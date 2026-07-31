// New capability, directly requested: alongside "Most Improved", the Team
// tab now also surfaces a swimmer who has NOT improved in an event they
// swim often — a heavily-repeated event (>5 times this season) whose best
// time is no better than their first time this season. Requested as an
// early-warning signal (possible stroke/technique or growth-related issue)
// that "most improved" alone can't surface. See _teamSeasonRecap/
// _teamHighlights in swim_tracker.html.
//
// NOTE: the seed() function below is serialized via .toString() and
// re-parsed standalone in the page context (see openDesktopApp) — it can't
// see outer Node.js closures. An earlier draft of this test used a shared
// `evt()` helper for building result rows; that silently failed inside the
// page ("evt is not defined", swallowed, not a page crash) leaving
// __mockStore only partially seeded. Every result row is inlined below
// instead — see mobile-no-duplicate-team-listing.js's memory note for the
// mobile-side twin of this exact trap.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
      teams: {},
      swimmers: {
        // Swims the same event 6 times this season, never beats their first
        // swim (30.00s) — should trigger "May need attention".
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
        // Genuinely improves, but only swims the event twice — must NOT
        // trigger "needs attention" (below the >5-swims threshold) even
        // though it's a small/no improvement.
        402: {
          id: '402', name: 'Rare Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2012', sex: 'female',
          seasons: { '2025-2026': { bests: [{ event: '100 Breast', pool: '25', seconds: 90.0, time: '1:30.00', date: '01/09/2025', points: 350 }],
            results: [
              { event: '100 Breast', pool: '25', date: '01/09/2025', seconds: 90.5, time: '1:30.50', points: 340, competition: 'Meet A' },
              { event: '100 Breast', pool: '25', date: '01/11/2025', seconds: 90.0, time: '1:30.00', points: 350, competition: 'Meet B' },
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

    const highlightsHtml = await page.$eval('#teamHighlights', (el) => el.innerHTML);
    assert(highlightsHtml.includes('May need attention'), 'expected a "May need attention" highlight card, got: ' + highlightsHtml.slice(0, 800));
    const attentionCardMatch = highlightsHtml.match(/May need attention[\s\S]{0,300}/);
    const attentionCard = attentionCardMatch ? attentionCardMatch[0] : '';
    assert(attentionCard.includes('Stagnant Swimmer'), 'expected the flagged swimmer to be named in the card, got: ' + attentionCard);
    assert(attentionCard.includes('50 Free'), 'expected the specific event to be named in the card, got: ' + attentionCard);
    assert(attentionCard.includes('6 swims'), 'expected the swim count (6) to be shown in the card, got: ' + attentionCard);
    steps.push({ desc: 'A swimmer with 6 swims of the same event and zero improvement is flagged "May need attention", naming the swimmer/event/count', ok: true });

    // "Rare Swimmer" only swam their event twice (below the >5 threshold) —
    // legitimately wins "Most Improved" instead (Stagnant Swimmer has 0%
    // improvement), but must never appear in the "needs attention" card.
    assert(!attentionCard.includes('Rare Swimmer'), 'REGRESSION: a swimmer with only 2 swims of an event should NOT trigger "needs attention" (below the >5 threshold), got: ' + attentionCard);
    steps.push({ desc: 'A swimmer below the >5-swims threshold is never the one flagged, even with no improvement', ok: true });

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
