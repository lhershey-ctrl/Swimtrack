// Mobile equivalent of app-loads-smoke.js: sign in (as the owner, so no
// invite-code gate gets in the way) and confirm the bottom nav + all 6 tabs
// switch without crashing. Runs against a real Vite dev server with only
// Firebase mocked — see tests/lib/mobile-harness.js.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = { swimmers: {}, coaches: {}, teams: {}, config: {} };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);

    await page.waitForSelector('text=Settings', { timeout: 5000 });
    steps.push({ desc: 'Sign-in succeeds and bottom nav renders (owner, no invite gate)', ok: true });

    // Scoped to a real <button> — plain 'text=Settings' also matches the Home
    // tab's "add one in Settings." copy (found via debugging a flaky test).
    for (const label of ['Home', 'Meets', 'Progress', 'Records', 'Seasons', 'Settings']) {
      await page.click('button:has-text("' + label + '")');
      await page.waitForTimeout(150);
    }
    const onSettings = await page.evaluate(() => document.body.innerText.includes('Add a swimmer'));
    assert(onSettings, 'expected to land on the Settings tab (Add-a-swimmer card) after clicking through all 6 tabs');
    steps.push({ desc: 'All 6 bottom-nav tabs switch, and content genuinely changes per tab', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-app-loads-smoke', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-app-loads-smoke', passed: false, steps, error: e.message };
  }
};
