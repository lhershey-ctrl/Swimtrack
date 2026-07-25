// Mobile equivalent of masters-personal-records-grid.js (desktop): same
// real bug (PB from one bracket compared against a different bracket's
// record), same fix — but mobile uses an age-group TAB selector instead of
// a wide multi-column table, since a phone screen can't fit one column per
// bracket. Defaults to the swimmer's current bracket.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        115352: {
          id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], recordName: 'הר-שי לירון', birthdate: '01/06/1978', sex: 'male',
          seasons: {
            '2022-2023': { bests: [{ event: '200 Breast', pool: '50', seconds: 152.19, time: '2:32.19', date: '01/10/2022', points: 502 }], results: [{ event: '200 Breast', pool: '50', seconds: 152.19, time: '2:32.19', date: '01/10/2022', points: 502 }] },
            '2025-2026': { bests: [{ event: '200 Breast', pool: '50', seconds: 149.05, time: '2:29.05', date: '01/10/2025', points: 510 }], results: [{ event: '200 Breast', pool: '50', seconds: 149.05, time: '2:29.05', date: '01/10/2025', points: 510 }] },
          },
        },
      },
      teams: {},
      config: {
        records: {
          records: { 50: { M: {
            '40-44': { '200|Breast': { sec: 150.00, time: '2:30.00', name: 'הר-שי לירון' } },
            '45-49': { '200|Breast': { sec: 155.00, time: '2:35.00', name: 'קוסטק אריק' } },
          } } },
          segments: {}, count: 2, loadedAt: Date.now(), by: 'test',
        },
      },
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Records")');
    await page.click('button:has-text("50m Pool")');
    await page.waitForTimeout(600);

    // Defaults to the current bracket (45-49, since "now" puts a 1978-born
    // swimmer at 47-48) — should show the 45-49 PB and the real holder's
    // name (not this swimmer), no gold background.
    let bodyText = await page.evaluate(() => document.body.innerText);
    assert(bodyText.includes('45-49') && bodyText.includes('40-44'), 'expected tabs for both brackets this swimmer has competed in, got: ' + bodyText.slice(0, 600));
    assert(bodyText.includes('2:29.05'), 'expected the 45-49-era PB to show by default, got: ' + bodyText.slice(0, 600));
    assert(bodyText.includes('קוסטק אריק'), 'expected the real 45-49 record holder to be named (not this swimmer), got: ' + bodyText.slice(0, 600));
    steps.push({ desc: 'Defaults to the current bracket, showing that bracket\'s own PB next to its own (different) record holder', ok: true });

    // Switch to the 40-44 tab — the swimmer holds THAT bracket's record.
    await page.click('button:has-text("40-44")');
    await page.waitForTimeout(300);
    bodyText = await page.evaluate(() => document.body.innerText);
    assert(bodyText.includes('2:32.19'), 'expected the 40-44-era PB after switching tabs, got: ' + bodyText.slice(0, 600));
    assert(!bodyText.includes('2:29.05') || bodyText.indexOf('2:32.19') < bodyText.indexOf('2:29.05'), 'expected the 45-49 PB to no longer be the active one shown, got: ' + bodyText.slice(0, 600));
    steps.push({ desc: 'Switching to the 40-44 tab shows that bracket\'s own PB (this swimmer holds this one)', ok: true });

    assert(bodyText.includes('🏅'), 'expected the medal marker on the held-record row, got: ' + bodyText.slice(0, 600));
    const goldCell = await page.$eval('body', (el) => /rgba\(224,\s*165,\s*42/.test(el.innerHTML));
    assert(goldCell, 'expected a gold-highlighted (rgba 224,165,42) cell for the bracket this swimmer holds the record in');
    steps.push({ desc: 'Gold highlight + medal marker appear for the held-record bracket', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-masters-personal-records-grid', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-masters-personal-records-grid', passed: false, steps, error: e.message };
  }
};
