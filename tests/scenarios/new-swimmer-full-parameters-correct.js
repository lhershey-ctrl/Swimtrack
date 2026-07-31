// Regression test for a real, live-reported bug: after viewing a FEMALE
// swimmer's Records tab, then loading a brand-new MALE swimmer via the
// new-swimmer approval modal, the Records tab kept comparing the new
// swimmer against WOMEN's age-group records — even though his own `sex`
// field was correctly saved as "male". Root cause: window.__recProfile
// (what buildRecords actually reads for sex/birthdate/recordName) is
// normally refreshed by doLoadFromCloud on every swimmer switch — the new
// modal deliberately skips that cloud fetch (to avoid an unwanted network
// call for a swimmer whose data is already sitting in memory), so it was
// left holding the PREVIOUSLY viewed swimmer's sex. Same bug class as the
// desktop PDF-report "wrong swimmer" race documented in
// swimtrack-cloud-architecture memory, different stale global.
//
// This test drives the exact repro end to end and also checks every other
// field a newly-added swimmer should have right: name, player ID,
// birthdate (Jan 1 of the extracted birth year), and team assignment.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        // Viewed FIRST — establishes the stale-state precondition the real
        // bug depended on.
        501: {
          id: '501', name: 'Existing Female', coachUids: ['coachX'], birthdate: '01/06/2010', sex: 'female', teamIds: ['teamAlpha'],
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '25', seconds: 32.0, time: '32.00', date: '01/06/2024', points: 400 }],
            results: [{ event: '50 Free', pool: '25', seconds: 32.0, time: '32.00', date: '01/06/2024', points: 400 }] } },
        },
      },
      teams: { teamAlpha: { id: 'teamAlpha', name: 'Junior Squad', createdBy: 'coachX', createdAt: 1000 } },
      // Age-16 records for BOTH sexes so the "(women)"/"(men)" hint text
      // actually differs and is meaningful to assert on.
      config: {
        records: {
          records: {
            25: {
              F: { 16: { '50|Free': { sec: 30.0, time: '30.00', name: 'Women\'s Record Holder' } } },
              M: { 16: { '50|Free': { sec: 27.0, time: '27.00', name: 'Men\'s Record Holder' } } },
            },
          },
          segments: {}, count: 2, loadedAt: Date.now(), by: 'test',
        },
      },
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);

    // View the existing female swimmer's Records tab first.
    const pickerText = await page.$eval('#loadSwimmerPicker', (el) => el.textContent);
    assert(pickerText.includes('Existing Female'), 'expected the existing swimmer to auto-import into the picker, got: ' + pickerText);
    await page.click('#loadSwimmerPicker button');
    await page.waitForTimeout(700);
    await page.click('#t-analyze');
    await page.waitForTimeout(200);
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);
    const hintBefore = await page.$eval('#recGapHint', (el) => el.textContent);
    assert(/women/.test(hintBefore), 'expected the existing female swimmer\'s Records tab to reference women\'s records, got: ' + hintBefore);
    steps.push({ desc: 'Existing female swimmer\'s Records tab correctly references women\'s records (establishes the stale-state precondition)', ok: true });

    // Load a brand-new, unrecognized MALE swimmer — same birth-year age
    // bracket (16) so the two records are directly comparable.
    const seasonJson = JSON.stringify({
      _swimmerId: '502', _swimmerName: 'New_Male_Swimmer', _birthYear: '2010', _sex: 'male',
      '2024-2025': { bests: [], results: [{ event: '50 Free', pool: '25', time: '28.00', seconds: 28, points: 420, date: '01/06/2024' }] },
    });
    // "Paste JSON" lives on the Analyze tab (the default tab), not Extract.
    await page.click('#t-analyze');
    await page.waitForTimeout(200);
    const pasteAreaOpen = await page.$eval('#pasteArea', (el) => getComputedStyle(el).display !== 'none').catch(() => false);
    if (!pasteAreaOpen) await page.click('.paste-toggle:has-text("Paste JSON")');
    await page.waitForTimeout(150);
    await page.fill('#jsonPaste', seasonJson);
    await page.click('button.load-btn:has-text("Load")');
    await page.waitForTimeout(400);

    const prefill = {
      id: await page.$eval('#nsmId', (el) => el.value),
      name: await page.$eval('#nsmName', (el) => el.value),
      birthdate: await page.$eval('#nsmBirthdate', (el) => el.value),
      sex: await page.$eval('#nsmSex', (el) => el.value),
    };
    assert(prefill.id === '502' && prefill.name === 'New Male Swimmer' && prefill.birthdate === '2010-01-01' && prefill.sex === 'male',
      'expected all 4 fields correctly pre-filled, got: ' + JSON.stringify(prefill));
    steps.push({ desc: 'New swimmer\'s ID, name, DOB, and sex are all correctly pre-filled from extraction', ok: true });

    await page.click('#newSwimmerModal button:has-text("Add Swimmer")');
    await page.waitForTimeout(400);

    const created = await page.evaluate(() => (window.getAllSwimmers ? window.getAllSwimmers() : []).find((s) => s.id === '502'));
    assert(created, 'expected the new swimmer to be created');
    assert(created.name === 'New Male Swimmer', 'wrong name: ' + JSON.stringify(created));
    assert(created.birthdate === '01/01/2010', 'wrong birthdate: ' + JSON.stringify(created));
    assert(created.sex === 'male', 'wrong sex: ' + JSON.stringify(created));
    assert(Array.isArray(created.teamIds) && created.teamIds.includes('teamAlpha'), 'wrong team assignment: ' + JSON.stringify(created));
    steps.push({ desc: 'New swimmer\'s saved record has the correct name, birthdate, sex, and active-team assignment', ok: true });

    // The actual regression: Records tab must now reference MEN's records,
    // not still show the previous (female) swimmer's stale comparison.
    await page.click('button[data-grp="records"]');
    await page.waitForTimeout(400);
    const hintAfter = await page.$eval('#recGapHint', (el) => el.textContent);
    assert(/\bmen\b/.test(hintAfter) && !/women/.test(hintAfter), 'REGRESSION: Records tab still compares the new MALE swimmer against women\'s records (stale __recProfile), got: ' + hintAfter);
    steps.push({ desc: 'Records tab correctly compares the new male swimmer against MEN\'s records, not stale women\'s data from the previously viewed swimmer', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'new-swimmer-full-parameters-correct (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'new-swimmer-full-parameters-correct (desktop)', passed: false, steps, error: e.message };
  }
};
