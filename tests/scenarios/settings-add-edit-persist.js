// Core Settings happy path, fully offline (no sign-in): add a swimmer by
// hand, edit their profile fields, save, and confirm both (a) the swimmer
// picker picks it up immediately and (b) a page reload still shows it —
// i.e. localStorage persistence (saveSettings/loadSettings) actually works,
// not just the in-memory SWIMMERS array for the current session.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.click('#t-settings');
    await page.waitForTimeout(200);
    await page.click('text=+ Add Swimmer');
    await page.waitForTimeout(150);

    const editButtons = await page.$$('button:has-text("✏️ Edit")');
    await editButtons[editButtons.length - 1].click();
    await page.waitForTimeout(150);

    const nameInputs = await page.$$('#settingsSwimmerList input[id^="set-name-"]');
    const idInputs = await page.$$('#settingsSwimmerList input[id^="set-id-"]');
    const bdInputs = await page.$$('#settingsSwimmerList input[id^="set-bd-"]');
    await nameInputs[nameInputs.length - 1].fill('Manual Swimmer');
    await idInputs[idInputs.length - 1].fill('555001');
    await bdInputs[bdInputs.length - 1].fill('15/06/2012');
    steps.push({ desc: 'A new swimmer card can be added and edited', ok: true });

    await page.click('#saveAllBtn');
    await page.waitForTimeout(300);

    await page.click('#t-analyze');
    await page.waitForTimeout(200);
    const pickerAfterSave = await page.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(pickerAfterSave.includes('Manual Swimmer'), 'picker should show the new swimmer right after saving, got: ' + pickerAfterSave);
    steps.push({ desc: 'Swimmer picker shows the new swimmer immediately after Save All', ok: true });

    const storedRaw = await page.evaluate(() => localStorage.getItem('sw_settings'));
    const stored = JSON.parse(storedRaw || '[]');
    const savedSwimmer = stored.find((sw) => sw.id === '555001');
    assert(savedSwimmer && savedSwimmer.name === 'Manual Swimmer' && savedSwimmer.birthdate === '15/06/2012',
      'localStorage sw_settings should contain the saved profile, got: ' + storedRaw);
    steps.push({ desc: 'Profile (name/ID/birthdate) is actually persisted to localStorage', ok: true });

    // Reload the page entirely — confirms this survives a real session boundary,
    // not just the in-memory SWIMMERS array from the same page load.
    await page.reload();
    await page.waitForTimeout(500);
    const pickerAfterReload = await page.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(pickerAfterReload.includes('Manual Swimmer'), 'picker should still show the swimmer after a full page reload, got: ' + pickerAfterReload);
    steps.push({ desc: 'Swimmer survives a full page reload (real localStorage persistence, not just in-memory state)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'settings-add-edit-persist (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'settings-add-edit-persist (desktop)', passed: false, steps, error: e.message };
  }
};
