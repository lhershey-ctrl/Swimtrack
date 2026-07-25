// Mobile equivalent of personal-records-current-age-gap.js (desktop): same
// bug, same fix — the Records tab's gap-vs-age-group-record used to require
// a swim performed literally while at the swimmer's exact current age, so a
// swimmer who'd just aged into a new bracket with no meet yet showed no gap
// at all for every event, even with an existing lifetime PB.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        // Currently 16 (born 2010, "now" is 2026) but their only 50 Free
        // swim was at age 13 (season 2023-2024) — no swim at exactly 16.
        401: {
          id: '401', name: 'Junior Swimmer', coachUids: ['coachX'], birthdate: '01/06/2010', sex: 'male',
          seasons: {
            '2023-2024': {
              bests: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/06/2023', points: 400 }],
              results: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/06/2023', points: 400 }],
            },
          },
        },
      },
      teams: {},
      config: { records: { records: { 25: { M: { 16: { '50|Free': { sec: 27.0, time: '27.00', name: 'Record Holder' } } } } }, segments: {}, count: 1, loadedAt: Date.now(), by: 'test' } },
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Records")');
    await page.waitForTimeout(600);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(bodyText.includes('50 Free'), 'Records tab should list 50 Free, got: ' + bodyText.slice(0, 500));
    assert(!/no time yet/i.test(bodyText), 'REGRESSION: still shows the old "no ... time yet" placeholder despite having a lifetime PB, got: ' + bodyText.slice(0, 500));
    assert(/%/.test(bodyText) || /faster than record/i.test(bodyText) || /holds this/i.test(bodyText), 'expected a real gap (%, "faster than record", or "<name> holds this") vs the current age-16 record, got: ' + bodyText.slice(0, 500));
    steps.push({ desc: 'Records tab gap compares the lifetime PB to the current age-group record instead of showing nothing', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-personal-records-current-age-gap', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-personal-records-current-age-gap', passed: false, steps, error: e.message };
  }
};
