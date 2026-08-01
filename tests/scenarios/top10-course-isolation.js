// Regression test for a real data-corrupting bug found while building the
// per-year/course upload grid (2026-07-25): swimPublishMastersTop10() and
// top10Review()'s diff both originally keyed only on (year, source), not
// course. World Aquatics ships LCM and SCM as separate files/years, so
// publishing SCM for a year AFTER LCM was already published for that same
// year would silently delete the LCM entries (the "kept" filter dropped
// every entry matching year+source, regardless of course) — and the diff
// review would have wrongly reported the untouched LCM entries as "no
// longer in top 10" (removed) purely because they weren't in the SCM file
// being compared. Fixed by scoping both the diff and the merge/replace by
// the actual course(s) present in the entries being published. This test
// seeds LCM 2025 as already published, then publishes SCM 2025 through the
// real UI and confirms the LCM entries survive untouched.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { coachX: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      swimmers: {},
      teams: {},
      config: {
        mastersTop10: {
          entries: [
            { source: 'world', year: 2025, course: 'LCM', sex: 'F', ageGroup: '40-44', event: '50m Backstroke', rank: 7, time: '31.94', seconds: 31.94, name: 'GOSTMALSKI Anya' },
          ],
          count: 1, loadedAt: Date.now(), by: 'lhershey@gmail.com',
        },
      },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(300);
    await page.click('#t-admin');
    await page.waitForTimeout(500);
    await page.click('text=Masters Top-10 Rankings');
    await page.waitForTimeout(300);
    await page.click('text=World Masters Top-10 (ISR only)');
    await page.waitForTimeout(500);

    const lcmChip = await page.$eval('#top10Chip-LCM-2025', (el) => el.textContent);
    assert(/✓\s*1/.test(lcmChip), 'expected the seeded LCM 2025 entry to already show as published, got: ' + lcmChip);
    steps.push({ desc: 'LCM 2025 starts out published (seeded), SCM 2025 does not', ok: true });

    // Real 2025 SCM fixture isn't downloaded (only LCM has one), so upload a
    // minimal synthetic SCM PDF instead — this test is about the publish/diff
    // key, not the parser, so a tiny fabricated PDF is the right fixture.
    const path = require('path');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#top10Chip-SCM-2025'),
    ]);
    await fileChooser.setFiles(path.join(__dirname, '..', 'fixtures', 'world-masters-top10-scm-2025-synthetic.pdf'));
    // Client-side PDF parsing is async and its duration varies with machine
    // load (a slower/shared CI runner can take noticeably longer than a local
    // dev machine) — wait for the real completion signal (Review button goes
    // from disabled to enabled once parsedEntries is populated) instead of a
    // fixed timeout that can be too tight under CI.
    await page.waitForFunction(() => {
      const rb = document.getElementById('top10ReviewBtn');
      return rb && !rb.disabled;
    }, { timeout: 15000 });

    await page.click('#top10ReviewBtn');
    await page.waitForTimeout(800);
    const reviewText = await page.$eval('#top10Preview', (el) => el.textContent);
    assert(/1 new, 0 updated, 0 dropped/.test(reviewText), 'REGRESSION: SCM 2025 diff should show 1 new entry and 0 dropped (must NOT count the untouched LCM 2025 entry as "dropped"), got: ' + reviewText.slice(0, 300));
    steps.push({ desc: 'Diff review for SCM 2025 does not flag the untouched LCM 2025 entry as removed', ok: true });

    await page.click('#top10PublishBtn');
    await page.waitForTimeout(800);

    const cloudEntries = await page.evaluate(() => (window.__mockStore.config.mastersTop10 || {}).entries);
    const lcmSurvived = cloudEntries.some((e) => e.course === 'LCM' && e.year === 2025 && e.name === 'GOSTMALSKI Anya');
    const scmAdded = cloudEntries.some((e) => e.course === 'SCM' && e.year === 2025);
    assert(lcmSurvived, 'REGRESSION: publishing SCM 2025 wiped out the already-published LCM 2025 entry — got: ' + JSON.stringify(cloudEntries));
    assert(scmAdded, 'expected the new SCM 2025 entry to also be published, got: ' + JSON.stringify(cloudEntries));
    assert(cloudEntries.length === 2, 'expected exactly 2 entries total (1 LCM + 1 SCM), got: ' + JSON.stringify(cloudEntries));
    steps.push({ desc: 'Publishing SCM 2025 adds the new entry without deleting the untouched LCM 2025 entry', ok: true });

    const lcmChipAfter = await page.$eval('#top10Chip-LCM-2025', (el) => el.textContent);
    assert(/✓\s*1/.test(lcmChipAfter), 'REGRESSION: LCM 2025 grid chip should still show as published after an unrelated SCM 2025 publish, got: ' + lcmChipAfter);
    steps.push({ desc: 'LCM 2025 grid chip still shows as published after the SCM 2025 publish', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'top10-course-isolation (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'top10-course-isolation (desktop)', passed: false, steps, error: e.message };
  }
};
