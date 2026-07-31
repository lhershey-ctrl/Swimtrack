// Regression test for a real gap: firestore.rules already let the app OWNER
// rename/delete ANY team (teams/{id} update/delete both allow isOwner()),
// but the Settings UI only ever checked `team.createdBy === user.uid` — so
// even the owner couldn't manage a team a teammate created, despite the
// backend already permitting it. Fixed: ActiveTeamNameEditor/renderAccountCard
// now also show rename+delete when isOwner(user) is true, with copy that
// says "as the app owner" instead of "since you created it".
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: {
        ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 500 },
        coachB: { email: 'b@example.com', name: 'Coach B', createdAt: 1000 },
      },
      // Created by coachB, NOT the owner — the owner is just a coachUid on
      // its one swimmer, same as any shared team they didn't personally start.
      teams: { teamY: { id: 'teamY', name: 'Some Team', createdBy: 'coachB', createdAt: 1000 } },
      swimmers: { 501: { id: '501', name: 'Kid', coachUids: ['coachB', 'ownerUid'], coachEmails: [], teamIds: ['teamY'] } },
      config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    // Single cluster (the swimmer has an explicit team, so no legacy
    // duplicate — see no-duplicate-team-listing.js) — no picker gate.
    const gateOpen = await page.$eval('#teamGate', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
    assert(!gateOpen, 'owner has only one real cluster here — no picker gate should appear');
    await page.click('#t-settings');
    await page.waitForTimeout(400);

    const before = await page.$eval('#accountCard', (el) => el.textContent);
    assert(before.includes("This Team's Name"), 'owner should see the rename field even though they didn\'t create this team, got: ' + before.slice(0, 600));
    assert(before.includes('Delete this team'), 'owner should see the delete button even though they didn\'t create this team, got: ' + before.slice(0, 600));
    assert(before.includes('as the app owner'), 'expected copy explaining the owner override, got: ' + before.slice(0, 600));
    steps.push({ desc: 'Owner sees rename + delete for a team a teammate created, with owner-specific copy', ok: true });

    await page.fill('#activeTeamNameInput', 'Some Team - Renamed by Owner');
    await page.click('button[onclick*="saveActiveTeamName"]');
    await page.waitForTimeout(400);
    const savedName = await page.evaluate(() => window.__mockStore.teams.teamY.name);
    assert(savedName === 'Some Team - Renamed by Owner', 'expected the owner\'s rename to persist, got: ' + savedName);
    steps.push({ desc: 'Owner can actually rename a team they did not create', ok: true });

    page.once('dialog', (d) => d.accept());
    await page.click('button[onclick*="deleteActiveTeam"]');
    await page.waitForTimeout(900);
    const teamAfter = await page.evaluate(() => window.__mockStore.teams.teamY);
    assert(!teamAfter, 'expected the owner\'s delete to actually remove the teams/{id} doc, got: ' + JSON.stringify(teamAfter));
    steps.push({ desc: 'Owner can actually delete a team they did not create', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'owner-bypass-rename-delete (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'owner-bypass-rename-delete (desktop)', passed: false, steps, error: e.message };
  }
};
