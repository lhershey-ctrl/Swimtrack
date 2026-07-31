// Regression test for a real gap reported live: "how do I change team
// name?" only ever had ONE answer in the app — the coach's own personal
// "Your Account Label" (coaches/{uid}.teamName) — with no way to
// rename an actual TEAM (teams/{id}.name, e.g. "עולם המים מאסטרס") at
// all. Firestore rules already permitted the team's creator to rename it
// (name-field-only diff); this just needed the function + UI. Covers both
// the happy path (creator can rename) and the negative case (a non-creator,
// non-owner coach who shares the same team never sees the rename field at
// all — the app owner CAN, see the owner-bypass-rename-delete test).
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];

  try {
    // ── Creator: sees + can use the "Current Team's Name" field ──
    {
      const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
        window.__FAKE_USER = { uid: 'coachOwner', email: 'owner@example.com', displayName: 'Owner' };
        window.__mockStore = {
          coaches: { coachOwner: { email: 'owner@example.com', name: 'Owner', createdAt: 1000 } },
          swimmers: { 115352: { id: '115352', name: 'לירון הר-שי', coachUids: ['coachOwner'], teamIds: ['teamAlpha'], birthdate: '01/06/1978', sex: 'male' } },
          teams: { teamAlpha: { id: 'teamAlpha', name: 'עולם המים מאסטרס', createdBy: 'coachOwner', createdAt: 1000 } },
          config: {},
        };
      });
      await page.click('text=☁ Sign in with Google');
      await page.waitForTimeout(900);
      await page.click('#t-settings');
      await page.waitForTimeout(400);

      const fieldText = await page.$eval('#accountCard', (el) => el.textContent);
      assert(fieldText.includes("This Team's Name"), 'expected an editable "This Team\'s Name" field, got: ' + fieldText.slice(0, 400));
      const inputVal = await page.$eval('#activeTeamNameInput', (el) => el.value);
      assert(inputVal === 'עולם המים מאסטרס', 'expected the field to be pre-filled with the team\'s real name, got: ' + inputVal);
      steps.push({ desc: 'Team creator sees a "Current Team\'s Name" field, pre-filled with the team\'s actual name', ok: true });

      await page.fill('#activeTeamNameInput', 'עולם המים מאסטרס - מעודכן');
      await page.click('button[onclick*="saveActiveTeamName"]');
      await page.waitForTimeout(400);
      const saved = await page.evaluate(() => window.__mockStore.teams.teamAlpha.name);
      assert(saved === 'עולם המים מאסטרס - מעודכן', 'expected the team\'s own name to be updated in Firestore, got: ' + saved);
      steps.push({ desc: 'Saving updates teams/{id}.name — the team itself, not the coach\'s own account label', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (creator): ' + consoleErrors.join(' | '));
      await browser.close();
    }

    // ── Non-creator, non-owner: a coach sharing the SAME team never sees the field ──
    {
      const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
        window.__FAKE_USER = { uid: 'coachViewer', email: 'viewer@example.com', displayName: 'Viewer' };
        window.__mockStore = {
          coaches: {
            coachOwner: { email: 'owner@example.com', name: 'Owner', createdAt: 1000 },
            coachViewer: { email: 'viewer@example.com', name: 'Viewer', createdAt: 1000 },
          },
          swimmers: { 115352: { id: '115352', name: 'לירון הר-שי', coachUids: ['coachOwner', 'coachViewer'], teamIds: ['teamAlpha'], birthdate: '01/06/1978', sex: 'male' } },
          teams: { teamAlpha: { id: 'teamAlpha', name: 'עולם המים מאסטרס', createdBy: 'coachOwner', createdAt: 1000 } },
          config: {},
        };
      });
      await page.click('text=☁ Sign in with Google');
      await page.waitForTimeout(900);
      // This swimmer has an explicit team AND a 2nd coach, but (since a
      // swimmer with an explicit team no longer ALSO joins a legacy
      // cluster — see multi-team-membership.js) coachViewer only has ONE
      // cluster here, so no picker gate appears — straight to Settings.
      await page.click('#t-settings');
      await page.waitForTimeout(400);

      const fieldText = await page.$eval('#accountCard', (el) => el.textContent);
      assert(!fieldText.includes("This Team's Name"), 'a coach who did NOT create this team (and isn\'t the app owner) should never see a rename field for it, got: ' + fieldText.slice(0, 400));
      steps.push({ desc: 'A non-creator, non-owner coach sharing the same team never sees the rename field', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (non-creator): ' + consoleErrors.join(' | '));
      await browser.close();
    }

    steps.push({ desc: 'No uncaught page errors during either flow', ok: true });
    return { name: 'rename-team (desktop)', passed: true, steps };
  } catch (e) {
    steps.push({ desc: e.message, ok: false });
    return { name: 'rename-team (desktop)', passed: false, steps, error: e.message };
  }
};
