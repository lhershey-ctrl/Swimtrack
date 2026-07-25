// Regression test for a direct request: show the currently selected team's
// name in small font in the top nav bar (Extract/Analyze/Team/Settings/
// Admin), so a coach juggling more than one roster can tell at a glance
// which one they're looking at. Covers both the explicit-team case (teams/
// {id}.name, e.g. "עולם המים מאסטרס") and the legacy/no-explicit-team
// fallback (the coach's own personal label, e.g. "KFS").
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  try {
    // ── Explicit team ──
    {
      const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
        window.__FAKE_USER = { uid: 'coachOwner', email: 'owner@example.com', displayName: 'Owner' };
        window.__mockStore = {
          coaches: { coachOwner: { email: 'owner@example.com', name: 'Owner', createdAt: 1000 } },
          swimmers: { 115352: { id: '115352', name: 'לירון הר-שי', coachUids: ['coachOwner'], teamIds: ['teamAlpha'], birthdate: '01/06/1978', sex: 'male' } },
          teams: { teamAlpha: { id: 'teamAlpha', name: 'עולם המים מאסטרס', createdBy: 'coachOwner', createdAt: 1000 } },
          config: {},
        };
      });
      await page.click('text=☁ Sign in with Google');
      await page.waitForTimeout(900);
      const txt = await page.$eval('#topbarTeamName', (el) => el.textContent);
      assert(txt === 'עולם המים מאסטרס', 'topbar should show the explicit team\'s own name, got: ' + txt);
      steps.push({ desc: 'Topbar shows the explicit team\'s own name', ok: true });
      assert(consoleErrors.length === 0, 'unexpected page errors (explicit team): ' + consoleErrors.join(' | '));
      await browser.close();
    }
    // ── Legacy/no explicit team — falls back to the coach's own label ──
    {
      const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
        window.__FAKE_USER = { uid: 'coachX', email: 'kfscoach@example.com', displayName: 'KFS Coach' };
        window.__mockStore = {
          coaches: { coachX: { email: 'kfscoach@example.com', name: 'KFS Coach', teamName: 'KFS', createdAt: 1000 } },
          swimmers: { 1: { id: '1', name: 'Gal', coachUids: ['coachX'], birthdate: '01/06/2010', sex: 'male' } },
          teams: {}, config: {},
        };
      });
      await page.click('text=☁ Sign in with Google');
      await page.waitForTimeout(900);
      const txt = await page.$eval('#topbarTeamName', (el) => el.textContent);
      assert(txt === 'KFS', 'topbar should fall back to the coach\'s own team label when there\'s no explicit team, got: ' + txt);
      steps.push({ desc: 'Topbar falls back to the coach\'s own label for the legacy/no-explicit-team case', ok: true });
      assert(consoleErrors.length === 0, 'unexpected page errors (legacy): ' + consoleErrors.join(' | '));
      await browser.close();
    }
    // ── Real bug, reported live: two LEGACY (no explicit team) clusters —
    // switching between them kept showing whichever cluster the signed-in
    // coach's OWN personal label happened to belong to, never the other
    // cluster's real name, because the fallback used `teamName` (this
    // coach's own label) instead of the currently SELECTED cluster's own
    // name (which can belong to a different coach entirely). ──
    {
      const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
        window.__FAKE_USER = { uid: 'coachL', email: 'lhershey@example.com', displayName: 'Liron' };
        window.__mockStore = {
          coaches: {
            coachL: { email: 'lhershey@example.com', name: 'Liron', teamName: 'Team Har-Shai', createdAt: 2000 },
            coachKFS: { email: 'kfs@example.com', name: 'KFS Coach', teamName: 'KFS', createdAt: 1000 },
          },
          swimmers: {
            // Solo — only coachL — its own legacy cluster, named by his own label.
            201: { id: '201', name: 'Har-Shai Kid', coachUids: ['coachL'], birthdate: '01/06/2011', sex: 'male' },
            // Shared with coachKFS (created earlier) — a SEPARATE legacy cluster
            // named after coachKFS's own label, not coachL's.
            202: { id: '202', name: 'KFS Kid', coachUids: ['coachL', 'coachKFS'], birthdate: '01/06/2011', sex: 'female' },
          },
          teams: {}, config: {},
        };
      });
      await page.click('text=☁ Sign in with Google');
      await page.waitForTimeout(900);
      // 2 legacy clusters — sign-in forces the "which account" picker gate.
      await page.click('#teamGateBody button:has-text("KFS")');
      await page.waitForTimeout(400);
      let txt = await page.$eval('#topbarTeamName', (el) => el.textContent);
      assert(txt === 'KFS', 'after picking the KFS cluster, topbar should show "KFS", got: ' + txt);
      steps.push({ desc: 'Picking a legacy cluster shows THAT cluster\'s own name, not the signed-in coach\'s personal label', ok: true });

      await page.click('#t-settings');
      await page.waitForTimeout(300);
      await page.click('button:has-text("Switch Account")');
      await page.waitForTimeout(300);
      await page.click('#teamGateBody button:has-text("Team Har-Shai")');
      await page.waitForTimeout(400);
      txt = await page.$eval('#topbarTeamName', (el) => el.textContent);
      assert(txt === 'Team Har-Shai', 'after switching to the Har-Shai cluster, topbar should update to "Team Har-Shai", got: ' + txt);
      steps.push({ desc: 'Switching between two legacy clusters updates the topbar to the newly-selected cluster\'s real name', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (two legacy clusters): ' + consoleErrors.join(' | '));
      await browser.close();
    }
    steps.push({ desc: 'No uncaught page errors during either flow', ok: true });
    return { name: 'topbar-team-name (desktop)', passed: true, steps };
  } catch (e) {
    steps.push({ desc: e.message, ok: false });
    return { name: 'topbar-team-name (desktop)', passed: false, steps, error: e.message };
  }
};
