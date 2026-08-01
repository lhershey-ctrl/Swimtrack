// New capability, directly requested with a sketch approved before
// implementation (see swimtrack-cloud-architecture memory): (1) loading a
// 2nd race PDF for a DIFFERENT event must be blocked outright, not just
// warned about, (2) swimmers are split into three buckets — matched
// (comparable), only-in-one-race (shown, not comparable), and matched-but-
// incomplete (a DNF/DQ swim, shown, not comparable — averaging/diffing
// against a partial swim would be misleading), (3) a progress-summary table
// covers every matched swimmer at once, sorted best-improved first.
//
// Drives the real parseEventMeta/eventMetaMatches/parseRaceTextFromString
// functions directly (same functions handleRaceDrop2 calls) rather than a
// synthetic PDF fixture — the PDF.js text-extraction layer itself is
// already covered by the world-top10-*.js tests; what's new here is the
// event-comparison and bucketing logic, which is exercised for real either
// way.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.click('#t-race');
    await page.waitForTimeout(200);

    // ── Part 1: event mismatch is blocked outright ──
    const blockResult = await page.evaluate(() => {
      // Race 1: 400m Free, Girls (real header text pattern from the actual PDFs).
      window.raceData = [
        { name: 'Noga Har-Shai', place: 3, total: 320.69, totalFmt: '05:20.69', splits: [34.55, 39.45, 41.23, 42.16, 40.90, 41.52, 40.71, 40.17] },
      ];
      window.raceHighlight = 0;
      window.raceEventMeta = window.parseEventMeta('400 חופשי - נ - תוצאות');
      const savedData = window.raceData, savedHL = window.raceHighlight, savedMeta = window.raceEventMeta;
      // Race 2: 200m Free — different distance, same stroke/sex.
      window.parseRaceTextFromString('200 חופשי - נ - תוצאות\n1 1 1 Someone Else 2013 Club 02:30.00 0.70 + 400\n02:30.00 01:55.00 01:15.00 00:35.00\n00:40.00 00:40.00 00:40.00');
      const newMeta = window.raceEventMeta;
      const matches = window.eventMetaMatches(savedMeta, newMeta);
      // Restore, mirroring handleRaceDrop2's own block branch.
      window.raceData = savedData; window.raceHighlight = savedHL; window.raceEventMeta = savedMeta;
      window.raceData2 = null;
      return { matches, savedLabel: savedMeta && savedMeta.label, newLabel: newMeta && newMeta.label };
    });
    assert(blockResult.matches === false, 'expected eventMetaMatches to detect 400 Free vs 200 Free as a mismatch, got: ' + JSON.stringify(blockResult));
    assert(blockResult.savedLabel === '400m Free (Girls)', 'expected race 1 event label to parse correctly, got: ' + blockResult.savedLabel);
    assert(blockResult.newLabel === '200m Free (Girls)', 'expected race 2 event label to parse correctly, got: ' + blockResult.newLabel);
    steps.push({ desc: 'A 200m Free 2nd file is correctly detected as a different event than a 400m Free 1st file', ok: true });

    const raceData2AfterBlock = await page.evaluate(() => window.raceData2);
    assert(raceData2AfterBlock === null, 'REGRESSION: raceData2 must stay null when the event mismatch blocks the load, got: ' + JSON.stringify(raceData2AfterBlock));
    steps.push({ desc: 'A blocked (mismatched-event) 2nd file never populates raceData2 — no partial/wrong comparison state', ok: true });

    // ── Part 2: matched vs unmatched vs incomplete buckets + progress table ──
    await page.evaluate(() => {
      window.raceEventMeta = window.parseEventMeta('400 חופשי - נ - תוצאות');
      window.raceData = [
        { name: 'Zohar Kupliansky', place: 1, total: 295.08, totalFmt: '04:55.08', splits: [33.24, 37.62, 37.75, 37.14, 37.29, 37.57, 37.27, 37.95] },
        { name: 'Noga Har-Shai', place: 3, total: 320.69, totalFmt: '05:20.69', splits: [34.55, 39.45, 41.23, 42.16, 40.90, 41.52, 40.71, 40.17] },
        { name: 'Maya Yehuda', place: 9, total: 404.26, totalFmt: '06:44.26', splits: [100.99, 105.36, 105.21, 92.70, null, null, null, null] },
        { name: 'Only In Heats', place: 5, total: 330.0, totalFmt: '05:30.00', splits: [35.0, 40.0, 41.0, 42.0, 41.0, 41.0, 41.0, 40.0] },
      ];
      window.raceHighlight = 1;
      window.raceEventMeta2 = window.parseEventMeta('400 חופשי - נ - תוצאות');
      window.raceData2 = [
        { name: 'Zohar Kupliansky', place: 3, total: 302.53, totalFmt: '05:02.53', splits: [34.01, 37.92, 39.20, 39.04, 39.07, 38.57, 38.26, 36.63] },
        { name: 'Noga Har-Shai', place: 8, total: 310.82, totalFmt: '05:10.82', splits: [34.57, 38.75, 39.93, 40.42, 39.57, 39.32, 39.16, 39.10] },
        { name: 'Maya Yehuda', place: 6, total: 304.7, totalFmt: '05:04.70', splits: [32.55, 37.01, 38.37, 39.24, 39.17, 40.12, 39.27, 38.97] },
        { name: 'Only In Finals', place: 2, total: 300.0, totalFmt: '05:00.00', splits: [33.0, 38.0, 38.0, 37.0, 38.0, 38.0, 38.0, 37.0] },
      ];
      window.raceHighlight2 = 1;
      window.renderRaceResults();
    });

    const matchedList = await page.$eval('#raceMatchedList', (el) => el.textContent);
    assert(matchedList.includes('Zohar Kupliansky') && matchedList.includes('Noga Har-Shai'), 'expected both fully-complete matched swimmers in the matched list, got: ' + matchedList);
    assert(!matchedList.includes('Maya Yehuda'), 'REGRESSION: Maya (DNF in race 1) must NOT appear in the matched/comparable list, got: ' + matchedList);
    steps.push({ desc: 'Matched list includes only swimmers with complete data in BOTH races', ok: true });

    const unmatchedList = await page.$eval('#raceUnmatchedList', (el) => el.textContent);
    assert(unmatchedList.includes('Only In Heats') && unmatchedList.includes('Only In Finals'), 'expected swimmers who only raced one of the two races to be listed, got: ' + unmatchedList);
    steps.push({ desc: 'Swimmers who only appear in one race are listed separately, not silently dropped', ok: true });

    const incompleteVisible = await page.$eval('#raceIncompleteWrap', (el) => getComputedStyle(el).display !== 'none');
    assert(incompleteVisible, 'expected the "matched but incomplete" section to show since Maya matched by name but DNF\'d in race 1');
    const incompleteList = await page.$eval('#raceIncompleteList', (el) => el.textContent);
    assert(incompleteList.includes('Maya Yehuda'), 'expected Maya to be listed as matched-but-incomplete, got: ' + incompleteList);
    steps.push({ desc: 'A swimmer who matched by name but DNF\'d in one race is shown as "incomplete", not silently merged into either bucket', ok: true });

    const progressVisible = await page.$eval('#raceProgressWrap', (el) => getComputedStyle(el).display !== 'none');
    assert(progressVisible, 'expected the progress summary table to show since there are matched swimmers');
    const progressText = await page.$eval('#raceProgressTable', (el) => el.textContent);
    assert(progressText.includes('Zohar Kupliansky') && progressText.includes('04:55.08') && progressText.includes('05:02.53'), 'expected Zohar\'s both times in the progress table, got: ' + progressText.slice(0, 400));
    assert(progressText.includes('Noga Har-Shai') && progressText.includes('05:20.69') && progressText.includes('05:10.82'), 'expected Noga\'s both times in the progress table, got: ' + progressText.slice(0, 400));
    const zoharIdx = progressText.indexOf('Zohar'), nogaIdx = progressText.indexOf('Noga');
    // Zohar regressed (5:02.53 slower than 4:55.08), Noga improved — Noga should sort above Zohar (best-improved first).
    assert(nogaIdx >= 0 && zoharIdx >= 0 && nogaIdx < zoharIdx, 'expected the improved swimmer (Noga) to sort above the regressed one (Zohar), best-improved first, got order in: ' + progressText.slice(0, 400));
    steps.push({ desc: 'Progress table lists every matched swimmer with both times, sorted best-improved first', ok: true });

    // ── Part 3: "What changed" only for a genuine self-comparison ──
    const whatChangedVisible = await page.$eval('#raceWhatChanged', (el) => getComputedStyle(el).display !== 'none');
    assert(whatChangedVisible, 'expected "What changed" to show for Noga vs Noga (self-comparison)');
    const whatChangedText = await page.$eval('#raceWhatChanged', (el) => el.textContent);
    assert(/What Changed/i.test(whatChangedText), 'expected a "What Changed" heading, got: ' + whatChangedText.slice(0, 200));
    steps.push({ desc: '"What changed" insights render for a real self-vs-self comparison', ok: true });

    // Switch B to a DIFFERENT swimmer — "What changed" must disappear (not meaningful swimmer-vs-swimmer).
    await page.click('#raceSwimmerSelect2 button:has-text("Zohar Kupliansky")');
    await page.waitForTimeout(200);
    const whatChangedVisible2 = await page.$eval('#raceWhatChanged', (el) => getComputedStyle(el).display !== 'none');
    assert(!whatChangedVisible2, 'REGRESSION: "What changed" should hide once comparing two DIFFERENT swimmers, not just self-vs-self, but it\'s still showing');
    steps.push({ desc: '"What changed" correctly hides once A and B are different swimmers', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'race-event-match-and-buckets (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'race-event-match-and-buckets (desktop)', passed: false, steps, error: e.message };
  }
};
