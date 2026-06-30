---
name: swimtrack-caching-and-debug-lessons
description: Hard-won lessons from a long SwimTrack debugging session (caching + cloud-load)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ef1d7e26-ea8d-4006-a5e3-d5de216c00bf
---

Two issues each cost many rounds; avoid repeating them.

**1. Browser caching of `extract.html`.** Updated code "didn't show up" repeatedly.
**Why:** Firebase Hosting was serving cached HTML.
**How to apply:** `firebase.json` now sets `Cache-Control: no-cache, no-store, must-revalidate` for `**/*.@(html|json)` and `/extract.html`. When a user says "I don't see the change," (a) add/keep a tiny visible build tag (e.g. `vN`) to confirm which build they're on, and (b) tell them to test in an **Incognito window** (zero cache) or `?v=N` fresh URL — don't assume a normal refresh busts it.

**2. Desktop "Load from cloud" rendered nothing.**
**Why:** the load was routed through `window.loadCloudDoc`, which was `undefined` at runtime — the main `<script>`'s top-level `window.X = function(){}` assignments past a certain point weren't reaching `window`, while hoisted `function` declarations (like `finalize`) were fine.
**How to apply:** in the desktop app, do cloud Load/Clear **inside the Firebase `<script type="module">`**, setting `window.D` and calling the hoisted `window.finalize()` directly. Don't depend on top-level `window.*=` helpers from the main script. Also: `var D` at top level IS `window.D` (same binding), so the module can set `window.D` and `finalize` sees it.

**Debugging method that worked:** add per-stage instrumentation that prints to the UI (counts in / built / kept, and capture errors), and when data integrity is in doubt, read the live Firestore doc directly via a node script (temp-open rules) rather than guessing. `inKeys=undefined` (vs `0`) was the tell that the function itself never ran.

See [[swimtrack-cloud-architecture]], [[swimtrack-deploy-workflow]].
