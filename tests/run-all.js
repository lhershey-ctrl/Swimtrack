// Regression suite for swim_tracker.html (desktop). Each file in
// tests/scenarios/ drives the REAL app in a headless browser with only the
// Firebase network calls faked (tests/mocks/) — not unit tests, not a code
// read-through, an actual click-through of the fixed bug.
//
// Usage:  cd tests && npm install && node run-all.js
// Exits 0 if everything passed, 1 if anything failed (CI-friendly).
const fs = require('fs');
const path = require('path');

async function main() {
  const dir = path.join(__dirname, 'scenarios');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const results = [];
  for (const f of files) {
    const run = require(path.join(dir, f));
    const start = Date.now();
    let result;
    try {
      result = await run();
    } catch (e) {
      result = { name: f, passed: false, steps: [], error: 'threw: ' + e.message };
    }
    result.ms = Date.now() - start;
    results.push(result);
    print(result);
  }
  const passed = results.filter((r) => r.passed).length;
  console.log('\n' + '─'.repeat(60));
  console.log(`${passed}/${results.length} scenarios passed`);
  results.forEach((r) => console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms)`));
  console.log('─'.repeat(60));
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

function print(result) {
  console.log(`\n${result.passed ? '✅ PASS' : '❌ FAIL'} — ${result.name} (${result.ms}ms)`);
  (result.steps || []).forEach((s) => console.log(`   ${s.ok ? '✓' : '✗'} ${s.desc}`));
  if (result.error) console.log(`   ERROR: ${result.error}`);
}

main();
