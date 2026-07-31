// New capability, directly requested: a collapsed "Data Statistics" panel
// in the Admin tab — swimmers added per week, male/female split, age
// distribution, plus 2 recommended additions (swimmers per team, best
// FINA points distribution). See renderAdminDataStats in swim_tracker.html.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];
  const { browser, page, consoleErrors } = await openDesktopApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
      teams: { teamAlpha: { id: 'teamAlpha', name: 'Junior Squad', createdBy: 'ownerUid', createdAt: 1000 } },
      swimmers: {
        // 2 male, 1 female, 1 unknown-sex. Ages ~13 (born 2012ish) and one
        // masters (born 1980). createdAt set on 3 of the 4 (one predates
        // the field, matching real production data) so the "N of M have a
        // recorded creation date" note is exercised too.
        601: { id: '601', name: 'Male Junior A', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/2012', sex: 'male', createdAt: Date.now(),
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2024', points: 410 }],
            results: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2024', points: 410 }] } } },
        602: { id: '602', name: 'Male Junior B', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/2012', sex: 'male', createdAt: Date.now(),
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2024', points: 320 }],
            results: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2024', points: 320 }] } } },
        603: { id: '603', name: 'Female Junior', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/2012', sex: 'female', createdAt: Date.now(),
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2024', points: 460 }],
            results: [{ event: '50 Free', pool: '25', seconds: 30.0, time: '30.00', date: '01/01/2024', points: 460 }] } } },
        // No sex, no createdAt (predates the field) — must still count
        // toward totals and Age Distribution without breaking anything.
        604: { id: '604', name: 'Unknown Sex Masters', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/1980',
          seasons: { '2024-2025': { bests: [{ event: '50 Free', pool: '50', seconds: 32.0, time: '32.00', date: '01/01/2024', points: 250 }],
            results: [{ event: '50 Free', pool: '50', seconds: 32.0, time: '32.00', date: '01/01/2024', points: 250 }] } } },
      },
      config: {},
    };
  });

  try {
    await page.click('text=☁ Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#t-admin');
    await page.waitForTimeout(1200);

    // The panel is collapsed by default (native <details>) — expand it.
    const summary = page.locator('summary:has-text("Data Statistics")');
    assert(await summary.count(), 'expected the "Data Statistics" collapsible section to exist');
    await summary.click();
    await page.waitForTimeout(600);

    const note = await page.$eval('#adminDataStatsNote', (el) => el.textContent);
    assert(/3 of 4/.test(note), 'expected the note to say 3 of 4 swimmers have a recorded creation date, got: ' + note);
    steps.push({ desc: 'Panel notes how many swimmers have a recorded creation date (3 of 4 in this seed)', ok: true });

    const sexData = await page.evaluate(() => window.adminSexChartInst && window.adminSexChartInst.data);
    assert(sexData, 'expected the sex-split chart to render');
    const maleIdx = sexData.labels.indexOf('Male'), femaleIdx = sexData.labels.indexOf('Female'), unknownIdx = sexData.labels.indexOf('Unknown');
    assert(sexData.datasets[0].data[maleIdx] === 2, 'expected 2 male swimmers, got: ' + JSON.stringify(sexData));
    assert(sexData.datasets[0].data[femaleIdx] === 1, 'expected 1 female swimmer, got: ' + JSON.stringify(sexData));
    assert(unknownIdx >= 0 && sexData.datasets[0].data[unknownIdx] === 1, 'expected 1 unknown-sex swimmer, got: ' + JSON.stringify(sexData));
    steps.push({ desc: 'Male/Female split chart correctly counts 2 male / 1 female / 1 unknown', ok: true });

    const teamSizeData = await page.evaluate(() => window.adminTeamSizeChartInst && window.adminTeamSizeChartInst.data);
    assert(teamSizeData, 'expected the swimmers-per-team chart to render');
    const jsIdx = teamSizeData.labels.indexOf('Junior Squad');
    assert(jsIdx >= 0 && teamSizeData.datasets[0].data[jsIdx] === 4, 'expected Junior Squad to show 4 swimmers, got: ' + JSON.stringify(teamSizeData));
    steps.push({ desc: 'Swimmers-per-team chart correctly shows 4 swimmers in Junior Squad', ok: true });

    const ageData = await page.evaluate(() => window.adminAgeChartInst && window.adminAgeChartInst.data);
    assert(ageData, 'expected the age-distribution chart to render');
    const totalAgeCounted = ageData.datasets[0].data.reduce((a, b) => a + b, 0);
    assert(totalAgeCounted === 4, 'expected all 4 swimmers (3 age ~13, 1 masters ~45+) to be counted across age bands, got: ' + JSON.stringify(ageData));
    steps.push({ desc: 'Age distribution chart accounts for all swimmers with a birthdate, including the masters one', ok: true });

    const pointsData = await page.evaluate(() => window.adminPointsChartInst && window.adminPointsChartInst.data);
    assert(pointsData, 'expected the FINA points distribution chart to render');
    const totalPointsCounted = pointsData.datasets[0].data.reduce((a, b) => a + b, 0);
    assert(totalPointsCounted === 4, 'expected all 4 swimmers to have a best-points bucket, got: ' + JSON.stringify(pointsData));
    steps.push({ desc: 'Best FINA points distribution chart accounts for all 4 swimmers', ok: true });

    const addedData = await page.evaluate(() => window.adminAddedChartInst && window.adminAddedChartInst.data);
    assert(addedData, 'expected the swimmers-added-per-week chart to render');
    const totalAdded = addedData.datasets[0].data.reduce((a, b) => a + b, 0);
    assert(totalAdded === 3, 'expected exactly the 3 swimmers WITH a createdAt to be counted (not the 4th, which predates the field), got: ' + JSON.stringify(addedData));
    steps.push({ desc: 'Swimmers-added-per-week chart only counts swimmers with a recorded creation date (3, not 4)', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await browser.close();
    return { name: 'admin-data-statistics (desktop)', passed: true, steps };
  } catch (e) {
    await browser.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'admin-data-statistics (desktop)', passed: false, steps, error: e.message };
  }
};
