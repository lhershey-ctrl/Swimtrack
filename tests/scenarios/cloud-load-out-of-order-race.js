// Regression test for the actual root cause behind repeated live "PDF
// Summary shows the wrong swimmer's data" reports, even after two earlier,
// narrower fixes shipped (awaiting a tracked pending-load promise, then a
// defensive window.D-matches-active-swimmer recheck). The real bug:
// doLoadFromCloud() calls resolve in NETWORK order, not call order — if an
// OLDER request (e.g. for a swimmer the user already switched away from)
// happens to take longer than a NEWER one, its late-arriving response
// silently overwrites window.D, undoing the newer, correct load. Classic
// out-of-order-async-response bug. Uses the mock's per-doc delay
// (window.__mockDocDelayMs) to force this ordering deterministically:
// the FIRST swimmer clicked is the SLOW request, the SECOND (the one that
// should actually win) is fast.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        901: {
          id: '901', name: 'Noga', coachUids: ['coachX'], birthdate: '01/01/2015', sex: 'female',
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '25', seconds: 30, time: '30.00', date: '01/06/2025', points: 900 }], results: [{ event: '50 Free', pool: '25', seconds: 30, time: '30.00', date: '01/06/2025', points: 900 }] } },
        },
        902: {
          id: '902', name: 'Gal', coachUids: ['coachX'], birthdate: '01/01/2013', sex: 'male',
          seasons: { '2024-2025': { bests: [{ event: '50 Fly', pool: '25', seconds: 33, time: '33.00', date: '01/06/2025', points: 700 }], results: [{ event: '50 Fly', pool: '25', seconds: 33, time: '33.00', date: '01/06/2025', points: 700 }] } },
        },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);

    // Noga's fetch will take 800ms; Gal's only 50ms — Noga is clicked FIRST
    // (older request) but Gal's response will land first.
    await page.evaluate(() => { window.__mockDocDelayMs = { 901: 800, 902: 50 }; });

    await page.click('#loadSwimmerPicker button:has-text("Noga")'); // slow, older request
    await page.click('#loadSwimmerPicker button:has-text("Gal")');  // fast, newer request — should win
    await page.waitForTimeout(1100); // long enough for BOTH to have resolved

    const finalId = await page.evaluate(() => window.__loadedSwimmerId);
    assert(finalId === '902', 'REGRESSION: window.D should end up as Gal (the last-requested swimmer), got swimmer id: ' + finalId);
    steps.push({ desc: 'A slower, older request cannot clobber window.D after a faster, newer request already won', ok: true });

    await page.click('text=📄 PDF Summary');
    await page.waitForTimeout(1200);
    const radar = await page.evaluate(() => {
      const c = window.Chart && Chart.getChart ? Chart.getChart('rpt-stroke-radar') : null;
      return c ? c.data.datasets[0].data : null;
    });
    const flyIdx = ['Free', 'Back', 'Breast', 'Fly', 'IM'].indexOf('Fly');
    assert(radar && radar[flyIdx] === 700, 'REGRESSION: PDF report radar should show Gal\'s own Fly=700, got: ' + JSON.stringify(radar));
    steps.push({ desc: 'PDF report built after the race reflects the correct (last-selected) swimmer', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'cloud-load-out-of-order-race (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'cloud-load-out-of-order-race (desktop)', passed: false, steps, error: e.message };
  }
};
