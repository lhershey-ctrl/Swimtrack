// Mobile equivalent of delete-team.js (desktop) — see that file for the
// full narrative.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachOwner', email: 'owner@example.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { coachOwner: { email: 'owner@example.com', name: 'Owner', createdAt: 1000 } },
      swimmers: {
        601: { id: '601', name: 'Legacy Swimmer', coachUids: ['coachOwner'] },
        602: { id: '602', name: 'Team Swimmer', coachUids: ['coachOwner'], teamIds: ['teamAlpha'] },
      },
      teams: { teamAlpha: { id: 'teamAlpha', name: 'Junior Squad', createdBy: 'coachOwner', createdAt: 1000 } },
      config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    const gateBtn = page.locator('button:has-text("Junior Squad")');
    assert(await gateBtn.count(), 'expected the account picker to open (2 distinct clusters before deletion)');
    await gateBtn.first().click();
    await page.waitForTimeout(400);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => document.body.innerText);
    assert(/delete this team/i.test(before), 'team creator should see a delete button, got: ' + before.slice(0, 800));
    steps.push({ desc: 'Team creator sees a "Delete this team" button', ok: true });

    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("Delete this team")');
    await page.waitForTimeout(900);

    const teamAfter = await page.evaluate(() => window.__mockStore.teams.teamAlpha);
    assert(!teamAfter, 'REGRESSION: teams/{id} doc should be deleted, got: ' + JSON.stringify(teamAfter));
    steps.push({ desc: 'Deleting the team removes the teams/{id} doc', ok: true });

    const sw602 = await page.evaluate(() => window.__mockStore.swimmers['602']);
    assert(!(sw602.teamIds || []).includes('teamAlpha'), 'REGRESSION: member swimmer should have the teamId stripped, got: ' + JSON.stringify(sw602));
    assert((sw602.coachUids || []).includes('coachOwner'), 'the swimmer itself must survive deletion (never delete the swimmer doc), got: ' + JSON.stringify(sw602));
    steps.push({ desc: 'Member swimmer keeps existing (and its coachUids) — only the teamId link is removed', ok: true });

    const after = await page.evaluate(() => document.body.innerText);
    assert(!/delete this team/i.test(after), 'the delete button should disappear once there\'s no active explicit team, got: ' + after.slice(0, 800));
    steps.push({ desc: 'App cleanly re-resolves to the single remaining cluster after the team is gone', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-delete-team', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-delete-team', passed: false, steps, error: e.message };
  }
};
