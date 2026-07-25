// Mobile equivalent of the display half of world-top10-parse-and-match.js.
// Mobile never publishes Masters Top-10 data (desktop-Admin-only, same as
// every other reference table) — this seeds config/mastersTop10 directly
// (as if desktop had already published it) and checks mobile's read-only
// Records-tab display matches correctly by intlName.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        110916: {
          id: '110916', name: 'אניה גוסטמלסקי', coachUids: ['coachX'], intlName: 'GOSTMALSKI Anya', birthdate: '01/06/1981', sex: 'female',
          seasons: { '2024-2025': { bests: [], results: [] } },
        },
      },
      teams: {},
      config: {
        mastersTop10: {
          entries: [
            { source: 'world', year: 2025, course: 'LCM', sex: 'F', ageGroup: '40-44', event: '50m Backstroke', rank: 7, time: '31.94', seconds: 31.94, name: 'GOSTMALSKI Anya' },
            { source: 'world', year: 2025, course: 'LCM', sex: 'F', ageGroup: '40-44', event: '100m Backstroke', rank: 7, time: '01:10.92', seconds: 70.92, name: 'GOSTMALSKI Anya' },
          ],
          count: 2, loadedAt: Date.now(), by: 'lhershey@gmail.com',
        },
      },
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Records")');
    await page.waitForTimeout(600);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(/international rankings/i.test(bodyText), 'expected an "International Rankings" section, got: ' + bodyText.slice(0, 800));
    assert(bodyText.includes('50m Backstroke') && bodyText.includes('#7'), 'expected the matched 50m Backstroke #7 entry, got: ' + bodyText.slice(0, 1000));
    assert(bodyText.includes('World'), 'expected the source label "World" to show, got: ' + bodyText.slice(0, 1000));
    assert(bodyText.includes('2 appearances'), 'expected an appearance count of 2, got: ' + bodyText.slice(0, 1000));
    steps.push({ desc: 'Records tab shows International Rankings, matched by intlName, sourced from config/mastersTop10', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-intl-rankings-display', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-intl-rankings-display', passed: false, steps, error: e.message };
  }
};
