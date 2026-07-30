// Real user report: opening the desktop tool (swim_tracker.html /
// extract.html) on an iPhone shows a cramped desktop-oriented layout with
// no obvious way to reach the real mobile app. This tool was never built
// for phones (wide tables, drag-a-bookmarklet-to-the-bookmarks-bar
// workflow), so instead of trying to make it responsive, a dismissible
// banner now nudges phone-width visitors to the real app at "/". Doesn't
// need sign-in — the banner logic runs on load regardless of auth state.
const { openDesktopApp, assert } = require('../lib/harness');

module.exports = async function run() {
  const steps = [];

  try {
    // Narrow / phone-width viewport: banner should show.
    const narrow = await openDesktopApp(function seed() {}, { viewport: { width: 375, height: 700 } });
    const narrowDisplay = await narrow.page.$eval('#mobileToolBanner', (el) => getComputedStyle(el).display);
    assert(narrowDisplay === 'flex', 'REGRESSION: a phone-width visitor should see the "open the app" banner, computed display was: ' + narrowDisplay);
    steps.push({ desc: 'Banner is shown at a phone-width (375px) viewport', ok: true });

    const bannerText = await narrow.page.$eval('#mobileToolBanner', (el) => el.textContent);
    assert(/open the swimtrack app/i.test(bannerText), 'banner should link to the mobile app, got: ' + bannerText);
    const href = await narrow.page.$eval('#mobileToolBanner a', (el) => el.getAttribute('href'));
    assert(href === '/', 'banner link should point at the app root, got: ' + href);
    steps.push({ desc: 'Banner links to the mobile app root ("/")', ok: true });

    await narrow.page.click('#mobileToolBanner button');
    await narrow.page.waitForTimeout(100);
    const afterDismiss = await narrow.page.$eval('#mobileToolBanner', (el) => getComputedStyle(el).display);
    assert(afterDismiss === 'none', 'dismissing the banner should hide it, computed display was: ' + afterDismiss);
    steps.push({ desc: 'Dismissing the banner hides it', ok: true });

    assert(narrow.consoleErrors.length === 0, 'unexpected page errors (narrow): ' + narrow.consoleErrors.join(' | '));
    await narrow.browser.close();

    // Normal desktop-width viewport: banner should stay hidden.
    const wide = await openDesktopApp(function seed() {}, { viewport: { width: 1100, height: 900 } });
    const wideDisplay = await wide.page.$eval('#mobileToolBanner', (el) => getComputedStyle(el).display);
    assert(wideDisplay === 'none', 'REGRESSION: a normal desktop viewport should never show the phone-visitor banner, computed display was: ' + wideDisplay);
    steps.push({ desc: 'Banner stays hidden at a normal desktop viewport (1100px)', ok: true });

    assert(wide.consoleErrors.length === 0, 'unexpected page errors (wide): ' + wide.consoleErrors.join(' | '));
    steps.push({ desc: 'No uncaught page errors in either viewport', ok: true });
    await wide.browser.close();

    return { name: 'mobile-visitor-banner (desktop tool)', passed: true, steps };
  } catch (e) {
    steps.push({ desc: e.message, ok: false });
    return { name: 'mobile-visitor-banner (desktop tool)', passed: false, steps, error: e.message };
  }
};
