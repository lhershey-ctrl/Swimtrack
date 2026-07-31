// Regression test for two real bugs found+fixed 2026-07-24:
//   1. Adding an existing swimmer (shared with another coach) to a brand-new
//      team used to exclusively reassign them, dropping them from their old
//      team. Fixed: swimmers/{id}.teamIds is now an ARRAY (multi-membership)
//      and coachUids sharing is preserved (never exclusively reassigned).
//   2. Saving new swimmers into the current team never refreshed desktop's
//      teamFilterIds snapshot, so switching to another team and back would
//      wipe the just-saved swimmers from the picker (they were still safely
//      in Firestore — a display bug, but looked identical to data loss).
//
// UPDATED 2026-07-31: originally a swimmer that gained an explicit teamId
// ALSO kept showing under its old legacy cluster ("duplicated across them
// on purpose"). That turned out to be a real, live-reported confusion — the
// exact same swimmers/coach-pair listed twice under two different names
// (see clusterMySwimmers/groupCoachesIntoTeams). Now an explicit team is a
// swimmer's one home: 'Existing Swimmer' moving into 'New Team B' means it
// no longer ALSO shows under 'Team Har-Shai'. A second, sibling swimmer
// ('Sibling') that never joins any explicit team is seeded so 'Team
// Har-Shai' still has a reason to exist as a cluster, keeping the
// switch-between-clusters part of this test meaningful. The underlying
// data-level guarantee this test also covers — coachUids preserved, not
// exclusively reassigned, when a swimmer gains a teamId — is UNCHANGED.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: {
        coachA: { email: 'coacha@example.com', name: 'Coach A', teamName: 'Team Har-Shai', createdAt: 1000 },
        coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 3000 },
      },
      // Pre-existing swimmers shared with another coach (like the real Liron/Team Har-Shai case).
      swimmers: {
        111: { name: 'Existing Swimmer', id: '111', coachUids: ['coachA', 'coachX'], coachEmails: [] },
        // Never moves into an explicit team — keeps 'Team Har-Shai' alive as
        // a cluster after 111 graduates into 'New Team B' below.
        222: { name: 'Sibling', id: '222', coachUids: ['coachA', 'coachX'], coachEmails: [] },
      },
      teams: {}, config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(800);

    const initialPicker = await page.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(initialPicker.includes('Existing Swimmer'), 'initial (Team Har-Shai) picker should show Existing Swimmer, got: ' + initialPicker);
    assert(initialPicker.includes('Sibling'), 'initial (Team Har-Shai) picker should show Sibling, got: ' + initialPicker);
    steps.push({ desc: 'Initial load shows both pre-existing swimmers', ok: true });

    // Create a new team.
    await page.click('#t-settings');
    await page.waitForTimeout(300);
    await page.click('text=+ Create a New Team');
    await page.waitForTimeout(150);
    await page.fill('#newTeamNameInput', 'New Team B');
    await page.click('text=Create');
    await page.waitForTimeout(800);

    // Add the SAME existing swimmer (111, multi-membership) + a brand-new swimmer.
    await addSettingsSwimmer(page, 'Existing Swimmer', '111');
    await addSettingsSwimmer(page, 'Brand New Swimmer', '700001');
    await page.click('text=💾 Save All Changes');
    await page.waitForTimeout(900);

    const cloud = await page.evaluate(() => {
      const s = window.__mockStore.swimmers;
      return Object.fromEntries(Object.keys(s).map((id) => [id, { coachUids: s[id].coachUids, teamIds: s[id].teamIds }]));
    });
    assert(Array.isArray(cloud['111'].teamIds) && cloud['111'].teamIds.length === 1, '111 should have exactly one teamId, got: ' + JSON.stringify(cloud['111']));
    assert(cloud['111'].coachUids.includes('coachA') && cloud['111'].coachUids.includes('coachX'), '111 must KEEP its original coachUids (not exclusively reassigned), got: ' + JSON.stringify(cloud['111']));
    steps.push({ desc: 'Saving an existing swimmer into a new team is additive (keeps old coachUids, gains a teamId)', ok: true });

    const pickerOnNewTeam = await page.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(pickerOnNewTeam.includes('Existing Swimmer') && pickerOnNewTeam.includes('Brand New Swimmer'), 'New Team B picker should show both swimmers, got: ' + pickerOnNewTeam);
    steps.push({ desc: 'New Team B picker shows both swimmers right after Save All', ok: true });

    // Switch to Team Har-Shai: Existing Swimmer graduated into an explicit
    // team, so it should NOT also show here anymore (de-duped) — only its
    // sibling, who never joined an explicit team, still belongs here.
    await page.click('text=Switch Account');
    await page.waitForTimeout(300);
    await page.click('#teamGateBody button:has-text("Team Har-Shai")');
    await page.waitForTimeout(900);
    const pickerHarShai = await page.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(pickerHarShai.includes('Sibling'), 'Team Har-Shai must still show Sibling (never joined an explicit team), got: ' + pickerHarShai);
    assert(!pickerHarShai.includes('Existing Swimmer'), 'Team Har-Shai must NOT show Existing Swimmer anymore — it has an explicit team now (de-duped), got: ' + pickerHarShai);
    assert(!pickerHarShai.includes('Brand New Swimmer'), 'Team Har-Shai must NOT show Brand New Swimmer, got: ' + pickerHarShai);
    steps.push({ desc: 'Switching to Team Har-Shai shows only the sibling — the graduated swimmer no longer double-shows there', ok: true });

    // Switch BACK to New Team B: regression check — both swimmers must survive the round trip.
    await page.click('#t-settings');
    await page.waitForTimeout(200);
    await page.click('text=Switch Account');
    await page.waitForTimeout(300);
    await page.click('#teamGateBody button:has-text("New Team B")');
    await page.waitForTimeout(900);
    const pickerBack = await page.$eval('#loadSwimmerPicker', (el) => el.textContent.trim());
    assert(pickerBack.includes('Existing Swimmer') && pickerBack.includes('Brand New Swimmer'), 'REGRESSION: switching back to New Team B lost swimmers, got: ' + pickerBack);
    steps.push({ desc: 'Switching back to New Team B still shows both swimmers (the regression this test guards against)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'multi-team-membership (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'multi-team-membership (desktop)', passed: false, steps, error: e.message };
  }
};

async function addSettingsSwimmer(page, name, id) {
  await page.click('text=+ Add Swimmer');
  await page.waitForTimeout(150);
  const editButtons = await page.$$('button:has-text("✏️ Edit")');
  await editButtons[editButtons.length - 1].click();
  await page.waitForTimeout(120);
  const nameInputs = await page.$$('#settingsSwimmerList input[id^="set-name-"]');
  const idInputs = await page.$$('#settingsSwimmerList input[id^="set-id-"]');
  await nameInputs[nameInputs.length - 1].fill(name);
  await idInputs[idInputs.length - 1].fill(id);
}
