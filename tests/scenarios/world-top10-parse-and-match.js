// Regression test for the new World Aquatics Masters Top-10 feature
// (2026-07-25): owner uploads a year's official PDF (Admin tab, desktop-
// only), it's parsed client-side down to ISR-only entries, reviewed as a
// diff against the cloud, published, then matched back against any
// swimmer's "Name in Int'l Rankings" (intlName) field on the Records tab.
//
// Uses a REAL downloaded PDF (tests/fixtures/world-masters-top10-lcm-2025.pdf,
// the actual 2025 long-course file, 263 pages) rather than a synthetic
// fixture — the parser's tie-handling (ranks repeat when swimmers are
// level) only proves out against the real page layout. This makes the
// scenario slow (~10s, real pdf.js parse) compared to the rest of the
// suite; that's expected, not a hang.
const path = require('path');
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { coachX: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      swimmers: {
        // A real ISR swimmer confirmed present in the 2025 LCM file (3
        // individual top-10 appearances: 50/100 Back, 50 Fly, 40-44 W).
        110916: {
          id: '110916', name: 'אניה גוסטמלסקי', coachUids: ['coachX'], intlName: 'GOSTMALSKI Anya', birthdate: '01/06/1981', sex: 'female',
          seasons: { '2024-2025': { bests: [{ event: '50 Back', pool: '50', seconds: 31.94, time: '31.94', date: '01/06/2025', points: 500 }], results: [{ event: '50 Back', pool: '50', seconds: 31.94, time: '31.94', date: '01/06/2025', points: 500 }] } },
        },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#loadSwimmerPicker button:has-text("גוסטמלסקי")');
    await page.waitForTimeout(900);

    await page.click('#t-settings');
    await page.waitForTimeout(300);
    const adminVisible = await page.$eval('#t-admin', (el) => getComputedStyle(el).display !== 'none');
    assert(adminVisible, 'Admin tab should be visible for the owner');
    await page.click('#t-admin');
    await page.waitForTimeout(500);

    await page.click('text=World Masters Top-10 (ISR only)');
    await page.waitForTimeout(300);
    await page.fill('#top10Year', '2025');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#top10Slot'),
    ]);
    await fileChooser.setFiles(path.join(__dirname, '..', 'fixtures', 'world-masters-top10-lcm-2025.pdf'));
    await page.waitForTimeout(8000); // real 263-page pdf.js parse

    const parseLabel = await page.$eval('#top10Slot .wr-fname', (el) => el.textContent);
    assert(/\d+ ISR entries/.test(parseLabel), 'expected the parse label to report a count of ISR entries, got: ' + parseLabel);
    steps.push({ desc: 'Real 263-page PDF parses client-side down to ISR-only entries (' + parseLabel.trim() + ')', ok: true });

    await page.click('#top10ReviewBtn');
    await page.waitForTimeout(1000);
    const reviewText = await page.$eval('#top10Preview', (el) => el.textContent);
    assert(/12 new, 0 updated, 0 dropped/.test(reviewText), 'expected exactly 12 new ISR entries on first upload, got: ' + reviewText.slice(0, 200));
    assert(reviewText.includes('GOSTMALSKI Anya'), 'diff preview should list Anya Gostmalski\'s new entries, got: ' + reviewText.slice(0, 400));
    steps.push({ desc: 'Diff review against the (empty) cloud correctly shows all entries as new', ok: true });

    await page.click('#top10PublishBtn');
    await page.waitForTimeout(1000);
    const publishStatus = await page.$eval('#top10PublishStatus', (el) => el.textContent);
    assert(/✅ Uploaded 2025/.test(publishStatus), 'expected a successful publish confirmation, got: ' + publishStatus);
    const cloudEntries = await page.evaluate(() => (window.__mockStore.config.mastersTop10 || {}).entries);
    assert(cloudEntries && cloudEntries.length === 12, 'expected 12 entries published to Firestore, got: ' + JSON.stringify(cloudEntries));
    assert(cloudEntries.every((e) => e.source === 'world'), 'every parsed entry should be tagged source:"world", got: ' + JSON.stringify(cloudEntries.map((e) => e.source)));
    steps.push({ desc: 'Publishing writes the parsed entries to config/mastersTop10, tagged source:"world"', ok: true });

    await page.click('#t-analyze');
    await page.waitForTimeout(300);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);
    const sectionVisible = await page.$eval('#intlRankSection', (el) => getComputedStyle(el).display !== 'none');
    assert(sectionVisible, 'International Rankings section should be visible once entries exist and intlName is set');
    const rows = await page.$eval('#intlRankBody', (el) => el.textContent);
    assert(rows.includes('31.94') && rows.includes('#7'), 'expected Anya\'s 50m Backstroke #7 (31.94) row to appear, got: ' + rows);
    assert(rows.includes('World'), 'expected the Source column to show "World" for these entries, got: ' + rows);
    steps.push({ desc: 'International Rankings section on the Records tab correctly matches by intlName and shows real entries', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'world-top10-parse-and-match (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'world-top10-parse-and-match (desktop)', passed: false, steps, error: e.message };
  }
};
