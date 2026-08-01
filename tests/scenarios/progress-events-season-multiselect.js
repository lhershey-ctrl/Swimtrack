// New capability, directly requested: "Progress in Key Events" (Analyze tab
// → Progress & Trends) per-event season filter defaults to the LAST 2
// seasons (not "All"), and is now multi-select (click toggles a season
// in/out, same interaction as the event selector above it) instead of the
// old single-select "pick exactly one season or All" behavior. Chart
// structure itself (makeEvChart) is unchanged — only which seasons feed it.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    const seasonJson = JSON.stringify({
      _swimmerId: '999006',
      _swimmerName: 'Season_Test_Swimmer',
      '2023-2024': { bests: [], results: [{ event: '50 Free', pool: '25', seconds: 32.0, time: '32.00', date: '01/01/2024', points: 400, competition: 'Old Meet' }] },
      '2024-2025': { bests: [], results: [{ event: '50 Free', pool: '25', seconds: 31.0, time: '31.00', date: '01/01/2025', points: 420, competition: 'Mid Meet' }] },
      '2025-2026': { bests: [], results: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2026', points: 440, competition: 'New Meet' }] },
    });
    await page.click('.paste-toggle:has-text("Paste JSON")');
    await page.waitForTimeout(150);
    await page.fill('#jsonPaste', seasonJson);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);
    // Unrecognized swimmer opens the new-swimmer confirm modal — confirm it.
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(400);

    await page.click('#t-analyze');
    await page.waitForTimeout(200);
    await page.click('button[data-grp="progress"]');
    await page.waitForTimeout(400);

    // Default: last 2 seasons only (2024-2025, 2025-2026) — the oldest
    // season's competition ("Old Meet") must NOT appear yet.
    let tableText = await page.$eval('#evt-0', (el) => el.textContent);
    assert(tableText.includes('Mid Meet') && tableText.includes('New Meet'), 'expected the last 2 seasons\' data by default, got: ' + tableText);
    assert(!tableText.includes('Old Meet'), 'REGRESSION: the oldest season should NOT show by default, got: ' + tableText);
    steps.push({ desc: 'Per-event table/chart defaults to the last 2 seasons, not "All"', ok: true });

    const activeBtns = await page.$$eval('#evs-0 button.active', (els) => els.map((e) => e.textContent.trim()));
    assert(activeBtns.includes('2024-2025') && activeBtns.includes('2025-2026') && !activeBtns.includes('2023-2024') && !activeBtns.includes('All'),
      'expected only the last 2 season buttons (not "All") shown active by default, got: ' + JSON.stringify(activeBtns));
    steps.push({ desc: 'Season buttons correctly reflect the default 2-season selection (shown active in blue)', ok: true });

    // Multi-select: individually add the oldest season back WITHOUT
    // deselecting the other two — all 3 competitions should now show.
    await page.click('#evs-0 button:has-text("2023-2024")');
    await page.waitForTimeout(200);
    tableText = await page.$eval('#evt-0', (el) => el.textContent);
    assert(tableText.includes('Old Meet') && tableText.includes('Mid Meet') && tableText.includes('New Meet'), 'expected all 3 seasons\' data after adding the oldest one on top of the default 2, got: ' + tableText);
    steps.push({ desc: 'Clicking an individual season ADDS to the selection (multi-select), not replaces it', ok: true });

    // Deselect the middle season individually — should drop out, others stay.
    await page.click('#evs-0 button:has-text("2024-2025")');
    await page.waitForTimeout(200);
    tableText = await page.$eval('#evt-0', (el) => el.textContent);
    assert(!tableText.includes('Mid Meet') && tableText.includes('Old Meet') && tableText.includes('New Meet'), 'expected the deselected season to drop out while the others remain, got: ' + tableText);
    steps.push({ desc: 'Clicking an already-active season REMOVES just that one from the selection', ok: true });

    // "All" selects every season at once.
    await page.click('#evs-0 button:has-text("All")');
    await page.waitForTimeout(200);
    tableText = await page.$eval('#evt-0', (el) => el.textContent);
    assert(tableText.includes('Old Meet') && tableText.includes('Mid Meet') && tableText.includes('New Meet'), 'expected "All" to select every season at once, got: ' + tableText);
    const allBtnActive = await page.$eval('#evs-0 button:has-text("All")', (el) => el.classList.contains('active'));
    assert(allBtnActive, 'expected the "All" button itself to show active once every season is selected');
    steps.push({ desc: 'Clicking "All" selects every season at once, and the "All" button itself highlights', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'progress-events-season-multiselect (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'progress-events-season-multiselect (desktop)', passed: false, steps, error: e.message };
  }
};
