// Mobile equivalent of owner-bypass-rename-delete.js (desktop) — see that
// file for the full narrative. firestore.rules already let the app OWNER
// rename/delete ANY team; the Settings UI only checked `createdBy ===
// user.uid`, so the owner couldn't manage a teammate-created team even
// though the backend allowed it.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: {
        ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 500 },
        coachB: { email: 'b@example.com', name: 'Coach B', createdAt: 1000 },
      },
      // Created by coachB, NOT the owner.
      teams: { teamY: { id: 'teamY', name: 'Some Team', createdBy: 'coachB', createdAt: 1000 } },
      swimmers: { 501: { id: '501', name: 'Kid', coachUids: ['coachB', 'ownerUid'], coachEmails: [], teamIds: ['teamY'] } },
      config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    const gateOpen = await page.evaluate(() => document.body.innerText.includes('Which account?'));
    assert(!gateOpen, 'owner has only one real cluster here — no "Which account?" gate should appear');
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => document.body.innerText);
    assert(/this team's name/i.test(before), 'owner should see the rename field even though they didn\'t create this team, got: ' + before.slice(0, 800));
    assert(/delete this team/i.test(before), 'owner should see the delete button even though they didn\'t create this team, got: ' + before.slice(0, 800));
    assert(/as the app owner/i.test(before), 'expected copy explaining the owner override, got: ' + before.slice(0, 800));
    steps.push({ desc: 'Owner sees rename + delete for a team a teammate created, with owner-specific copy', ok: true });

    const inputs = await page.$$('input');
    let targetInput = null;
    for (const inp of inputs) {
      const val = await inp.inputValue();
      if (val === 'Some Team') { targetInput = inp; break; }
    }
    assert(targetInput, 'could not find the team-name input pre-filled with the current value');
    await targetInput.fill('Some Team - Renamed by Owner');
    // NOT page-wide "last Save button" — the owner also sees AccessManager's
    // unrelated "Save access list" button elsewhere on the page, which also
    // matches :has-text("Save"). The real Save is this input's own sibling.
    const saveBtn = await targetInput.$('xpath=following-sibling::button[1]');
    assert(saveBtn, 'could not find the Save button next to the team-name input');
    await saveBtn.click();
    await page.waitForTimeout(400);
    const savedName = await page.evaluate(() => window.__mockStore.teams.teamY.name);
    assert(savedName === 'Some Team - Renamed by Owner', 'expected the owner\'s rename to persist, got: ' + savedName);
    steps.push({ desc: 'Owner can actually rename a team they did not create', ok: true });

    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("Delete this team")');
    await page.waitForTimeout(900);
    const teamAfter = await page.evaluate(() => window.__mockStore.teams.teamY);
    assert(!teamAfter, 'expected the owner\'s delete to actually remove the teams/{id} doc, got: ' + JSON.stringify(teamAfter));
    steps.push({ desc: 'Owner can actually delete a team they did not create', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-owner-bypass-rename-delete', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-owner-bypass-rename-delete', passed: false, steps, error: e.message };
  }
};
