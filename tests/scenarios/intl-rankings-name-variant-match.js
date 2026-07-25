// Regression test for a real live bug reported by the user (2026-07-25):
// only 1 of a swimmer's real international-ranking entries showed up on
// the Records tab, when there should have been many more. Root cause: the
// same real person is published under genuinely different spellings across
// federations/years — e.g. Liron appears as "HARSHAY Liron" (World 2024+,
// lastname-first), "LIRON HARSHAY" (World pre-2024, firstname-first), and
// "Liron Har-Shai" (Europe, firstname-first, "i" not "y" ending) — but the
// old matching logic did an EXACT (order-sensitive) comparison against the
// swimmer's single stored intlName, so only entries spelled identically to
// it ever matched. Fixed with a word-order-agnostic, minor-spelling-
// tolerant fuzzy match (sorted words + Levenshtein, high 0.85 threshold —
// same-script Latin comparison, not the looser cross-script Hebrew
// transliteration bar the Settings suggestion chips use). Also covers the
// redesigned year-grouped, medal-annotated display (desktop): one row per
// year, World/Europe columns, top-3 ranks shown as medals.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { coachX: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      swimmers: {
        115352: {
          id: '115352', name: 'לירון הר-שי', coachUids: ['coachX'], intlName: 'HARSHAY Liron', birthdate: '01/06/1980', sex: 'male',
          seasons: { '2020-2021': { bests: [{ event: '50 Free', pool: '50', seconds: 25.5, time: '25.50', date: '01/06/2021', points: 600 }], results: [{ event: '50 Free', pool: '50', seconds: 25.5, time: '25.50', date: '01/06/2021', points: 600 }] } },
        },
      },
      teams: {},
      config: {
        // The exact real-world shape of the bug: 3 different spellings for
        // the same person, spread across sources/years, only one of which
        // matches the stored intlName ("HARSHAY Liron") exactly.
        mastersTop10: {
          entries: [
            { source: 'world', year: 2025, course: 'SCM', sex: 'M', ageGroup: '45-49', event: '400m Medley', rank: 5, time: '5:30.00', seconds: 330, name: 'HARSHAY Liron' },
            { source: 'world', year: 2021, course: 'LCM', sex: 'M', ageGroup: '40-44', event: '200m Breaststroke', rank: 8, time: '2:50.00', seconds: 170, name: 'LIRON HARSHAY' },
            { source: 'world', year: 2021, course: 'SCM', sex: 'M', ageGroup: '40-44', event: '400m Medley', rank: 3, time: '5:20.00', seconds: 320, name: 'LIRON HARSHAY' },
            { source: 'europe', year: 2023, course: 'LC', sex: 'M', ageGroup: '40-44', event: '200m Breaststroke', rank: 1, time: '2:45.00', seconds: 165, name: 'Liron Har-Shai' },
          ],
          count: 4, loadedAt: Date.now(), by: 'lhershey@gmail.com',
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
    await page.waitForTimeout(300);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);

    const hint = await page.$eval('#intlRankHint', (el) => el.textContent);
    assert(/4 appearances/.test(hint), 'REGRESSION: expected all 4 entries (across 3 different name spellings) to match, got: ' + hint);
    steps.push({ desc: 'All 4 entries match despite 3 different published spellings ("HARSHAY Liron" / "LIRON HARSHAY" / "Liron Har-Shai")', ok: true });

    const rows = await page.$eval('#intlRankBody', (el) => el.textContent);
    assert(rows.includes('2025') && rows.includes('2021') && rows.includes('2023'), 'expected all 3 years to appear as separate rows, got: ' + rows);
    assert(rows.includes('🥉'), 'expected the rank-3 entry to show a bronze medal, got: ' + rows);
    assert(rows.includes('🥇'), 'expected the rank-1 entry to show a gold medal, got: ' + rows);
    assert(rows.includes('#5') && rows.includes('#8'), 'expected non-top-3 entries to still show as "#N", got: ' + rows);
    assert(rows.includes('400 IM') && rows.includes('200 Breast'), 'expected event names to be shortened (400 IM, 200 Breast), got: ' + rows);
    steps.push({ desc: 'Table is grouped one row per year, with medals for top-3 and shortened event names', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'intl-rankings-name-variant-match (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'intl-rankings-name-variant-match (desktop)', passed: false, steps, error: e.message };
  }
};
