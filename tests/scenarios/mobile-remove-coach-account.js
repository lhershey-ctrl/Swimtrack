// Mobile equivalent of remove-coach-account.js (desktop) — see that file
// for the full narrative.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: {
        ownerUid: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000, viewerUids: ['coachB'], viewerEmails: ['coachb@example.com'] },
        coachB: { email: 'coachb@example.com', name: 'Coach B', createdAt: 2000 },
      },
      swimmers: {
        501: { id: '501', name: 'Shared Swimmer', coachUids: ['ownerUid', 'coachB'], coachEmails: ['lhershey@gmail.com', 'coachb@example.com'] },
      },
      teams: {}, config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(400);

    const before = await page.evaluate(() => document.body.innerText);
    assert(before.includes('coachb@example.com'), 'Admin stats should show Coach B before removal, got: ' + before.slice(0, 800));
    const removeButtonsBefore = await page.$$('button:has-text("Remove account")');
    assert(removeButtonsBefore.length === 1, 'expected exactly one "Remove account" button (owner never gets one), got ' + removeButtonsBefore.length);
    steps.push({ desc: 'Admin Stats shows a "Remove account" button only for the non-owner coach', ok: true });

    page.once('dialog', (d) => d.accept());
    await removeButtonsBefore[0].click();
    // Removal triggers reload() -> setCoaches/setSwimmers -> an async
    // nameClusters() effect (see admin-stats-per-team.js's own 1200ms wait
    // for the same reason) before the Stats list actually re-renders.
    await page.waitForTimeout(1200);

    const coachBAfter = await page.evaluate(() => window.__mockStore.coaches.coachB);
    assert(!coachBAfter, 'REGRESSION: removed coach\'s coaches/{uid} doc should be deleted, got: ' + JSON.stringify(coachBAfter));
    steps.push({ desc: 'Removing the account deletes coaches/{uid}', ok: true });

    const sw = await page.evaluate(() => window.__mockStore.swimmers['501']);
    assert(!sw.coachUids.includes('coachB'), 'REGRESSION: removed coach should be stripped from the shared swimmer\'s coachUids, got: ' + JSON.stringify(sw));
    assert(sw.coachUids.includes('ownerUid'), 'the OTHER coach on the shared swimmer must be untouched, got: ' + JSON.stringify(sw));
    steps.push({ desc: 'Removed coach is unlinked from every swimmer they coached, without touching the other coach or deleting the swimmer', ok: true });

    const ownerDoc = await page.evaluate(() => window.__mockStore.coaches.ownerUid);
    assert(!ownerDoc.viewerUids.includes('coachB'), 'REGRESSION: removed coach should be stripped from other coaches\' viewerUids too, got: ' + JSON.stringify(ownerDoc));
    steps.push({ desc: 'Removed coach is also stripped from other coaches\' standing viewerUids/viewerEmails', ok: true });

    const after = await page.evaluate(() => document.body.innerText);
    assert(!after.includes('coachb@example.com'), 'Admin stats should no longer show Coach B after removal, got: ' + after.slice(0, 800));
    steps.push({ desc: 'Admin Stats no longer shows the removed coach', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-remove-coach-account', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-remove-coach-account', passed: false, steps, error: e.message };
  }
};
