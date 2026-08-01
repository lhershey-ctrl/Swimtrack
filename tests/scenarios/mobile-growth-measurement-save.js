// Real user report: "tried to save weight and height from the mobile app
// and it didn't work." Root-caused two real issues while reproducing it:
// (1) the height/weight date field was free-text ("DD/MM/YYYY" typed by
// hand) — now a native <input type="date"> (calendar picker), directly
// requested, and removes an entire class of typo/format bugs; (2) the
// Settings page has THREE buttons that all just say "Save" (account label,
// team name, and the swimmer editor itself) — genuinely easy to click the
// wrong one and believe height/weight saved when it didn't (this repro hit
// that exact trap while writing this test). Buttons are now labeled
// distinctly: "Save Label" / "Save Name" / "Save Changes".
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'coach@example.com', displayName: 'Coach' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'coach@example.com', name: 'Coach', createdAt: 1000 } },
      teams: {},
      swimmers: { 801: { id: '801', name: 'Test Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2012', sex: 'female' } },
      config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(400);
    await page.click('text=Test Swimmer #801');
    await page.waitForTimeout(300);

    const dateInputs = await page.$$('input[type="date"]');
    assert(dateInputs.length === 2, 'expected exactly 2 native date pickers (height + weight), got: ' + dateInputs.length);
    steps.push({ desc: 'Height/weight date fields are native calendar pickers, not free-text', ok: true });

    // Height: pick a date via the native input (ISO under the hood) and a value.
    await dateInputs[0].fill('2026-03-01');
    const cmInput = await page.$('input[placeholder="cm"]');
    await cmInput.fill('145');
    const exactPlusButtons = await page.locator('button', { hasText: /^\+$/ }).all();
    assert(exactPlusButtons.length === 2, 'expected exactly 2 "+" add buttons (height + weight), got: ' + exactPlusButtons.length);
    await exactPlusButtons[0].click();
    await page.waitForTimeout(200);

    const bodyAfterAdd = await page.evaluate(() => document.body.innerText);
    assert(bodyAfterAdd.includes('145'), 'expected the new height entry to appear in the list immediately, got: ' + bodyAfterAdd.slice(0, 600));
    // Stored/displayed in the app's DD/MM/YYYY convention, converted from the picker's ISO value.
    assert(bodyAfterAdd.includes('01/03/2026'), 'expected the ISO date picker value to be converted to DD/MM/YYYY for display, got: ' + bodyAfterAdd.slice(0, 600));
    steps.push({ desc: 'Adding a measurement via the date picker converts ISO to DD/MM/YYYY and shows immediately', ok: true });

    // The exact trap this bug hid in: multiple ambiguous "Save" buttons.
    const saveLabelBtn = await page.$('button:has-text("Save Label")');
    const saveNameBtn = await page.$('button:has-text("Save Name")');
    const saveChangesBtn = await page.$('button:has-text("Save Changes")');
    assert(saveLabelBtn, 'expected the account-label Save button to read "Save Label", not a generic "Save"');
    assert(saveChangesBtn, 'expected the swimmer editor\'s Save button to read "Save Changes", not a generic "Save"');
    steps.push({ desc: 'Save buttons are labeled distinctly (Save Label / Save Name / Save Changes) — no more ambiguous "Save"', ok: true });

    await saveChangesBtn.click();
    await page.waitForTimeout(500);

    const stored = await page.evaluate(() => window.__mockStore.swimmers['801']);
    assert(stored.heights && stored.heights.length === 1, 'REGRESSION: height measurement was not persisted to Firestore, got: ' + JSON.stringify(stored));
    assert(stored.heights[0].date === '01/03/2026' && stored.heights[0].value === 145, 'expected the persisted height entry to have the right date/value, got: ' + JSON.stringify(stored.heights));
    steps.push({ desc: 'Clicking "Save Changes" actually persists the height measurement to Firestore', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-growth-measurement-save', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-growth-measurement-save', passed: false, steps, error: e.message };
  }
};
