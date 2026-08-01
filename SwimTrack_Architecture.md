# SwimTrack — Architecture & Developer Reference

## Overview

SwimTrack has **two front-ends sharing one cloud database**:

1. **Desktop app** — `swim_tracker.html`, a zero-build single HTML file (vanilla JS, Chart.js, pdf.js). Used to **extract** data from loglig.com and **sync it to the cloud**. Also does full analysis + the Race-PDF tool.
2. **Mobile app** — `mobile/` (React + Vite), a modern phone-first PWA that **reads from the cloud** and shows the analysis. Deployed to Firebase Hosting.

Both authenticate with **Google Sign-In** and talk directly to **Firebase Firestore** (project `swimtrack-e12c8`). Access is restricted to an email allow-list. The desktop app still works fully offline via `localStorage` if you don't sign in.

**Live URLs**
- Mobile app: `https://swimtrack-e12c8.web.app/`
- Desktop extractor + sync: `https://swimtrack-e12c8.web.app/extract.html` (the deploy copies `swim_tracker.html` → `extract.html`)

> Google sign-in only works from a hosted origin (`*.web.app` or `localhost`), **never from a `file://` page** — so use the hosted `/extract.html`, not the local file, when you need to sync.

---

## Cloud Architecture (Firebase)

```
DESKTOP (swim_tracker.html)                MOBILE (mobile/ — React+Vite)
  • Extract (bookmarklet / paste HTML)       • Google sign-in gate
  • Analyze + Race                           • Swimmer picker (from cloud)
  • ☁ Sign in / Load / Sync                  • Home/Meets/Progress/Records/
        │  write/read                          Seasons/Settings (recharts)
        ▼                                            ▲ read (live onSnapshot)
   ┌───────────────────────────────────────────────────────────────────┐
   │  Firebase project: swimtrack-e12c8                                 │
   │  Firestore:                                                        │
   │    swimmers/{playerId} = {                                         │
   │      name, id, birthdate, sex,                                     │
   │      recordName?, intlName?,                                       │
   │      heights:[{date,value}], weights:[...], seasonIds:[...],       │
   │      seasons:{ "2024-2025": {seasonId,bests[],results[]}, …},      │
   │      coachUids:[uid,...], coachEmails:[email,...],                 │
   │      teamIds:[teamId,...]   ← optional, see "Teams" below          │
   │      updatedAt                                                     │
   │    }                                                               │
   │      recordName = Hebrew spelling as published in Israeli records; │
   │      intlName = Latin spelling as published in World/Europe        │
   │      Top-10 rankings — both optional, fuzzy-suggested in Settings  │
   │    coaches/{uid} = { email, name, createdAt, teamName? }           │
   │      ← existence of this doc = "is a coach"; teamName is the       │
   │        self-editable display name for their LEGACY (coachUids-     │
   │        based) cluster, shown when picking/switching accounts       │
   │    teams/{teamId} = { name, createdBy, createdAt }                 │
   │      ← an EXPLICIT, named roster a coach creates under their own   │
   │        login (see "Teams" below) — distinct from a legacy cluster; │
   │        name is editable by createdBy via renameTeam()              │
   │    inviteCodes/{code} = { createdAt, createdBy, usedBy, usedAt,    │
   │      note, targetCoachUid?, swimmerIds? }     ← single-use         │
   │    pendingShares/{uid} = { swimmerIds:[...], claimedAt }           │
   │      ← rules-verification bridge for invite-code redemption        │
   │    config/access  = { emails:[...] }    ← legacy flat allow-list   │
   │    config/records = { records, segments, count, loadedAt, by }     │
   │      ← Israeli age-group records (juniors+masters, SC+LC)          │
   │    config/rudolph = { table, count, loadedAt, by }                 │
   │      ← Rudolph age-graded 1-20 points table (50m only)             │
   │    config/usaStandards = { table, count, loadedAt, by }            │
   │      ← USA Swimming motivational standards (juniors 10-18)         │
   │    config/mastersRecords = { table, count, loadedAt, by }          │
   │      ← World Aquatics masters world records (SCM+LCM)              │
   │    config/mastersTop10 = { entries:[...], count, loadedAt, by }    │
   │      ← World + European Aquatics masters Top-10 rankings, each     │
   │        entry tagged {source:"world"|"europe", course, year, sex,   │
   │        event, name, rank, ...} — see "Masters Top-10 International │
   │        Rankings" below                                             │
   │  Auth: Google                                                      │
   │  Hosting: serves mobile/dist (+ extract.html, bm2.js)              │
   └───────────────────────────────────────────────────────────────────┘
```

### Data ownership (avoids clobbering)
- **`seasons`** (results/bests) is written by the **desktop** "☁ Sync to cloud" (Analyze tab). Firestore `merge:true` updates season-by-season, so re-syncing one season never wipes the others.
- **Profile** (`name`, `birthdate`, `sex`, `heights`, `weights`, `seasonIds`) is editable on **both** desktop Settings (auto-saves to cloud when signed in; "☁ Save to Cloud" button) **and** the mobile Settings tab. All writes use `merge:true` and only touch their own fields.
- **`coachUids`/`coachEmails`/`teamIds`** are all **additive-only** — every write uses Firestore `arrayUnion()` (joining a team, sharing access, syncing) and every removal uses `arrayRemove()` (Settings "✕ Remove" on a swimmer, "✕" on a viewer pill) targeting only the current coach/team. Nothing ever overwrites these arrays wholesale, and — critically — **removing a swimmer or a viewer never deletes the swimmer document itself**, only unlinks the one coach/team relationship being removed; the doc and any other coach's access stay fully intact. (An earlier version of mobile's "Remove" button called `deleteDoc()` directly — a real, shipped bug that would have wiped a shared swimmer's entire record for every coach who had access, not just the one clicking Remove. Fixed 2026-07-25; never reintroduce a hard delete on this collection from a non-owner action.)
- **`config/records`**, **`config/rudolph`**, **`config/usaStandards`**, **`config/mastersRecords`**, **`config/mastersTop10`** are published **only from the desktop app's Extract/Admin tabs** after reviewing a diff vs. the current cloud doc, owner-only. Both apps only ever *read* them for scoring/gap/ranking features. (Whenever a new `config/*` doc is added, it must be explicitly added to `firestore.rules`' `isMember()`-gated read list too — this was missed once for `mastersTop10` and silently broke every read/write with "insufficient permissions" until caught and fixed.)
- **`recordName`/`intlName`** (per swimmer) are editable by any coach on that swimmer, same as the rest of the profile — see "Name-Match Suggestion Chips" below for how they get filled in.

### Security rules (`firestore.rules`)
- **Owners** (hardcoded `ownerEmails()`, currently `lhershey@gmail.com`) always have full access — read/write everything, including cross-coach admin queries.
- **Coaches**: existence of a `coaches/{uid}` doc is what makes an account a "coach." `swimmers/{id}` read/update is scoped to `request.auth.uid in resource.data.coachUids`; create is open to any coach (a brand-new doc has no prior owner to protect). `coaches/{uid}` is readable by any coach (needed to label a shared swimmer's team) but only self-updatable, and only the `teamName` field.
- **`teams/{teamId}`**: any coach can read (needed to show a team's name to someone who didn't create it); update is allowed for the owner OR the creator (`createdBy`) — and for a non-owner creator, only when the diff touches nothing but the `name` field (`diff().affectedKeys().hasOnly(['name'])`), i.e. renaming, not reassigning ownership; only the owner can delete.
- Everyone else (no `coaches/{uid}` doc yet) must redeem an **invite code** first — see "Onboarding a new coach" below. `config/records`/`rudolph`/`usaStandards`/`mastersRecords`/`mastersTop10` are readable by any coach (or legacy-allowed email), writable only by the owner.

---

## Teams / Multi-Account Architecture

A single Google sign-in can have access to **more than one, otherwise-unrelated roster** — e.g. a coach invited into two different families' swimmers, or a coach who explicitly creates a second, empty roster for a different squad under their own login. Both apps compute this **client-side**, over whatever swimmers the signed-in coach can already query (`coachUids array-contains uid`) — no extra Firestore query, no rules change needed for the clustering itself.

### Two kinds of "team" — an explicit team is always a swimmer's ONE home

1. **Legacy cluster** (implicit) — a group of swimmers connected by *shared coachUids*, with no explicit `teams/{id}` behind it. This is the original, pre-teams model (e.g. a family sharing one roster). Named after the earliest-created member coach's `coaches/{uid}.teamName` (or a computed default, `"<email-local-part>'s Team"`).
2. **Explicit team** (`teams/{id}`) — a real, named Firestore doc a coach creates via **Settings → "Start Another Team" → + Create a New Team**. Brand-new and empty at creation; swimmers join it by being added while it's the *active* team, or by already existing elsewhere and being additionally tagged with its id (see below). Named directly from `teams/{id}.name`.

**A swimmer's `teamIds` is an array, not a single field** — so a swimmer can belong to more than one *explicit* team at once (added to a brand-new team never removes them from another one they already belong to; real bug during development, before `teamId` singular was redesigned into `teamIds` array — see [[swimtrack-cloud-architecture]] in the assistant's memory).

**As soon as a swimmer has ANY explicit team, they no longer also join the legacy grouping — this was reversed 2026-07-31 (real bug).** The original design ("duplicated across them on purpose") let a swimmer with both an explicit team AND legacy coachUids-sharing show up in BOTH — in practice this produced a confusing phantom duplicate: the exact same swimmers/coach-pair, once under the explicit team's real name, once again under a legacy cluster labeled with whichever member's *personal* `teamName` happened to be earliest-created (often not a name that describes that swimmer pair at all). Live-reported and confirmed with real data: "the 2nd team har shai is actually team דולפין נתניה that somehow was copied" — same 2 swimmers, same coach pair, one row correctly named after the real `teams/{id}` doc, one phantom row via the legacy grouping. Fixed in both `clusterMySwimmers`/`groupCoachesIntoTeams`: a swimmer with `teamIds.length > 0` is now excluded from the legacy pass entirely, full stop — no more "solo, and already has a team" special case, it's unconditional.

**A coach's personal `teamName` label must never equal a real team's name — this WILL bite you again if it does.** If it does (e.g. after converting a legacy cluster into a real team without also renaming the coach's own personal label), any FUTURE stray/untagged swimmer that lands in a legacy grouping rooted at that coach will display with the exact same name as the real team — indistinguishable duplicate, all over again, even with the dedup fix above in place. This actually happened in production (2026-07-31): converting the legacy "Team Har-Shai" cluster into a real `teams/{id}` doc left the two coaches' personal labels still set to "Team Har-Shai," so a swimmer that briefly lacked a `teamIds` tag (see the next section) surfaced under a phantom "Team Har-Shai" a second time. Fixed by renaming both coaches' personal labels to something that can't collide (`"Liron (Owner)"`, `"Sharon"`) — keep this invariant whenever converting a legacy cluster into an explicit team.

### Clustering algorithm — `clusterMySwimmers(mySwimmers, myUid)`

Implemented identically in both apps (`swim_tracker.html` and `mobile/src/App.jsx`). Input: every swimmer doc the signed-in coach's uid appears on. Output: an array of clusters, `{key, teamId?, swimmers, coachUids}`.

1. **Explicit-team pass**: for every swimmer, for every id in its `teamIds`, put it in that team's cluster (`key: "team:"+teamId`).
2. **Legacy pass (union-find)**: a swimmer with ANY `teamIds` is skipped entirely (see above — an explicit team is always its one home). Otherwise, swimmers are unioned together if they share any coach **other than the signed-in coach's own uid** — using your own uid would trivially merge every swimmer you can see into one cluster, since by definition you're on all of them. Swimmers with **no other coach at all** ("solo," entirely yours) are unioned together into one combined default cluster, so each doesn't become its own singleton.
3. If clustering yields **only one cluster total**, nothing changes for the user — no gate, no picker, same single-roster experience as before teams existed.
4. If it yields **more than one**, cluster names are resolved (`nameClusters()` — fetches each explicit team's real name from `teams/{id}`, or the earliest-created legacy member's `teamName`/default) and a **forced picker** ("Which account?" on mobile, `#teamGate` overlay on desktop) shows at sign-in. The choice is remembered in `localStorage` (`swimtrack:teamKey`) so it doesn't re-ask next time, and is reachable afterward via **"Switch Account"** (desktop Settings) / the account-switcher (mobile TopBar + Settings).

### Renaming/deleting a team you didn't create — owner bypass

`firestore.rules` lets the app **owner** rename/delete ANY team (`isOwner()` OR-branch on both `teams/{id}` update and delete), not just its creator — but the Settings UI (`ActiveTeamNameEditor` mobile / `renderAccountCard`'s `canRenameTeam` desktop) originally only ever checked `team.createdBy === user.uid`, so even the owner couldn't manage a teammate-created team despite the backend already permitting it. Fixed (2026-07-31): both UIs now also show rename/delete when `isOwner(user)` is true, with copy that says "as the app owner" instead of "since you created it" when the signed-in user isn't the creator.

### Admin panel: "Team" vs "Shared roster" badge

Each row in the Admin Teams list gets a small badge next to its name — green **"Team"** if `team.teamId` is set (a real, nameable `teams/{id}` doc), gray **"Shared roster"** otherwise (an inferred legacy grouping, name borrowed from a personal `teamName` label). Added specifically so the naming-collision failure mode above is visually distinguishable at a glance instead of two identical-looking rows.

### Switching teams — what actually changes

Picking a cluster (`applyTeamChoice`) sets:
- `currentTeamId` — which explicit team (if any) a **newly-added** swimmer gets tagged into (`teamIds: arrayUnion(currentTeamId)`); `null` for a legacy cluster.
- The swimmer list shown — mobile just uses `cluster.swimmers` directly (always a fresh, complete re-fetch); desktop derives a `teamFilterIds` Set used to filter the cloud-swimmer query.
- **Desktop-specific gotcha, real bug found + fixed**: `teamFilterIds` is a snapshot taken at switch time. Saving NEW swimmers into the *currently active* team afterward (e.g. "💾 Save All Changes") didn't update that snapshot — so switching away and back would make `pruneAutoImportedSwimmers()` treat the just-saved swimmers as "not in this team" and silently drop them locally (they were still safe in Firestore, just hidden — looked identical to data loss to the user). Fixed with `refreshTeamFilterForCurrentTeam()`, called after every cloud save. If you ever touch `teamFilterIds`/`pruneAutoImportedSwimmers`, re-verify this exact switch → add-swimmer → save → switch-away → switch-back cycle (see `tests/scenarios/multi-team-membership.js`).

### Admin view — cross-coach, owner-only

`groupCoachesIntoTeams(coaches, swimmers)` (both apps) is the **admin-side twin** of `clusterMySwimmers` — same explicit-team-then-legacy-union-find shape, but over **every** coach/swimmer in the system (a query only the owner's rules allow), and grouping by each swimmer's **root coach** (whichever coachUid has the earliest `coaches/{uid}.createdAt`) rather than "my own uid," since there's no single "my uid" to exclude at admin scope. Deliberately NOT naive connected-components-via-any-shared-swimmer — that would incorrectly merge two genuinely unrelated rosters into one "team" the moment one coach happens to be a viewer on both. Powers the Admin tab's Teams list (now showing each team's real name, resolved via `nameClusters()`) and a **Performance Split table per team** (not one table mixing every coach's swimmers) — collapsed to just the team name + swimmer count by default, expandable.

### Onboarding a new coach / adding & removing a viewer

- **Owner-only invite code**: a plain `inviteCodes/{code}` doc (no `targetCoachUid`) — redeeming it self-registers a brand-new, independent, empty-roster coach.
- **"Add a Viewer"** (any coach, both apps' Settings): generates a "join my team" code (`targetCoachUid` + `swimmerIds` set to the generating coach's own current roster) — redeeming it grants the SAME access the generating coach has, restoring the old flat-allow-list "family sharing" behavior on top of the multi-coach model. Shows a live "Current Team" pill list of everyone who already has access (derived from `coachEmails` on the roster's swimmers).
- **"Remove a Viewer"** (added 2026-07-25): each "Current Team" pill has an inline "✕." Since only uids/emails are stored on swimmer docs (no ready-made email→uid map), removal first queries `coaches` `where(email==...)` to resolve the target uid, then `arrayRemove`s that uid/email off every swimmer in the current roster shared with them. Never touches the swimmer doc otherwise, never affects any other coach.
- **"Start Another Team"** (Settings): `createTeam()` writes a new `teams/{id}` doc and immediately switches into it (bypasses the picker — intent is unambiguous), so the very next "+ Add Swimmer" tags into the right team automatically.

### Renaming a team, and knowing which one you're on

Two genuinely different "name" concepts exist, and confusing them was a real live support question ("how do I change team name?") — the field labels were renamed 2026-07-31 to make the distinction explicit in the UI itself, not just in this doc:
- **`coaches/{uid}.teamName`** — a coach's own personal account label, labeled **"Your Account Label"** in Settings (`saveMyTeamName()`). Fixed regardless of which team/cluster is currently being viewed — explicitly NOT a team name (see the naming-collision warning above for why conflating these two breaks things).
- **`teams/{id}.name`** — an explicit team's own name (e.g. "עולם המים מאסטרס"), shown to everyone with access to it. Editable by its creator OR the app owner (see "owner bypass" above), via a **"This Team's Name"** field that only appears for them (`renameTeam(teamId, name)`, both apps) — `renderAccountCard()` (desktop) / `ActiveTeamNameEditor` (mobile).

**Desktop's `renderAccountCard()` resolves the active team via `window.currentTeamId`, never `activeCluster.teamId`** — `myTeamClusters` (and therefore `activeCluster = myTeamClusters.filter(c => c.key === selectedTeamKey)[0]`) is only ever populated when there's real cluster ambiguity (2+ options needing a picker); in the common single-cluster case it's `[]`, which would silently hide anything gated on `activeCluster` for the most common real-world scenario. `window.currentTeamId` is set correctly in both the single-cluster bypass path and the picker-selection path — prefer it any time you need "the team currently being viewed."

A small-font **topbar label** (`#topbarTeamName`, top-right of the desktop nav bar) shows which team/cluster is currently active — explicit team's own name if `window.currentTeamId` is set, else (for a legacy cluster) the currently-*selected* cluster's own resolved name (`activeCluster.name` — which can belong to a **different coach** than the signed-in one, e.g. viewing a teammate's roster), else this coach's own personal label as the final single-cluster fallback. **Real bug shipped and fixed same-day**: the first version used the coach's own label unconditionally instead of checking `activeCluster` first, so switching between two *legacy* clusters (e.g. "KFS" ↔ "Team Har-Shai") kept showing whichever cluster the signed-in coach's own label happened to belong to, never the other cluster's real name. Any future code needing "the name of the team/cluster currently being looked at" should follow this exact priority order: explicit team name → selected cluster's name (if ambiguous/multi-cluster) → own personal label (single-cluster fallback only).

---

### Desktop ↔ cloud (Analyze tab "☁ Cloud" bar)
- **☁ Load from cloud** — builds the global `D` from `swimmers/{activeId}.seasons` and renders via `finalize()`.
- **☁ Sync to cloud** — pushes the loaded `D` + profile to `swimmers/{activeId}`.
- File loads now **merge** into the current view; switching swimmers auto-resets; **✕ Clear** resets.
- The Firebase code is a `<script type="module">` at the bottom of `swim_tracker.html` importing the modular SDK from gstatic. Cloud load/clear are defined **in that module** (using `window.D` + the hoisted `window.finalize`) so they don't depend on the main script's execution order.

### Mobile app (`mobile/`)
- Vite + React 19 + recharts; Firebase Web SDK.
- `src/firebase.js` — init, Google auth (`signInWithPopup`), `fetchSwimmers`, `subscribeSwimmer` (live), profile CRUD, access-list read/write, `fetchRecords()`/`fetchRudolph()` (read-only; publishing is desktop-only).
- `src/analysis.js` — pure analysis builders ported from the desktop (`allResults`, `getStroke`, `competitions`, `scLc`, `insights`, `seasonRecap`, `strokeImprovement`, `pointsTrend`, `eventHeatmap`, `recordGap`/`bestInAgeGroup`/`recordsHeldBy` (Israeli records), `rudolphAgeBracket`/`rudolphScore`/`rudolphTrend` (Rudolph age-graded score), …).
- `src/theme.jsx` — light/dark palettes + context (`useUI`), persisted to `localStorage`.
- `src/App.jsx` — auth gate, swimmer picker, 6 tabs (Home, Meets, Progress, Records, Seasons, Settings). Progress tab shows Points Trend + Rudolph "Age Score" trend (50m only, hidden for swimmers over 20) with a "?" info modal. `AdminScreen` (owner-only, reachable via `TopBar`'s avatar menu) is a 7th, hidden full-screen state alongside these 6 tabs — not one of them, see "Admin Tab" above.
- Build/deploy: `cd mobile && npm run build` (a `prebuild` copies `../swim_tracker.html` → `public/extract.html`; Vite also copies `mobile/public/bm2.js` verbatim into `dist/`) then `firebase deploy`.

---

## Desktop single-file app

`swim_tracker.html` is a **zero-dependency, single-file** swimming analysis tool. No server, no build step. Open in any browser. Local state is stored in browser `localStorage` (key `sw_settings`); cloud sync is optional (sign in).

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Vanilla JavaScript (ES5-compatible) |
| Charting | Chart.js 4.4.1 (CDN) |
| PDF extraction | pdf.js 3.11.174 (CDN) |
| Styling | Custom CSS with CSS variables |
| Storage | browser `localStorage` key `sw_settings` |
| Build | None — edit the HTML file directly |

---

## File Structure

Single file: `swim_tracker.html` (~7800 lines — grown considerably since the original ~3000; still zero-build, still opens directly in a browser).

```
<head>
  <style>          ← All CSS
</head>
<body>
  #landingOverlay  ← One-time marketing/onboarding splash (desktop only)
  #pdfReportRoot   ← Hidden, off-screen; populated by buildPdfReport(), shown via @media print
  .topbar          ← Tab navigation + #topbarTeamName (active team/cluster label)
  #tc-extract      ← Tab: Extract Data (LogLig bookmarklet/paste-HTML)
  #tc-analyze      ← Tab: Analyze (①-⑫b, sub-grouped into Overview/Progress/Records pills)
  #tc-race         ← Tab: Race Curve
  #tc-team         ← Tab: Team (desktop-only per-coach roster view)
  #tc-settings     ← Tab: Settings (swimmer mgmt, Account card, viewers, teams)
  #tc-admin        ← Tab: Admin (owner-only — hidden for everyone else)
  <script>
    IIFE block     ← Swimmer management + settings (SWIMMERS, activeSwimmer)
    Global scope   ← All analysis functions, chart builders, data model,
                      cluster/team logic, PDF-report builders
    <script type="module">  ← Firebase (gstatic modular SDK) — cloud
                               load/sync/clear, auth, all Firestore reads/writes
  </script>
</body>
```

---

## Data Model

### Global `D` object (in-memory, built from loaded JSON)

```js
D = {
  '2024-2025': {
    results: [
      { event, pool, place, time, seconds, points, date, competition }
    ],
    bests: [
      { event, pool, time, seconds, points }
    ]
  },
  '2023-2024': { ... }
}
```

- `results` = every individual swim from competition history
- `bests` = season-best per event (from LogLig "Best Times" table)
- Key = season string e.g. `'2024-2025'`
- `pool` = raw string scraped from LogLig ('25', '50', or empty)

### Helper functions

```js
allResults()         // deduped results across all seasons
seasons()            // sorted season keys from D
poolNorm(raw)        // '25'|'50'|'' normalized
parseDate('DD/MM/YYYY')  // → timestamp
dateToSeason(ts)         // → '2024-2025' string
getStroke(eventName)     // → 'Free'|'Back'|'Breast'|'Fly'|'IM'
isRelay(eventName)       // → bool
```

---

## IIFE — Swimmer Management

Swimmer data and settings are wrapped in an IIFE to prevent scope leakage. Key internals exposed via `window.*`:

```js
window.getAllSwimmers()          // → SWIMMERS array
window.getActiveSwimmerData()   // → SWIMMERS[activeSwimmer]
window.getActiveSwimmerSids()   // → active swimmer's season ID array
window.addSwimmerSeason(i, type)
window.removeSwimmerSeason(i, sid)
window.addMeasurement(i, field)   // field = 'heights'|'weights'
window.removeMeasurement(i, field, j)
window.selectSwimmer(i)
window.showSwChart(divId, swimIdx, type)  // lazy chart init
```

### SWIMMERS schema

```js
[{
  name: 'Noga',
  id: '268117',           // loglig.com Player ID
  seasonIds: [1715, 1605, 1533, 1396, 1284, 1164],
  birthdate: 'DD/MM/YYYY',
  heights: [{ date: 'DD/MM/YYYY', value: 165 }],
  weights: [{ date: 'DD/MM/YYYY', value: 52.0 }]
}]
```

Persisted to `localStorage['sw_settings']` as JSON.

---

## Known Season IDs (loglig.com)

| Season | Season ID |
|--------|-----------|
| 2025–2026 | 1715 |
| 2024–2025 | 1605 |
| 2023–2024 | 1533 |
| 2022–2023 | 1396 |
| 2021–2022 | 1284 |
| 2020–2021 | 1164 |

---

## Data Extraction Mechanism

LogLig's swimmer season page (server-rendered, no client-side lazy loading) has 3 table groups, each `<table class="pld-table tablesorter...">`:
- **#personalbests** — headers מקצוע/אורך הבריכה/תוצאה/תאריך/שם תחרות (no points column) — not used by the app.
- **#seasonalbests** — same + מיקום במשחה + **ניקוד** (points) — this is the `bests` array (detected via the points column).
- **#results** — **one `<table>` per event**, each wrapped in `<div class="pld-card"><div class="pld-group-title">EVENT NAME</div>…`, headers תאריך/שם תחרות/**משחה**(event)/קטגוריה/אורך הבריכה/מקצה/מסלול/מיקום במקצה/מיקום במשחה/תוצאה/ניקוד — this is the `results` array (every individual swim). Detected by an event-name column ("משחה") + a competition-name column, with no points column.

Two independent parsing paths must be kept in sync by hand when LogLig's markup changes (confirmed the hard way in 2026-07 — see [[swimtrack-loglig-extraction]] in the assistant's memory / the git history around commit `4052872`):

### Manual Bookmarklet (primary method)

`bmLink2`'s `href` (set directly in the HTML) is a **tiny, permanent loader**:
```js
javascript:(function(){var s=document.createElement('script');s.src='https://swimtrack-e12c8.web.app/bm2.js?t='+Date.now();document.body.appendChild(s);})();
```
The actual extraction logic lives in `mobile/public/bm2.js` (deployed with `no-cache` headers via `firebase.json`, copied into `dist/` verbatim by Vite's public-dir handling). Clicking the bookmark always fetches and runs whatever is *currently* live — a LogLig markup fix ships via a normal `firebase deploy`; the bookmark itself never needs to be re-dragged again. (Before commit `3b86e57`, the entire script was baked into the bookmark's URL — a frozen snapshot from drag-time that no server-side fix could ever reach. Don't reintroduce that pattern.)

### Paste-HTML alternative

`extractFromHtml()` in `swim_tracker.html` (Extract tab → "Alternative: paste page HTML instead") does the same parsing via `DOMParser` on a copy of `document.documentElement.outerHTML` (grabbed via `copy(...)` in the browser console on the LogLig page, then pasted into a textarea). Useful for debugging without needing a working bookmark, and as the primary method if the bookmarklet ever breaks for a reason unrelated to the parsing logic itself.

### Dead code

`BM`/`copyBM1` (the old "Auto Extraction," multi-season, iframe-crawling console script) still exists in the source but isn't wired to any visible button — leave it alone unless specifically asked to revive or remove it.

---

## New-Swimmer Approval Modal (desktop only)

Loading a file for an unrecognized LogLig player ID — via the bookmarklet, paste-HTML, or the Extract tab's quick name+ID "+ Add" form — no longer silently auto-creates a swimmer. It opens a review modal (`#newSwimmerModal`) pre-filled with whatever's known, lets you edit any field, and only creates on explicit "Add Swimmer" (Cancel discards, creates nothing).

**Auto-fill, from the LogLig page itself:**
- **Name** — already scraped into the downloaded JSON's `_swimmerName` (`bm2.js`/`extractFromHtml`); previously captured but never read back out (real bug, fixed 2026-07-31) — new swimmers used to get a placeholder `"Swimmer <id>"` name.
- **Birth year → DOB** — LogLig shows a swimmer's birth year (not exact DOB) as a pill under their name ("שנת לידה 1980"), matched via a text-pattern regex against the raw page (`/שנת\s*לידה[^0-9]{0,12}(\d{4})/`) rather than a specific CSS selector — more resilient to LogLig markup changes, same reasoning as the results-table detection above. Defaults the new swimmer's DOB to **January 1** of that year (exact DOB isn't published).
- **Sex** — same pill row ("מגדר זכר"/"נקבה"), `/מגדר[^א-ת]{0,12}(זכר|נקבה)/`.
- Both `_birthYear`/`_sex` flow through `mergeRaw()` → `finalize()` the same way `_swimmerId`/`_swimmerName` already did, captured before the season-data "cleaning" pass strips them.

**Duplicate detection — `findExistingSwimmer(id, name)`, matches by ID *or* name.** If either matches an existing local swimmer, that swimmer is selected instead of a new one being created (fixes a real, previously-unchecked bug: the old manual "+ Add" form pushed straight into `SWIMMERS` with zero duplicate check at all).

**Two real bugs found live after this shipped, both worth remembering as a pattern — a new code path skipping the "normal" load flow must explicitly refresh every piece of state that flow used to refresh as a side effect:**
1. **New swimmer had no team.** `confirmNewSwimmerModal()`'s new-swimmer branch never stamped `teamIds` from `window.currentTeamId` — `addSettingsSwimmer` (a separate, older add-swimmer path in Settings) already did this correctly, the new modal just didn't match it. A swimmer added while a specific team was active landed with NO team at all, falling into a legacy grouping instead — this is what produced the "phantom Team Har-Shai duplicate" incident described in the Teams section above. Fixed: the modal now stamps `teamIds:[window.currentTeamId]` too.
2. **Stale sex/DOB in the Records tab's age-group comparison.** `window.__recProfile` (what `buildRecords` actually reads for sex/birthdate/recordName — NOT the swimmer's own `sw.sex`) is normally refreshed by `doLoadFromCloud` on every real swimmer switch. The modal deliberately calls `renderSwimmerBanner()`/`buildAll()` directly instead of going through `doLoadFromCloud` (to avoid an unwanted cloud fetch for data already in memory) — so `__recProfile` was never told about the new/newly-selected swimmer, and kept whatever the PREVIOUSLY viewed swimmer's sex was. Live-reported: viewing a female swimmer's Records tab, then confirming a new male swimmer via the modal, kept comparing him against women's age-group records, even though his `sex` field was correctly saved as "male" in Firestore. Fixed: both branches of `confirmNewSwimmerModal()` now explicitly set `window.__recProfile` themselves. Same bug class as the PDF-report "wrong swimmer" race documented in the assistant's memory (a stale global not refreshed by a new code path), different global.

`createdAt` is stamped once at creation (`Date.now()`, both `confirmNewSwimmerModal` and `addSettingsSwimmer`) and forwarded by `swimSaveProfile` ONLY when the local object already has one — an older swimmer re-saved after an edit never gets a fabricated "created now" timestamp. This is what powers the Admin "Swimmers Added Per Week" chart below; most pre-existing production swimmers predate this field and have no `createdAt` at all (that chart's note accounts for this rather than hiding it).

Mobile has no equivalent modal — LogLig extraction (and therefore auto-add-on-load) is desktop-only.

---

## Admin "Data Statistics" Panel

A collapsed section in the Admin tab/screen (both apps — `renderAdminDataStats()` desktop, `AdminDataStatsPanel` mobile React component), directly requested: swimmers added per week, male/female split, age distribution, and swimmers per team.

- **Swimmers Added Per Week** — bar chart, bucketed by Monday-start week (`_weekStartLabel`/`weekStartLabel`, identical logic in both apps) from `createdAt`. Only counts swimmers that HAVE a `createdAt` (see above); a note shows how many don't.
- **Male / Female Split** — pie chart, with **percentage shown in the legend text** (not in-slice labels — an earlier version tried in-slice Chart.js/Recharts labels; on mobile specifically, a screenshot taken too early caught the pie chart mid-mount-animation looking like a broken sliver, a timing artifact not a real bug, but the legend-text approach sidesteps the fragile in-slice rendering entirely and reads better on a narrow phone screen anyway).
- **Age Distribution** — bar chart with **single-year buckets for ages 9-18** (the range that matters swim-by-swim for this roster) and **5-year bands outside that range** (`<9`, then `19-23` … `49+`) — explicit ask, not a default choice; age computed via the same year-end convention as `_recAge`/`recordAge` (see "Age / Age-Group Logic" above), not `getAgeAt`.
- **Swimmers Per Team** — horizontal bar chart, reuses the already-named `teams` array from the Teams list above it, so "Team"/"Shared roster" badges stay consistent between the two.
- A "Best FINA Points Distribution" chart was tried and removed after live feedback ("doesn't matter for this aspect") — don't re-add it without being asked.

**Module-script gotcha (desktop only, worth knowing before adding a 6th chart here)**: this whole region of `swim_tracker.html` runs inside `<script type="module">` (needs the Firebase modular SDK imports) — unlike the classic-script Analyze-tab charts elsewhere in the file, a bare `var xChartInst` here is module-scoped, NOT auto-exposed on `window` the way `window.btChartInst` etc. are. Every chart instance here is assigned directly as `window.adminXChartInst` so both the destroy-before-recreate pattern and any test/debugging code that reads it can actually reach it.

---

## Analysis Functions

```
buildAll()               ← called after data load; calls all builders in order
buildCompetitions()      ← ① competition table with PB badges
buildTop5()              ← ② event progress charts
buildRecords()           ← ③ personal records — masters: age-bracket tabs; juniors: single table
buildSCLC()              ← ④ SC vs LC comparison
buildInsights()          ← ⑤ insight cards
buildBestTimes()         ← ⑥ best times chart (pool + stroke filter)
buildSeasonRecap()       ← ⑦ collapsible season cards
buildSeasonComp()        ← ⑦b season comparison table
buildStrokeBreakdown()   ← ⑧ improvement by stroke (2-season compare)
buildPointsTrend()       ← ⑨ points trend chart
buildRudolphTrend()      ← ⑩ Rudolph age score chart (long course only)
buildUsaStandards()      ← ⑪ USA Age Group Standards radar charts (juniors 10-18)
buildMastersWr()         ← ⑫ Distance to World Record (masters, age>30)
buildIntlRankings()      ← ⑫b Masters Top-10 International Rankings (World/Europe)
renderSwimmerBanner()    ← swimmer identity card at top of Analyze tab
buildPdfReport()         ← NOT part of buildAll() — built on-demand by openPdfReport(),
                            reads the same window.D/getActiveSwimmerData() the sections above do
```

**Analyze tab sub-navigation:** the sections above are grouped into 3 pill sub-tabs — Overview (①⑤), Progress & Trends (②⑥⑨⑩), Records & Comparisons (③④⑦⑦b⑧⑪⑫⑫b) — via `.an-grp[data-grp]` wrapper divs and `setAnalyzeGroup(g)` (toggles `display` + fires a resize event so Chart.js re-sizes canvases that were built while hidden). All builders still run unconditionally in `buildAll()` regardless of which group is currently visible — switching groups is pure visibility, not lazy building.

---

## PB Badge Logic

```js
computePBTimeline()
// Sorts all results chronologically, tracks best per event×pool key,
// returns a Set of strings: `event|pool|date|seconds`
// buildCompetitions() checks each row's key against this Set → gold border + "PB" chip
```

**Known limitation:** the eventList passed to the competition table has `{event, pool, time, points}` but not `seconds`, so PB key matching is unreliable until seconds is added to that pipeline.

---

## Chart Patterns

All charts use **lazy initialization** — built only when the container is visible:

```js
// Settings physical charts
window.showSwChart(divId, swimIdx, type)
// Called from button onclick via data-* attributes (avoids quote escaping):
// data-div="swcp-heights-0" data-idx="0" data-tp="h"
// onclick="showSwChart(this.dataset.div,+this.dataset.idx,this.dataset.tp)"
```

Chart instances are cached in `_swCharts[swimIdx+'-'+type]` — clicking "Show" again hides the div, clicking again reuses the instance.

---

## CSS Architecture

CSS variables defined in `:root`:
```css
--blue: #185FA5       --blue-dark: #0f3d72    --blue-light: #e8f1fb
--green: #1a9e6f      --green-light: #e8f7f1
--orange: #d97706     --red: #dc2626
--gray-50 … --gray-900 (standard scale)
--radius: 12px        --shadow-sm / --shadow / --shadow-lg
```

Key class patterns:
- `.metric` — KPI chip with `.hi` (blue) and `.green` modifiers
- `.ev-btn` + `.active` — pill-style filter toggle buttons
- `.insight` + `.green/.blue/.orange/.red` — left-border gradient card
- `.tbl-card` — rounded table container
- `.section-title` — blue accent bar + uppercase label

---

## Stroke Color Mapping

```js
STROKE_COLORS = {
  Free:   '#185FA5',  // blue
  Back:   '#1D9E75',  // green
  Breast: '#EF9F27',  // orange
  Fly:    '#e05252',  // red
  IM:     '#9b7bc4'   // purple
}
```

`getStroke(eventName)` uses Hebrew + English regex to classify. Tested against loglig.com event name strings.

---

## Age / Age-Group Logic

**Two genuinely different conventions exist — do not conflate them:**

```js
getAgeAt(birthdate, atDate)       // precise fractional age on a literal date
_recAge(bd, ts) / recordAge(bd, ts)  // "age group": calendar YEAR of ts minus birth year
```

- **`getAgeAt`** — "how old is this swimmer right now / on this exact day." Correct for: swimmer banner's current age, the Competitions table's per-meet Age column, the adult (>20) cutoff that hides the Rudolph section.
- **`recordAge`/`_recAge`** — "which age-group table/record applies to this result." Correct for: Israeli age-group records ([[records]]/`buildRecords`), Rudolph age-graded scoring (`buildRudolphTrend`), and season-level age labels (Season Recap header — uses the season's *end* year: `parseInt(season.split('-')[1])`, not the literal meet date's year).

**Why this distinction matters (learned the hard way, twice, same day):** a swimmer already competes in — and LogLig itself categorizes results under — next year's age group before their exact birthday arrives. Using `getAgeAt` (precise age) for "which age-group table applies" picks the wrong, too-lenient younger bracket. Confirmed with real data: Gal's 2:58.12 in 200 IM scored >10 Rudolph points using his exact age (10) instead of ~6.9 using his age group (11, matching LogLig's own "בנים 11" category for that meet). If you're computing "the age that applies to swimmer X for event/season/meet Y," default to the `recordAge` convention unless you've specifically verified `getAgeAt` is what's wanted.

```js
ageGroupLabel(age)  // 'U12'|'Age 12–15'|'Cadet (16-17)'|'Junior (18-19)'|'Senior (20+)'
```

Used in: swimmer banner, competition table Age column, season recap header.

---

## Israeli Age-Group Records (`config/records`)

Published from the desktop Extract tab (③ Israeli Age Records) after uploading the official PDFs from **isr.org.il/records.asp** (juniors + masters, long + short course — 4 separate PDFs, any subset can be uploaded). Parsed entirely client-side (pdf.js text-item extraction, grouped by row/column position), diffed against the current `config/records` doc, then published via a manual "☁ Upload changes to Cloud" button (owner-only, enforced by `firestore.rules`).

`buildRecords()` shows, per pool (25m/50m), the swimmer's **all-time personal best** vs. their **current** age-group record, using `_recAge()`/`_recCat()`/`_recKey()` (dist+stroke → key) — same helpers reused by the Rudolph feature below.

**Gap comparison uses the lifetime PB, not a same-bracket swim (fixed 2026-07-25, real bug).** An earlier version required the comparison swim to have literally happened while the swimmer was AT that exact age bracket (`_bestInGroup`) — so a swimmer who'd just aged into a new bracket with no meet yet at that age showed "no in-group swim" for every single event, even though their existing PB (set at a younger age) might already beat the record. `_gapCells`/`buildRecords` (mobile: `RecordsTab`) now always compares the swimmer's all-time best to the record for their CURRENT age group, full stop. This "must be swum while in that exact bracket" restriction is still correct and unchanged for the *other* age-graded features below (Rudolph, USA Standards, Masters WR gap) — it was specific to Personal Records.

---

## Rudolph Age-Graded Scoring (`config/rudolph`)

Dr. Klaus Rudolph's German age-graded points table — a swim time maps to **1-20 points**, calibrated separately per sex × age (8 through 18, plus "offen"/open) × event, **long course (50m) only** (25m times are systematically faster — more turns — and would score inflated against a 50m-only table; both apps hard-filter to 50m).

Published from the desktop Extract tab (④ Rudolph Age-Score Table) after uploading the official PDF (source: see the link in that panel — a new "Basis" year gets re-uploaded the same way). Parsed client-side via a row-clustering trick: the PDF renders each row's points-label (leftmost/rightmost column) on a baseline ~1px off from the row's time values, so rows are grouped by y-coordinate with a ~3-unit tolerance (real distinct rows are ~12-13 units apart, so this never merges two different point-rows).

```js
_rudBracket(age)                          // → "8".."18"|"offen"|null (age<8)
_rudScore(table, sex, age, event, seconds) // interpolates/extrapolates the 20-row curve
buildRudolphTrend()                       // ⑩ chart; mirrors buildPointsTrend()'s Chart.js pattern
```

Age used for scoring is the **age group** (`_recAge`/`recordAge` convention — calendar year of the swim minus birth year), not the swimmer's precise age-in-years on that day — see "Age / Age-Group Logic" above for why. `window.__rudolphTable` caches the published table (set in `refreshRudolphStatus()`, mirroring `window.__records`); the whole "⑩ Age Score (Rudolph)" section hides itself for swimmers whose *current* real age (`getAgeAt`, no date arg) is over 20.

Mobile equivalent: `mobile/src/analysis.js`'s `rudolphAgeBracket()`/`rudolphScore()`/`rudolphTrend()`, rendered by `RudolphTrend` in `mobile/src/App.jsx` (Progress tab, below Points Trend).

---

## USA Motivational Standards (`config/usaStandards`)

USA Swimming's official age-group time standards (B/BB/A/AA/AAA/AAAA tiers), juniors only (ages 10-18). Published from the desktop Admin tab after uploading the official single-age PDF; parser translates raw stroke abbreviations (FR/BK/BR/FL) to the app's internal full names (Free/Back/Breast/Fly) via a `STROKE_MAP` — a mismatch here was a real bug once (lookup expects full names, PDF gives abbreviations).

Uses **current age + best-ever time** (the Personal-Records convention), unlike Rudolph/Israeli-records' age-group convention — deliberately different, since USA Standards tiers a swimmer's *current* standing, not a historical swim's category. Two radar charts (short 50-100 / long 200+ distance) per swimmer, `_usaTier()`/`USA_TIERS`. Hidden outside ages 10-18. Mobile: same tiering logic in `analysis.js`, used both in the Records tab and in Performance Split's color-coded column.

---

## Masters World Records (`config/mastersRecords`)

World Aquatics' official masters world records (5-year age brackets, 25+), SCM + LCM separately. Published from the desktop Admin tab (two upload slots). `table[course][sex][ageGroup][eventKey] = {seconds, athlete, ...}`.

Powers "Distance to World Record" on the Records tab (⑫) — a sorted bar chart of % slower than the WR for the swimmer's current 5-year bracket (`_wrAgeGroup(age)` — bucket math, not literal age), gated to age > `MASTERS_REPORT_AGE` (30). Same table also backs the Personal Records masters-tabs redesign below and the PDF Summary report's masters branch.

---

## Masters Top-10 International Rankings (`config/mastersTop10`)

"How many times has this masters swimmer placed in the World or European Aquatics Top-10?" — Admin-tab upload/parse/diff/publish (desktop only), read-only display on both apps' Records tab.

**Two independent PDF parsers, both client-side (pdf.js), because the two federations' PDFs are laid out completely differently:**
- **World Aquatics** — two eras, auto-detected with a fallback: the 2024+ format is a single column with explicit "N." rank tokens and each event self-declaring its course (LC/SC). The pre-2024 FINA-era format (2021-2023) has **no rank token at all** (rank = row position), tokenizes "MEN"/"WOMEN" headers as separate single-character items, and has a relay section that must be skipped. The app tries the 2024+ parser first and falls back to the old-format parser automatically if it finds nothing — the UI never asks which era a file is.
- **European Aquatics** — a genuine 3-column flowing layout (three side-by-side mini-tables per page, NOT synchronized to start a new event together), parsed by bucketing each text item by x-position (`x<190→col0, 190≤x<390→col1, x≥390→col2`) and tracking parse state independently per column. Comma-decimal times (`"0:29,27"`). Some rows have a redacted/missing name (GDPR) — dropped, never guessed from a stray leftover token.

**Publish scoping** (`swimPublishMastersTop10(entries, year, source)`): replace-on-publish is keyed by `(year, source, course)` — derived from the actual courses present in the entries being published — not just `(year, source)`. This was a real bug once (publishing a year's SCM file after its LCM file was already published silently deleted the LCM entries); the fix transparently protects both World and Europe since they share this one publish function.

### Matching a swimmer to their published entries — `intlName` + fuzzy matching

A swimmer's Settings `intlName` field (their name as it appears in these rankings, e.g. "Liron Har-Shai") is matched against published entries via `_namesMatchFuzzy`/`namesMatchFuzzy` (both apps): **word-order-agnostic** (sort each name's words alphabetically before comparing — the #1 real variation is family-name/first-name order swapped) + Levenshtein-tolerant of minor spelling differences, threshold **0.85** (this is a same-script Latin-to-Latin comparison — real matches for the same person cluster near-exact, so a high bar cleanly separates signal from noise). This fixed a real bug where a swimmer published under several genuinely different spellings across federations/years ("HARSHAY Liron" vs "LIRON HARSHAY" vs "Liron Har-Shai") only ever matched one of them.

**Display** (Records tab, both apps): one row per YEAR, World/Europe columns, each cell condensing that year's entries onto one line — medal emoji (🥇🥈🥉) for top-3, "#N" otherwise, shortened event names, course shown in brackets (e.g. "🥇 400 IM (SCM)"). Desktop wraps each entry as its own `white-space:nowrap` "chip" inside a `white-space:normal` container (the global `.tbl-card td{white-space:nowrap}` rule otherwise forces a swimmer with many entries into one giant unbroken line, pushing the whole card into horizontal scroll — chips let the cell grow taller instead of the table growing wider). Section sits right after "Distance to World Record" (⑫→⑫b), since both are elite-comparison sections.

---

## Name-Match Suggestion Chips (Settings → "Name in Records" / "Name in Int'l Rankings")

Both `recordName` (Hebrew, matched against `config/records`) and `intlName` (Latin, matched against `config/mastersTop10`) used to require typing the exact published spelling blind. Now a swimmer's own Hebrew name is fuzzy-matched against whatever's already published and shown as click-to-fill suggestion chips (`suggestNameMatches()`, both apps) — word-order-agnostic (family-name/first-name swap) in both cases.

**Two deliberately different confidence thresholds** — do not assume one threshold works for both modes:
- **Hebrew→Hebrew** (`recordName` candidates, same script): **0.85**. Real matches for the same person cluster near 100%, so a high bar cleanly separates signal from common-first-name noise (validated against real data: a shared-first-name false positive scored 70%, eliminated at 0.85).
- **Hebrew→Latin** (`intlName` candidates, cross-script — compares a rough phonetic transliteration guess `_hebToLatinGuess()` against the real Latin spelling): **0.45**. Even correct matches only reach ~55-66% here, and below that true/false positives overlap, so this lower bar was chosen specifically to avoid ever suggesting a WRONG match, at the cost of missing a few genuine low scorers (those still need manual entry).

---

## Personal Records — Masters Age-Bracket Tabs

For **masters swimmers** (5-year brackets, 25+) — juniors are explicitly unchanged (single age-appropriate bracket table, per direct user request: "the change should be only for masters"). Real bug this fixed: a masters swimmer's lifetime PB (set at whatever age) was being shown next to an unrelated, *different* age bracket's record (e.g. a 40-44 PB shown beside the 45-49 record) — confusing and not actually comparable.

**Redesign**: one age-bracket TAB per bracket the swimmer has actually competed in (defaults to their current bracket) — matches the existing Masters WR gap-chart selector pattern (`wrGapAgeSelector`/`.ev-selector`/`.ev-btn`) on both desktop and mobile (desktop was previously one-column-per-bracket; changed to tabs specifically to match mobile's necessarily-narrower design, per direct feedback: "i prefer that the desktop will look more like the mobile"). Each cell = the swimmer's PB **swum within that bracket** (`_lookupRecByCat`/`lookupRecordByCat`) + the record for that bracket: gold background + the swimmer's own name if they hold it, otherwise the real holder's name **and time**, with the gap in seconds in parentheses (e.g. "קוסטק אריק · 2:25.00 (+4.05s)") — never just a bare name with no way to gauge the actual gap. Pool cards (25m/50m) are explicitly labeled with their course (SCM/LCM) — applies to both masters and junior swimmers, since pool identity wasn't visually obvious before for either.

---

## Desktop PDF Summary Report

"📄 PDF Summary" button in the swimmer banner → `openPdfReport()` → `buildPdfReport()` (populates a hidden `#pdfReportRoot`, positioned off-screen via `position:fixed;left:-10000px` — **not** `display:none`, which would give its `<canvas>` charts zero computed layout size and make them render blank) → `window.print()`. `@media print` hides everything else and gives each `.rpt-page` `page-break-after:always`, so "Save as PDF" from the print dialog produces a clean multi-page report with no extra library.

**Always exactly 2 pages**: an event page (all 4 "Progress in Main Events" cards, reusing `makeEvChart()`/`makeEvTable()` — the same functions behind the live "① Progress in Key Events" section, deliberately unmodified so the PDF always matches what's on screen) + a summary page (Top-10 Best/Most-Improved tables, a stroke radar, a season event-coverage heat map, callouts). This was tried once as a straight "cram 4 cards on page 1" port and had to be reworked: a busy swimmer's per-event **results table** is unbounded (one row per meet that season), and could make a card too tall to fit a physical page, spilling a near-empty extra page. Fixed by capping each card's table to a fixed row count (`EVENT_TABLE_MAX_ROWS`, `makeEvTable(results, maxRows)` — the optional 2nd param is PDF-report-only, the live Analyze tab's own calls don't pass it and are unaffected) with a "+N more this season" note when truncated, instead of letting page count grow with data volume.

Masters swimmers (age > `MASTERS_REPORT_AGE`, 30) get a % gap-to-World-Record column instead of Rudolph/USA Standard, since neither of those is calibrated past ~20/18. Chart.js instances here have `animation:false` and the print/screenshot must wait for layout — the general rule for any chart that needs to appear correctly in a non-interactive single-shot capture.

---

## Team Tab (desktop-only per-coach view)

A per-coach roster view (`#tc-team`) with highlight cards (`_teamHighlights(roster)`) computed from `_teamSeasonRecap(D)` per swimmer: Most Improved, Top Points Swim, Busiest Competitor, and — added 2026-07-31, directly requested — **"May need attention"**: a swimmer who swims an event often (**>5 times in the latest season**, the threshold specified verbatim by the user) with **zero improvement** between their first and best time that season (`stagnantEv`/`stagnantPct`/`stagnantCount` in `_teamSeasonRecap`, same `firstIn[k]`/`bestIn[k]` per-event data already computed for Most Improved, plus a new per-event `countIn[k]` tally). Picks the single worst (most negative/least-improved) qualifying event across the whole roster, same one-highlight-card convention as the other three. Rendered as a red `⚠️ May need attention: <name>` card — an early-warning signal (possible stroke/technique or growth-related issue) that "most improved" alone can't surface. Mobile has no Team tab (see the 2026-07-19 nav-capacity note below).

---

## Admin Tab (owner-only)

Cross-coach view, gated by `isOwner()` in rules and an `owner` check in the UI. **Desktop**: a dedicated top-nav tab, hidden for non-owners. **Mobile**: moved (2026-07-31, directly requested) out of the Settings tab into its own hidden, full-screen `AdminScreen` — reachable only via a "🔑 Admin" item in `TopBar`'s avatar dropdown menu (below "Switch account"), owner-gated, with a back arrow to return; deliberately NOT a 7th bottom-nav icon (mobile's nav was already at its intentional 6-icon cap — see the 2026-07-19 UI-decisions note this doc originally shipped with). `#topbarAvatarBtn`/`#topbarMenuAdmin` are the stable test-hook ids for this flow.

Sections, top to bottom: Stats (teams/swimmers/open-invite-code KPIs), Coaches list, **Data Statistics** (collapsed — see its own section above), Performance Split (one table **per team**, not one combined table — `groupCoachesIntoTeams()`), Least Recently Synced, **Invite a Coach** (generate a code) sitting immediately next to **Invite Codes** (the list of all codes ever generated, open vs. redeemed) — these two were split apart by Performance Split/Least-Recently-Synced in an earlier layout and moved together since they're the same feature end-to-end, then (desktop only) the four reference-table upload/publish panels (Israeli Records ③, Rudolph ④, USA Standards ⑤, Masters World Records ⑥, Masters Top-10 Rankings ⑦) — owner-only "upload once in a while" tools, deliberately kept out of the everyday Extract-tab workflow.

---

## Landing Page

A one-time (per-browser) marketing/onboarding overlay (`#landingOverlay`, desktop), dismissed via "Sign in with Google" or "Continue without an account" — desktop still works fully offline, so this is a splash in front of the tool, not a hard gate (`localStorage.sw_landing_dismissed`). Mobile already requires sign-in, so it just extends the existing `SignIn` component with the same feature list above the Google button, no separate overlay needed.

---

## localStorage Migration

On load, `loadSettings()` runs forward-migration:
```js
if (typeof sw.height === 'string') delete sw.height;   // v1 → v2
if (!Array.isArray(sw.heights)) sw.heights = [];
if (!Array.isArray(sw.weights)) sw.weights = [];
if (!Array.isArray(sw.seasonIds)) sw.seasonIds = [];
if (sw.birthdate === undefined) sw.birthdate = '';
```

---

## Global Constants — Declaration Order

The following globals MUST be defined before `buildAll()` can run. They are declared **twice** intentionally:

1. **Early declaration** — right after `var D=null;` at the top of Script 1, so they are always assigned during top-level script execution
2. **Original declaration** — at their natural position further down in the source, as a self-documenting anchor (grep the var name rather than trusting a line number — the file has grown substantially and this drifts)
3. **Safety net** — `buildAll()` re-initializes all five if still falsy, guarding against any call-before-init edge case

```js
var COLORS = ['#185FA5','#EF9F27', ...];          // 9 chart colors, cycle with ci%COLORS.length
var STROKE_COLORS = {Free,Back,Breast,Fly,IM};     // keyed by getStroke() return value
var top5Active = new Set();                         // which events are toggled on in ② chart
var top5Charts = {};                                // Chart.js instances keyed by canvasId
var ENG_MONTHS = ['Jan','Feb',...,'Dec'];           // used by fmtDateShort()
```

**Why this matters:** if `buildAll()` is ever called before Script 1 has finished top-level execution (e.g. a FileReader `onload` firing early), these vars would be `undefined` and every chart function would throw.

---

## Common Gotchas

| Issue | Root cause | Fix |
|-------|-----------|-----|
| Charts not showing in Settings | SWIMMERS is IIFE-scoped; `buildSwimmerPhysCharts` can't access it from global scope | Use `window.getAllSwimmers()` |
| JS syntax errors after edits | Extra `}` left from replaced functions | Run `node --check extracted.js` after every change |
| Onclick string escaping | Complex nested quotes break | Use `data-*` HTML attributes + `this.dataset.*` in onclick |
| File corruption after Python edits | `bytes.replace(b'', new_bytes, 1)` prepends to start of file | Always locate the `<!DOCTYPE` offset and slice from there |
| PB badges never show | `eventList` rows lack `.seconds` field; key never matches | Add `seconds` to the eventList pipeline |
| `COLORS`/`STROKE_COLORS` undefined in buildAll | These `var` assignments sit at their natural position further down in the source; if called early they're `undefined` | Declared early + safety net in `buildAll()` — do not remove either |
| Charts blank after tab switch | Chart.js doesn't re-render inside hidden containers | `switchTab('analyze')` and `buildAll()` both fire `window.dispatchEvent(new Event('resize'))` |
| Charts blank after switching Analyze sub-tab (Overview/Progress/Records) | Same root cause, one level deeper — charts in a non-default `.an-grp` are built while `display:none` | `setAnalyzeGroup()` also fires `window.dispatchEvent(new Event('resize'))` after toggling visibility — don't remove it when adding new sections |
| New `.an-grp` section stays visible in every sub-tab | Forgot `style="display:none"` on a non-default group's wrapper div (only the *first* mention of a `data-grp` needs to start visible if it's the default "overview" group) | Every `.an-grp[data-grp]` div except the ones meant to show by default must have `style="display:none"` in the HTML itself — `setAnalyzeGroup()` only toggles on click, it doesn't set the initial state |
| LogLig extraction suddenly returns empty `results` | LogLig changed the season page's table markup (happened 2026-07); `bests` keeps working since it's a different table | Get the raw page HTML (`copy(document.documentElement.outerHTML)` in console, not the app's JSON output) and compare against the current parsing logic in `mobile/public/bm2.js` + `extractFromHtml()` — both must be fixed, they're independent copies |
| "Current team" logic silently no-ops for the common case | `myTeamClusters`/`activeCluster` are only populated when there's real cluster ambiguity (2+ clusters) — `[]` in the (most common) single-cluster case | Use `window.currentTeamId`/the `currentTeamId` prop instead of deriving from `myTeamClusters` — it's set correctly in both the bypass path and the picker-selection path |
| A per-swimmer table/card grows unboundedly and can overflow a printed page | A results table with one row per meet has no natural cap | Cap visible rows with an explicit `maxRows` param + a "+N more" note (see `makeEvTable`/PDF Summary report) rather than trusting real data will "usually" be small |
| Long comma-joined table cell forces the whole table into horizontal scroll | Global `.tbl-card td{white-space:nowrap}` rule (fine for short cells) fights a long list | Wrap each list entry as its own `white-space:nowrap` "chip" inside a `white-space:normal` container — the cell grows taller instead of the table growing wider |
| New `config/*` reference doc reads/writes fail with "insufficient permissions" | Forgot to add the new doc name to `firestore.rules`' `isMember()`-gated list — the generic pattern isn't automatic | Grep `firestore.rules` for the sibling `config/*` docs (records/rudolph/usaStandards/mastersRecords/mastersTop10) and add the new one alongside them |
| A new swimmer/team-clustering code path silently produces wrong data (no team, stale sex/age comparisons) | A new "create/select swimmer" flow that bypasses the normal load path (`doLoadFromCloud`, `finalize()`) must explicitly redo everything that path used to do as a side effect — `window.currentTeamId` tagging, `window.__recProfile` refresh, etc. — nothing does it for you automatically | Grep every OTHER place a swimmer gets created/selected (`addSettingsSwimmer`, `doLoadFromCloud`) and mirror what it sets, don't assume "select the swimmer" alone is enough |
| A `Chart.js`/Recharts instance is `undefined` when read from a test or another function | Desktop: this code runs inside `<script type="module">` (Firebase imports) — a bare `var xChartInst` there is module-scoped, not auto-exposed on `window` the way classic-script chart vars are | Assign chart instances directly as `window.xChartInst`, not a bare module-level `var`, inside any module-script code |
| A chart/pie renders as a broken sliver or is missing in a screenshot | Caught mid-mount-animation (Chart.js/Recharts both animate in by default) — a timing artifact of the capture, not a real render bug | Wait longer (1-2s) before screenshotting, or re-check after the fact — don't assume a mid-animation frame is the final state |
| A coach's personal `teamName` label matches a real team's name | Coincidental (or left over from converting a legacy cluster into an explicit team without also renaming the personal label) — any untagged swimmer landing in that coach's legacy grouping will display as an indistinguishable duplicate of the real team | Keep personal account labels distinct from every real team name; if converting a legacy cluster into a team, rename the personal label(s) too, don't just create the `teams/{id}` doc |

---

## Testing

`tests/` (repo root) — a headless Playwright suite driving the REAL `swim_tracker.html`/mobile app in a browser, with only the Firebase CDN modules/imports swapped for in-memory mocks (`tests/mocks/`, `tests/mobile-mocks/`) — real clicks/fills/saves against the shipped UI, not unit tests against extracted logic.

- **Run it**: `cd tests && npm install && node run-all.js` (or `npm test`). Prints a step-by-step ✓/✗ report per scenario plus a final PASS/FAIL table; exits 0/1.
- **60 scenarios** as of this writing, in `tests/scenarios/` (desktop + `mobile-*` twins covering the same behavior on each app where applicable).
- **Standing rule**: every new feature or bug fix ships with a corresponding scenario — not an afterthought, part of "done." Prefer `button:has-text("X")` over bare `text=X` for anything clickable (bare text can match unrelated prose elsewhere on the page and silently no-op a click).
- **CI**: `.github/workflows/tests.yml` runs the full suite on every push/PR to `master`.
- **A `seed()` function passed to `openDesktopApp`/`openMobileApp` is serialized via `.toString()` and re-parsed standalone in the browser page — it CANNOT see outer Node.js closures.** A shared helper function referenced from inside `seed()` (e.g. a `evt()` row-builder, or a `seedShared()` wrapper factored out across two calls) fails silently inside the page (`"X is not defined"`, swallowed — not a page crash), leaving `window.__mockStore` only partially seeded, which then produces confusing downstream test failures that look unrelated to the real cause. Always inline seed data fully inside each `seed()` function; never factor it into a function defined outside it.

---

## How to Extend

**Add a new analysis section:**
1. Add HTML container in `#tc-analyze`, wrapped in `<div class="an-grp" data-grp="overview|progress|records">` matching whichever sub-tab it belongs to (add `style="display:none"` unless it's going in the default-visible "overview" group)
2. Write `buildXxx()` function
3. Call it from `buildAll()`
4. Add a section-title div with the next ⑪ emoji number

**Add a new swimmer field:**
1. Add to `DEFAULT_SWIMMERS` schema
2. Add migration in `loadSettings()`
3. Add input in `renderSettingsUI()` inside the IIFE
4. Call `saveSettings()` on change

**Add a new known season:**
1. Update `KNOWN` map in `renderSettingsUI()`:  
   `var KNOWN = {1715:'2025-2026', 1605:'2024-2025', ...}`

**Add a new "external reference table" feature (records/Rudolph/USA-Standards/Masters-WR/Masters-Top10 style)** — the established, repeated pattern for "parse an official PDF, publish to the cloud, show a gap/comparison on the Records tab":
1. Write a client-side pdf.js parser (desktop only) grouping text items by row/column position; add an Admin-tab upload slot + diff-review + owner-only publish button.
2. Add the new doc to the Firestore schema comment block above AND to `firestore.rules`' `isMember()`-gated read list (easy to forget — see the Common Gotchas entry above; every prior instance of this feature type has had this exact bug at least once).
3. Add a read-only fetch in both apps (mobile never publishes, only reads).
4. Add the Records-tab display + gap/comparison logic to both apps, reusing the existing age/age-group helpers (`_recAge`/`recordAge`, `_wrAgeGroup`, etc.) rather than inventing new age math.
5. Write a `tests/scenarios/*.js` (+ mobile twin if mobile has its own display logic) using a real downloaded PDF fixture in `tests/fixtures/` if the parser itself needs coverage, or seeded mock data if only the display logic does.
6. Update this doc + the assistant's memory.
