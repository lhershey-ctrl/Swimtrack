// New capability, directly requested: a hidden "🔑 Admin" item in the
// TopBar avatar menu (below "Switch account"), owner-only, opening a
// full-screen Admin page with a back button — instead of Admin content
// being inline in the Settings tab. Covers: the menu item only exists for
// the owner, opening it replaces the whole screen (no bottom nav), and the
// back button returns cleanly to the normal app (tabs/bottom nav intact).
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];

  // ── Owner: sees the menu item, can open + leave the Admin screen ──
  {
    const app = await openMobileApp(function seed() {
      window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
      window.__mockStore = {
        coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
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
      const adminItem = page.locator('#topbarMenuAdmin');
      assert(await adminItem.count(), 'expected the owner to see the "🔑 Admin" menu item');
      steps.push({ desc: 'Owner sees the hidden "🔑 Admin" item in the avatar menu', ok: true });

      await adminItem.click();
      await page.waitForTimeout(500);
      const onAdmin = await page.evaluate(() => document.body.innerText.includes('Admin'));
      assert(onAdmin, 'expected to land on the Admin screen after clicking the menu item');
      // Bottom nav's tab labels shouldn't be clickable/present as nav buttons
      // while on the full-screen Admin page.
      const homeTabButtons = await page.$$('button:has-text("Home")');
      assert(homeTabButtons.length === 0, 'expected the bottom nav (with a "Home" tab button) to be replaced entirely by the full-screen Admin page, got ' + homeTabButtons.length + ' Home buttons');
      steps.push({ desc: 'Opening Admin replaces the whole screen — no bottom nav underneath it', ok: true });

      const backBtn = page.locator('button[title="Back"]');
      assert(await backBtn.count(), 'expected a back button on the Admin screen');
      await backBtn.click();
      await page.waitForTimeout(400);
      const backOnMain = await page.$$('button:has-text("Home")');
      assert(backOnMain.length > 0, 'expected the back button to return to the normal app with bottom nav intact, got 0 Home buttons');
      steps.push({ desc: 'Back button returns cleanly to the normal app (bottom nav restored)', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (owner): ' + consoleErrors.join(' | '));
      await app.close();
    } catch (e) {
      await app.close();
      steps.push({ desc: e.message, ok: false });
      return { name: 'mobile-admin-screen-navigation', passed: false, steps, error: e.message };
    }
  }

  // ── Non-owner: never sees the menu item at all ──
  {
    const app = await openMobileApp(function seed() {
      window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
      window.__mockStore = {
        coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
        swimmers: { 1: { id: '1', name: 'Gal', coachUids: ['coachX'], birthdate: '01/01/2010', sex: 'male' } },
        teams: {}, config: {},
      };
    });
    const { page, consoleErrors } = app;
    try {
      await page.click('text=Sign in with Google');
      await page.waitForTimeout(900);
      await page.click('#topbarAvatarBtn');
      await page.waitForTimeout(150);
      const adminItem = page.locator('#topbarMenuAdmin');
      assert((await adminItem.count()) === 0, 'a non-owner coach should never see the "🔑 Admin" menu item');
      steps.push({ desc: 'A non-owner coach never sees the "🔑 Admin" menu item', ok: true });

      assert(consoleErrors.length === 0, 'unexpected page errors (non-owner): ' + consoleErrors.join(' | '));
      steps.push({ desc: 'No uncaught page errors during either flow', ok: true });
      await app.close();
    } catch (e) {
      await app.close();
      steps.push({ desc: e.message, ok: false });
      return { name: 'mobile-admin-screen-navigation', passed: false, steps, error: e.message };
    }
  }

  return { name: 'mobile-admin-screen-navigation', passed: true, steps };
};
