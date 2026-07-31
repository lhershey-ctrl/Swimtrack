// Regression test for a real, live-reported bug: switching the active
// swimmer via the TopBar picker kept showing the PREVIOUS swimmer's name
// and stats until (if ever) the new swimmer's subscription happened to
// deliver — nothing cleared it in between. On a slow network (or a denied
// subscription — subscribeSwimmer's error path never called back at all),
// this wasn't a brief flicker, it was indefinite stale/wrong data. Fixed:
// (1) `swimmer` state is cleared to null the instant swimmerId changes,
// so the existing "Loading swimmer…" state shows instead of stale data;
// (2) subscribeSwimmer's error callback now also clears it instead of only
// logging.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
      teams: {},
      swimmers: {
        A1: { id: 'A1', name: 'Alice Alpha', coachUids: ['ownerUid'], coachEmails: [] },
        B1: { id: 'B1', name: 'Bob Beta', coachUids: ['ownerUid'], coachEmails: [] },
      },
      config: {},
    };
    // Bob's swimmer-doc subscription is deliberately slow — long enough to
    // check the screen well before it resolves.
    window.__mockDocDelayMs = { B1: 1500 };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.waitForFunction(() => document.body.innerText.includes('Alice Alpha'), { timeout: 8000 });
    steps.push({ desc: 'Alice loads as the initial active swimmer', ok: true });

    // Open the swimmer picker and switch to Bob (slow to load).
    await page.click('button:has-text("Alice Alpha")');
    await page.waitForTimeout(150);
    await page.click('button:has-text("Bob Beta")');

    // Check IMMEDIATELY, well before Bob's 1500ms mock delay resolves.
    await page.waitForTimeout(200);
    const midSwitchText = await page.evaluate(() => document.body.innerText);
    assert(!midSwitchText.includes('Recent swims'), 'REGRESSION: still showing Alice\'s full Home content (stale) instead of a loading state while Bob\'s data is in flight, got: ' + midSwitchText.slice(0, 500));
    assert(midSwitchText.includes('Loading swimmer'), 'expected the existing "Loading swimmer…" state while the new swimmer\'s data is in flight, got: ' + midSwitchText.slice(0, 500));
    steps.push({ desc: 'Mid-switch (before the new swimmer\'s data arrives), the screen shows a loading state, not stale data from the previous swimmer', ok: true });

    // Now wait past the delay and confirm Bob's data actually does land
    // (Bob has no seasons data, so HomeTab shows the "no seasons synced"
    // message rather than "Recent swims" — still proves the real doc landed).
    await page.waitForFunction(() => document.body.innerText.includes('Bob Beta'), { timeout: 5000 });
    steps.push({ desc: 'Bob\'s data loads correctly once the (slow) subscription resolves', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-swimmer-switch-no-stale-display', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-swimmer-switch-no-stale-display', passed: false, steps, error: e.message };
  }
};
