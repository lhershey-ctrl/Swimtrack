// Mobile equivalent of remove-from-legacy-keeps-explicit-team.js (desktop).
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachMain', email: 'coachmain@example.com', displayName: 'Coach Main' };
    window.__mockStore = {
      coaches: {
        coachMain: { email: 'coachmain@example.com', name: 'Coach Main', createdAt: 2000 },
        coachOther: { email: 'coachother@example.com', name: 'Coach Other', teamName: 'Team KFS', createdAt: 1000 },
      },
      teams: { teamX: { name: 'Olam HaMayim', createdBy: 'coachMain', createdAt: 500 } },
      swimmers: {
        201: { id: '201', name: 'Shared Swimmer', coachUids: ['coachOther', 'coachMain'], coachEmails: ['coachother@example.com', 'coachmain@example.com'], teamIds: ['teamX'] },
        202: { id: '202', name: 'Other KFS Swimmer', coachUids: ['coachOther', 'coachMain'], coachEmails: ['coachother@example.com', 'coachmain@example.com'] },
      },
      config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    // 2 clusters (legacy "Team KFS" + explicit "Olam HaMayim") force the
    // "Which account?" gate.
    await page.click('button:has-text("Team KFS")');
    await page.waitForTimeout(700);

    const bodyBefore = await page.evaluate(() => document.body.innerText);
    assert(bodyBefore.includes('Shared Swimmer'), 'Team KFS should show the shared swimmer, got: ' + bodyBefore.slice(0, 400));

    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(400);
    await page.click('button:has-text("Shared Swimmer") >> nth=-1');
    await page.waitForTimeout(300);
    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("Remove")');
    await page.waitForTimeout(600);

    const doc = await page.evaluate(() => window.__mockStore.swimmers['201']);
    assert(!doc.coachUids.includes('coachMain'), 'coachMain should be unlinked from the legacy cluster, got: ' + JSON.stringify(doc.coachUids));
    assert(doc.coachUids.includes('coachOther'), 'coachOther\'s access must be untouched, got: ' + JSON.stringify(doc.coachUids));
    assert(doc.teamIds.includes('teamX'), 'REGRESSION: teamIds should be untouched by a legacy-cluster removal, got: ' + JSON.stringify(doc.teamIds));
    steps.push({ desc: 'Removing from the legacy cluster only unlinks coachUids, never touches teamIds', ok: true });

    // Switch to the explicit team — the swimmer must still be there.
    await page.click('button:has-text("Switch account") >> nth=-1');
    await page.waitForTimeout(400);
    await page.click('button:has-text("Olam HaMayim") >> nth=-1');
    await page.waitForTimeout(900);
    const bodyAfter = await page.evaluate(() => document.body.innerText);
    assert(bodyAfter.includes('Shared Swimmer'), 'REGRESSION: swimmer removed from a legacy cluster vanished from an unrelated explicit team too, got: ' + bodyAfter.slice(0, 600));
    steps.push({ desc: 'Swimmer still shows in the explicit team after being removed from an unrelated legacy cluster (the regression this test guards against)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-remove-from-legacy-keeps-explicit-team', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-remove-from-legacy-keeps-explicit-team', passed: false, steps, error: e.message };
  }
};
