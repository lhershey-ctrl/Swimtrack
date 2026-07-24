// Regression test for the 2026-07-24 Admin page changes:
//   1. Each row in the Admin "Teams" list now shows the actual team name
//      (e.g. "Masters Squad"), not just the concatenated coach names.
//   2. Performance Split is rendered as ONE TABLE PER TEAM, not a single
//      table mixing every coach's swimmers together.
//   3. A senior/masters swimmer (age > 30) shows a FINA score + % off World
//      Record in the Rudolph/USA Standard columns instead of a blank "—"
//      (neither Rudolph nor USA Standards is calibrated for masters ages).
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      teams: { teamX: { name: 'Masters Squad', createdBy: 'ownerUid', createdAt: 500 } },
      swimmers: {
        // Legacy (no explicit team) cluster — the owner's own default roster.
        301: {
          id: '301', name: 'Junior Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2011', sex: 'male',
          seasons: {
            '2024-2025': {
              bests: [{ event: '100 Free', pool: '25', seconds: 65.0, time: '1:05.00', date: '01/06/2025', points: 350 }],
              results: [{ event: '100 Free', pool: '25', seconds: 65.0, time: '1:05.00', date: '01/06/2025', points: 350 }],
            },
          },
        },
        // Explicit-team member (age 45 in 2025 => "45-49" WR bracket) — a
        // senior/masters swimmer, no other coach. _teamBestInGroup (used by
        // the WR-gap lookup) reads each season's "bests" table, not raw
        // "results" — both need the same swim for this fixture to work.
        302: {
          id: '302', name: 'Senior Swimmer', coachUids: ['ownerUid'], teamIds: ['teamX'], birthdate: '01/01/1980', sex: 'female',
          seasons: {
            '2024-2025': {
              bests: [{ event: '50 Free', pool: '50', seconds: 32.0, time: '32.00', date: '01/06/2025', points: 700 }],
              results: [{ event: '50 Free', pool: '50', seconds: 32.0, time: '32.00', date: '01/06/2025', points: 700 }],
            },
          },
        },
      },
      config: {
        mastersRecords: { table: { LCM: { F: { '45-49': { '50|Free': { seconds: 30.0, athlete: 'WR Holder' } } } } } },
      },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    // This owner has 2 clusters (the legacy default roster + the explicit
    // "Masters Squad" team), so sign-in forces the team-gate picker open —
    // Admin sees every team regardless of which one is picked here.
    const gateOpen = await page.$eval('#teamGate', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
    if (gateOpen) { await page.click('#teamGateBody button'); await page.waitForTimeout(400); }
    await page.click('#t-settings');
    await page.waitForTimeout(300);

    const adminTabVisible = await page.$eval('#t-admin', (el) => getComputedStyle(el).display !== 'none');
    assert(adminTabVisible, 'Admin tab should be visible for the owner');
    await page.click('#t-admin');
    await page.waitForTimeout(1200);

    const coachesText = await page.$eval('#adminCoachesCard', (el) => el.textContent);
    assert(coachesText.includes('Masters Squad'), 'Admin Teams list should show the real team name "Masters Squad", got: ' + coachesText);
    steps.push({ desc: 'Admin Teams list shows the actual team name, not just coach names', ok: true });

    const perfHtml = await page.$eval('#adminPerf', (el) => el.innerHTML);
    const perfText = await page.$eval('#adminPerf', (el) => el.textContent);
    const tableCount = (perfHtml.match(/<table/g) || []).length;
    assert(tableCount >= 2, 'expected one Performance Split table per team (>=2), got ' + tableCount + ' tables');
    assert(perfText.includes('Masters Squad'), 'Performance Split section should be headed by the team name, got: ' + perfText);
    steps.push({ desc: 'Performance Split renders one table per team (not one combined table)', ok: true });

    assert(perfText.includes('Senior Swimmer'), 'Senior Swimmer should appear in the Performance Split, got: ' + perfText);
    assert(perfText.includes('700 pts (FINA)'), 'Senior Swimmer\'s row should show a FINA score, got: ' + perfText);
    assert(/off WR/.test(perfText), 'Senior Swimmer\'s row should show a % off World Record, got: ' + perfText);
    steps.push({ desc: 'Senior/masters swimmer shows FINA score + % off World Record instead of Rudolph/USA Standard', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'admin-stats-per-team (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'admin-stats-per-team (desktop)', passed: false, steps, error: e.message };
  }
};
