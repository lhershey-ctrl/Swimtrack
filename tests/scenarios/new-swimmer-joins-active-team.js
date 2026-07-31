// Regression test for a real, live-reported bug: a swimmer created via the
// new-swimmer approval modal (both the auto-load-from-file path and the
// Extract tab's quick "+ Add" form) never got tagged with the currently
// active explicit team — confirmNewSwimmerModal built the local swimmer
// object without the `if(window.currentTeamId) sw.teamIds=[...]` stamp
// that addSettingsSwimmer (a separate, untouched add-swimmer path) already
// had. The swimmer silently landed with NO team at all, then fell into a
// legacy "solo" grouping at sync time — which, because the signed-in
// coach's own personal account label happened to match a REAL team's name,
// displayed as a confusing phantom duplicate of that team ("Shared Roster"
// badge, same name). This test drives the real flow end to end: pick an
// explicit team, add a swimmer via each path, sync to the cloud, and check
// the swimmer doc's real teamIds — not just local state.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachOwner', email: 'owner@example.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { coachOwner: { email: 'owner@example.com', name: 'Owner', createdAt: 1000 } },
      swimmers: {
        // A pre-existing swimmer keeps the account single-cluster-free of
        // ambiguity so signing in doesn't force the "which account" gate.
        901: { id: '901', name: 'Existing Swimmer', coachUids: ['coachOwner'], teamIds: ['teamAlpha'] },
      },
      teams: { teamAlpha: { id: 'teamAlpha', name: 'Junior Squad', createdBy: 'coachOwner', createdAt: 1000 } },
      config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    const activeTeamId = await page.evaluate(() => window.currentTeamId);
    assert(activeTeamId === 'teamAlpha', 'expected "Junior Squad" (its only real team) to already be the active team, got: ' + activeTeamId);
    steps.push({ desc: 'Signed in with "Junior Squad" as the active team', ok: true });

    // Path 1: auto-load an unrecognized swimmer from a file, confirm via the modal.
    const seasonJson = JSON.stringify({
      _swimmerId: '902', _swimmerName: 'Auto_Loaded_Kid',
      '2024-2025': { bests: [], results: [{ event: '50 Free', pool: '25', time: '30.00', seconds: 30, points: 400, date: '01/01/2025' }] },
    });
    await page.click('.paste-toggle:has-text("Paste JSON")');
    await page.waitForTimeout(150);
    await page.fill('#jsonPaste', seasonJson);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    const autoLoadedTeamIds = await page.evaluate(() => {
      const sw = (window.getAllSwimmers ? window.getAllSwimmers() : []).find((s) => s.id === '902');
      return sw ? sw.teamIds : null;
    });
    assert(Array.isArray(autoLoadedTeamIds) && autoLoadedTeamIds.includes('teamAlpha'), 'REGRESSION: auto-loaded swimmer should be tagged with the active team ("Junior Squad"), got teamIds: ' + JSON.stringify(autoLoadedTeamIds));
    steps.push({ desc: 'A swimmer auto-loaded from an unrecognized file is tagged with the active team locally', ok: true });

    // Path 2: manual quick-add on the Extract tab.
    await page.click('#t-extract');
    await page.waitForTimeout(200);
    await page.fill('#newSwimmerName', 'Manually Added Kid');
    await page.fill('#newSwimmerId', '903');
    await page.click('button:has-text("+ Add")');
    await page.waitForTimeout(300);
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    const manualTeamIds = await page.evaluate(() => {
      const sw = (window.getAllSwimmers ? window.getAllSwimmers() : []).find((s) => s.id === '903');
      return sw ? sw.teamIds : null;
    });
    assert(Array.isArray(manualTeamIds) && manualTeamIds.includes('teamAlpha'), 'REGRESSION: manually-added swimmer should be tagged with the active team ("Junior Squad"), got teamIds: ' + JSON.stringify(manualTeamIds));
    steps.push({ desc: 'A swimmer added via the Extract tab\'s quick "+ Add" form is tagged with the active team locally', ok: true });

    // Sync to the cloud and confirm the REAL doc — not just local state —
    // actually carries the team tag (this is what the live bug report was
    // about: the local UI looked fine, the synced Firestore doc did not).
    await page.click('#t-settings');
    await page.waitForTimeout(300);
    await page.click('text=💾 Save All Changes');
    await page.waitForTimeout(900);

    const cloudTeamIds = await page.evaluate(() => ({
      autoLoaded: (window.__mockStore.swimmers['902'] || {}).teamIds,
      manual: (window.__mockStore.swimmers['903'] || {}).teamIds,
    }));
    assert(Array.isArray(cloudTeamIds.autoLoaded) && cloudTeamIds.autoLoaded.includes('teamAlpha'), 'REGRESSION: synced cloud doc for the auto-loaded swimmer is missing the active team, got: ' + JSON.stringify(cloudTeamIds.autoLoaded));
    assert(Array.isArray(cloudTeamIds.manual) && cloudTeamIds.manual.includes('teamAlpha'), 'REGRESSION: synced cloud doc for the manually-added swimmer is missing the active team, got: ' + JSON.stringify(cloudTeamIds.manual));
    steps.push({ desc: 'Both new swimmers\' synced Firestore docs carry the active team\'s teamId (the actual regression this test guards against)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'new-swimmer-joins-active-team (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'new-swimmer-joins-active-team (desktop)', passed: false, steps, error: e.message };
  }
};
