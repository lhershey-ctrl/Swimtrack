---
name: swimtrack-cloud-architecture
description: How the two SwimTrack apps share the Firebase cloud + data ownership
metadata: 
  node_type: memory
  type: project
  originSessionId: ef1d7e26-ea8d-4006-a5e3-d5de216c00bf
---

Two front-ends, one Firestore (project `swimtrack-e12c8`), Google sign-in, email allow-list.

**Firestore model:**
- `swimmers/{playerId}` = `{ name, id, birthdate, heights:[{date,value}], weights:[...], seasonIds:[...], seasons:{ "2024-2025":{seasonId,bests[],results[]}, … }, updatedAt }`
- `config/access` = `{ emails:[...] }` — the live allow-list.

**Security (`firestore.rules`):** owners (hardcoded `ownerEmails()` = `lhershey@gmail.com`) always allowed + can edit the allow-list; others must be in `config/access.emails`. To add someone: mobile **Settings → Who can access → Save** (owner only). The allow-list was seeded once via a brief temp-rules window (set `config/access` write `if true`, run a node client-SDK script from `mobile/node_modules`, restore — same trick works to read/seed any doc when there's no gcloud/ADC).

**Data ownership (no clobbering — all writes use `merge:true`):**
- `seasons` ← desktop **Analyze → ☁ Sync to cloud** only (per-season merge; re-syncing one season keeps the rest).
- Profile (name/DOB/heights/weights/seasonIds) ← editable on desktop **Settings** (auto-saves to cloud when signed in) AND mobile **Settings**.

**Desktop (`swim_tracker.html`):** Firebase is a `<script type="module">` at the file bottom (gstatic modular SDK). Cloud **Load/Sync/Clear** are defined IN that module — they set `window.D` and call the hoisted `window.finalize()` directly. IMPORTANT: do NOT route cloud actions through helper functions assigned at the main script's top level — `window.loadCloudDoc` came back `undefined` at runtime (main script's top-level assignments past a point weren't reaching `window`), which cost ~10 debugging rounds. Module + `window.finalize` is the reliable pattern. See [[swimtrack-caching-and-debug-lessons]].

**Mobile (`mobile/`):** React+Vite+recharts. `firebase.js` (auth, `fetchSwimmers`, `subscribeSwimmer`, profile CRUD, access list), `analysis.js` (pure builders ported from desktop), `theme.jsx` (light/dark), `App.jsx` (auth gate + 6 tabs: Home/Meets/Progress/Records/Seasons/Settings). Stroke classifier: IM matches Hebrew **מעורב** (not only משולב). Refs in [[swimtrack-references]].
