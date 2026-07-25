// Mobile equivalent of remove-viewer.js (desktop).
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
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
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(400);

    const before = await page.evaluate(() => document.body.innerText);
    assert(before.includes('coachv@example.com'), '"Current Team" should list the shared coach\'s email, got: ' + before.slice(0, 800));
    steps.push({ desc: '"Current Team" lists the other coach with access', ok: true });

    page.once('dialog', (d) => d.accept());
    await page.click('button[title="Remove this viewer\'s access"]');
    await page.waitForTimeout(700);

    const cloudAfter = await page.evaluate(() => window.__mockStore.swimmers['701'].coachUids);
    assert(!cloudAfter.includes('coachV'), 'REGRESSION: removed viewer still has coachUids access, got: ' + JSON.stringify(cloudAfter));
    assert(cloudAfter.includes('coachX'), 'the current coach\'s own access must be untouched, got: ' + JSON.stringify(cloudAfter));
    steps.push({ desc: 'Removing a viewer revokes their access, leaving the swimmer and other coaches intact', ok: true });

    const after = await page.evaluate(() => document.body.innerText);
    assert(!after.includes('coachv@example.com'), 'removed viewer should no longer be listed, got: ' + after.slice(0, 800));
    steps.push({ desc: 'Removed viewer no longer appears in "Current Team"', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-remove-viewer', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-remove-viewer', passed: false, steps, error: e.message };
  }
};
