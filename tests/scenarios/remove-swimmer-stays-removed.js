// Regression test for: clicking "✕ Remove" on a swimmer in Settings only
// ever spliced them out of local state — their Firestore doc still had this
// coach in coachUids, so the next cloud refresh (e.g. right after "Save All
// Changes") silently re-imported them, making Remove look broken ("it
// returns afterwards" — real user report). Fixed: Remove now also unlinks
// this coach from the swimmer's Firestore doc (arrayRemove), so they don't
// come back.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        501: { id: '501', name: 'Keeper', coachUids: ['coachX'], coachEmails: ['coachx@example.com'] },
        502: { id: '502', name: 'Removable', coachUids: ['coachX'], coachEmails: ['coachx@example.com'] },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(400);

    const pickerBefore = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(pickerBefore.includes('Removable'), 'both swimmers should auto-import before removal, got: ' + pickerBefore);

    // Find the "Removable" swimmer's card and click its "✕ Remove" button.
    const cards = await page.$$('#settingsSwimmerList > div');
    let removed = false;
    for (const card of cards) {
      const text = await card.textContent();
      if (text.includes('Removable')) {
        await card.$eval('button:has-text("✕ Remove")', (btn) => btn.click());
        removed = true;
        break;
      }
    }
    assert(removed, 'could not find the "Removable" swimmer\'s card to click Remove on');
    await page.waitForTimeout(500);

    const cloudAfterRemove = await page.evaluate(() => window.__mockStore.swimmers['502'].coachUids);
    assert(!cloudAfterRemove.includes('coachX'), 'REGRESSION: removed swimmer\'s Firestore doc still lists this coach in coachUids, got: ' + JSON.stringify(cloudAfterRemove));
    steps.push({ desc: 'Removing a swimmer unlinks this coach from their Firestore doc, not just local state', ok: true });

    // The exact repro: Save All Changes triggers a cloud refresh afterward —
    // confirm the removed swimmer does NOT come back.
    await page.click('text=💾 Save All Changes');
    await page.waitForTimeout(900);
    const pickerAfterSave = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(!pickerAfterSave.includes('Removable'), 'REGRESSION: removed swimmer reappeared in the picker after Save All Changes, got: ' + pickerAfterSave);
    assert(pickerAfterSave.includes('Keeper'), 'the OTHER swimmer should still be there, got: ' + pickerAfterSave);
    steps.push({ desc: 'Removed swimmer does not reappear after Save All Changes (the regression this test guards against)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'remove-swimmer-stays-removed (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'remove-swimmer-stays-removed (desktop)', passed: false, steps, error: e.message };
  }
};
