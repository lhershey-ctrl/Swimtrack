// Regression test for a real bug reported live from a screenshot: the old
// Personal Records table compared a masters swimmer's LIFETIME PB (swum at
// whatever age it happened) against their CURRENT age group's record —
// e.g. 200m Breaststroke PB set at 40-44 shown next to the 45-49 record,
// a confusing mismatch. Fixed with a per-age-group VIEW for masters
// swimmers only (juniors keep the old single-bracket table, see
// personal-records-current-age-gap.js): age-bracket TABS (matching the
// existing Masters WR gap-chart selector AND the mobile app's own tab
// design, per explicit user request to keep desktop/mobile consistent),
// defaulting to the swimmer's current bracket. The selected bracket's
// table shows the PB actually swum WITHIN it next to THAT bracket's own
// record — always naming the actual holder, and (per user request) also
// showing the record's own time + the gap in seconds when it's NOT held
// by this swimmer, not just a bare name.
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
            '45-49': { '200|Breast': { sec: 145.00, time: '2:25.00', name: 'קוסטק אריק' } },   // someone else holds this one, genuinely faster than Liron's 149.05
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

    const poolTitle = await page.$eval('#rec25', (el) => el.closest('.tbl-card').textContent);
    assert(poolTitle.includes('25m Pool') && poolTitle.includes('SCM'), 'expected the pool card to be clearly labeled with its course, got: ' + poolTitle.slice(0, 100));
    steps.push({ desc: 'Pool card is clearly labeled with its course (SCM/LCM)', ok: true });

    const tabsText = await page.$eval('#rec50AgeSel', (el) => el.textContent);
    assert(tabsText.includes('40-44') && tabsText.includes('45-49'), 'expected tabs for both age brackets this swimmer has competed in, got: ' + tabsText);
    assert(/45-49.*current/.test(tabsText.replace(/\s+/g, ' ')), 'expected the CURRENT bracket (45-49) to be marked as such, got: ' + tabsText);
    steps.push({ desc: 'Age-bracket tabs appear (matching the Masters WR selector design), current bracket marked and selected by default', ok: true });

    // Default tab (45-49, current) — this swimmer does NOT hold this
    // bracket's record, so the cell must show the real holder's NAME, the
    // record's own TIME, and the gap in seconds — not just a bare name.
    let body50 = await page.$eval('#rec50', (el) => el.textContent);
    assert(body50.includes('2:29.05'), 'expected the current (45-49) bracket\'s own PB to show by default, got: ' + body50);
    assert(body50.includes('קוסטק אריק') && body50.includes('2:25.00'), 'expected the real record holder\'s name AND the record\'s own time, got: ' + body50);
    assert(body50.includes('+4.05s'), 'expected the gap in seconds in brackets, got: ' + body50);
    steps.push({ desc: 'Un-held record shows holder name + record time + gap in seconds, not just a bare name', ok: true });

    // Switch to 40-44 — this swimmer DOES hold that bracket's record.
    await page.click('#rec50AgeSel button:has-text("40-44")');
    await page.waitForTimeout(200);
    body50 = await page.$eval('#rec50', (el) => el.textContent);
    assert(body50.includes('2:32.19'), 'expected the 40-44-era PB after switching tabs, got: ' + body50);
    assert(body50.includes('🏅') && body50.includes('הר-שי לירון'), 'expected a held-record marker with this swimmer\'s own name for the bracket they hold, got: ' + body50);
    steps.push({ desc: 'Switching tabs shows that bracket\'s own PB; a held record shows the swimmer\'s own name with a medal, no gap math needed', ok: true });

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
