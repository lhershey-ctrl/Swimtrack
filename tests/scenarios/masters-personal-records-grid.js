// Regression test for a real bug reported live from a screenshot: the old
// Personal Records table compared a masters swimmer's LIFETIME PB (swum at
// whatever age it happened) against their CURRENT age group's record —
// e.g. 200m Breaststroke PB set at 40-44 shown next to the 45-49 record,
// a confusing mismatch ("it shows I have the age-group record in 45-49 in
// a different time" — actually just an unrelated record from a different
// bracket). Fixed by redesigning Personal Records for masters swimmers
// (5-year brackets only — juniors keep the old single-bracket table, see
// personal-records-current-age-gap.js) into a grid: one column per age
// bracket the swimmer has actually competed in, each cell showing the PB
// actually swum WITHIN that specific bracket next to THAT bracket's own
// record — never a cross-bracket mismatch. Gold background + the holder's
// own name when this swimmer holds that bracket's record; plain background
// + the real holder's name otherwise.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { coachX: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      swimmers: {
        // Born so "now" (2026) puts them at 45-49, but with real swims in
        // BOTH 40-44 (2022-2023 season) and 45-49 (2025-2026 season) for
        // 200 Breast — the exact shape of the reported bug.
        115352: {
          id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], recordName: 'הר-שי לירון', birthdate: '01/06/1978', sex: 'male',
          seasons: {
            '2022-2023': { bests: [{ event: '200 Breast', pool: '50', seconds: 152.19, time: '2:32.19', date: '01/10/2022', points: 502 }], results: [{ event: '200 Breast', pool: '50', seconds: 152.19, time: '2:32.19', date: '01/10/2022', points: 502 }] },
            '2025-2026': { bests: [{ event: '200 Breast', pool: '50', seconds: 149.05, time: '2:29.05', date: '01/10/2025', points: 510 }], results: [{ event: '200 Breast', pool: '50', seconds: 149.05, time: '2:29.05', date: '01/10/2025', points: 510 }] },
          },
        },
      },
      teams: {},
      config: {
        records: {
          records: { 50: { M: {
            '40-44': { '200|Breast': { sec: 150.00, time: '2:30.00', name: 'הר-שי לירון' } }, // Liron holds this one
            '45-49': { '200|Breast': { sec: 155.00, time: '2:35.00', name: 'קוסטק אריק' } },   // someone else holds this one
          } } },
          segments: {}, count: 2, loadedAt: Date.now(), by: 'test',
        },
      },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#loadSwimmerPicker button:has-text("הר-שי")');
    await page.waitForTimeout(900);

    await page.click('#t-analyze');
    await page.waitForTimeout(200);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);

    const headText = await page.$eval('#rec50Head', (el) => el.textContent);
    assert(headText.includes('40-44') && headText.includes('45-49'), 'expected separate columns for both age brackets this swimmer has competed in, got: ' + headText);
    steps.push({ desc: 'Grid shows one column per age bracket actually competed in (40-44 AND 45-49)', ok: true });

    const bodyHtml = await page.$eval('#rec50', (el) => el.innerHTML);
    // The 40-44 cell must show the 40-44-era PB (2:32.19) next to the
    // 40-44 record (2:30.00, held by this swimmer) — NOT mixed with 45-49.
    assert(bodyHtml.includes('2:32.19'), 'expected the 40-44-era PB (2:32.19) to appear, got snippet: ' + bodyHtml.slice(0, 400));
    assert(bodyHtml.includes('2:29.05'), 'expected the 45-49-era PB (2:29.05) to appear separately, got snippet: ' + bodyHtml.slice(0, 400));
    steps.push({ desc: 'Each bracket column shows the PB actually swum WITHIN that bracket, not a lifetime PB compared to the wrong bracket\'s record', ok: true });

    assert(bodyHtml.includes('background:#fdf3d9'), 'expected a gold-background cell for the bracket this swimmer holds the record in (40-44), got snippet: ' + bodyHtml.slice(0, 600));
    assert(bodyHtml.includes('קוסטק אריק'), 'expected the 45-49 cell to name the actual record holder (not this swimmer), got snippet: ' + bodyHtml.slice(0, 600));
    steps.push({ desc: 'Gold background + own name for a held record; plain background + real holder\'s name otherwise', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'masters-personal-records-grid (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'masters-personal-records-grid (desktop)', passed: false, steps, error: e.message };
  }
};
