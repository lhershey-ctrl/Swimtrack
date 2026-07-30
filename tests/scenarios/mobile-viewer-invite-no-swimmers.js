// Regression test for two real bugs reported live: (1) "Add a Viewer" was
// hard-blocked ("Add a swimmer first") for a brand-new coach with zero
// swimmers, so two coaches starting a team together couldn't invite each
// other before either had added anyone; (2) even once a viewer WAS invited,
// swimmers the inviter added AFTER that point never became visible to them
// (the old design only ever shared a one-time snapshot of the roster taken
// at "Generate code" time). Fixed via coaches/{uid}.viewerUids/viewerEmails
// — a standing "who I've granted access to" list, consulted by
// createSwimmer() every time a NEW swimmer is added, not just baked into
// the invite code once. This test seeds a coach who already has a
// registered viewer (simulating a past redemption from before this coach
// had any swimmers) and checks: (a) "Generate code" no longer requires an
// existing roster, and (b) a brand-new swimmer automatically shares with
// that already-registered viewer.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: {
        coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000, viewerUids: ['coachV'], viewerEmails: ['coachv@example.com'] },
      },
      swimmers: {}, teams: {}, config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(400);

    const beforeText = await page.evaluate(() => document.body.innerText);
    assert(!beforeText.includes('Add a swimmer first'), 'REGRESSION: "Add a Viewer" should not require an existing swimmer, page said: ' + beforeText.slice(0, 400));
    steps.push({ desc: 'Add a Viewer is not blocked for a coach with zero swimmers', ok: true });

    await page.click('button:has-text("Generate")');
    await page.waitForTimeout(500);

    const codes = await page.evaluate(() => Object.entries(window.__mockStore.inviteCodes || {}));
    assert(codes.length === 1, 'expected exactly one invite code to be generated, got: ' + JSON.stringify(codes));
    const [, codeDoc] = codes[0];
    assert(codeDoc.targetCoachUid === 'coachX', 'invite code should target this coach, got: ' + JSON.stringify(codeDoc));
    assert(Array.isArray(codeDoc.swimmerIds) && codeDoc.swimmerIds.length === 0, 'invite code should carry an empty (not missing) swimmerIds snapshot, got: ' + JSON.stringify(codeDoc));
    steps.push({ desc: 'Generating a code with zero swimmers succeeds and writes a valid inviteCodes doc', ok: true });

    await page.fill('input[placeholder="Name"]', 'Brand New Swimmer');
    await page.fill('input[placeholder="Player ID"]', '555002');
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(700);

    const sw = await page.evaluate(() => window.__mockStore.swimmers['555002']);
    assert(sw && sw.name === 'Brand New Swimmer', 'new swimmer should be written to Firestore, got: ' + JSON.stringify(sw));
    assert(Array.isArray(sw.coachUids) && sw.coachUids.includes('coachX'), 'new swimmer should include the adding coach, got: ' + JSON.stringify(sw));
    assert(Array.isArray(sw.coachUids) && sw.coachUids.includes('coachV'), 'REGRESSION: new swimmer should auto-share with the already-registered viewer (coachV), got: ' + JSON.stringify(sw));
    assert(Array.isArray(sw.coachEmails) && sw.coachEmails.includes('coachv@example.com'), 'new swimmer coachEmails should include the viewer\'s email, got: ' + JSON.stringify(sw));
    steps.push({ desc: 'A brand-new swimmer automatically shares with a viewer registered before the swimmer existed', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-viewer-invite-no-swimmers', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-viewer-invite-no-swimmers', passed: false, steps, error: e.message };
  }
};
