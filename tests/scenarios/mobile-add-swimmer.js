// Mobile equivalent of settings-add-edit-persist.js: add a swimmer from the
// Settings tab and confirm (a) it's written to Firestore with the signed-in
// coach's uid, and (b) it shows up in the Settings swimmer list right away
// (SwimmersManager calls reloadSwimmers() after createSwimmer()).
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
    // Scoped to a real <button> — plain 'text=Settings' also matches the
    // Home tab's "add one in Settings." copy and clicks that instead (found
    // via debugging: it's earlier in the DOM than the bottom-nav button).
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(300);

    await page.fill('input[placeholder="Name"]', 'Mobile Test Swimmer');
    await page.fill('input[placeholder="Player ID"]', '444001');
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(700);

    const cloudSwimmer = await page.evaluate(() => window.__mockStore.swimmers['444001']);
    assert(cloudSwimmer && cloudSwimmer.name === 'Mobile Test Swimmer', 'swimmer should be written to Firestore, got: ' + JSON.stringify(cloudSwimmer));
    assert(Array.isArray(cloudSwimmer.coachUids) && cloudSwimmer.coachUids.includes('ownerUid'), 'swimmer should be tagged with the signed-in coach uid, got: ' + JSON.stringify(cloudSwimmer));
    steps.push({ desc: 'New swimmer is written to Firestore with the correct name + coachUid', ok: true });

    const settingsText = await page.evaluate(() => document.body.innerText);
    assert(settingsText.includes('Mobile Test Swimmer'), 'Settings swimmer list should show the new swimmer, page text was missing it');
    steps.push({ desc: 'Settings tab shows the new swimmer immediately after adding', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-add-swimmer', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-add-swimmer', passed: false, steps, error: e.message };
  }
};
