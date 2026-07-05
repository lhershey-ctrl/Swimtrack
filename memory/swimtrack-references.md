---
name: swimtrack-references
description: "SwimTrack URLs, Firebase/GitHub IDs, swimmer player IDs, file layout"
metadata: 
  node_type: memory
  type: reference
  originSessionId: aa2468ed-d83c-497d-a96c-a5606287bdf8
---

**Firebase project:** `swimtrack-e12c8` (config/keys are committed in code — safe; rules are the security boundary).
**GitHub:** `https://github.com/lhershey-ctrl/Swimtrack` (private, branch `master`).
**Live URLs:**
- Mobile app: `https://swimtrack-e12c8.web.app/`
- Desktop extractor+sync: `https://swimtrack-e12c8.web.app/extract.html`

**Swimmers (loglig player ID = Firestore `swimmers/{id}` doc id):**
- Noga `268117`, Gal `276401`, Liron `115352`.

**Known season IDs (loglig):** 1715=2025-26, 1605=2024-25, 1533=2023-24, 1396=2022-23, 1284=2021-22, 1164=2020-21.

**Repo layout (working dir `d:\Liron\Tools\Swimtrack` — was `c:\Users\liron.hs\Claude\Projects\Swimming` on a prior machine):**
- `swim_tracker.html` — desktop app (was `noga_swimming_app.html`); `swim_tracker.BACKUP.html` = pristine pre-cloud original.
- `mobile/` — React+Vite app (`src/App.jsx`, `firebase.js`, `analysis.js`, `theme.jsx`, `share.js`, `cdcGrowth.js`).
- `mobile/parse_records.mjs`, `probe_records.mjs`, `record_gaps.mjs` — manual dev-only Node scripts for tuning the Israeli-records PDF parser; never invoked by the running app.
- `firebase.json`, `.firebaserc`, `firestore.rules`.
- `Data/` — extracted swimmer JSON files + `swimming_settings (1).json` + the 4 official Israeli-record Hebrew PDFs (juniors/masters × long/short course).

See [[swimtrack-cloud-architecture]], [[swimtrack-deploy-workflow]], [[swimtrack-records-feature]].
