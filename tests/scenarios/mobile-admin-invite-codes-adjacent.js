// Mobile equivalent of admin-invite-codes-adjacent.js (desktop): the Invite
// Codes list used to render inside AdminStatsPanel, sandwiched between
// Stats and Performance Split — far from the InviteCodeManager generator
// that follows AdminStatsPanel in the tree. Moved it to the end of
// AdminStatsPanel's own output so it lands immediately before the
// generator once both are rendered together.
//
// Admin moved out of the Settings tab into its own hidden full-screen page
// (2026-07-31, directly requested) — reachable via the avatar menu's
// "🔑 Admin" item, not inline in Settings anymore. Updated navigation
// accordingly.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Liron' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Liron', createdAt: 1000 } },
      swimmers: { 1: { id: '1', name: 'Gal', coachUids: ['ownerUid'], birthdate: '01/01/2010', sex: 'male' } },
      teams: {}, config: {},
    };
  });
  const { page, consoleErrors } = app;
  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#topbarAvatarBtn');
    await page.waitForTimeout(150);
    await page.click('#topbarMenuAdmin');
    await page.waitForTimeout(1500);

    const headings = await page.$$eval('div', (els) =>
      els
        .filter((e) => e.children.length === 0 && /^(Invite Codes|Invite a Coach|Performance Split|Least Recently Synced|Stats)$/.test(e.textContent.trim()))
        .map((e) => e.textContent.trim())
    );
    const codesIdx = headings.lastIndexOf('Invite Codes');
    const inviteIdx = headings.indexOf('Invite a Coach');
    assert(codesIdx >= 0 && inviteIdx >= 0, 'both sections should exist in the Admin/Settings area, got: ' + JSON.stringify(headings));
    assert(Math.abs(codesIdx - inviteIdx) === 1, '"Invite Codes" should sit immediately next to "Invite a Coach", got order: ' + JSON.stringify(headings));
    steps.push({ desc: 'Mobile: "Invite Codes" sits immediately next to "Invite a Coach"', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-admin-invite-codes-adjacent', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-admin-invite-codes-adjacent', passed: false, steps, error: e.message };
  }
};
