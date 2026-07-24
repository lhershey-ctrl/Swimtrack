// Mobile equivalent of lib/harness.js. Mobile imports Firebase from real npm
// packages ("firebase/app" etc.), not CDN <script> URLs, so page.route()
// can't intercept them the way the desktop harness does — instead we run a
// dedicated Vite dev server (mobile/vite.test.config.js) that aliases those
// three import specifiers to tests/mobile-mocks/*.js, and drive that server
// with Playwright. The server is started once per test process and shared
// across scenarios (ref-counted), not restarted per scenario — that's what
// keeps a full mobile run from paying a multi-second Vite boot every time.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const MOBILE_DIR = path.join(__dirname, '..', '..', 'mobile');
const PORT = 3099;
const URL = `http://localhost:${PORT}`;

let serverProcess = null;
let serverRefCount = 0;
let serverReady = null;

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('mobile test server did not become ready at ' + url + ' within ' + timeoutMs + 'ms');
}

function ensureServer() {
  serverRefCount++;
  if (serverProcess) return serverReady;
  const viteBin = path.join(MOBILE_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  serverProcess = spawn(viteBin, ['--config', 'vite.test.config.js'], {
    cwd: MOBILE_DIR,
    stdio: 'ignore',
    shell: process.platform === 'win32', // .cmd shims need a shell on Windows
  });
  serverReady = waitForServer(URL, 20000);
  return serverReady;
}

function releaseServer() {
  serverRefCount--;
  if (serverRefCount <= 0 && serverProcess) {
    const pid = serverProcess.pid;
    if (process.platform === 'win32') {
      // shell:true means serverProcess is the cmd.exe wrapper, not vite itself
      // — .kill() alone would leave the real vite/node process (and port 3099)
      // running. /T kills the whole process tree.
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      serverProcess.kill();
    }
    serverProcess = null;
    serverReady = null;
  }
}

async function openMobileApp(seed) {
  await ensureServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.addInitScript(seed);
  await page.goto(URL);
  await page.waitForTimeout(300);
  return {
    browser,
    page,
    consoleErrors,
    async close() { await browser.close(); releaseServer(); },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}

module.exports = { openMobileApp, assert };
