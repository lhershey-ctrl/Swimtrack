// Regression test for a real bug reported live from a screenshot: a
// swimmer with many international-ranking appearances (e.g. 43+) had each
// year's World/Europe cell rendered as ONE giant unbroken line, forcing
// the whole "International Rankings" card into horizontal scroll — the
// global `.tbl-card td { white-space: nowrap }` rule (fine for typical
// short cells elsewhere) fought this cell's long comma-joined entry list.
// Fixed by wrapping each entry in its own nowrap "chip" inside a
// white-space:normal container, so the GROUP wraps onto new lines instead
// of the table growing wider. This test seeds 16 entries in a single year
// (8 events x World+Europe) — more than enough to have overflowed before
// the fix — and asserts the card's scrollWidth no longer exceeds its
// clientWidth.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    var events = ['50m Freestyle', '100m Freestyle', '50m Backstroke', '100m Backstroke', '50m Breaststroke', '100m Breaststroke', '50m Butterfly', '100m Butterfly'];
    var entries = [];
    events.forEach(function (event, i) {
      entries.push({ source: 'world', year: 2025, course: i % 2 ? 'LCM' : 'SCM', sex: 'F', ageGroup: '40-44', event: event, rank: (i % 10) + 1, time: '30.00', seconds: 30, name: 'ANYA GOSTMALSKI' });
      entries.push({ source: 'europe', year: 2025, course: i % 2 ? 'LC' : 'SC', sex: 'F', ageGroup: '40-44', event: event, rank: (i % 10) + 1, time: '30.00', seconds: 30, name: 'ANYA GOSTMALSKI' });
    });
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        110916: { id: '110916', name: 'אניה גוסטמלסקי', coachUids: ['coachX'], intlName: 'ANYA GOSTMALSKI', birthdate: '01/06/1981', sex: 'female',
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '50', seconds: 30, time: '30.00', date: '01/06/2025', points: 500 }], results: [{ event: '50 Free', pool: '50', seconds: 30, time: '30.00', date: '01/06/2025', points: 500 }] } } },
      },
      teams: {}, config: { mastersTop10: { entries: entries, count: entries.length, loadedAt: Date.now(), by: 'test' } },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#loadSwimmerPicker button:has-text("גוסטמלסקי")');
    await page.waitForTimeout(900);
    await page.click('#t-analyze');
    await page.waitForTimeout(300);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(500);

    const hint = await page.$eval('#intlRankHint', (el) => el.textContent);
    assert(/16 appearances/.test(hint), 'expected all 16 entries to be counted, got: ' + hint);

    const overflow = await page.$eval('#intlRankCard', (el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    assert(overflow.scrollWidth <= overflow.clientWidth + 2, 'REGRESSION: International Rankings card overflows horizontally with a heavy year (16 entries), got scrollWidth=' + overflow.scrollWidth + ' clientWidth=' + overflow.clientWidth);
    steps.push({ desc: 'A year with 16 entries wraps onto multiple lines instead of forcing horizontal scroll', ok: true });

    const rows = await page.$eval('#intlRankBody', (el) => el.textContent);
    assert(rows.includes('50 Free') && rows.includes('100 Fly'), 'expected all events to still be present in the wrapped cell, got: ' + rows.slice(0, 300));
    steps.push({ desc: 'All entries are still present, just wrapped rather than dropped or truncated', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'intl-rankings-no-horizontal-scroll (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'intl-rankings-no-horizontal-scroll (desktop)', passed: false, steps, error: e.message };
  }
};
