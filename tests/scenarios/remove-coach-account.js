// New capability: owner can fully remove a coach's account from the Admin
// "Teams" list. Confirms it: (a) strips the removed coach from every
// swimmer's coachUids/coachEmails (never deletes the swimmer doc — it's
// shared with another coach here), (b) strips them from every OTHER
// coach's viewerUids/viewerEmails too (so they stop auto-sharing future
// swimmers — see the viewer-inheritance fix), (c) deletes their own
// coaches/{uid} doc, and (d) the owner's own account can never be removed.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
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

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(300);
    await page.click('#t-admin');
    await page.waitForTimeout(1200);

    const before = await page.$eval('#adminCoachesCard', (el) => el.textContent);
    assert(before.includes('coachb@example.com'), 'Admin list should show Coach B before removal, got: ' + before);
    const removeButtonsBefore = await page.$$('#adminCoachesCard button:has-text("Remove account")');
    assert(removeButtonsBefore.length === 1, 'expected exactly one "Remove account" button (owner never gets one), got ' + removeButtonsBefore.length);
    steps.push({ desc: 'Admin Teams list shows a "Remove account" button only for the non-owner coach', ok: true });

    page.once('dialog', (d) => d.accept());
    await removeButtonsBefore[0].click();
    await page.waitForTimeout(700);

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

    const after = await page.$eval('#adminCoachesCard', (el) => el.textContent);
    assert(!after.includes('coachb@example.com'), 'Admin list should no longer show Coach B after removal, got: ' + after);
    steps.push({ desc: 'Admin Teams list no longer shows the removed coach', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'remove-coach-account (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'remove-coach-account (desktop)', passed: false, steps, error: e.message };
  }
};
