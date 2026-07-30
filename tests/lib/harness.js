const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const REPO = path.join(__dirname, '..', '..');
const MOCKS = path.join(__dirname, '..', 'mocks');
const FB_VERSION = '12.11.0'; // must match the <script type="module"> imports in swim_tracker.html

// Launches swim_tracker.html with the real Firebase CDN modules replaced by
// tests/mocks/*.js (in-memory auth + Firestore), so scenarios can drive the
// REAL, unmodified app UI with only the network boundary faked. `seed` is
// installed via addInitScript so it exists before the app's own script runs.
async function openDesktopApp(seed, opts) {
  const browser = await chromium.launch();
  const viewport = (opts && opts.viewport) || { width: 1100, height: 900 };
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  for (const name of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']) {
    await page.route(`https://www.gstatic.com/firebasejs/${FB_VERSION}/${name}`, (r) =>
      r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(MOCKS, name)) })
    );
  }

  await page.addInitScript(() => {
    try { localStorage.removeItem('swimtrack:teamKey'); } catch (e) {}
    try { localStorage.setItem('sw_landing_dismissed', '1'); } catch (e) {}
  });
  await page.addInitScript(seed); // scenario-specific: sets window.__FAKE_USER / window.__mockStore

  const fileUrl = 'file:///' + path.join(REPO, 'swim_tracker.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  await page.waitForTimeout(300);
  return { browser, page, consoleErrors };
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

module.exports = { openDesktopApp, assert, REPO, MOCKS };
