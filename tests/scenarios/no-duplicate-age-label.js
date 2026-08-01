// Regression test for a live bug report: the swimmer banner (desktop) showed
// "Age 13 · Age 13" — ageGroupLabel(13) returned the literal string "Age 13"
// for ages 12-15 (a leftover from when each single age had its own bracket
// name), which then got concatenated onto a banner string that already
// starts with "Age 13". Fixed by having ageGroupLabel() return "" for ages
// 12-15 (the raw age already says everything the label would), with every
// call site skipping the " · " separator when the label is empty. Ages 16+
// still get a real, distinct bracket name (Cadet/Junior/Senior) that is NOT
// redundant with the raw age, so that part must keep working.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    // Age 13 as of today (2026) — birth year 2013 — the exact reported case.
    const age13Json = JSON.stringify({
      _swimmerId: '999007',
      _swimmerName: 'Age13_Kid',
      _birthYear: '2013',
      _sex: 'female',
      '2024-2025': { bests: [], results: [{ event: '50 Free', pool: '25', time: '30.00', seconds: 30, points: 500, date: '01/01/2025' }] },
    });
    await page.click('.paste-toggle:has-text("Paste JSON")');
    await page.waitForTimeout(150);
    await page.fill('#jsonPaste', age13Json);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    const bannerText13 = await page.$eval('#swimmerBanner', (el) => el.textContent);
    assert(/Age 13/.test(bannerText13), 'expected the banner to show Age 13 at all, got: ' + bannerText13);
    assert(!/Age 13[^0-9]*Age 13/.test(bannerText13), 'REGRESSION: banner shows a duplicated "Age 13 ... Age 13", got: ' + bannerText13);
    steps.push({ desc: 'Ages 12-15 (no distinct bracket name) show "Age N" exactly once, not duplicated', ok: true });

    // Age 16 — a real, distinct bracket name (Cadet 16-17) must still show.
    const age16Json = JSON.stringify({
      _swimmerId: '999008',
      _swimmerName: 'Age16_Kid',
      _birthYear: '2010',
      _sex: 'male',
      '2024-2025': { bests: [], results: [{ event: '50 Free', pool: '25', time: '25.00', seconds: 25, points: 500, date: '01/01/2025' }] },
    });
    await page.fill('#jsonPaste', age16Json);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    const bannerText16 = await page.$eval('#swimmerBanner', (el) => el.textContent);
    assert(/Age 16/.test(bannerText16) && /Cadet \(16-17\)/.test(bannerText16), 'expected Age 16 AND the distinct "Cadet (16-17)" bracket label, got: ' + bannerText16);
    assert(!/Cadet \(16-17\)[^0-9]*Cadet \(16-17\)/.test(bannerText16), 'REGRESSION: bracket label itself duplicated, got: ' + bannerText16);
    steps.push({ desc: 'Ages 16+ still show their real, distinct bracket name (not a regression from the ages-12-15 fix)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'no-duplicate-age-label (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'no-duplicate-age-label (desktop)', passed: false, steps, error: e.message };
  }
};
