---
name: swimtrack-cloud-architecture
description: How the two SwimTrack apps share the Firebase cloud + data ownership
metadata: 
  node_type: memory
  type: project
  originSessionId: aa2468ed-d83c-497d-a96c-a5606287bdf8
---

Two front-ends, one Firestore (project `swimtrack-e12c8`), Google sign-in, email allow-list.

**Firestore model:**
- `swimmers/{playerId}` = `{ name, id, birthdate, sex, recordName, heights:[{date,value}], weights:[...], seasonIds:[...], seasons:{ "2024-2025":{seasonId,bests[],results[]}, … }, updatedAt }`
- `config/access` = `{ emails:[...] }` — the live allow-list.
- `config/records` = `{ records, segments:{"50|J","25|J","50|M","25|M":{loadedAt,count}}, count, loadedAt, by }` — official Israeli age-group records, published from the desktop app. See [[swimtrack-records-feature]].

**Security (`firestore.rules`):** owners (hardcoded `ownerEmails()` = `lhershey@gmail.com`) always allowed + can edit the allow-list; others must be in `config/access.emails`. `config/records` is readable by any allow-listed user but writable only by owners. To add someone: mobile **Settings → Who can access → Save** (owner only). The allow-list was seeded once via a brief temp-rules window (set `config/access` write `if true`, run a node client-SDK script from `mobile/node_modules`, restore — same trick works to read/seed any doc when there's no gcloud/ADC).

**Data ownership (no clobbering — all writes use `merge:true`):**
- `seasons` ← desktop **Analyze → ☁ Sync to cloud** only (per-season merge; re-syncing one season keeps the rest).
- Profile (name/DOB/sex/recordName/heights/weights/seasonIds) ← editable on desktop **Settings** (auto-saves to cloud when signed in) AND mobile **Settings**.
- `config/records` ← desktop only, manual "☁ Upload changes to Cloud" button after reviewing a diff vs the current cloud doc; mobile only ever reads it.

**Desktop (`swim_tracker.html`):** Firebase is a `<script type="module">` at the file bottom (gstatic modular SDK). Cloud **Load/Sync/Clear** are defined IN that module — they set `window.D` and call the hoisted `window.finalize()` directly. IMPORTANT: do NOT route cloud actions through helper functions assigned at the main script's top level — `window.loadCloudDoc` came back `undefined` at runtime (main script's top-level assignments past a point weren't reaching `window`), which cost ~10 debugging rounds. Module + `window.finalize` is the reliable pattern. See [[swimtrack-caching-and-debug-lessons]].

On sign-in, the module also runs `autoSyncProfilesFromCloud()`: fetches every doc in `swimmers/`, and for each one applies profile fields (height/weight/DOB/seasonIds) into the local `SWIMMERS` roster via `window.applyCloudProfile()`/`window.silentAddSwimmer()` (the latter adds an unknown swimmer WITHOUT switching the active selection — unlike `window.upsertSwimmer()`, which does). This is what makes desktop **Settings** show cloud height/weight immediately after sign-in, without requiring the user to first click "☁ Load" on the Analyze tab (that button still exists, and is still what pulls full `seasons` data + switches the active swimmer).

**Mobile (`mobile/`):** React+Vite+recharts. `firebase.js` (auth, `fetchSwimmers`, `subscribeSwimmer`, profile CRUD, access list), `analysis.js` (pure builders ported from desktop, plus `recordGap()`/`bestInAgeGroup()`/`recordsHeldBy()` for the records feature), `theme.jsx` (light/dark), `App.jsx` (auth gate + 6 tabs: Home/Meets/Progress/Records/Seasons/Settings). Stroke classifier: IM matches Hebrew **מעורב** (not only משולב). Refs in [[swimtrack-references]].
