// Baseline smoke test: the app must cold-load (no data, no sign-in, fresh
// browser) without throwing, and the core tab structure must be present.
// Cheap and fast on purpose — this is the "did I break the page outright"
// tripwire that should run before anything more specific.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.waitForSelector('#dropZone', { timeout: 5000 });
    steps.push({ desc: 'Drop-zone / Analyze tab renders on cold load', ok: true });

    for (const tab of ['extract', 'analyze', 'settings']) {
      await page.click('#t-' + tab);
      await page.waitForTimeout(150);
      const visible = await page.$eval('#tc-' + tab, (el) => getComputedStyle(el).display !== 'none');
      assert(visible, 'tab "' + tab + '" did not become visible after clicking it');
    }
    steps.push({ desc: 'Extract / Analyze / Settings tabs all switch correctly', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors on cold load: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors on cold load or while switching tabs', ok: true });

    await browser.close();
    return { name: 'app-loads-smoke (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'app-loads-smoke (desktop)', passed: false, steps, error: e.message };
  }
};
