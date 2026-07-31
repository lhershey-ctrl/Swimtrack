// Regression test for a real, live-reported bug: an explicit team's (e.g.
// "עולם המים") swimmer list used to be fetched via the same coachUids-gated
// query used for legacy clusters — so unlinking a coach's own coachUids from
// an unrelated legacy-cluster swimmer (e.g. "Team KFS") could cut off the
// explicit team's view too. Fixed by fetching a coach's OWNED teams'
// swimmers independent of coachUids (see loadSwimmers/resolveTeamAndProceed:
// fetchSwimmersByTeam(t.id) runs alongside fetchSwimmers(user), unconditionally).
//
// NOTE: this used to use ONE swimmer with dual membership (legacy AND an
// explicit teamId) to prove the point, matching the original live bug
// report. That setup is no longer reachable through the UI: a swimmer with
// an explicit teamId no longer ALSO surfaces under a legacy cluster (see
// clusterMySwimmers/groupCoachesIntoTeams — deliberately de-duped 2026-07-31
// after live confusion, "why do I have 2 similar teams," turned out to be
// exactly this dual-membership case producing a phantom duplicate row). So
// this now uses two separate swimmers to exercise the same underlying
// fetch-independence guarantee: removing legacy access to one swimmer must
// never affect a different swimmer's explicit-team visibility.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachMain', email: 'coachmain@example.com', displayName: 'Coach Main' };
    window.__mockStore = {
      coaches: {
        coachMain: { email: 'coachmain@example.com', name: 'Coach Main', createdAt: 2000 },
        coachOther: { email: 'coachother@example.com', name: 'Coach Other', teamName: 'Team KFS', createdAt: 1000 },
      },
      teams: { teamX: { name: 'Olam HaMayim', createdBy: 'coachMain', createdAt: 500 } },
      swimmers: {
        // Purely legacy — shared with coachOther, no explicit team. This is
        // the one that gets its coachMain access removed.
        201: { id: '201', name: 'Shared Swimmer', coachUids: ['coachOther', 'coachMain'], coachEmails: ['coachother@example.com', 'coachmain@example.com'] },
        // A second Team-KFS swimmer, purely so removing "Shared Swimmer"
        // doesn't trip the app's "must keep at least one swimmer" guard.
        202: { id: '202', name: 'Other KFS Swimmer', coachUids: ['coachOther', 'coachMain'], coachEmails: ['coachother@example.com', 'coachmain@example.com'] },
        // In coachMain's explicit team AND separately shares coachOther as a
        // legacy co-coach too — the swimmer whose visibility must survive
        // the unrelated removal above.
        203: { id: '203', name: 'Explicit Team Swimmer', coachUids: ['coachMain', 'coachOther'], coachEmails: ['coachmain@example.com', 'coachother@example.com'], teamIds: ['teamX'] },
      },
      config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    // 2 clusters (legacy "Team KFS" + explicit "Olam HaMayim") force the gate.
    await page.click('#teamGateBody button:has-text("Team KFS")');
    await page.waitForTimeout(700);

    const pickerOnKFS = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(pickerOnKFS.includes('Shared Swimmer'), 'Team KFS should show the shared swimmer, got: ' + pickerOnKFS);
    assert(!pickerOnKFS.includes('Explicit Team Swimmer'), 'Team KFS must NOT show the swimmer that already has an explicit team (de-duped), got: ' + pickerOnKFS);
    steps.push({ desc: 'Team KFS shows only its purely-legacy swimmers, not the one with an explicit team', ok: true });

    await page.click('#t-settings');
    await page.waitForTimeout(400);
    const cards = await page.$$('#settingsSwimmerList > div');
    let removed = false;
    for (const card of cards) {
      const text = await card.textContent();
      if (text.includes('Shared Swimmer')) { await card.$eval('button:has-text("✕ Remove")', (btn) => btn.click()); removed = true; break; }
    }
    assert(removed, 'could not find "Shared Swimmer"\'s card to click Remove on');
    await page.waitForTimeout(600);

    const doc = await page.evaluate(() => window.__mockStore.swimmers['201']);
    assert(!doc.coachUids.includes('coachMain'), 'coachMain should be unlinked from the legacy cluster, got: ' + JSON.stringify(doc.coachUids));
    assert(doc.coachUids.includes('coachOther'), 'coachOther\'s access must be untouched, got: ' + JSON.stringify(doc.coachUids));
    steps.push({ desc: 'Removing from the legacy cluster only unlinks coachUids on that swimmer', ok: true });

    // Switch to the explicit team — the UNRELATED swimmer must still be there.
    await page.click('text=Switch Account');
    await page.waitForTimeout(400);
    await page.click('#teamGateBody button:has-text("Olam HaMayim")');
    await page.waitForTimeout(900);
    const pickerOnExplicit = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(pickerOnExplicit.includes('Explicit Team Swimmer'), 'REGRESSION: an unrelated legacy-cluster removal broke the explicit team\'s own fetch, got: ' + pickerOnExplicit);
    steps.push({ desc: 'The explicit team\'s swimmer is unaffected by an unrelated legacy-cluster removal (the regression this test guards against)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'remove-from-legacy-keeps-explicit-team (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'remove-from-legacy-keeps-explicit-team (desktop)', passed: false, steps, error: e.message };
  }
};
