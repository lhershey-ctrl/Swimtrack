// Regression test for a wording fix (user feedback, 2026-07-25): when a
// swimmer holds an age-group record, mobile's Records tab said "You hold
// this!" — a leftover from before results could be viewed for someone
// other than "you" (multi-coach/viewer access). Should name the swimmer
// instead, since the person viewing (a coach, a viewer, a parent) usually
// isn't the swimmer themselves.
const { openMobileApp, assert } = require('../lib/mobile-harness');

module.exports = async function run() {
  const steps = [];
  const app = await openMobileApp(function seed() {
    window.__FAKE_USER = { uid: 'coachX', email: 'coachx@example.com', displayName: 'Coach X' };
    window.__mockStore = {
      coaches: { coachX: { email: 'coachx@example.com', name: 'Coach X', createdAt: 1000 } },
      swimmers: {
        // recordName matches the published record holder's name exactly —
        // this swimmer's PB ties the record for their age group, so they
        // "hold" it.
        601: {
          id: '601', name: 'Record Holder Swimmer', coachUids: ['coachX'], recordName: 'Record Holder Swimmer', birthdate: '01/06/2010', sex: 'male',
          seasons: {
            '2025-2026': { bests: [{ event: '50 Free', pool: '25', seconds: 27.0, time: '27.00', date: '01/06/2026', points: 500 }], results: [{ event: '50 Free', pool: '25', seconds: 27.0, time: '27.00', date: '01/06/2026', points: 500 }] },
          },
        },
      },
      teams: {},
      config: { records: { records: { 25: { M: { 16: { '50|Free': { sec: 27.0, time: '27.00', name: 'Record Holder Swimmer' } } } } }, segments: {}, count: 1, loadedAt: Date.now(), by: 'test' } },
    };
  });
  const { page, consoleErrors } = app;

  try {
    await page.click('text=Sign in with Google');
    await page.waitForTimeout(900);
    await page.click('button:has-text("Records")');
    await page.waitForTimeout(600);

    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(bodyText.includes('Record Holder Swimmer holds this'), 'expected the record-holder callout to name the swimmer instead of saying "You hold this", got: ' + bodyText.slice(0, 500));
    assert(!/you hold this/i.test(bodyText), 'REGRESSION: should no longer say "You hold this" — should name the swimmer, got: ' + bodyText.slice(0, 500));
    steps.push({ desc: 'Record-holder callout names the swimmer instead of saying "You hold this"', ok: true });

    assert(consoleErrors.length === 0, 'unexpected page errors: ' + consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors during the flow', ok: true });

    await app.close();
    return { name: 'mobile-record-holder-shows-name', passed: true, steps };
  } catch (e) {
    await app.close();
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-record-holder-shows-name', passed: false, steps, error: e.message };
  }
};
