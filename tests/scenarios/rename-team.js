// Regression test for a real gap reported live: "how do I change team
// name?" only ever had ONE answer in the app — the coach's own personal
// "Team / Account Name" label (coaches/{uid}.teamName) — with no way to
// rename an actual TEAM (teams/{id}.name, e.g. "עולם המים מאסטרס") at
// all. Firestore rules already permitted the team's creator to rename it
// (name-field-only diff); this just needed the function + UI. Covers both
// the happy path (creator can rename) and the negative case (a non-creator
// viewer of the same team never sees the rename field at all).
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
      assert(fieldText.includes("Current Team's Name"), 'expected an editable "Current Team\'s Name" field, got: ' + fieldText.slice(0, 400));
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

    // ── Non-creator: a viewer of the SAME team never sees the field ──
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
      // This swimmer has BOTH an explicit team AND a 2nd coach, so it lands
      // in both an explicit-team cluster and a legacy coachUids cluster —
      // the picker gate opens; choose the team cluster (same as the real
      // "עולם המים" scenario reported live).
      await page.click('#teamGateBody button:has-text("עולם המים מאסטרס")');
      await page.waitForTimeout(400);
      await page.click('#t-settings');
      await page.waitForTimeout(400);

      const fieldText = await page.$eval('#accountCard', (el) => el.textContent);
      assert(!fieldText.includes("Current Team's Name"), 'a coach who did NOT create this team should never see a rename field for it, got: ' + fieldText.slice(0, 400));
      steps.push({ desc: 'A non-creator viewer of the same team never sees the rename field', ok: true });

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
