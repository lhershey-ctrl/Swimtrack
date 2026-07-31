// Mobile equivalent of admin-data-statistics.js (desktop) — same collapsed
// "Data Statistics" panel (swimmers/week, sex split w/ %, age distribution,
// swimmers per team), now also on mobile's Admin screen, directly
// requested: "i dont see data statistics in mobile. please add."
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'ownerUid', email: 'lhershey@gmail.com', displayName: 'Owner' };
    window.__mockStore = {
      coaches: { ownerUid: { email: 'lhershey@gmail.com', name: 'Owner', createdAt: 1000 } },
      teams: { teamAlpha: { id: 'teamAlpha', name: 'Junior Squad', createdBy: 'ownerUid', createdAt: 1000 } },
      swimmers: {
        601: { id: '601', name: 'Male Junior A', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/2012', sex: 'male', createdAt: Date.now() },
        602: { id: '602', name: 'Male Junior B', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/2012', sex: 'male', createdAt: Date.now() },
        603: { id: '603', name: 'Female Junior', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/2012', sex: 'female', createdAt: Date.now() },
        // No sex, no createdAt (predates the field) — must still be
        // accounted for without breaking anything.
        604: { id: '604', name: 'Unknown Sex Masters', coachUids: ['ownerUid'], teamIds: ['teamAlpha'], birthdate: '01/01/1980' },
      },
      config: {},
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('#topbarAvatarBtn');
    await page.waitForTimeout(150);
    await page.click('#topbarMenuAdmin');
    await page.waitForFunction(() => document.body.innerText.includes('Data Statistics'), { timeout: 10000 });

    const beforeExpand = await page.evaluate(() => document.body.innerText);
    assert(!/Swimmers Added Per Week/.test(beforeExpand), 'expected the panel to be collapsed by default, got: ' + beforeExpand.slice(0, 600));
    steps.push({ desc: 'Data Statistics panel is collapsed by default', ok: true });

    await page.click('button:has-text("Data Statistics")');
    await page.waitForTimeout(400);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(/3 of 4/.test(bodyText), 'expected the note to say 3 of 4 swimmers have a recorded creation date, got: ' + bodyText.slice(0, 1200));
    assert(bodyText.includes('Swimmers Added Per Week'), 'expected the added-per-week chart heading, got: ' + bodyText.slice(0, 1200));
    assert(/Male:\s*2\s*\(50%\)/.test(bodyText), 'expected the sex-split legend to show Male: 2 (50%), got: ' + bodyText.slice(0, 1200));
    assert(/Female:\s*1\s*\(25%\)/.test(bodyText), 'expected the sex-split legend to show Female: 1 (25%), got: ' + bodyText.slice(0, 1200));
    assert(bodyText.includes('Age Distribution'), 'expected the age-distribution chart heading, got: ' + bodyText.slice(0, 1200));
    assert(bodyText.includes('Swimmers Per Team'), 'expected the swimmers-per-team chart heading, got: ' + bodyText.slice(0, 1200));
    assert(bodyText.includes('Junior Squad'), 'expected the team name to appear in the per-team chart, got: ' + bodyText.slice(0, 1200));
    steps.push({ desc: 'Expanded panel shows all 4 charts with correct notes/percentages', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-admin-data-statistics', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-admin-data-statistics', passed: false, steps, error: e.message };
  }
};
