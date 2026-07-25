// Regression test for: opening "📄 PDF Summary" for one junior swimmer right
// after switching to them from another (e.g. Noga → Gal, a real family
// account with two juniors) could show the PREVIOUS swimmer's data,
// including the "Performance by Stroke" radar — a race between
// selectLoadSwimmer()'s async cloud fetch and openPdfReport() reading
// window.D before that fetch lands. Uses an artificial network delay (the
// mock otherwise resolves via a bare microtask, which hides real-world
// races) to force the window where this used to be observable. Fixed by
// having openPdfReport() await the in-flight load (window.__pendingCloudLoad)
// before building the report.
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

    // Load Noga fully first, so window.D genuinely holds HER data (the thing
    // that must NOT still be there once the report for Gal is built).
    await page.click('#loadSwimmerPicker button:has-text("Noga")');
    await page.waitForTimeout(900);

    // Simulate real network latency, then switch to Gal and click PDF
    // Summary immediately — no wait — exactly the race a fast click (or a
    // slow connection) produces in real use.
    await page.evaluate(() => { window.__mockNetworkDelayMs = 400; });
    await page.click('#loadSwimmerPicker button:has-text("Gal")');
    await page.click('text=📄 PDF Summary');
    await page.waitForTimeout(1500);

    const radar = await page.evaluate(() => {
      const c = window.Chart && Chart.getChart ? Chart.getChart('rpt-stroke-radar') : null;
      return c ? c.data.datasets[0].data : null;
    });
    assert(radar, 'radar chart should exist after opening the PDF report');
    const flyIdx = ['Free', 'Back', 'Breast', 'Fly', 'IM'].indexOf('Fly');
    assert(radar[flyIdx] === 700, 'REGRESSION: radar should show Gal\'s own Fly=700, got: ' + JSON.stringify(radar));
    assert(radar.every((v, i) => i === flyIdx || v === 0), 'REGRESSION: radar should have ONLY Gal\'s Fly score, no leftover data from Noga (Free=900), got: ' + JSON.stringify(radar));
    steps.push({ desc: 'PDF report for the newly-switched-to swimmer waits for their cloud load before building, avoiding the stale-data race', ok: true });

    const reportHeader = await page.$eval('.rpt-name', (el) => el.textContent);
    assert(reportHeader === 'Gal', 'report header should name the correct (new) swimmer, got: ' + reportHeader);
    steps.push({ desc: 'Report header names the correct swimmer', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'pdf-report-swimmer-switch-race (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'pdf-report-swimmer-switch-race (desktop)', passed: false, steps, error: e.message };
  }
};
