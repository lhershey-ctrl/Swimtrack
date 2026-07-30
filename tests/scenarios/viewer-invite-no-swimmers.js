// Desktop equivalent of mobile-viewer-invite-no-swimmers.js — see that file
// for the full bug narrative. Two real bugs: (1) "Add a Viewer" was
// hard-blocked for a coach with zero synced swimmers; (2) even after a
// viewer was invited, swimmers added later never became visible to them
// (the old design only shared a one-time roster snapshot). Fixed via
// coaches/{uid}.viewerUids/viewerEmails, consulted by swimSaveProfile/doSync
// every time a swimmer is saved — not just baked into the invite code once.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: {
        coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000, viewerUids: ['coachV'], viewerEmails: ['coachv@example.com'] },
      },
      swimmers: {}, teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-settings');
    await page.waitForTimeout(400);

    const beforeGenerate = await page.evaluate(() => Object.keys(window.__mockStore.inviteCodes || {}).length);
    await page.click('#viewerActions button:has-text("Generate code")');
    await page.waitForTimeout(500);

    const codes = await page.evaluate(() => Object.entries(window.__mockStore.inviteCodes || {}));
    assert(codes.length === beforeGenerate + 1, 'REGRESSION: generating a viewer code with zero swimmers should not be blocked, got codes: ' + JSON.stringify(codes));
    const [, codeDoc] = codes[codes.length - 1];
    assert(codeDoc.targetCoachUid === 'coachX', 'invite code should target this coach, got: ' + JSON.stringify(codeDoc));
    assert(Array.isArray(codeDoc.swimmerIds) && codeDoc.swimmerIds.length === 0, 'invite code should carry an empty (not missing) swimmerIds snapshot, got: ' + JSON.stringify(codeDoc));
    steps.push({ desc: 'Generating a viewer code with zero swimmers succeeds and writes a valid inviteCodes doc', ok: true });

    await page.click('text=+ Add Swimmer');
    await page.waitForTimeout(150);
    const editButtons = await page.$$('button:has-text("✏️ Edit")');
    await editButtons[editButtons.length - 1].click();
    await page.waitForTimeout(150);
    const nameInputs = await page.$$('#settingsSwimmerList input[id^="set-name-"]');
    const idInputs = await page.$$('#settingsSwimmerList input[id^="set-id-"]');
    await nameInputs[nameInputs.length - 1].fill('Brand New Swimmer');
    await idInputs[idInputs.length - 1].fill('555003');

    await page.click('#saveAllBtn');
    await page.waitForTimeout(600);

    const sw = await page.evaluate(() => window.__mockStore.swimmers['555003']);
    assert(sw && sw.name === 'Brand New Swimmer', 'new swimmer should be written to Firestore, got: ' + JSON.stringify(sw));
    assert(Array.isArray(sw.coachUids) && sw.coachUids.includes('coachX'), 'new swimmer should include the adding coach, got: ' + JSON.stringify(sw));
    assert(Array.isArray(sw.coachUids) && sw.coachUids.includes('coachV'), 'REGRESSION: new swimmer should auto-share with the already-registered viewer (coachV), got: ' + JSON.stringify(sw));
    assert(Array.isArray(sw.coachEmails) && sw.coachEmails.includes('coachv@example.com'), 'new swimmer coachEmails should include the viewer\'s email, got: ' + JSON.stringify(sw));
    steps.push({ desc: 'A brand-new swimmer automatically shares with a viewer registered before the swimmer existed', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'viewer-invite-no-swimmers (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'viewer-invite-no-swimmers (desktop)', passed: false, steps, error: e.message };
  }
};
