// Regression test for: after clicking "✕ Clear" in Analyze, the swimmer
// banner (name/seasons/swims) stayed visible showing stale data. Fixed by
// having clearLoadedData() re-render the banner after emptying window.D.
// Loading data for an unrecognized swimmer ID now opens the new-swimmer
// confirm modal instead of silently auto-creating them (see
// swimtrack-cloud-architecture memory, 2026-07-31) — this test confirms
// that swimmer via the modal before checking the banner.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    // No sign-in needed for this one — Paste JSON works fully offline.
  });

  try {
    const seasonJson = JSON.stringify({
      _swimmerId: '999001',
      _swimmerName: 'Test Swimmer',
      '2024-2025': { bests: [], results: [{ event: '50 Free', course: 'SC', time: '30.00', points: 500, date: '2025-01-01' }] },
    });
    await page.click('.paste-toggle:has-text("Paste JSON")');
    await page.waitForTimeout(150);
    await page.fill('#jsonPaste', seasonJson);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);

    const modalOpen = await page.$eval('#newSwimmerModal', (el) => getComputedStyle(el).display !== 'none');
    assert(modalOpen, 'expected the new-swimmer confirm modal to open for an unrecognized ID');
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    const bannerVisibleAfterLoad = await page.$eval('#swimmerBanner', (el) => getComputedStyle(el).display !== 'none');
    assert(bannerVisibleAfterLoad, 'banner should be visible after loading a swimmer with data');
    steps.push({ desc: 'Banner shows after loading swimmer data', ok: true });

    await page.click('text=✕ Clear');
    await page.waitForTimeout(300);

    const bannerVisibleAfterClear = await page.$eval('#swimmerBanner', (el) => getComputedStyle(el).display !== 'none');
    assert(!bannerVisibleAfterClear, 'REGRESSION: banner still visible after Clear');
    steps.push({ desc: 'Banner hides immediately after clicking Clear (the regression this test guards against)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'clear-button-hides-banner (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'clear-button-hides-banner (desktop)', passed: false, steps, error: e.message };
  }
};
