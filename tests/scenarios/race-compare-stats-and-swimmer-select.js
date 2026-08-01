// New capability, directly requested after a live user report: "compare 2
// races" previously just silently overlaid ONE line (whichever swimmer
// parseRaceTextFromString happened to auto-match by name) onto the main
// chart, with no visible way to pick a different swimmer from the 2nd
// race — #raceSwimmerSelect2 existed in the HTML but no JS ever populated
// it. Also the Y-axis "tight range" fix from earlier this session computed
// min/max across the ENTIRE field's splits, so one DNF/DQ swimmer with
// garbage split values (e.g. 1:40+ per "50m") blew the range out for
// everyone — confirmed against the user's real two 400m Free PDFs (heats +
// finals), where heat 2 has exactly such a swimmer.
//
// Now: (1) any swimmer from EITHER race is selectable as swimmer A or B,
// (2) a numeric comparison table (total time, place, avg 50m/100m split,
// per-split deltas) sits alongside the existing overlay chart, (3) the
// Y-axis is scoped to only the swimmers actually highlighted on the chart
// (winner, A, B), not the full field.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.click('#t-race');
    await page.waitForTimeout(200);

    // Real 400m Free splits (הר-שי נוגה, heats vs finals) plus a real DNF
    // outlier from the same heat (יהודה מאיה) whose garbage "50m" splits
    // (100s+) previously blew out the Y-axis for the whole chart.
    await page.evaluate(() => {
      window.raceData = [
        { name: 'ארד מיקה', place: 1, total: 299.57, totalFmt: '04:59.57', splits: [33.08, 36.75, 37.53, 38.94, 37.63, 38.99, 38.61, 38.04] },
        { name: 'הר-שי נוגה', place: 3, total: 320.69, totalFmt: '05:20.69', splits: [34.55, 39.45, 41.23, 42.16, 40.90, 41.52, 40.71, 40.17] },
        { name: 'יהודה מאיה (DNF)', place: 9, total: 404.26, totalFmt: '06:44.26', splits: [100.99, 105.36, 105.21, 92.70, null, null, null, null] },
      ];
      window.raceHighlight = 1; // הר-שי נוגה
      window.raceData2 = [
        { name: 'הר-שי נוגה', place: 8, total: 310.82, totalFmt: '05:10.82', splits: [34.57, 38.75, 39.93, 40.42, 39.57, 39.32, 39.16, 39.10] },
        { name: 'שרף יובל', place: 1, total: 286.16, totalFmt: '04:46.16', splits: [32.55, 34.06, 35.59, 36.60, 37.03, 36.80, 37.23, 36.30] },
      ];
      window.raceHighlight2 = 0;
      window.renderRaceResults();
    });

    // Y-axis: tight around the real ~31-45s split range, unaffected by the
    // DNF swimmer's 90-105s "splits" sitting elsewhere in the same field.
    const yScale = await page.evaluate(() => { const y = window.raceChartInst.options.scales.y; return { min: y.min, max: y.max }; });
    assert(yScale.min >= 28 && yScale.min <= 34, 'expected Y-axis min just under the fastest real split (~32.55s), got: ' + JSON.stringify(yScale));
    assert(yScale.max >= 43 && yScale.max <= 50, 'REGRESSION: expected Y-axis max close to the real slowest relevant split (~42-45s), not blown out by the DNF swimmer\'s 100s+ splits, got: ' + JSON.stringify(yScale));
    steps.push({ desc: 'Y-axis is tightly scoped to the highlighted swimmers only, not thrown off by an unrelated DNF swimmer elsewhere in the field', ok: true });

    // Swimmer-B selector: both race-2 swimmers must be pickable, not just
    // whichever one got auto-matched by name.
    const selBtns = await page.$$eval('#raceSwimmerSelect2 button', (els) => els.map((e) => e.textContent.trim()));
    assert(selBtns.some((t) => t.includes('הר-שי נוגה')) && selBtns.some((t) => t.includes('שרף יובל')), 'expected both race-2 swimmers to be selectable, got: ' + JSON.stringify(selBtns));
    steps.push({ desc: 'Any swimmer from the 2nd race is selectable as the comparison swimmer (not just an auto-matched one)', ok: true });

    const clearBtnVisible = await page.$eval('#raceClearBtn2', (el) => getComputedStyle(el).display !== 'none');
    assert(clearBtnVisible, 'expected the "Clear 2nd race" button to become visible once a 2nd race is loaded (was previously dead/always hidden)');
    steps.push({ desc: '"Clear 2nd race" button becomes visible once a 2nd race is loaded', ok: true });

    // Comparison table: real numbers, real improvement heats -> finals.
    let tableText = await page.$eval('#raceCompareTable', (el) => el.textContent);
    assert(/05:20\.69/.test(tableText) && /05:10\.82/.test(tableText), 'expected both total times in the comparison table, got: ' + tableText.slice(0, 300));
    assert(/40\.09s/.test(tableText) && /38\.85s/.test(tableText), 'expected correct avg 50m splits (A: 40.09s, B: 38.85s), got: ' + tableText.slice(0, 400));
    assert(/100m[\s\S]{0,40}39\.45s[\s\S]{0,40}38\.75s/.test(tableText), 'expected the 100m-mark split row to show both swimmers\' real values, got: ' + tableText.slice(0, 600));
    steps.push({ desc: 'Comparison table shows correct total time, avg 50m/100m splits, and per-split values for both swimmers', ok: true });

    // Selecting a DIFFERENT swimmer in race 2 (not the same person) must
    // update the table to a genuine swimmer-vs-swimmer comparison.
    await page.click('#raceSwimmerSelect2 button:has-text("שרף יובל")');
    await page.waitForTimeout(200);
    tableText = await page.$eval('#raceCompareTable', (el) => el.textContent);
    assert(/04:46\.16/.test(tableText), 'expected swimmer B\'s total time to update to שרף יובל\'s time after re-selecting, got: ' + tableText.slice(0, 300));
    assert(!/05:10\.82/.test(tableText), 'REGRESSION: table should no longer show the previous B swimmer\'s time after switching selection, got: ' + tableText.slice(0, 300));
    steps.push({ desc: 'Selecting a different swimmer in race 2 updates the table to a real swimmer-vs-swimmer comparison, not just self-vs-self', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'race-compare-stats-and-swimmer-select (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'race-compare-stats-and-swimmer-select (desktop)', passed: false, steps, error: e.message };
  }
};
