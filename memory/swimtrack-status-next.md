---
name: swimtrack-status-next
description: SwimTrack current state and likely next tasks (as of 2026-06-30)
metadata: 
  node_type: memory
  type: project
  originSessionId: ef1d7e26-ea8d-4006-a5e3-d5de216c00bf
---

**Done & live (2026-06-30):** desktop↔cloud sync, mobile app (auth, picker, 6 tabs, light/dark theme, growth charts, event-coverage heat map, Points Trend in Progress, smart pool/stroke/distance event filters), access allow-list seeded (lhershey + sharos88), no-cache headers, repo renamed `noga_swimming_app.html`→`swim_tracker.html`, docs updated. Desktop cloud Load/Sync/Clear confirmed working.

**Recently done (2026-06-30):**
- Desktop **"☁ Load:" shows a pill per cloud swimmer** (`getDocs(collection(db,"swimmers"))`→`refreshCloudSwimmers` on sign-in); click loads + `window.upsertSwimmer(id,name)` adds to local roster — Liron loads on any browser.
- **Growth percentiles (CDC 2000)** — `mobile/src/cdcGrowth.js` holds verified CDC LMS data (stature/weight/BMI, 5–19y, by sex) parsed straight from the official CDC CSVs (NOT hand-typed — regenerate with the scratch `gen_cdc.cjs` if needed; raw CSVs fetched via WebFetch which SAVES the raw bytes to tool-results/*.bin — the model's inline transcription is garbled, always parse the .bin). Home `GrowthPercentile`: metric toggle, percentile-band chart + swimmer points + current percentile + growth-vs-PB correlation. Needs swimmer `sex` (added to Settings editor) + `birthdate`.
- **WhatsApp share** — `mobile/src/share.js` `shareProgress()` builds text + a canvas card and uses Web Share API (files) → falls back to `wa.me` + image download. "📤 Share" button on Home.
- Memory files mirrored into repo `<project>/memory/`; keep both in sync.

**Open / ideas not built:**
- **Race PDF analysis on mobile** — desktop only.
- Sex selector only on mobile Settings; desktop Settings doesn't set it yet.
- Could add target-times/projection + "New PB!" celebration (previously suggested).
- Heat map: optional **whole-career** total + a **points-average** variant (offered, not built).
- Possible: auto-load active swimmer from cloud on sign-in (currently manual ☁ Load).

See [[swimtrack-cloud-architecture]], [[swimtrack-references]].
