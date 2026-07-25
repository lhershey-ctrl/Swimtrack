// Regression test for a new capability: "Add a Viewer" previously only ever
// granted access (Generate code); there was no way to revoke a viewer once
// added. Each "Current Team" pill now has an inline "✕" to remove that
// viewer's access to every swimmer this coach shares with them.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: {
        coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 },
        coachV: { email: 'coachv@example.com', name: 'Coach V', createdAt: 2000 },
      },
      swimmers: {
        701: { id: '701', name: 'Shared Swimmer', coachUids: ['coachX', 'coachV'], coachEmails: ['coachx@example.com', 'coachv@example.com'] },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(400);

    const teamListBefore = await page.$eval('#viewerTeamList', (el) => el.textContent);
    assert(teamListBefore.includes('coachv@example.com'), 'viewer pill should show the shared coach\'s email, got: ' + teamListBefore);
    steps.push({ desc: '"Current Team" lists the other coach with access', ok: true });

    page.once('dialog', (d) => d.accept());
    await page.click('#viewerTeamList button');
    await page.waitForTimeout(600);

    const cloudAfter = await page.evaluate(() => window.__mockStore.swimmers['701'].coachUids);
    assert(!cloudAfter.includes('coachV'), 'REGRESSION: removed viewer still has coachUids access, got: ' + JSON.stringify(cloudAfter));
    assert(cloudAfter.includes('coachX'), 'the current coach\'s own access must be untouched, got: ' + JSON.stringify(cloudAfter));
    steps.push({ desc: 'Clicking the "✕" on a viewer pill revokes their access (arrayRemove), leaving the swimmer and other coaches intact', ok: true });

    const teamListAfter = await page.$eval('#viewerTeamList', (el) => el.textContent);
    assert(!teamListAfter.includes('coachv@example.com'), 'removed viewer should no longer be listed, got: ' + teamListAfter);
    steps.push({ desc: 'Removed viewer no longer appears in "Current Team"', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'remove-viewer (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'remove-viewer (desktop)', passed: false, steps, error: e.message };
  }
};
