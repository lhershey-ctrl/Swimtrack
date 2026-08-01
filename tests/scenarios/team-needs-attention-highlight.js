// New capability, directly requested: the Team tab's "Needs Attention"
// section lists EVERY swimmer (not just the single worst one) who swims an
// event often (>=5 times this season) with little-to-no improvement
// between their first and best time that season. Early-warning signal
// (possible stroke/technique or growth-related issue) "most improved"
// alone can't surface. See _teamSeasonRecap/_teamNeedsAttentionList in
// swim_tracker.html.
//
// UPDATED 2026-08-01, live-reported real-data example (עדן שץ, 5 swims of
// 100 Breast, +1.97% improvement) exposed two gaps in the original
// version: the >5 (strictly) threshold missed anyone at exactly 5 starts,
// and the pct<=0 "zero improvement" rule missed small-but-real improvement
// that still isn't meaningful progress ("not improving ... or improved
// marginally," the coach's own phrasing). Now: >=5 starts, <2% improvement
// (covers both zero AND marginal), and EVERY qualifying swimmer is listed
// — not folded into a single highlight card that could only ever name one
// person.
//
// NOTE: the seed() function below is serialized via .toString() and
// re-parsed standalone in the page context (see openDesktopApp) — it can't
// see outer Node.js closures. Every result row is inlined below instead of
// a shared helper — see mobile-no-duplicate-team-listing.js's memory note
// for the mobile-side twin of this exact trap.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
      teams: {},
      swimmers: {
        // 6 swims, zero improvement (first == best) — clearly qualifies.
        401: {
          id: '401', name: 'Stagnant Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2012', sex: 'male',
          seasons: { '2025-2026': { bests: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/09/2025', points: 400 }],
            results: [
              { event: '50 Free', pool: '25', date: '01/09/2025', seconds: 30.0, time: '30.00', points: 400, competition: 'Meet 1' },
              { event: '50 Free', pool: '25', date: '15/10/2025', seconds: 30.2, time: '30.20', points: 390, competition: 'Meet 2' },
              { event: '50 Free', pool: '25', date: '01/11/2025', seconds: 30.1, time: '30.10', points: 395, competition: 'Meet 3' },
              { event: '50 Free', pool: '25', date: '15/12/2025', seconds: 30.3, time: '30.30', points: 385, competition: 'Meet 4' },
              { event: '50 Free', pool: '25', date: '01/02/2026', seconds: 30.05, time: '30.05', points: 398, competition: 'Meet 5' },
              { event: '50 Free', pool: '25', date: '15/03/2026', seconds: 30.15, time: '30.15', points: 392, competition: 'Meet 6' },
            ] } },
        },
        // Exactly 5 swims (the boundary), ~1.97% improvement — the real
        // עדן שץ scenario that exposed the old thresholds as too strict.
        402: {
          id: '402', name: 'Marginal Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2012', sex: 'female',
          seasons: { '2025-2026': { bests: [{ event: '100 Breast', pool: '25', seconds: 84.64, time: '1:24.64', date: '21/01/2026', points: 420 }],
            results: [
              { event: '100 Breast', pool: '25', date: '24/10/2025', seconds: 86.34, time: '1:26.34', points: 400, competition: 'Meet 1' },
              { event: '100 Breast', pool: '25', date: '31/10/2025', seconds: 86.08, time: '1:26.08', points: 403, competition: 'Meet 2' },
              { event: '100 Breast', pool: '25', date: '04/12/2025', seconds: 86.78, time: '1:26.78', points: 396, competition: 'Meet 3' },
              { event: '100 Breast', pool: '25', date: '21/01/2026', seconds: 84.64, time: '1:24.64', points: 420, competition: 'Meet 4' },
              { event: '100 Breast', pool: '25', date: '24/02/2026', seconds: 85.22, time: '1:25.22', points: 413, competition: 'Meet 5' },
            ] } },
        },
        // Only swims the event twice — must NOT qualify regardless of how
        // small the improvement is (below the >=5-swims threshold).
        403: {
          id: '403', name: 'Rare Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2012', sex: 'female',
          seasons: { '2025-2026': { bests: [{ event: '100 Fly', pool: '25', seconds: 90.0, time: '1:30.00', date: '01/09/2025', points: 350 }],
            results: [
              { event: '100 Fly', pool: '25', date: '01/09/2025', seconds: 90.5, time: '1:30.50', points: 340, competition: 'Meet A' },
              { event: '100 Fly', pool: '25', date: '01/11/2025', seconds: 90.0, time: '1:30.00', points: 350, competition: 'Meet B' },
            ] } },
        },
        // 6 swims, but a REAL, substantial improvement (10%) — must NOT
        // qualify even though it clears the swim-count threshold.
        404: {
          id: '404', name: 'Improving Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2012', sex: 'male',
          seasons: { '2025-2026': { bests: [{ event: '200 IM', pool: '25', seconds: 145.0, time: '2:25.00', date: '01/02/2026', points: 450 }],
            results: [
              { event: '200 IM', pool: '25', date: '01/09/2025', seconds: 160.0, time: '2:40.00', points: 380, competition: 'Meet 1' },
              { event: '200 IM', pool: '25', date: '15/10/2025', seconds: 156.0, time: '2:36.00', points: 395, competition: 'Meet 2' },
              { event: '200 IM', pool: '25', date: '01/11/2025', seconds: 152.0, time: '2:32.00', points: 410, competition: 'Meet 3' },
              { event: '200 IM', pool: '25', date: '15/12/2025', seconds: 149.0, time: '2:29.00', points: 425, competition: 'Meet 4' },
              { event: '200 IM', pool: '25', date: '01/02/2026', seconds: 145.0, time: '2:25.00', points: 450, competition: 'Meet 5' },
              { event: '200 IM', pool: '25', date: '15/03/2026', seconds: 146.0, time: '2:26.00', points: 447, competition: 'Meet 6' },
            ] } },
        },
      },
      config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    // #t-team's roster comes from cloudSwimmers (populated by
    // refreshCloudSwimmers() on sign-in) — wait for it to actually land
    // before switching tabs, rather than a fixed guess.
    await page.waitForFunction(() => document.getElementById('loadSwimmerPicker') && document.getElementById('loadSwimmerPicker').textContent.includes('Stagnant Swimmer'), { timeout: 8000 });
    await page.click('#t-team');
    await page.waitForTimeout(1200);

    const sectionVisible = await page.$eval('#teamAttentionSection', (el) => getComputedStyle(el).display !== 'none');
    assert(sectionVisible, 'expected the "Needs Attention" section to be visible when swimmers qualify');
    const attnHtml = await page.$eval('#teamAttention', (el) => el.innerHTML);

    assert(attnHtml.includes('Stagnant Swimmer') && attnHtml.includes('50 Free') && attnHtml.includes('6 swims'), 'expected Stagnant Swimmer (6 swims, 0% improvement) to be listed, got: ' + attnHtml);
    assert(attnHtml.includes('Marginal Swimmer') && attnHtml.includes('100 Breast') && attnHtml.includes('5 swims'), 'expected Marginal Swimmer (5 swims, ~1.97% improvement) to be listed — the real live-reported boundary case, got: ' + attnHtml);
    steps.push({ desc: 'Both a zero-improvement swimmer (6 swims) and a marginal-improvement swimmer (exactly 5 swims, ~2%) are listed', ok: true });

    assert(!attnHtml.includes('Rare Swimmer'), 'REGRESSION: a swimmer with only 2 swims must not qualify regardless of improvement, got: ' + attnHtml);
    assert(!attnHtml.includes('Improving Swimmer'), 'REGRESSION: a swimmer with real (10%) improvement must not qualify even with 6 swims, got: ' + attnHtml);
    steps.push({ desc: 'A swimmer below the swim-count threshold, and a swimmer with real improvement, are both correctly excluded', ok: true });

    // Worst (most negative/least-improved) first.
    const stagnantIdx = attnHtml.indexOf('Stagnant Swimmer'), marginalIdx = attnHtml.indexOf('Marginal Swimmer');
    assert(stagnantIdx >= 0 && marginalIdx >= 0 && stagnantIdx < marginalIdx, 'expected Stagnant Swimmer (0%) to be listed before Marginal Swimmer (~1.97%), got: ' + attnHtml);
    steps.push({ desc: 'List is sorted worst (least improved) first', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'team-needs-attention-highlight (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'team-needs-attention-highlight (desktop)', passed: false, steps, error: e.message };
  }
};
