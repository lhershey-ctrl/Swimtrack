// Regression test for the pre-2024 FINA "World Masters Top 10" PDF layout
// (2021-2023), structurally different from the 2024+ World Aquatics format
// covered by world-top10-parse-and-match.js: no rank token (rank = row
// position), "MEN" tokenized as three separate single-char items "M"/"E"/"N"
// instead of one combined token, variable-length (1-3 token) names, and a
// relay section (skipped) after each sex's individual events. Uses the
// REAL 2021 LCM file (267KB, 27 pages) as a fixture — validated in a Node
// prototype first (56 ISR entries, M:37/F:19, including known real
// swimmers like LIRON HARSHAY and ARIK KOTEK) before being ported in, same
// discipline as the 2024+ format's own fixture-based test.
const path = require('path');
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { coachX: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      swimmers: {
        115352: {
          id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], intlName: 'LIRON HARSHAY', birthdate: '01/06/1980', sex: 'male',
          seasons: { '2020-2021': { bests: [{ event: '50 Free', pool: '50', seconds: 25.5, time: '25.50', date: '01/06/2021', points: 600 }], results: [{ event: '50 Free', pool: '50', seconds: 25.5, time: '25.50', date: '01/06/2021', points: 600 }] } },
        },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#loadSwimmerPicker button:has-text("הר-שי")');
    await page.waitForTimeout(900);

    await page.click('#t-settings');
    await page.waitForTimeout(300);
    await page.click('#t-admin');
    await page.waitForTimeout(500);
    await page.click('text=Masters Top-10 Rankings');
    await page.waitForTimeout(300);
    await page.click('text=World Masters Top-10 (ISR only)');
    await page.waitForTimeout(500);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#top10Chip-LCM-2021'),
    ]);
    await fileChooser.setFiles(path.join(__dirname, '..', 'fixtures', 'world-masters-top10-lcm-2021-old-format.pdf'));
    await page.waitForTimeout(4000); // real 27-page parse, both the new-format attempt (fails) then old-format fallback

    const parseLabel = await page.$eval('#top10UploadFname', (el) => el.textContent);
    assert(/\d+ ISR entries/.test(parseLabel), 'expected the old-format fallback to still report ISR entries, got: ' + parseLabel);
    steps.push({ desc: 'Old (pre-2024) PDF layout parses via automatic fallback after the 2024+ format finds nothing (' + parseLabel.trim() + ')', ok: true });

    await page.click('#top10ReviewBtn');
    await page.waitForTimeout(1000);
    const reviewText = await page.$eval('#top10Preview', (el) => el.textContent);
    assert(/56 new, 0 updated, 0 dropped/.test(reviewText), 'expected exactly 56 new ISR entries (37 men + 19 women), got: ' + reviewText.slice(0, 200));
    assert(reviewText.includes('LIRON HARSHAY') || reviewText.includes('ARIK KOTEK'), 'diff preview should list known real ISR swimmers, got: ' + reviewText.slice(0, 400));
    steps.push({ desc: 'Diff review shows all 56 entries as new, including both sexes', ok: true });

    await page.click('#top10PublishBtn');
    await page.waitForTimeout(1000);
    const cloudEntries = await page.evaluate(() => (window.__mockStore.config.mastersTop10 || {}).entries);
    assert(cloudEntries && cloudEntries.length === 56, 'expected 56 entries published, got: ' + (cloudEntries ? cloudEntries.length : cloudEntries));
    const bothSexes = cloudEntries.some((e) => e.sex === 'M') && cloudEntries.some((e) => e.sex === 'F');
    assert(bothSexes, 'expected both men and women entries — the "M"/"E"/"N" tokenized MEN-section detection must be working, got sexes: ' + JSON.stringify(Array.from(new Set(cloudEntries.map((e) => e.sex)))));
    steps.push({ desc: 'Publishing writes all 56 entries (both sexes) to config/mastersTop10', ok: true });

    await page.click('#t-analyze');
    await page.waitForTimeout(300);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);
    const rows = await page.$eval('#intlRankBody', (el) => el.textContent);
    assert(rows.includes('World'), 'expected Liron\'s matched entry (intlName "LIRON HARSHAY") to show on the Records tab, got: ' + rows);
    steps.push({ desc: 'A real swimmer with intlName "LIRON HARSHAY" matches an old-format-parsed entry on the Records tab', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'world-top10-old-format-parse (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'world-top10-old-format-parse (desktop)', passed: false, steps, error: e.message };
  }
};
