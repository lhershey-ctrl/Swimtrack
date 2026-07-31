// Regression test for a real, live-reported bug: two swimmers shared
// between coachA and coachB, who ALSO belong to an explicit team coachB
// created, used to show up TWICE in the Admin Teams list — once correctly
// under the explicit team's real name, once again under a phantom "legacy"
// row labeled with coachA's own personal account label (whichever coach in
// the pair is earliest-created). Same swimmers, same coach pair, counted
// twice under two different names. Root cause + fix: see
// clusterMySwimmers/groupCoachesIntoTeams — a swimmer with an explicit team
// no longer ALSO joins the legacy/root-coach grouping.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: {
        ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 500 },
        // Earliest of the pair — would be picked as "root" by the legacy
        // grouping, and its personal label is what a phantom row would show.
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

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(300);
    await page.click('#t-admin');
    await page.waitForTimeout(1200);

    const coachesText = await page.$eval('#adminCoachesCard', (el) => el.textContent);
    const dolphinCount = (coachesText.match(/Dolphin Netanya/g) || []).length;
    assert(dolphinCount === 1, 'expected exactly ONE "Dolphin Netanya" row, got ' + dolphinCount + ' — text: ' + coachesText);
    assert(!coachesText.includes('Team Har-Shai'), 'REGRESSION: a phantom "Team Har-Shai" row (coachA\'s personal label) should not exist — same 2 swimmers are already covered by the explicit team, got: ' + coachesText);
    steps.push({ desc: 'The shared swimmers show up under the explicit team ONCE, with no phantom legacy-label duplicate', ok: true });

    const coachesHtml = await page.$eval('#adminCoachesCard', (el) => el.innerHTML);
    assert(/Dolphin Netanya[\s\S]{0,400}>Team</.test(coachesHtml), 'expected the "Team" badge next to the real explicit-team row, got: ' + coachesHtml.slice(0, 700));
    steps.push({ desc: 'The explicit team row is badged "Team" (not "Shared roster")', ok: true });

    await browser.close();
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'no-duplicate-team-listing (desktop)', passed: false, steps, error: e.message };
  }

  // Fresh page for coachA's own perspective (mock store doesn't persist
  // across app instances, so re-seed identically).
  const { browser: browser2, page: page2, consoleErrors: consoleErrors2 } = await openDesktopApp(function seed() {
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
  try {
    await page2.click('text=☁ Sign in with Google');
    await page2.waitForTimeout(900);
    const gateOpen = await page2.$eval('#teamGate', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
    assert(!gateOpen, 'coachA has only one real cluster here — no picker gate should appear');
    const picker = await page2.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(picker.includes('Shared Kid 1') && picker.includes('Shared Kid 2'), 'expected both shared swimmers in the single cluster, got: ' + picker);
    steps.push({ desc: 'From coachA\'s own seat, the two swimmers form a single cluster — no duplicate/ambiguous switcher entry', ok: true });

    assert(consoleErrors2.length === 0, 'unexpected page errors (coachA seat): ' + consoleErrors2.join(' | '));
    steps.push({ desc: 'No uncaught page errors during either flow', ok: true });

    await browser2.close();
    return { name: 'no-duplicate-team-listing (desktop)', passed: true, steps };
  } catch (e) {
    await browser2.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'no-duplicate-team-listing (desktop)', passed: false, steps, error: e.message };
  }
};
