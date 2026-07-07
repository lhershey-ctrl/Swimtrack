---
name: swimtrack-status-next
description: SwimTrack current state and likely next tasks (as of 2026-07-07)
metadata: 
  node_type: memory
  type: project
  originSessionId: aa2468ed-d83c-497d-a96c-a5606287bdf8
---

**Done & live (as of 2026-07-07, HEAD `a01a600`):** desktop↔cloud sync (incl. auto-pull of profile data on sign-in), mobile app (auth, picker, 6 tabs, light/dark theme, growth charts, event-coverage heat map, Points Trend in Progress, smart pool/stroke/distance event filters, on-screen error boundary), access allow-list seeded (lhershey + sharos88), no-cache headers, growth percentiles (CDC 2000) + WhatsApp share, and the **Israeli age-group records feature** (in-app Hebrew PDF parser + cloud publish in desktop, Records-I-hold + record-gap browser in mobile, printable per-season report in Seasons tab). See [[swimtrack-records-feature]] for full detail.

**Recently done (this cluster, commits `66cf0f8`→`e4741f6`):**
- In-app PDF parser + `config/records` cloud publish (desktop), record gaps + "Records I hold" (mobile), all-records browser (desktop).
- Printable per-season report (Seasons tab).
- Records tab now leads with the swimmer's **current age-group best**, with earlier ages shown below.
- Held-record time shown as the headline even when set internationally (not in loglig's own data).
- Records list also shows held records with no matching loglig row, as rows.
- Extract tab: removed the Auto Extraction (console-script) option, keeping only the Manual (single-season bookmarklet) method — **note: `SwimTrack_Architecture.md` and `SwimTrack_Skill.txt` still describe the old Auto Extraction method as the recommended path; those docs are now stale on this point and should be updated if touched.**

**Recently done (2026-07-05):**
- Fixed desktop Settings not showing cloud height/weight/DOB — was only synced as a side effect of the Analyze tab's manual "☁ Load" button. Now auto-syncs every cloud swimmer's profile on sign-in. Confirmed fixed by the user. See [[swimtrack-caching-and-debug-lessons]] lesson 3, [[swimtrack-cloud-architecture]].

**Recently done (2026-07-07):**
- Fixed mobile Records tab crashing (blank screen) for Liron only — missing `recordKey` import in `App.jsx`, only hit when `swimmer.recordName` is set (currently just Liron). Confirmed fixed by the user. See [[swimtrack-caching-and-debug-lessons]] lesson 4.
- Added `TabErrorBoundary` in `mobile/src/App.jsx` — any future tab crash now shows the error message/stack on screen instead of a silent blank app. Keep this for future phone-only debugging.

**Open / ideas not built:**
- Race PDF analysis on mobile — desktop only.
- Sex selector only on mobile Settings; desktop Settings doesn't set it yet.
- Could add target-times/projection + "New PB!" celebration (previously suggested).
- Heat map: optional whole-career total + points-average variant (offered, not built).

See [[swimtrack-cloud-architecture]], [[swimtrack-references]], [[swimtrack-records-feature]].
