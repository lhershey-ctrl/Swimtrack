// Regression test for a high-severity bug: mobile's "Remove" button called
// deleteDoc() on the swimmer's Firestore doc directly — for a swimmer
// shared with another coach (e.g. Liron, shared between two family
// accounts), clicking Remove in ONE coach's app permanently wiped the
// swimmer's entire record for EVERYONE, not just stopped showing them in
// that one account. Fixed to unlink only this coach (arrayRemove), never
// delete the doc.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        // Shared with a SECOND coach who never signs in during this test —
        // their continued access is exactly what must survive.
        601: { id: '601', name: 'Shared Swimmer', coachUids: ['coachX', 'coachB'], coachEmails: ['coachx@example.com', 'coachb@example.com'], seasons: { '2024-2025': { bests: [], results: [] } } },
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

    // TopBar's own swimmer-picker button also contains this swimmer's name —
    // the Settings SwimmerEditor row (the one we want) is the LAST match.
    await page.click('button:has-text("Shared Swimmer") >> nth=-1');
    await page.waitForTimeout(300);

    page.once('dialog', (d) => d.accept());
    await page.click('button:has-text("Remove")');
    await page.waitForTimeout(500);

    const doc = await page.evaluate(() => window.__mockStore.swimmers['601']);
    assert(doc, 'REGRESSION: the swimmer\'s Firestore doc was deleted entirely — shared coach lost all their data, not just this account\'s access');
    assert(!doc.coachUids.includes('coachX'), 'this coach should be unlinked, got coachUids: ' + JSON.stringify(doc.coachUids));
    assert(doc.coachUids.includes('coachB'), 'the OTHER coach must keep their access, got coachUids: ' + JSON.stringify(doc.coachUids));
    steps.push({ desc: 'Removing a swimmer unlinks only this coach — the doc and the other coach\'s access survive intact', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-remove-swimmer-does-not-delete-shared', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-remove-swimmer-does-not-delete-shared', passed: false, steps, error: e.message };
  }
};
