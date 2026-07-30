// New capability: a team's creator can delete it from Settings (next to the
// rename field). Confirms: (a) the button only shows for the creator (same
// gate as rename), (b) deleting strips the teamId from every member swimmer
// (arrayRemove — the swimmer itself is untouched, it just falls back into
// whatever other team/legacy cluster it still belongs to) and removes the
// teams/{id} doc, (c) the app cleanly re-resolves afterward instead of
// getting stuck on a now-deleted team (here: 2 clusters before deletion,
// 1 clean merged cluster after — no crash, no stale picker).
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
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

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    // Two clusters (legacy default roster + "Junior Squad") — pick the team.
    const gateOpen = await page.$eval('#teamGate', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
    assert(gateOpen, 'expected the account picker to open (2 distinct clusters before deletion)');
    await page.click('#teamGateBody button:has-text("Junior Squad")');
    await page.waitForTimeout(400);
    await page.click('#t-settings');
    await page.waitForTimeout(400);

    const before = await page.$eval('#accountCard', (el) => el.textContent);
    assert(before.includes('Delete this team'), 'team creator should see a delete button, got: ' + before.slice(0, 500));
    steps.push({ desc: 'Team creator sees a "Delete this team" button', ok: true });

    page.once('dialog', (d) => d.accept());
    await page.click('button[onclick*="deleteActiveTeam"]');
    await page.waitForTimeout(900);

    const teamAfter = await page.evaluate(() => window.__mockStore.teams.teamAlpha);
    assert(!teamAfter, 'REGRESSION: teams/{id} doc should be deleted, got: ' + JSON.stringify(teamAfter));
    steps.push({ desc: 'Deleting the team removes the teams/{id} doc', ok: true });

    const sw602 = await page.evaluate(() => window.__mockStore.swimmers['602']);
    assert(!(sw602.teamIds || []).includes('teamAlpha'), 'REGRESSION: member swimmer should have the teamId stripped, got: ' + JSON.stringify(sw602));
    assert((sw602.coachUids || []).includes('coachOwner'), 'the swimmer itself must survive deletion (never delete the swimmer doc), got: ' + JSON.stringify(sw602));
    steps.push({ desc: 'Member swimmer keeps existing (and its coachUids) — only the teamId link is removed', ok: true });

    // Only one cluster remains now (legacy roster, both swimmers merged into
    // it) — the app should cleanly auto-resolve, not get stuck on the gate
    // or crash trying to render a deleted team.
    const gateAfter = await page.$eval('#teamGate', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
    assert(!gateAfter, 'account picker should not be stuck open after the only ambiguity was resolved by deletion');
    const settingsAfter = await page.$eval('#accountCard', (el) => el.textContent);
    assert(!settingsAfter.includes('Delete this team'), 'the delete button should disappear once there\'s no active explicit team, got: ' + settingsAfter.slice(0, 500));
    steps.push({ desc: 'App cleanly re-resolves to the single remaining cluster after the team is gone', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'delete-team (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'delete-team (desktop)', passed: false, steps, error: e.message };
  }
};
