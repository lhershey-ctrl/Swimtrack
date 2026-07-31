// New capability: loading a file for an unrecognized swimmer ID no longer
// silently auto-creates them — it opens a confirm modal, pre-filled from
// whatever the extraction tools found (name from _swimmerName, DOB from
// _birthYear as Jan 1 of that year, sex from _sex — all three scraped off
// the LogLig page's "שנת לידה"/"מגדר" pills). Covers: prefill correctness,
// Cancel doesn't create a swimmer, Add does with the right fields, and the
// manual "+ Add Swimmer" flow in Settings routes through the same
// find-existing-or-open-modal logic (matching by ID OR name) instead of
// blindly creating a duplicate.
const { openDesktopApp, assert } = require('../lib/harness');

const SEASON_JSON = JSON.stringify({
  _swimmerId: '999003',
  _swimmerName: 'New_Kid',
  _birthYear: '1980',
  _sex: 'male',
  '2024-2025': { bests: [], results: [{ event: '50 Free', pool: '25', time: '30.00', seconds: 30, points: 500, date: '01/01/2025' }] },
});

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {});

  try {
    await page.click('.paste-toggle:has-text("Paste JSON")');
    await page.waitForTimeout(150);
    await page.fill('#jsonPaste', SEASON_JSON);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);

    const modalOpen = await page.$eval('#newSwimmerModal', (el) => getComputedStyle(el).display !== 'none');
    assert(modalOpen, 'expected the new-swimmer confirm modal to open for an unrecognized ID');
    const prefill = {
      id: await page.$eval('#nsmId', (el) => el.value),
      name: await page.$eval('#nsmName', (el) => el.value),
      birthdate: await page.$eval('#nsmBirthdate', (el) => el.value),
      sex: await page.$eval('#nsmSex', (el) => el.value),
    };
    assert(prefill.id === '999003', 'expected ID pre-filled from the loaded data, got: ' + JSON.stringify(prefill));
    assert(prefill.name === 'New Kid', 'expected name pre-filled from _swimmerName with underscores converted to spaces, got: ' + JSON.stringify(prefill));
    assert(prefill.birthdate === '1980-01-01', 'expected DOB pre-filled as Jan 1 of the extracted birth year, got: ' + JSON.stringify(prefill));
    assert(prefill.sex === 'male', 'expected sex pre-filled from _sex, got: ' + JSON.stringify(prefill));
    steps.push({ desc: 'Modal pre-fills ID, name, DOB (Jan 1 of birth year), and sex from extraction', ok: true });

    // Cancel — no swimmer should be created.
    await page.click('#newSwimmerModal button:has-text("✕")');
    await page.waitForTimeout(200);
    const afterCancel = await page.evaluate(() => (window.getAllSwimmers ? window.getAllSwimmers() : []).some((s) => s.id === '999003'));
    assert(!afterCancel, 'REGRESSION: swimmer should NOT be created after Cancel, got a matching swimmer anyway');
    steps.push({ desc: 'Cancel closes the modal without creating a swimmer', ok: true });

    // Re-load the same file — still unrecognized (cancel didn't create it) — this time Add.
    await page.fill('#jsonPaste', SEASON_JSON);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);

    const created = await page.evaluate(() => (window.getAllSwimmers ? window.getAllSwimmers() : []).find((s) => s.id === '999003'));
    assert(created, 'expected the swimmer to be created after clicking Add Swimmer');
    assert(created.name === 'New Kid', 'expected the created swimmer\'s name to be "New Kid", got: ' + JSON.stringify(created));
    assert(created.birthdate === '01/01/1980', 'expected the created swimmer\'s DOB to be 01/01/1980, got: ' + JSON.stringify(created));
    assert(created.sex === 'male', 'expected the created swimmer\'s sex to be "male", got: ' + JSON.stringify(created));
    steps.push({ desc: 'Add Swimmer creates the swimmer with the (possibly edited) modal fields', ok: true });

    const bannerVisible = await page.$eval('#swimmerBanner', (el) => getComputedStyle(el).display !== 'none');
    assert(bannerVisible, 'expected the swimmer banner to render immediately after confirming (not stuck hidden)');
    steps.push({ desc: 'Banner renders immediately after confirming a brand-new swimmer', ok: true });

    // Manual "+ Add Swimmer" (on the Extract tab's "Swimmer Management"
    // card), same ID again — must select the existing swimmer instead of
    // creating a duplicate (no modal at all).
    await page.click('#t-extract');
    await page.waitForTimeout(300);
    await page.fill('#newSwimmerName', 'Someone Else');
    await page.fill('#newSwimmerId', '999003');
    await page.click('button:has-text("+ Add")');
    await page.waitForTimeout(300);
    const countAfterDupId = await page.evaluate(() => (window.getAllSwimmers ? window.getAllSwimmers() : []).filter((s) => s.id === '999003').length);
    assert(countAfterDupId === 1, 'REGRESSION: adding an existing ID should select it, not create a duplicate, got ' + countAfterDupId + ' swimmers with that ID');
    const modalOpenAfterDupId = await page.$eval('#newSwimmerModal', (el) => getComputedStyle(el).display !== 'none');
    assert(!modalOpenAfterDupId, 'a matched-by-ID add should select directly, not open the modal');
    steps.push({ desc: 'Manual "+ Add Swimmer" with an already-known ID selects the existing swimmer instead of duplicating', ok: true });

    // Same NAME, different ID — should also match (by name) and select, per
    // explicit requirement: matching is by ID OR name, not ID alone.
    await page.fill('#newSwimmerName', 'New Kid');
    await page.fill('#newSwimmerId', '999004');
    await page.click('button:has-text("+ Add")');
    await page.waitForTimeout(300);
    const countAfterDupName = await page.evaluate(() => (window.getAllSwimmers ? window.getAllSwimmers() : []).filter((s) => s.name === 'New Kid').length);
    assert(countAfterDupName === 1, 'REGRESSION: adding an existing NAME (different ID) should select it, not create a duplicate, got ' + countAfterDupName + ' swimmers named "New Kid"');
    steps.push({ desc: 'Manual "+ Add Swimmer" with an already-known NAME (different ID) also selects the existing swimmer, not just ID matches', ok: true });

    // A genuinely new ID+name opens the modal (manual mode), and Add creates it.
    await page.fill('#newSwimmerName', 'Totally New Person');
    await page.fill('#newSwimmerId', '999005');
    await page.click('button:has-text("+ Add")');
    await page.waitForTimeout(300);
    const manualModalOpen = await page.$eval('#newSwimmerModal', (el) => getComputedStyle(el).display !== 'none');
    assert(manualModalOpen, 'expected the modal to open for a genuinely new ID+name from manual add');
    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(300);
    const manuallyCreated = await page.evaluate(() => (window.getAllSwimmers ? window.getAllSwimmers() : []).some((s) => s.id === '999005' && s.name === 'Totally New Person'));
    assert(manuallyCreated, 'expected a genuinely new swimmer to be created via the manual-add modal flow');
    steps.push({ desc: 'Manual "+ Add Swimmer" with a genuinely new ID+name opens the same modal and creates the swimmer', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'new-swimmer-approval-modal (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'new-swimmer-approval-modal (desktop)', passed: false, steps, error: e.message };
  }
};
