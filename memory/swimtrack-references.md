---
name: swimtrack-references
description: "SwimTrack URLs, Firebase/GitHub IDs, swimmer player IDs, file layout"
metadata: 
  node_type: memory
  type: reference
  originSessionId: ef1d7e26-ea8d-4006-a5e3-d5de216c00bf
---

**Firebase project:** `swimtrack-e12c8` (config/keys are committed in code — safe; rules are the security boundary).
**GitHub:** `https://github.com/lhershey-ctrl/Swimtrack` (private, branch `master`).
**Live URLs:**
- Mobile app: `https://swimtrack-e12c8.web.app/`
- Desktop extractor+sync: `https://swimtrack-e12c8.web.app/extract.html`

**Swimmers (loglig player ID = Firestore `swimmers/{id}` doc id):**
- Noga `268117`, Gal `276401`, Liron `115352`.

**Known season IDs (loglig):** 1715=2025-26, 1605=2024-25, 1533=2023-24, 1396=2022-23, 1284=2021-22, 1164=2020-21.

**Repo layout (working dir `c:\Users\liron.hs\Claude\Projects\Swimming`):**
- `swim_tracker.html` — desktop app (was `noga_swimming_app.html`); `swim_tracker.BACKUP.html` = pristine pre-cloud original.
- `mobile/` — React+Vite app (`src/App.jsx`, `firebase.js`, `analysis.js`, `theme.jsx`).
- `firebase.json`, `.firebaserc`, `firestore.rules`.
- `Data/` — extracted JSON files + `swimming_settings (1).json`.

See [[swimtrack-cloud-architecture]], [[swimtrack-deploy-workflow]].
