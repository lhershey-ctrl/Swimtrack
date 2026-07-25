// Regression test for: a junior swimmer's Personal Records "gap vs age-group
// record" showed "no in-group swim" for EVERY event whenever they'd just
// aged into a new bracket with no meet yet at that exact age — even though
// their existing lifetime PB (set at a younger age) might already be
// relevant. Fixed: the gap now always compares the swimmer's all-time PB
// against the CURRENT age group's record, not a swim restricted to having
// literally happened while at that exact age.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        // Currently 16 (born 2010, "now" is 2026) — but their only 50 Free
        // swim was at age 13 (season 2023-2024), so there is NO swim with
        // year-end age exactly 16. Old behavior: "no in-group swim" forever.
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
      // Shape is config/records = { records:{pool:{sex:{cat:{"dist|Stroke":{...}}}}}, segments, count, loadedAt, by }.
      config: { records: { records: { 25: { M: { 16: { '50|Free': { sec: 27.0, time: '27.00', name: 'Record Holder' } } } } }, segments: {}, count: 1, loadedAt: Date.now(), by: 'test' } },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);

    const pickerText = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(pickerText.includes('Junior Swimmer'), 'swimmer should auto-import into the picker, got: ' + pickerText);
    await page.click('#loadSwimmerPicker button');
    await page.waitForTimeout(900);

    await page.click('#t-analyze');
    await page.waitForTimeout(200);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);

    const rec25 = await page.$eval('#rec25', (el) => el.textContent);
    assert(rec25.includes('50 Free'), 'Personal Records table should list 50 Free, got: ' + rec25);
    assert(!rec25.includes('no in-group swim') && !rec25.includes('no swim yet'), 'REGRESSION: gap column still shows the old "no swim" placeholder despite having a lifetime PB, got: ' + rec25);
    assert(/%/.test(rec25) || /faster/i.test(rec25) || /you hold it/i.test(rec25), 'expected a real gap (%, "faster", or "you hold it") comparing the PB to the current age-16 record, got: ' + rec25);
    steps.push({ desc: 'Personal Records gap compares the lifetime PB to the current age-group record instead of showing "no swim yet"', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'personal-records-current-age-gap (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'personal-records-current-age-gap (desktop)', passed: false, steps, error: e.message };
  }
};
