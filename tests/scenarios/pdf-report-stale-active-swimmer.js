// Regression test for a second path to the same bug as
// pdf-report-swimmer-switch-race.js: a real user still saw the WRONG
// swimmer's radar graph after that fix shipped ("for others sometimes it is
// ok but not for all"), meaning at least one other way to change the active
// swimmer also leaves window.D stale — not just selectLoadSwimmer()'s async
// cloud fetch. window.selectSwimmer(idx) is one such path: it flips
// `activeSwimmer` and re-renders selectors WITHOUT touching window.D at all
// (used internally by a few call sites). This test drives that path
// directly to prove openPdfReport()'s defensive re-check (does window.D
// actually belong to the active swimmer? if not, force a reload) catches
// staleness regardless of WHICH path caused it, not just the one
// originally diagnosed.
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

    // Load Noga fully — window.D genuinely holds her data.
    await page.click('#loadSwimmerPicker button:has-text("Noga")');
    await page.waitForTimeout(900);

    // Flip the active swimmer to Gal via a path that does NOT touch
    // window.D or window.__pendingCloudLoad at all — simulating whatever
    // second path the real bug report implies exists.
    await page.evaluate(() => {
      const swimmers = window.getAllSwimmers();
      const galIdx = swimmers.findIndex((s) => s.name === 'Gal');
      window.selectSwimmer(galIdx);
    });
    await page.click('text=📄 PDF Summary');
    await page.waitForTimeout(1200);

    const radar = await page.evaluate(() => {
      const c = window.Chart && Chart.getChart ? Chart.getChart('rpt-stroke-radar') : null;
      return c ? c.data.datasets[0].data : null;
    });
    const flyIdx = ['Free', 'Back', 'Breast', 'Fly', 'IM'].indexOf('Fly');
    assert(radar && radar[flyIdx] === 700, 'REGRESSION: radar should show Gal\'s own Fly=700 (openPdfReport should have force-reloaded stale D), got: ' + JSON.stringify(radar));
    steps.push({ desc: 'openPdfReport force-reloads when window.D doesn\'t match the active swimmer, regardless of which path caused the mismatch', ok: true });

    const reportHeader = await page.$eval('.rpt-name', (el) => el.textContent);
    assert(reportHeader === 'Gal', 'report header should name the correct (new) swimmer, got: ' + reportHeader);
    steps.push({ desc: 'Report header names the correct swimmer', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'pdf-report-stale-active-swimmer (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'pdf-report-stale-active-swimmer (desktop)', passed: false, steps, error: e.message };
  }
};
