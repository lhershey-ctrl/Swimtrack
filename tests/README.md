# SwimTrack regression suite

Drives the **real** `swim_tracker.html` in a headless browser, with only the
three Firebase CDN modules swapped for in-memory mocks (`mocks/`) — every
click, save, and tab switch is the actual app code, not a re-implementation
of it. Each file in `scenarios/` is a regression test for one specific bug
that was found and fixed; it fails again if that bug ever comes back.

## Run it

```
cd tests
npm install          # first time only
node run-all.js       # or: npm test
```

Exits 0 if everything passed, 1 otherwise — safe to wire into a CI step or
git hook later.

## What's covered today

| Scenario | Guards against |
|---|---|
| `clear-banner.js` | Swimmer banner staying visible with stale data after "✕ Clear" |
| `multi-team-membership.js` | (a) adding an existing swimmer to a new team exclusively reassigning them instead of adding them additionally, (b) saving swimmers into the current team going stale and getting wiped on the next team switch |

## Adding a new scenario

Copy the shape of an existing file: export an async `run()` that uses
`openDesktopApp(seedFn)` from `lib/harness.js` to launch the app with a
`window.__mockStore` fixture, drives it with real Playwright clicks, and
`assert()`s the outcome. Return `{ name, passed, steps }` (steps is a list of
`{ desc, ok }` — this is what shows up in the printed report). Any bug found
during manual testing/debugging is worth turning into a permanent scenario
here before moving on — that's the whole point of this directory.

## Not covered yet

- Mobile (`mobile/src/App.jsx`) has no equivalent harness yet — its
  architecture (cluster state is always freshly re-fetched, never a
  separately-filtered snapshot) made it structurally immune to the specific
  bug `multi-team-membership.js` guards against on desktop, but that's not
  the same as being tested.
- Anything requiring real Firebase Auth/Firestore (this suite is fully
  offline/mocked by design — fast and free, but it can't catch a real
  `firestore.rules` permission bug).
