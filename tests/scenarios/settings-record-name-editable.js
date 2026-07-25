// Regression test for a new capability: desktop Settings could only ever
// READ a swimmer's "recordName" (the Hebrew name used to flag age-group
// records they hold, e.g. for records set at a meet outside LogLig
// entirely) from the cloud profile — there was no input to edit it, unlike
// mobile. User feedback: "add it to the desktop. it is easier to update."
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        // Already has a recordName set (as if edited on mobile previously) —
        // desktop must show it, not just let you set one from blank.
        501: { id: '501', name: 'Test Swimmer', coachUids: ['coachX'], recordName: 'קיים שם' },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(400);
    const card = (await page.$$('#settingsSwimmerList > div'))[0];
    await card.$eval('button:has-text("✏️ Edit")', (btn) => btn.click());
    await page.waitForTimeout(200);

    const fieldValue = await page.$eval('input[id^="set-recname-"]', (el) => el.value);
    assert(fieldValue === 'קיים שם', 'the recordName field should pre-fill with the existing cloud value, got: ' + JSON.stringify(fieldValue));
    steps.push({ desc: 'Desktop Settings shows the existing recordName pulled from the cloud profile', ok: true });

    await page.fill('input[id^="set-recname-"]', 'שם חדש');
    await page.click('text=💾 Save All Changes');
    await page.waitForTimeout(700);

    const cloudValue = await page.evaluate(() => window.__mockStore.swimmers['501'].recordName);
    assert(cloudValue === 'שם חדש', 'editing the field and saving should push the new recordName to Firestore, got: ' + JSON.stringify(cloudValue));
    steps.push({ desc: 'Editing the field on desktop and saving persists the new recordName to the cloud', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'settings-record-name-editable (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'settings-record-name-editable (desktop)', passed: false, steps, error: e.message };
  }
};
