// Confirms redeemInviteCode's other half of the viewer-inheritance fix (see
// viewer-invite-no-swimmers.js): redeeming a "join my team" invite code —
// even one generated when the inviter had zero swimmers, swimmerIds: [] —
// registers the redeemer as a standing viewer on the INVITER's own coach
// doc (coaches/{targetCoachUid}.viewerUids/viewerEmails), not just a
// one-time swimmer-list snapshot. Drives the real "not activated yet" →
// enter invite code → Activate flow in the desktop cloud bar.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'newCoach', email: 'newcoach@example.com', displayName: 'New Coach' };
    window.__mockStore = {
      coaches: {
        coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 },
      },
      inviteCodes: {
        ABC123: { createdAt: 1000, createdBy: 'coachx@example.com', usedBy: null, usedAt: null, note: '', targetCoachUid: 'coachX', swimmerIds: [] },
      },
      swimmers: {}, teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);

    const statusBefore = await page.evaluate(() => document.body.innerText);
    assert(statusBefore.includes('not activated yet'), 'a coach with no coaches/{uid} doc should be prompted to activate, got: ' + statusBefore.slice(0, 300));
    steps.push({ desc: 'A brand-new signed-in coach sees "not activated yet"', ok: true });

    await page.fill('input[placeholder="INVITE CODE"]', 'ABC123');
    await page.click('button:has-text("Activate")');
    await page.waitForTimeout(700);

    const newCoachDoc = await page.evaluate(() => window.__mockStore.coaches.newCoach);
    assert(newCoachDoc && newCoachDoc.email === 'newcoach@example.com', 'redeeming should create the redeemer\'s own coach doc, got: ' + JSON.stringify(newCoachDoc));
    steps.push({ desc: 'Redeeming the code creates the redeemer\'s coaches/{uid} doc', ok: true });

    const inviterDoc = await page.evaluate(() => window.__mockStore.coaches.coachX);
    assert(Array.isArray(inviterDoc.viewerUids) && inviterDoc.viewerUids.includes('newCoach'),
      'REGRESSION: redeeming a code should register the redeemer as a standing viewer on the INVITER\'s coach doc, got: ' + JSON.stringify(inviterDoc));
    assert(Array.isArray(inviterDoc.viewerEmails) && inviterDoc.viewerEmails.includes('newcoach@example.com'),
      'inviter\'s viewerEmails should include the redeemer\'s email, got: ' + JSON.stringify(inviterDoc));
    steps.push({ desc: 'Redeeming a zero-swimmer invite still registers the redeemer as the inviter\'s standing viewer', ok: true });

    const pending = await page.evaluate(() => window.__mockStore.pendingShares && window.__mockStore.pendingShares.newCoach);
    assert(pending && pending.targetCoachUid === 'coachX', 'pendingShares doc should record which coach this was redeemed for, got: ' + JSON.stringify(pending));
    steps.push({ desc: 'pendingShares records targetCoachUid alongside the (empty) swimmerIds snapshot', ok: true });

    const statusAfter = await page.evaluate(() => document.body.innerText);
    assert(!statusAfter.includes('not activated yet'), 'account should no longer show "not activated yet" after a successful Activate, got: ' + statusAfter.slice(0, 300));
    steps.push({ desc: 'Cloud bar no longer shows "not activated yet" after Activate succeeds', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'redeem-invite-registers-viewer (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'redeem-invite-registers-viewer (desktop)', passed: false, steps, error: e.message };
  }
};
