// Mobile equivalent of no-duplicate-team-listing.js (desktop): two swimmers
// shared between coachA and coachB, who ALSO belong to an explicit team
// coachB created, used to show up TWICE — once under the explicit team's
// real name, once again under a phantom legacy row labeled with coachA's
// own personal account label. Same root cause + fix as the desktop test.
//
// NOTE: each seed() below inlines the full mock store rather than calling a
// shared helper — Playwright's addInitScript serializes the function via
// .toString() and re-parses it standalone in the browser, so it can't see
// outer Node.js closures. A shared "seedShared()" helper silently threw
// ReferenceError inside the page (swallowed, not a page-crash), leaving
// __mockStore only partially set — a real trap worth documenting here.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];

  // ── Owner's Admin panel: the pair must show up ONCE, under the real team name ──
  {
    const app = await openMobileApp(function seed() {
      window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
      window.__mockStore = {
        coaches: {
          ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 500 },
          // Earliest of the pair — would be picked as legacy "root", and its
          // personal label is what a phantom duplicate row would show.
          coachA: { email: 'a@example.com', name: 'Coach A', teamName: 'Team Har-Shai', createdAt: 1000 },
          coachB: { email: 'b@example.com', name: 'Coach B', createdAt: 2000 },
        },
        teams: { teamX: { id: 'teamX', name: 'Dolphin Netanya', createdBy: 'coachB', createdAt: 1500 } },
        swimmers: {
          401: { id: '401', name: 'Shared Kid 1', coachUids: ['coachA', 'coachB'], coachEmails: [], teamIds: ['teamX'] },
          402: { id: '402', name: 'Shared Kid 2', coachUids: ['coachA', 'coachB'], coachEmails: [], teamIds: ['teamX'] },
        },
        config: {},
      };
    });
    const { page, consoleErrors } = app;
    try {
      await page.click('text=Sign in with Google');
      await page.waitForTimeout(900);
      // Admin moved out of Settings into its own hidden full-screen page
      // (2026-07-31) — reachable via the avatar menu's "🔑 Admin" item.
      await page.click('#topbarAvatarBtn');
      await page.waitForTimeout(150);
      await page.click('#topbarMenuAdmin');
      // Admin panel fires several parallel fetches (coaches/swimmers/codes/
      // rudolph/usaStandards/mastersRecords) — poll instead of a fixed sleep
      // so this isn't flaky under slower CI/mock-server timing.
      await page.waitForFunction(() => document.body.innerText.includes('PERFORMANCE SPLIT'), { timeout: 10000 });

      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(bodyText.includes('Dolphin Netanya'), 'expected the real team name to appear in the Admin panel, got: ' + bodyText.slice(0, 900));
      assert(!bodyText.includes('Team Har-Shai'), 'REGRESSION: a phantom "Team Har-Shai" row (coachA\'s personal label) should not exist, got: ' + bodyText);
      // Scope to just the Teams list (between "STATS" and "PERFORMANCE
      // SPLIT") to count rows without the name also legitimately repeating
      // in the (collapsed) Performance Split section header below it.
      const teamsListText = bodyText.split('STATS')[1].split('PERFORMANCE SPLIT')[0];
      const dolphinCount = (teamsListText.match(/Dolphin Netanya/g) || []).length;
      assert(dolphinCount === 1, 'expected exactly ONE "Dolphin Netanya" row in the Teams list, got ' + dolphinCount + ' — text: ' + teamsListText);
      steps.push({ desc: 'Admin panel shows the shared swimmers ONCE, under the real team name — no phantom legacy-label duplicate', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (owner seat): ' + consoleErrors.join(' | '));
      await app.close();
    } catch (e) {
      await app.close();
      steps.push({ desc: e.message, ok: false });
      return { name: 'mobile-no-duplicate-team-listing', passed: false, steps, error: e.message };
    }
  }

  // ── coachA's own seat: these are their only swimmers, both fully covered
  // by the explicit team — single cluster, no "Which account?" gate. ──
  {
    const app = await openMobileApp(function seed() {
      window.__FAKE_USER = { uid: 'coachA', email: 'a@example.com', displayName: 'Coach A' };
      window.__mockStore = {
        coaches: {
          coachA: { email: 'a@example.com', name: 'Coach A', teamName: 'Team Har-Shai', createdAt: 1000 },
          coachB: { email: 'b@example.com', name: 'Coach B', createdAt: 2000 },
        },
        teams: { teamX: { id: 'teamX', name: 'Dolphin Netanya', createdBy: 'coachB', createdAt: 1500 } },
        swimmers: {
          401: { id: '401', name: 'Shared Kid 1', coachUids: ['coachA', 'coachB'], coachEmails: [], teamIds: ['teamX'] },
          402: { id: '402', name: 'Shared Kid 2', coachUids: ['coachA', 'coachB'], coachEmails: [], teamIds: ['teamX'] },
        },
        config: {},
      };
    });
    const { page, consoleErrors } = app;
    try {
      await page.click('text=Sign in with Google');
      await page.waitForTimeout(900);
      const gateOpen = await page.evaluate(() => document.body.innerText.includes('Which account?'));
      assert(!gateOpen, 'coachA has only one real cluster here — no "Which account?" gate should appear');
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert(bodyText.includes('Shared Kid 1') || bodyText.includes('Select swimmer'), 'expected the single cluster to load normally, got: ' + bodyText.slice(0, 600));
      steps.push({ desc: 'From coachA\'s own seat, the two swimmers form a single cluster — no ambiguous switcher / gate', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (coachA seat): ' + consoleErrors.join(' | '));
      await app.close();
    } catch (e) {
      await app.close();
      steps.push({ desc: e.message, ok: false });
      return { name: 'mobile-no-duplicate-team-listing', passed: false, steps, error: e.message };
    }
  }

  steps.push({ desc: 'No uncaught page errors during either flow', ok: true });
  return { name: 'mobile-no-duplicate-team-listing', passed: true, steps };
};
