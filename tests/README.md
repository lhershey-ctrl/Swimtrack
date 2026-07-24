# SwimTrack regression suite

Drives the **real** apps in a headless browser, with only Firebase swapped
for in-memory mocks — every click, save, and tab switch is the actual app
code, not a re-implementation of it. Each file in `scenarios/` is a test for
either a specific bug that was found and fixed (fails again if it comes
back) or a basic happy-path flow.

- **Desktop** (`swim_tracker.html`): opened directly as a `file://` page;
  the 3 Firebase CDN URLs are intercepted via Playwright `page.route()` and
  served from `mocks/`. See `lib/harness.js`.
- **Mobile** (`mobile/src/App.jsx`): a real Vite dev server
  (`mobile/vite.test.config.js`) aliases the `firebase/app`, `firebase/auth`,
  `firebase/firestore` npm imports to `mobile-mocks/`, since mobile imports
  Firebase as packages, not CDN URLs — `page.route()` can't intercept those
  the same way. See `lib/mobile-harness.js`. The dev server starts once per
  run (ref-counted across scenarios) and is torn down after the last one.

## Run it

```
cd tests
npm install          # first time only
node run-all.js       # or: npm test
```

Exits 0 if everything passed, 1 otherwise — safe to wire into a CI step or
git hook later. A full run (5 desktop + 2 mobile scenarios) takes about
20-25 seconds on a normal dev machine, mostly browser + dev-server startup.

## What's covered today

| Scenario | App | Guards against / verifies |
|---|---|---|
| `app-loads-smoke.js` | desktop | Cold load doesn't crash; Extract/Analyze/Settings tabs switch |
| `clear-banner.js` | desktop | Swimmer banner staying visible with stale data after "✕ Clear" |
| `load-data-and-charts.js` | desktop | Pasting two seasons merges them (not overwritten); Best Times / Points Trend charts actually render data, not just an empty canvas |
| `multi-team-membership.js` | desktop | (a) adding an existing swimmer to a new team exclusively reassigning them instead of adding them additionally, (b) saving swimmers into the current team going stale and getting wiped on the next team switch |
| `settings-add-edit-persist.js` | desktop | Adding/editing a swimmer in Settings saves to `localStorage` and survives a real page reload |
| `mobile-app-loads-smoke.js` | mobile | Sign-in + all 6 bottom-nav tabs actually switch content (not just "didn't crash") |
| `mobile-add-swimmer.js` | mobile | Adding a swimmer in Settings writes the correct Firestore doc (name + coachUid) and shows up immediately |

## Adding a new scenario

Copy the shape of an existing file — desktop scenarios use
`openDesktopApp(seedFn)` from `lib/harness.js`, mobile scenarios use
`openMobileApp(seedFn)` from `lib/mobile-harness.js` — seed a
`window.__mockStore` fixture, drive it with real Playwright clicks, and
`assert()` the outcome. Return `{ name, passed, steps }` (steps is a list of
`{ desc, ok }` — this is what shows up in the printed report). Any bug found
during manual testing/debugging is worth turning into a permanent scenario
here before moving on — that's the whole point of this directory.

**Selector gotcha worth knowing**: an unqualified `page.click('text=Foo')`
matches the first element whose text *contains* "Foo" anywhere in the DOM,
not necessarily the button you meant — mobile's bottom nav "Settings" button
was initially mis-clicked in favor of a plain sentence on the Home tab that
also contains the word "Settings". Prefer `button:has-text("Foo")` (or an
id/class) for anything clickable once there's any chance of ambiguity.

## Not covered yet

- Desktop's Records/Rudolph/USA-Standards/Masters-WR panels (would need
  `config/*` reference-table fixtures in the mock store).
- Anything requiring real Firebase Auth/Firestore or `firestore.rules`
  permission behavior (this suite is deliberately fully mocked/offline —
  fast and free, but it can't catch a real rules bug).
- No actual CI runner wired up yet (GitHub Actions) — this is a local gate
  you run manually before considering a change done.
