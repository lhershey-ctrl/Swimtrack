// Regression test for a real, live-reported bug: a swimmer shared between
// two coaches (a legacy, coachUids-based cluster — e.g. "Team KFS") who is
// ALSO in an explicit team the SAME coach created (e.g. "עולם המים") —
// removing them from the legacy cluster stripped the coach's own uid from
// coachUids, which also made them vanish from the explicit team, even
// though the swimmer's teamIds was never touched. Root cause: the explicit
// team's swimmer list was fetched via the same coachUids-gated query used
// for the legacy cluster. Fixed by (a) never touching coachUids when
// removing while viewing an explicit team (already covered by
// remove-swimmer-stays-removed.js) and (b) fetching a coach's OWNED teams'
// swimmers independent of coachUids, so losing coachUids on one cluster
// can't cut off an unrelated explicit team.
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
        // Shared legacy (with coachOther, whose team is named "Team KFS")
        // AND in the explicit team coachMain owns — exactly the real case.
        201: { id: '201', name: 'Shared Swimmer', coachUids: ['coachOther', 'coachMain'], coachEmails: ['coachother@example.com', 'coachmain@example.com'], teamIds: ['teamX'] },
        // A second Team-KFS swimmer, purely so removing "Shared Swimmer"
        // doesn't trip the app's "must keep at least one swimmer" guard.
        202: { id: '202', name: 'Other KFS Swimmer', coachUids: ['coachOther', 'coachMain'], coachEmails: ['coachother@example.com', 'coachmain@example.com'] },
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
    assert(doc.teamIds.includes('teamX'), 'REGRESSION: teamIds should be untouched by a legacy-cluster removal, got: ' + JSON.stringify(doc.teamIds));
    steps.push({ desc: 'Removing from the legacy cluster only unlinks coachUids, never touches teamIds', ok: true });

    // Switch to the explicit team — the swimmer must still be there.
    await page.click('text=Switch Account');
    await page.waitForTimeout(400);
    await page.click('#teamGateBody button:has-text("Olam HaMayim")');
    await page.waitForTimeout(900);
    const pickerOnExplicit = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(pickerOnExplicit.includes('Shared Swimmer'), 'REGRESSION: swimmer removed from a legacy cluster vanished from an unrelated explicit team too, got: ' + pickerOnExplicit);
    steps.push({ desc: 'Swimmer still shows in the explicit team after being removed from an unrelated legacy cluster (the regression this test guards against)', ok: true });

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
