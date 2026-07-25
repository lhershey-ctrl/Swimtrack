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
    steps.push({ desc: 'No uncaught page errors during either flow', ok: true });
    return { name: 'topbar-team-name (desktop)', passed: true, steps };
  } catch (e) {
    steps.push({ desc: e.message, ok: false });
    return { name: 'topbar-team-name (desktop)', passed: false, steps, error: e.message };
  }
};
