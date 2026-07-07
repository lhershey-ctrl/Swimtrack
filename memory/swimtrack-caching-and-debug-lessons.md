---
name: swimtrack-caching-and-debug-lessons
description: Hard-won lessons from a long SwimTrack debugging session (caching + cloud-load)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aa2468ed-d83c-497d-a96c-a5606287bdf8
---

Two issues each cost many rounds; avoid repeating them.

**1. Browser caching of `extract.html`.** Updated code "didn't show up" repeatedly.
**Why:** Firebase Hosting was serving cached HTML.
**How to apply:** `firebase.json` now sets `Cache-Control: no-cache, no-store, must-revalidate` for `**/*.@(html|json)` and `/extract.html`. When a user says "I don't see the change," (a) add/keep a tiny visible build tag (e.g. `vN`) to confirm which build they're on, and (b) tell them to test in an **Incognito window** (zero cache) or `?v=N` fresh URL — don't assume a normal refresh busts it.

**2. Desktop "Load from cloud" rendered nothing.**
**Why:** the load was routed through `window.loadCloudDoc`, which was `undefined` at runtime — the main `<script>`'s top-level `window.X = function(){}` assignments past a certain point weren't reaching `window`, while hoisted `function` declarations (like `finalize`) were fine.
**How to apply:** in the desktop app, do cloud Load/Clear **inside the Firebase `<script type="module">`**, setting `window.D` and calling the hoisted `window.finalize()` directly. Don't depend on top-level `window.*=` helpers from the main script. Also: `var D` at top level IS `window.D` (same binding), so the module can set `window.D` and `finalize` sees it.

**Debugging method that worked:** add per-stage instrumentation that prints to the UI (counts in / built / kept, and capture errors), and when data integrity is in doubt, read the live Firestore doc directly via a node script (temp-open rules) rather than guessing. `inKeys=undefined` (vs `0`) was the tell that the function itself never ran.

**3. Desktop Settings didn't show cloud height/weight/DOB (2026-07-05, fixed & confirmed working).**
**Why:** profile fields only ever reached the local `SWIMMERS` array as a side effect of manually clicking "☁ Load" on the Analyze tab (`upsertSwimmer` only set name/id, never height/weight/DOB/seasonIds) — and only for swimmers already in the local roster. On a fresh browser/machine (roster = hardcoded Noga/Gal defaults), a swimmer like Liron didn't show up in Settings at all until that explicit action. Confirmed by asking the user for repro steps: they signed in and went straight to Settings, never clicking Load first.
**How to apply:** desktop now auto-pulls every cloud swimmer's profile on sign-in (`autoSyncProfilesFromCloud`, in the Firebase module), applying fields via `applyCloudProfile()` and silently adding unknown swimmers via `silentAddSwimmer()` (a variant of `upsertSwimmer` that does NOT call `selectSwimmer` — important, since this runs for swimmers the user isn't necessarily viewing that session; calling the regular `upsertSwimmer` in a loop would hijack the active-swimmer selection). General lesson: when a "why doesn't X show the cloud data" bug comes in, ask what UI action (if any) preceded the observation before assuming the write/read path is broken — often the trigger for syncing profile-style data is more narrowly scoped than the user expects.

**4. Mobile Records tab blank for Liron only, Noga/Gal fine (2026-07-07, fixed & confirmed working).**
**Why:** `recordKey()` was called inside `RecordsTab`'s `listRows` useMemo but never imported from `analysis.js` in `App.jsx` — a `ReferenceError`. It only executes inside the `if (records && sex && cat && myName)` branch, and `myName` (swimmer.recordName) is only set for Liron (he holds real Israeli records) — Noga/Gal don't have `recordName` set yet, so they never hit the broken line. Replaying the exact analysis.js math against Liron's real cloud data outside the browser (Node script, temp-opened Firestore read rules, immediately restored) found NO bug — the crash was a missing import, invisible without an actual browser render.
**How to apply:** (a) when a bug is swimmer-specific, check what profile fields differ (here: `recordName` presence) and which `if` branches that field gates — don't assume it's a data-shape issue. (b) There was no error boundary anywhere in `mobile/src/App.jsx`, so an uncaught render error blanked the ENTIRE app with nothing visible and no dev-tools on a phone to diagnose — added `TabErrorBoundary` (keyed by `tab+swimmerId`) wrapping the tab-switch, which now shows the error message + stack directly on screen. This turned an unreproducible "just blank" report into a one-shot fix via a screenshot. Keep this boundary — it's now the standard way to debug any future phone-only crash.
**Technique reused:** temp-opening `swimmers/{id}` and `config/records` Firestore read rules (`allow read: if true`), fetching with a Node script placed *inside* `mobile/` (so `node_modules` resolves — a script in a scratch dir outside `mobile/` fails with `ERR_MODULE_NOT_FOUND`), then immediately restoring + redeploying the original rules. Verify restoration with `git diff firestore.rules` (expect empty) before moving on.

See [[swimtrack-cloud-architecture]], [[swimtrack-deploy-workflow]].
