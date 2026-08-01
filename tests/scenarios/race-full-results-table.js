// New capability, directly requested: loading one race PDF should present
// ALL splits for EVERY swimmer (a full table), not just the highlighted
// swimmer's laps — plus the event label detected from the PDF header, and
// clicking any row changes who's highlighted in the chart/metrics below.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.click('#t-race');
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      window.raceEventMeta = window.parseEventMeta('400 חופשי - נ - תוצאות');
      window.raceData = [
        { name: 'Mika Arad', place: 1, total: 299.57, totalFmt: '04:59.57', splits: [33.08, 36.75, 37.53, 38.94, 37.63, 38.99, 38.61, 38.04] },
        { name: 'Noga Har-Shai', place: 3, total: 320.69, totalFmt: '05:20.69', splits: [34.55, 39.45, 41.23, 42.16, 40.90, 41.52, 40.71, 40.17] },
        { name: 'Maya Yehuda', place: 9, total: 404.26, totalFmt: '06:44.26', splits: [100.99, 105.36, 105.21, 92.70, null, null, null, null] },
      ];
      window.raceHighlight = 0;
      window.renderRaceResults();
    });

    const badgeText = await page.$eval('#raceEventBadge', (el) => el.textContent);
    assert(/400m Free/.test(badgeText), 'expected the detected event label to show next to "All Results", got: ' + badgeText);
    steps.push({ desc: 'Detected event label (distance/stroke/sex) shows above the results table', ok: true });

    const tableText = await page.$eval('#raceFullTable', (el) => el.textContent);
    ['Mika Arad', 'Noga Har-Shai', 'Maya Yehuda'].forEach((n) => assert(tableText.includes(n), 'expected ' + n + ' in the full results table, got: ' + tableText.slice(0, 400)));
    assert(/34\.55/.test(tableText) && /40\.17/.test(tableText), 'expected Noga\'s full split row (not just the highlighted swimmer\'s), got: ' + tableText.slice(0, 800));
    assert(/33\.08/.test(tableText) && /38\.04/.test(tableText), 'expected every swimmer\'s splits in the table, not just the highlighted one, got: ' + tableText.slice(0, 800));
    steps.push({ desc: 'Full results table shows every swimmer and every split, not just the highlighted swimmer', ok: true });

    assert(/DNF/.test(tableText), 'expected the DNF swimmer to be visibly flagged in the table, got: ' + tableText.slice(0, 800));
    steps.push({ desc: 'An incomplete/DNF swim is visibly flagged in the full table rather than silently showing dashes with no explanation', ok: true });

    // Click a different swimmer's row → they become highlighted.
    await page.click('#raceFullTable tr:has-text("Mika Arad")');
    await page.waitForTimeout(300);
    const highlightedName = await page.evaluate(() => window.raceData[window.raceHighlight].name);
    assert(highlightedName === 'Mika Arad', 'REGRESSION: clicking a row in the full table should change the highlighted swimmer, got: ' + highlightedName);
    steps.push({ desc: 'Clicking a row in the full results table changes who\'s highlighted in the chart/metrics below', ok: true });

    // Y-axis should still be tight/reasonable for the newly-highlighted swimmer + winner, unaffected by Maya's DNF garbage.
    const yScale = await page.evaluate(() => { const y = window.raceChartInst.options.scales.y; return { min: y.min, max: y.max }; });
    assert(yScale.max < 60, 'REGRESSION: Y-axis max should stay tight even with a DNF elsewhere in the field, got: ' + JSON.stringify(yScale));
    steps.push({ desc: 'Y-axis stays tight after switching the highlighted swimmer via the table', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'race-full-results-table (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'race-full-results-table (desktop)', passed: false, steps, error: e.message };
  }
};
