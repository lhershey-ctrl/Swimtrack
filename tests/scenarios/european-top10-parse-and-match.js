// Regression test for the new European Aquatics Masters Top-10 feature —
// a genuinely different PDF layout from World Aquatics: a 3-column flowing
// table (each page has 3 side-by-side mini-tables, not synchronized to
// start new events together, so parsing tracks state per column), course
// (LC/SC) self-declared per event same as World's 2024+ format, comma-
// decimal times, and one official file per year normally covers BOTH
// courses at once (so the grid is year-only, not year×course like World's).
// Also validates that rows with a redacted/missing name (found in the real
// data — likely GDPR-related) are silently dropped rather than corrupting
// the next entry with a garbage time-string "name" (a real bug found while
// prototyping this parser).
// Uses the REAL 2025 file (1.2MB, 121 pages) — validated in a Node
// prototype (78 ISR entries: LC F14/M23, SC F10/M31) before porting in,
// same discipline as both World-format fixtures.
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
          id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], intlName: 'Liron Har-Shai', birthdate: '01/06/1980', sex: 'male',
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
    await page.click('text=European Masters Top-10 (ISR only)');
    await page.waitForTimeout(500);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#euTop10Chip-2025'),
    ]);
    await fileChooser.setFiles(path.join(__dirname, '..', 'fixtures', 'european-masters-top10-2025.pdf'));
    await page.waitForTimeout(6000); // real 121-page, 3-column parse

    const parseLabel = await page.$eval('#euTop10UploadFname', (el) => el.textContent);
    assert(/78 ISR entries/.test(parseLabel), 'expected the real 2025 file to parse to exactly 78 ISR entries, got: ' + parseLabel);
    assert(/LC\/SC|SC\/LC/.test(parseLabel), 'expected both courses to be detected from one file, got: ' + parseLabel);
    steps.push({ desc: 'Real 121-page, 3-column PDF parses client-side to ISR-only entries across both courses (' + parseLabel.trim() + ')', ok: true });

    await page.click('#euTop10ReviewBtn');
    await page.waitForTimeout(1000);
    const reviewText = await page.$eval('#euTop10Preview', (el) => el.textContent);
    assert(/78 new, 0 updated, 0 dropped/.test(reviewText), 'expected exactly 78 new ISR entries on first upload, got: ' + reviewText.slice(0, 200));
    assert(reviewText.includes('Liron Har-Shai') || reviewText.includes('Arik Kotek'), 'diff preview should list known real ISR swimmers, got: ' + reviewText.slice(0, 400));
    steps.push({ desc: 'Diff review against the (empty) cloud correctly shows all entries as new', ok: true });

    await page.click('#euTop10PublishBtn');
    await page.waitForTimeout(1000);
    const cloudEntries = await page.evaluate(() => (window.__mockStore.config.mastersTop10 || {}).entries);
    assert(cloudEntries && cloudEntries.length === 78, 'expected 78 entries published, got: ' + (cloudEntries ? cloudEntries.length : cloudEntries));
    assert(cloudEntries.every((e) => e.source === 'europe'), 'every parsed entry should be tagged source:"europe", got: ' + JSON.stringify(Array.from(new Set(cloudEntries.map((e) => e.source)))));
    const courses = new Set(cloudEntries.map((e) => e.course));
    assert(courses.has('LC') && courses.has('SC'), 'expected both LC and SC entries from the single uploaded file, got: ' + JSON.stringify(Array.from(courses)));
    steps.push({ desc: 'Publishing writes all 78 entries (both courses) to config/mastersTop10, tagged source:"europe"', ok: true });

    await page.click('#t-analyze');
    await page.waitForTimeout(300);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);
    const rows = await page.$eval('#intlRankBody', (el) => el.textContent);
    assert(rows.includes('2025') && rows.includes('Breast'), 'expected Liron\'s matched entry (intlName "Liron Har-Shai") to show on the Records tab, got: ' + rows);
    const cardText = await page.$eval('#intlRankCard', (el) => el.textContent);
    assert(cardText.includes('Europe'), 'expected the "Europe" column header, got: ' + cardText);
    steps.push({ desc: 'A real swimmer with intlName "Liron Har-Shai" matches a European-parsed entry on the Records tab', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'european-top10-parse-and-match (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'european-top10-parse-and-match (desktop)', passed: false, steps, error: e.message };
  }
};
