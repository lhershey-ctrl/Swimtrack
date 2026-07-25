// Regression test for a new capability: Settings' "Name in Records"/"Name
// in Int'l Rankings" fields used to require typing the exact spelling
// blind. Now, whichever already-published names fuzzy-match the swimmer's
// own Hebrew name (word-order-agnostic — the #1 real variation is family
// name vs. first name swapped) show up as click-to-fill suggestion chips.
// "Name in Records" candidates come from config/records (Hebrew-to-Hebrew);
// "Name in Int'l Rankings" candidates come from config/mastersTop10 (a
// rough Hebrew->Latin phonetic guess vs. Latin candidates).
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        115352: { id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], birthdate: '01/06/1980', sex: 'male' },
      },
      teams: {},
      config: {
        // Israeli record held under the REVERSED word order ("הר-שי לירון")
        // — the exact real-world variation this feature exists for.
        records: { records: { 50: { M: { '25-29': { '50|Free': { sec: 24.5, time: '24.50', name: 'הר-שי לירון' } } } } }, segments: {}, count: 1, loadedAt: Date.now(), by: 'test' },
        mastersTop10: {
          entries: [
            { source: 'world', year: 2025, course: 'LCM', sex: 'M', ageGroup: '45-49', event: '50m Backstroke', rank: 7, time: '31.94', seconds: 31.94, name: 'HARSHAY Liron' },
          ],
          count: 1, loadedAt: Date.now(), by: 'test',
        },
      },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(400);
    const card = (await page.$$('#settingsSwimmerList > div'))[0];
    await card.$eval('button:has-text("✏️ Edit")', (btn) => btn.click());
    await page.waitForTimeout(1200); // wait for records/mastersTop10 fetch + suggestion render

    const recSuggest = await page.$eval('#rec-suggest-0', (el) => el.textContent);
    assert(recSuggest.includes('הר-שי לירון'), 'expected a "Name in Records" suggestion for the reversed-word-order record holder, got: ' + recSuggest);
    steps.push({ desc: 'A "Name in Records" suggestion appears for the same swimmer under reversed word order', ok: true });

    const intlSuggest = await page.$eval('#intl-suggest-0', (el) => el.textContent);
    assert(intlSuggest.includes('HARSHAY Liron'), 'expected a "Name in Int\'l Rankings" suggestion via Hebrew->Latin fuzzy match, got: ' + intlSuggest);
    steps.push({ desc: 'A "Name in Int\'l Rankings" suggestion appears via the Hebrew->Latin phonetic guess', ok: true });

    await page.click('#rec-suggest-0 button');
    await page.waitForTimeout(200);
    const recVal = await page.$eval('#set-recname-0', (el) => el.value);
    assert(recVal === 'הר-שי לירון', 'clicking the suggestion chip should fill the recordName input, got: ' + recVal);
    const swRecVal = await page.evaluate(() => window.getAllSwimmers()[0].recordName);
    assert(swRecVal === 'הר-שי לירון', 'clicking the suggestion chip should update the swimmer object too, got: ' + swRecVal);
    steps.push({ desc: 'Clicking a suggestion chip fills the input and updates the swimmer record, no typing needed', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'settings-name-suggestions (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'settings-name-suggestions (desktop)', passed: false, steps, error: e.message };
  }
};
