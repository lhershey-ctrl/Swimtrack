// Regression test for the "PDF Summary should be exactly 2 pages, 4 event
// graphs on page 1" request. This was tried once before (a straight port),
// but a real busy swimmer (many current-season meets) made a card too tall
// to fit, spilling a near-empty extra page — the fix at the time was to
// split into 2 cards per page instead (2026-07-21, HEAD 71499d6), growing
// to 3+ pages depending on data volume. Revisited per direct request: keep
// all 4 cards on page 1 always, but bound each card's height by capping its
// results table to a fixed row count (the actual unbounded-growth culprit)
// instead of letting page count vary with data volume.
const { openDesktopApp, assert } = require('../lib/harness');

function seed() {
  window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
  var events = ['50 Free', '100 Free', '50 Fly', '100 IM'];
  var dates = ['05/09/2024', '20/09/2024', '10/10/2024', '01/11/2024', '15/11/2024', '01/12/2024', '10/01/2025', '25/01/2025', '05/02/2025', '20/02/2025'];
  var results = [];
  events.forEach(function (ev, ei) {
    dates.forEach(function (d, di) {
      results.push({ event: ev, pool: '25', seconds: 30 + ei * 10 - di * 0.3, time: 'x', date: d, points: 600 + di * 10, competition: 'Meet #' + (di + 1) + ' — Winter Series' });
    });
  });
  var prevResults = events.map(function (ev, ei) { return { event: ev, pool: '25', seconds: 35 + ei * 10, time: 'x', date: '01/03/2024', points: 500, competition: 'Prev Season Meet' }; });
  window.__mockStore = {
    coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
    swimmers: {
      901: {
        id: '901', name: 'BusySwimmer', coachUids: ['coachX'], birthdate: '01/01/2013', sex: 'female',
        seasons: {
          '2023-2024': { bests: prevResults, results: prevResults },
          '2024-2025': { bests: results.filter(function (r, i) { return i % 10 === 9; }), results: results },
        },
      },
    },
    teams: {}, config: {},
  };
}

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(seed);
  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#loadSwimmerPicker button:has-text("BusySwimmer")');
    await page.waitForTimeout(900);
    await page.click('text=📄 PDF Summary');
    await page.waitForTimeout(1400);

    const info = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('.rpt-page'));
      const cards = pages[0] ? Array.from(pages[0].querySelectorAll('.rpt-evt-card')) : [];
      return {
        pageCount: pages.length,
        page1Height: pages[0] ? pages[0].getBoundingClientRect().height : 0,
        cardCount: cards.length,
        notes: cards.map((c) => (c.textContent.match(/\+\d+ more this season/) || [null])[0]),
        rowCounts: cards.map((c) => c.querySelectorAll('tr').length - 1),
      };
    });

    assert(info.pageCount === 2, 'report should always be exactly 2 pages regardless of data volume, got: ' + info.pageCount);
    steps.push({ desc: 'Report is always exactly 2 pages (event page + summary page)', ok: true });

    assert(info.cardCount === 4, 'all 4 event cards should be on page 1, got: ' + info.cardCount);
    steps.push({ desc: 'All 4 event graphs are on page 1', ok: true });

    assert(info.rowCounts.every((n) => n <= 4), 'a busy swimmer\'s per-event table should cap at a fixed row count, got: ' + JSON.stringify(info.rowCounts));
    assert(info.notes.every((n) => n && /more this season/.test(n)), 'a capped table should note how many results were hidden, got: ' + JSON.stringify(info.notes));
    steps.push({ desc: 'A busy swimmer\'s per-event table caps rows and notes the hidden count, instead of growing the card unboundedly', ok: true });

    // The real bug this guards: 1032px is the ~usable printable height on an
    // A4 page at 12mm margins (measured in the original overflow bug — see
    // buildPdfReport's own comment). A card that grows with data volume
    // eventually blows this budget; a capped one shouldn't, regardless of
    // how many meets the swimmer has this season.
    assert(info.page1Height < 1032, 'page 1 should fit within one printed page even for a busy swimmer, got height: ' + info.page1Height);
    steps.push({ desc: 'Page 1 fits within one printed page\'s usable height, even for a busy swimmer', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'pdf-report-page-count (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'pdf-report-page-count (desktop)', passed: false, steps, error: e.message };
  }
};
