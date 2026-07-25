// Mobile equivalent of settings-name-suggestions.js (desktop): the same
// "Name in Records"/"Name in Int'l Rankings" suggestion chips, seeded with
// the same reversed-word-order Hebrew record and Hebrew->Latin transliterated
// ranking entry.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        115352: { id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], birthdate: '01/06/1980', sex: 'male' },
      },
      teams: {},
      config: {
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
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(300);
    // Scoped to the swimmer id, not just the name — the TopBar swimmer
    // switcher also contains the plain name and would match a looser selector.
    await page.click('button:has-text("#115352")');
    await page.waitForTimeout(1200); // wait for records/mastersTop10 fetch + suggestion render

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(bodyText.includes('הר-שי לירון'), 'expected a "Name in Records" suggestion for the reversed-word-order record holder, got: ' + bodyText.slice(0, 800));
    assert(bodyText.includes('HARSHAY Liron'), 'expected a "Name in Int\'l Rankings" suggestion via Hebrew->Latin fuzzy match, got: ' + bodyText.slice(0, 800));
    steps.push({ desc: 'Both suggestion chips appear on mobile Settings, matching the desktop behavior', ok: true });

    await page.click('button:has-text("הר-שי לירון")');
    await page.waitForTimeout(200);
    const recVal = await page.$eval('input[dir="rtl"]', (el) => el.value);
    assert(recVal === 'הר-שי לירון', 'tapping the suggestion chip should fill the recordName input, got: ' + recVal);
    steps.push({ desc: 'Tapping a suggestion chip fills the input, no typing needed', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-settings-name-suggestions', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-settings-name-suggestions', passed: false, steps, error: e.message };
  }
};
