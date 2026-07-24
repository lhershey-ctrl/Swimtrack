// Mobile equivalent of admin-stats-per-team.js (desktop): the Admin Stats
// panel is folded into mobile Settings (owner-only, no separate tab). Same
// 3 checks: real team name in the Teams list, one Performance Split table
// per team, and a senior/masters swimmer showing FINA + % off World Record.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      teams: { teamX: { name: 'Masters Squad', createdBy: 'ownerUid', createdAt: 500 } },
      swimmers: {
        301: {
          id: '301', name: 'Junior Swimmer', coachUids: ['ownerUid'], birthdate: '01/01/2011', sex: 'male',
          seasons: {
            '2024-2025': {
              bests: [{ event: '100 Free', pool: '25', seconds: 65.0, time: '1:05.00', date: '01/06/2025', points: 350 }],
              results: [{ event: '100 Free', pool: '25', seconds: 65.0, time: '1:05.00', date: '01/06/2025', points: 350 }],
            },
          },
        },
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
      config: { mastersRecords: { table: { LCM: { F: { '45-49': { '50|Free': { seconds: 30.0, athlete: 'WR Holder' } } } } } } },
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    // This owner has 2 clusters (legacy default roster + explicit "Masters
    // Squad" team), so sign-in forces the "Which account?" gate open first —
    // Admin sees every team regardless of which one is picked here.
    const gateOpen = await page.evaluate(() => document.body.innerText.includes('Which account?'));
    if (gateOpen) { await page.click('text=Which account?').catch(() => {}); await page.click('button >> nth=0').catch(() => {}); await page.waitForTimeout(400); }
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(1500);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(bodyText.includes('Masters Squad'), 'Admin Teams list should show the real team name, got: ' + bodyText.slice(0, 600));
    steps.push({ desc: 'Admin Teams list shows the actual team name, not just coach names', ok: true });

    const perfHeadings = (bodyText.match(/Masters Squad|Lhershey/g) || []).length;
    assert(perfHeadings >= 2, 'expected the team name to appear both in the Teams list and as a Performance Split heading, got ' + perfHeadings + ' occurrences');
    steps.push({ desc: 'Performance Split renders a separate, named section per team', ok: true });

    assert(bodyText.includes('Senior Swimmer'), 'Senior Swimmer should appear in the Performance Split, got: ' + bodyText.slice(0, 800));
    assert(bodyText.includes('700 pts (FINA)'), 'Senior Swimmer\'s row should show a FINA score, got: ' + bodyText.slice(0, 800));
    assert(/off WR/.test(bodyText), 'Senior Swimmer\'s row should show a % off World Record, got: ' + bodyText.slice(0, 800));
    steps.push({ desc: 'Senior/masters swimmer shows FINA score + % off World Record instead of Rudolph/USA Standard', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-admin-stats-per-team', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-admin-stats-per-team', passed: false, steps, error: e.message };
  }
};
