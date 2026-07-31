// Core happy path: paste in two seasons of results (offline, no cloud),
// confirm they MERGE correctly (not overwrite each other) and that the
// Analyze tab's charts actually render with real data — not just that the
// page didn't crash. Checks the underlying Chart.js instances' datasets
// directly (window.btChartInst / window.ptChartInst), since a chart can
// exist as a DOM canvas while still being empty (e.g. the print-report bug
// logged in swimtrack-cloud-architecture, where a 0×0 canvas "rendered"
// nothing at all).
const { openDesktopApp, assert } = require('../lib/harness');

const SEASON_1 = {
  _swimmerId: '999002',
  _swimmerName: 'Chart Test Swimmer',
  '2024-2025': {
    bests: [
      { event: '50 Free', pool: '25', seconds: 32.5, time: '32.50', date: '01/11/2024', points: 450 },
      { event: '100 Free', pool: '25', seconds: 70.0, time: '1:10.00', date: '01/11/2024', points: 400 },
    ],
    results: [
      { event: '50 Free', pool: '25', seconds: 32.5, time: '32.50', date: '01/11/2024', points: 450, place: 1, competition: 'Meet A' },
      { event: '100 Free', pool: '25', seconds: 70.0, time: '1:10.00', date: '01/11/2024', points: 400, place: 2, competition: 'Meet A' },
    ],
  },
};
const SEASON_2 = {
  _swimmerId: '999002',
  _swimmerName: 'Chart Test Swimmer',
  '2025-2026': {
    bests: [
      { event: '50 Free', pool: '25', seconds: 31.8, time: '31.80', date: '01/11/2025', points: 470 },
      { event: '100 Free', pool: '25', seconds: 68.5, time: '1:08.50', date: '01/11/2025', points: 420 },
    ],
    results: [
      { event: '50 Free', pool: '25', seconds: 31.8, time: '31.80', date: '01/11/2025', points: 470, place: 1, competition: 'Meet B' },
      { event: '100 Free', pool: '25', seconds: 68.5, time: '1:08.50', date: '01/11/2025', points: 420, place: 1, competition: 'Meet B' },
    ],
  },
};

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await pasteJson(page, SEASON_1);
    // Unrecognized swimmer ID (999002) opens the new-swimmer confirm modal
    // (see swimtrack-cloud-architecture memory, 2026-07-31) instead of
    // silently auto-creating them — confirm it before the second paste,
    // same as a real user would after their first file for a new swimmer.
    const modalOpen = await page.$eval('#newSwimmerModal', (el) => getComputedStyle(el).display !== 'none');
    assert(modalOpen, 'expected the new-swimmer confirm modal to open for an unrecognized ID');
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    await pasteJson(page, SEASON_2);

    const seasonKeys = await page.evaluate(() => Object.keys(window.D || {}).sort());
    assert(
      seasonKeys.length === 2 && seasonKeys.includes('2024-2025') && seasonKeys.includes('2025-2026'),
      'expected both seasons merged into window.D, got: ' + JSON.stringify(seasonKeys)
    );
    steps.push({ desc: 'Two pasted seasons merge together (not overwritten)', ok: true });

    await page.click('#t-analyze');
    await page.waitForTimeout(300);
    // Pasting JSON for an unrecognized swimmer auto-creates them
    // (addSwimmerById), using the real name from _swimmerName (bm2.js/
    // extractFromHtml already scrape this off the LogLig page) — real bug,
    // fixed 2026-07-31: this field was captured but never read back out, so
    // every auto-added swimmer got a placeholder "Swimmer <id>" name.
    const bannerText = await page.$eval('#swimmerBanner', (el) => el.textContent);
    assert(bannerText.includes('Chart Test Swimmer'), 'banner should show the swimmer\'s real name from _swimmerName, not a "Swimmer <id>" placeholder, got: ' + bannerText);
    assert(bannerText.includes('999002'), 'banner should show the loaded swimmer\'s player ID, got: ' + bannerText);
    assert(bannerText.includes('2'), 'banner should reflect 2 seasons loaded, got: ' + bannerText);
    steps.push({ desc: 'Swimmer banner reflects the auto-filled real name, player ID, and season count', ok: true });

    const chartState = await page.evaluate(() => ({
      bestTimesPoints: window.btChartInst ? window.btChartInst.data.datasets.reduce((a, d) => a + d.data.length, 0) : -1,
      pointsTrendPoints: window.ptChartInst ? window.ptChartInst.data.datasets.reduce((a, d) => a + d.data.length, 0) : -1,
    }));
    assert(chartState.bestTimesPoints > 0, 'Best Times chart should have plotted data points, got: ' + JSON.stringify(chartState));
    steps.push({ desc: 'Best Times Over Time chart has real plotted data (not a blank/empty canvas)', ok: true });
    assert(chartState.pointsTrendPoints > 0, 'Points Trend chart should have plotted data points, got: ' + JSON.stringify(chartState));
    steps.push({ desc: 'Points Trend chart has real plotted data', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'load-data-and-charts (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'load-data-and-charts (desktop)', passed: false, steps, error: e.message };
  }
};

async function pasteJson(page, obj) {
  const isOpen = await page.$eval('#pasteArea', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
  if (!isOpen) await page.click('.paste-toggle:has-text("Paste JSON")');
  await page.waitForTimeout(120);
  await page.fill('#jsonPaste', JSON.stringify(obj));
  await page.click('button.load-btn:has-text("Load")');
  await page.waitForTimeout(400);
}
