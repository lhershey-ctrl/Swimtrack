---
name: swimtrack-status-next
description: SwimTrack current state and likely next tasks (as of 2026-06-30)
metadata: 
  node_type: memory
  type: project
  originSessionId: ef1d7e26-ea8d-4006-a5e3-d5de216c00bf
---

**Done & live (2026-06-30):** desktop↔cloud sync, mobile app (auth, picker, 6 tabs, light/dark theme, growth charts, event-coverage heat map, Points Trend in Progress, smart pool/stroke/distance event filters), access allow-list seeded (lhershey + sharos88), no-cache headers, repo renamed `noga_swimming_app.html`→`swim_tracker.html`, docs updated. Desktop cloud Load/Sync/Clear confirmed working.

**Known open items / ideas raised but not built:**
- DONE (2026-06-30): Desktop **"☁ Load:" now shows a pill per cloud swimmer** (fetched via `getDocs(collection(db,"swimmers"))` → `refreshCloudSwimmers` on sign-in). Clicking loads that swimmer and `window.upsertSwimmer(id,name)` adds them to the local roster — so Liron loads on any browser.
- **Race PDF analysis on mobile** — not ported yet (desktop only).
- Memory files also mirrored into the repo at `<project>/memory/` (user prefers them visible there); keep both in sync.
- Heat map: optional **whole-career** total + a **points-average** variant (offered, not built).
- Possible: auto-load active swimmer from cloud on sign-in (currently manual ☁ Load).

See [[swimtrack-cloud-architecture]], [[swimtrack-references]].
