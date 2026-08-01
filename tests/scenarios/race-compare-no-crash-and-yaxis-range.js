// Real user report, Race tab (🏁), 400m Free heats vs finals PDFs: (1)
// loading a 2nd PDF to overlay/compare crashed with "Could not read PDF:
// renderRacePosition is not defined" — renderRaceResults() called
// renderRacePosition() and renderRaceOpenClose(), neither of which was ever
// defined anywhere in the file (dead calls, likely left over from an
// abandoned "Position Through the Race" feature — its HTML scaffold
// (#racePosCard) still exists, hidden, but was never wired up). The first
// PDF load hit the same ReferenceError, just silently (uncaught, no visible
// error UI on that path) — only the compare flow's try/catch surfaced it.
// Fixed by removing both dead calls. (2) The split-time chart's Y axis
// wasn't scaled to the actual split range (e.g. ~28-32s for 50m splits) —
// the code already computed a tight _rYMin/_rYMax from the real data but
// never passed them into the Chart.js y-scale, so it used Chart's own
// default range. Also switched from `reverse:true` (unique to this one
// chart) to the normal low-to-high orientation every other chart in the app
// uses. Fixed by wiring min/max into scales.y and dropping reverse.
const { openDesktopApp, assert } = require('../lib/harness');

function fakeSwimmer(name, place, splits) {
  const total = splits.reduce((a, b) => a + b, 0);
  return { name, place, splits, total, totalFmt: total.toFixed(2) };
}

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.click('#t-race');
    await page.waitForTimeout(200);

    // 400m Free = 8x 50m splits, realistic 28-32s range (matches the
    // reported real-world case: 50m splits, not the 0-based default range).
    await page.evaluate(() => {
      window.raceHighlight = 0;
      window.raceData = [
        window.__fakeSw1 = { name: 'Swimmer A', place: 1, splits: [28.5, 29.8, 30.1, 30.3, 30.5, 30.6, 30.4, 29.9], total: 240.1, totalFmt: '4:00.10' },
        { name: 'Swimmer B', place: 2, splits: [28.9, 30.1, 30.4, 30.6, 30.8, 30.9, 30.7, 30.2], total: 243.6, totalFmt: '4:03.60' },
      ];
      window.renderRaceResults();
    });

    assert(consoleErrors.length === 0, 'REGRESSION: loading the first race PDF should not throw (renderRacePosition/renderRaceOpenClose no longer exist), got: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'First race load (renderRaceResults) runs with no uncaught errors', ok: true });

    const resultsVisible = await page.$eval('#raceResults', (el) => getComputedStyle(el).display !== 'none');
    assert(resultsVisible, 'expected the race results section to render and show');
    steps.push({ desc: 'Race results section renders normally after the fix', ok: true });

    // Now simulate loading a 2nd (compare) PDF — the exact flow that
    // surfaced the crash for the user.
    await page.evaluate(() => {
      window.raceData2 = [
        { name: 'Swimmer A', place: 1, splits: [28.0, 29.5, 29.9, 30.0, 30.2, 30.3, 30.1, 29.6], total: 236.6, totalFmt: '3:56.60' },
      ];
      window.raceHighlight2 = 0;
      window.renderRaceResults();
    });
    assert(consoleErrors.length === 0, 'REGRESSION: loading a 2nd (compare) race PDF should not throw "renderRacePosition is not defined", got: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'Second (compare) race load runs with no uncaught errors — the exact regression reported', ok: true });

    // Y-axis: must be scaled to the real split range (not Chart.js's 0-based
    // default), and oriented low-to-high like every other chart (no reverse).
    const yScale = await page.evaluate(() => {
      const y = window.raceChartInst.options.scales.y;
      return { min: y.min, max: y.max, reverse: !!y.reverse };
    });
    assert(yScale.min >= 20 && yScale.min <= 29, 'expected the Y-axis min to sit just under the fastest split (~28s), got: ' + JSON.stringify(yScale));
    assert(yScale.max >= 30 && yScale.max <= 35, 'expected the Y-axis max to sit just over the slowest split (~30.9s), got: ' + JSON.stringify(yScale));
    assert(!yScale.reverse, 'REGRESSION: Y axis should read low-to-high like every other chart in the app, not reversed, got: ' + JSON.stringify(yScale));
    steps.push({ desc: 'Y axis is tightly scaled to the actual split range (not a wide 0-based default) and reads low-to-high, matching every other chart', ok: true });

    await browser.close();
    return { name: 'race-compare-no-crash-and-yaxis-range (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'race-compare-no-crash-and-yaxis-range (desktop)', passed: false, steps, error: e.message };
  }
};
