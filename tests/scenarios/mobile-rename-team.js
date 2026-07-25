// Mobile equivalent of rename-team.js (desktop): same real gap (no way to
// rename an actual team, only the coach's own personal account label),
// same fix. Covers both the happy path (creator can rename) and the
// negative case (a non-creator viewer of the same team never sees the
// rename field at all).
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];

  try {
    // ── Creator: sees + can use the "Current Team's Name" field ──
    {
      const app = await openMobileApp(function seed() {
        window.__FAKE_USER = { uid: 'coachOwner', email: 'owner@example.com', displayName: 'Owner' };
        window.__mockStore = {
          coaches: { coachOwner: { email: 'owner@example.com', name: 'Owner', createdAt: 1000 } },
          swimmers: { 115352: { id: '115352', name: 'לירון הר-שי', coachUids: ['coachOwner'], teamIds: ['teamAlpha'], birthdate: '01/06/1978', sex: 'male' } },
          teams: { teamAlpha: { id: 'teamAlpha', name: 'עולם המים מאסטרס', createdBy: 'coachOwner', createdAt: 1000 } },
          config: {},
        };
      });
      const { page, consoleErrors } = app;
      await page.click('text=Sign in with Google');
      await page.waitForTimeout(900);
      await page.click('button:has-text("Settings")');
      await page.waitForTimeout(500);

      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(/current team's name/i.test(bodyText), 'expected an editable "Current Team\'s Name" field, got: ' + bodyText.slice(0, 800));
      steps.push({ desc: 'Team creator sees a "Current Team\'s Name" field, pre-filled with the team\'s actual name', ok: true });

      const inputs = await page.$$('input');
      let targetInput = null;
      for (const inp of inputs) {
        const val = await inp.inputValue();
        if (val === 'עולם המים מאסטרס') { targetInput = inp; break; }
      }
      assert(targetInput, 'could not find the team-name input pre-filled with the current value');
      await targetInput.fill('עולם המים מאסטרס - מעודכן');
      const saveButtons = await page.$$('button:has-text("Save")');
      await saveButtons[saveButtons.length - 1].click();
      await page.waitForTimeout(400);
      const saved = await page.evaluate(() => window.__mockStore.teams.teamAlpha.name);
      assert(saved === 'עולם המים מאסטרס - מעודכן', 'expected the team\'s own name to be updated in Firestore, got: ' + saved);
      steps.push({ desc: 'Saving updates teams/{id}.name — the team itself, not the coach\'s own account label', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (creator): ' + consoleErrors.join(' | '));
      await app.close();
    }

    // ── Non-creator: a viewer of the SAME team never sees the field ──
    {
      const app = await openMobileApp(function seed() {
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
      const { page, consoleErrors } = app;
      await page.click('text=Sign in with Google');
      await page.waitForTimeout(900);
      // Same team-gate ambiguity as the desktop test — pick the team cluster.
      const gateBtn = page.locator('button:has-text("עולם המים מאסטרס")');
      if (await gateBtn.count()) { await gateBtn.first().click(); await page.waitForTimeout(400); }
      await page.click('button:has-text("Settings")');
      await page.waitForTimeout(500);

      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(!/current team's name/i.test(bodyText), 'a coach who did NOT create this team should never see a rename field for it, got: ' + bodyText.slice(0, 800));
      steps.push({ desc: 'A non-creator viewer of the same team never sees the rename field', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (non-creator): ' + consoleErrors.join(' | '));
      await app.close();
    }

    steps.push({ desc: 'No uncaught page errors during either flow', ok: true });
    return { name: 'mobile-rename-team', passed: true, steps };
  } catch (e) {
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-rename-team', passed: false, steps, error: e.message };
  }
};
