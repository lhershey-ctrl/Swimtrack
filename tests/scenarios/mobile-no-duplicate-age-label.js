// Mobile twin of no-duplicate-age-label.js (desktop) — same underlying bug:
// ageGroupLabel(13) used to return the literal string "Age 13" for ages
// 12-15, which duplicated onto the Home tab's "ID {id} · Age {n}" line as
// "Age 13 · Age 13". Fixed in mobile/src/analysis.js (ageGroupLabel) and
// mobile/src/App.jsx (HomeTab header), mirroring the desktop fix.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
      teams: {},
      // Birth year 2013 → age 13 as of "today" (2026), the exact reported bracket.
      swimmers: {
        999009: {
          id: '999009', name: 'Age13 Mobile Kid', coachUids: ['ownerUid'], birthdate: '01/07/2013', sex: 'female',
          seasons: { '2025-2026': {
            bests: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/09/2025', points: 400 }],
            results: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/09/2025', points: 400 }],
          } },
        },
      },
      config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    const homeText = await page.evaluate(() => document.body.innerText);
    assert(/Age 13/.test(homeText), 'expected the Home tab header to show Age 13 at all, got: ' + homeText.slice(0, 400));
    assert(!/Age 13[^0-9]*Age 13/.test(homeText), 'REGRESSION: Home tab header shows duplicated "Age 13 ... Age 13", got: ' + homeText.slice(0, 400));
    steps.push({ desc: 'Home tab header shows "Age 13" exactly once, not duplicated (ages 12-15 have no distinct bracket name)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-no-duplicate-age-label', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-no-duplicate-age-label', passed: false, steps, error: e.message };
  }
};
