// Regression test for a direct request: "put the invite codes near the
// invite a coach section, they are related." Both used to be real sections
// but split apart by Performance Split / Least Recently Synced in between —
// moved the Invite Codes list to sit immediately next to the generator on
// both apps.
const { openDesktopApp, assert } = require('../lib/harness');

function seed() {
  window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Liron' };
  window.__mockStore = {
    coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
    swimmers: { 1: { id: '1', name: 'Gal', coachUids: ['ownerUid'], birthdate: '01/01/2010', sex: 'male' } },
    teams: {}, config: {},
  };
}

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(seed);
  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);

    const titles = await page.$$eval('#tc-admin .section-title', (els) => els.map((e) => e.textContent.trim()));
    const inviteIdx = titles.findIndex((t) => t.includes('Invite a Coach'));
    const codesIdx = titles.findIndex((t) => t.includes('Invite Codes'));
    assert(inviteIdx >= 0 && codesIdx >= 0, 'both sections should exist in the Admin tab, got: ' + JSON.stringify(titles));
    assert(Math.abs(codesIdx - inviteIdx) === 1, '"Invite Codes" should sit immediately next to "Invite a Coach", got order: ' + JSON.stringify(titles));
    steps.push({ desc: 'Desktop: "Invite Codes" sits immediately next to "Invite a Coach" in the Admin tab', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'admin-invite-codes-adjacent (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'admin-invite-codes-adjacent (desktop)', passed: false, steps, error: e.message };
  }
};
