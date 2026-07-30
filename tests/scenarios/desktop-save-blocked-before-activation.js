// Real bug, reported live: a brand-new coach who signs in but hasn't
// redeemed their invite code yet could still reach Settings and click
// "💾 Save All Changes" — desktop never hard-gates the rest of the UI
// behind coachStatus the way mobile's InviteGate does, and swimSaveProfile/
// doSync only ever checked `currentUser`, not activation status. The write
// was rejected by firestore.rules (isCoach() false), surfacing as a raw
// "Missing or insufficient permissions" message with no indication of what
// to actually do. Fixed: swimSaveProfile/doSync now check coachStatus
// up front and fail with an actionable message pointing at the invite-code
// input, instead of letting the write hit Firestore at all.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'newCoach', email: 'newcoach@example.com', displayName: 'New Coach' };
    window.__mockStore = { coaches: {}, swimmers: {}, teams: {}, config: {} };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(300);

    await page.click('text=+ Add Swimmer');
    await page.waitForTimeout(150);
    const editButtons = await page.$$('button:has-text("✏️ Edit")');
    await editButtons[editButtons.length - 1].click();
    await page.waitForTimeout(150);
    const nameInputs = await page.$$('#settingsSwimmerList input[id^="set-name-"]');
    const idInputs = await page.$$('#settingsSwimmerList input[id^="set-id-"]');
    await nameInputs[nameInputs.length - 1].fill('Blocked Swimmer');
    await idInputs[idInputs.length - 1].fill('555004');

    await page.click('#saveAllBtn');
    await page.waitForTimeout(600);

    const statusText = await page.$eval('#settingsCloudStatus', (el) => el.textContent);
    assert(/activate your account/i.test(statusText), 'REGRESSION: an unactivated coach should get an actionable "activate your account" message, got: ' + statusText);
    assert(!/missing or insufficient permissions/i.test(statusText), 'a raw Firestore permission error should never reach the user, got: ' + statusText);
    steps.push({ desc: 'Saving before activation shows a clear, actionable message instead of a raw permission error', ok: true });

    const written = await page.evaluate(() => window.__mockStore.swimmers['555004']);
    assert(!written, 'the swimmer should NOT have been written to Firestore while unactivated, got: ' + JSON.stringify(written));
    steps.push({ desc: 'The blocked write never actually reaches Firestore', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'desktop-save-blocked-before-activation', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'desktop-save-blocked-before-activation', passed: false, steps, error: e.message };
  }
};
