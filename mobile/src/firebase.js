import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

// ── Firebase config (project: swimtrack-e12c8) ──────────────────────
// API keys are safe to ship in the client — Firestore rules are the
// real security boundary (see firestore.rules: email allow-list).
export const firebaseConfig = {
  apiKey: "AIzaSyBhwDdRv0hJ-QncJzp1U6iIb7HBt9heF9Y",
  authDomain: "swimtrack-e12c8.firebaseapp.com",
  projectId: "swimtrack-e12c8",
  storageBucket: "swimtrack-e12c8.firebasestorage.app",
  messagingSenderId: "588538376714",
  appId: "1:588538376714:web:ade1154ba499f5966365f3",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ── Auth ────────────────────────────────────────────────────────────
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export function signOut() {
  return fbSignOut(auth);
}

// ── Swimmers ────────────────────────────────────────────────────────
// Data model: one document per swimmer, keyed by LogLig player ID.
//
//   swimmers/{playerId} = {
//     name, id, birthdate,
//     heights: [{date, value}], weights: [{date, value}], seasonIds: [...],
//     seasons: { "2024-2025": { seasonId, bests:[], results:[] }, ... },
//     updatedAt: <ms>
//   }

// One-time fetch of the swimmer list (id + name) for the picker. Always
// scoped to this account's own roster — even for the owner. Cross-coach
// visibility (e.g. a future admin stats panel) is a deliberate, separate
// action, never the default day-to-day list, so one coach's newly-added
// swimmers never bleed into another's picker.
export async function fetchSwimmers(user) {
  const q = query(collection(db, "swimmers"), where("coachUids", "array-contains", user.uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Swimmers in an explicit team, independent of coachUids — used to
// supplement fetchSwimmers() with swimmers a coach can no longer see via
// the coachUids-gated query alone (e.g. right after their own uid was
// removed from a swimmer's coachUids by "Remove" on an unrelated legacy
// cluster) but who still belong to a team this same coach created. See
// loadSwimmers() in App.jsx for why this matters.
export async function fetchSwimmersByTeam(teamId) {
  const q = query(collection(db, "swimmers"), where("teamIds", "array-contains", teamId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Live subscription to a single swimmer document.
export function subscribeSwimmer(swimmerId, callback) {
  return onSnapshot(
    doc(db, "swimmers", swimmerId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    // Previously only logged — the caller's state was left however it was,
    // which (combined with nothing clearing it on swimmerId change either)
    // could mean a stale, PREVIOUS swimmer's data stays on screen forever
    // if the new subscription is denied/fails. Explicitly clear it instead.
    (err) => { console.error("Swimmer listener error:", err); callback(null); }
  );
}

// ── Access list (config/access.emails) ──────────────────────────────
// Owners (see firestore.rules ownerEmails) can edit this from Settings.
// Keep this list in sync with ownerEmails() in firestore.rules.
export const OWNER_EMAILS = ["lhershey@gmail.com"];

export function isOwner(user) {
  return !!user && OWNER_EMAILS.includes((user.email || "").toLowerCase());
}

export async function getAccessList() {
  const snap = await getDoc(doc(db, "config", "access"));
  return snap.exists() ? snap.data().emails || [] : [];
}

// ── Israeli age records (config/records) ─────────────────────────────
// Published from the desktop app (~yearly). Shape:
//   { records: { "50"|"25": { "M"|"F": { cat: { "dist|stroke": {sec,time,name,date} } } } },
//     count, loadedAt: <ms>, by }
export async function fetchRecords() {
  const snap = await getDoc(doc(db, "config", "records"));
  return snap.exists() ? snap.data() : null;
}

// ── Rudolph age-graded points table (config/rudolph) ────────────────
// Published from the desktop app after uploading the official Rudolph PDF.
// Shape: { table: { "F"|"M": { "8".."18"|"offen": { "dist|stroke": [{pts,sec}, …20] } } },
//          count, loadedAt, by }
export async function fetchRudolph() {
  const snap = await getDoc(doc(db, "config", "rudolph"));
  return snap.exists() ? snap.data() : null;
}

// ── USA Motivational Standards, junior ages 10-18 (config/usaStandards) ──
// Published from the desktop app after uploading USA Swimming's single-age
// motivational standards PDF. Shape:
//   { table: { "SCM"|"LCM": { "10".."18": { "F"|"M": { "dist|stroke": {B,BB,A,AA,AAA,AAAA} } } } },
//     count, loadedAt, by }
export async function fetchUsaStandards() {
  const snap = await getDoc(doc(db, "config", "usaStandards"));
  return snap.exists() ? snap.data() : null;
}

// ── World Aquatics Masters World Records (config/mastersRecords) ─────────
// Published from the desktop app after uploading the SCM/LCM masters world
// records PDFs. Shape:
//   { table: { "SCM"|"LCM": { "F"|"M": { "25-29".."105-109": { "dist|stroke": {seconds,athlete,date} } } } },
//     count, loadedAt, by }
export async function fetchMastersRecords() {
  const snap = await getDoc(doc(db, "config", "mastersRecords"));
  return snap.exists() ? snap.data() : null;
}

// ── Masters Top-10 rankings, World Aquatics + European Aquatics (config/mastersTop10) ──
// Published from the desktop app's Admin tab (owner-only). Shape:
//   { entries: [{source:"world"|"europe",year,course,sex,ageGroup,event,
//                rank,time,seconds,name}], count, loadedAt, by }
// ISR swimmers only. Mobile only ever reads this — publishing is desktop-only.
export async function fetchMastersTop10() {
  const snap = await getDoc(doc(db, "config", "mastersTop10"));
  return snap.exists() ? snap.data() : null;
}

export async function saveAccessList(emails) {
  await setDoc(doc(db, "config", "access"), { emails });
}

// ── Swimmer profile CRUD (mobile-owned: name, DOB, height/weight, seasonIds) ──
// merge:true so we never overwrite the `seasons` data written by desktop sync.
export async function saveSwimmerProfile(swimmerId, profile) {
  await setDoc(doc(db, "swimmers", String(swimmerId)), profile, { merge: true });
}

// merge:true and deliberately omits `seasons` — never overwrite a swimmer's
// season data, including on a re-add of an already-tracked ID (id/name/
// coachUids are safe to always re-stamp; seasons is desktop-sync-owned and
// must be left untouched here).
// `teamId` is optional — set it when the coach is currently viewing an
// explicit team (see createTeam) so the new swimmer ALSO joins that team;
// omit it to fall back to the legacy coachUids-only behavior (unchanged
// from before teams existed). Additive (arrayUnion) — a swimmer can belong
// to more than one team/cluster at once (see clusterMySwimmers), so typing
// in an already-existing player ID here never "moves" them out of wherever
// else they already show, only adds this team alongside it.
// Also shares the new swimmer with every standing viewer this coach has
// already granted access to (coaches/{coachUid}.viewerUids/viewerEmails —
// see redeemInviteCode) — otherwise a viewer who joined before this
// swimmer existed would never see them without a fresh, separate share.
export async function createSwimmer(swimmerId, name, coachUid, coachEmail, teamId) {
  const coachDoc = await fetchCoach(coachUid);
  const viewerUids = (coachDoc && coachDoc.viewerUids) || [];
  const viewerEmails = (coachDoc && coachDoc.viewerEmails) || [];
  const payload = {
    id: String(swimmerId), name, createdAt: Date.now(),
    coachUids: arrayUnion(coachUid, ...viewerUids),
    coachEmails: arrayUnion(coachEmail, ...viewerEmails),
  };
  if (teamId) payload.teamIds = arrayUnion(teamId);
  await setDoc(doc(db, "swimmers", String(swimmerId)), payload, { merge: true });
}

// Unlinks THIS coach (and, if viewing an explicit team, that team) from the
// swimmer — symmetric with createSwimmer's arrayUnion. Never deletes the
// swimmer doc itself: it used to (deleteDoc), which meant removing a
// swimmer shared with another coach (e.g. Liron, shared with sharos88)
// would permanently wipe their entire record for everyone, not just stop
// showing them in this account. Real bug, high severity — fixed to match
// desktop's swimCloudRemoveSwimmer.
export async function deleteSwimmer(swimmerId, coachUid, coachEmail, teamId) {
  // While viewing an explicit team, only unlink THAT team — never touch
  // coachUids. This coach may own/share other teams or a legacy cluster
  // for the SAME swimmer, and coachUids is what fetchSwimmers()'s base
  // query is gated on; stripping it here would silently break this coach's
  // visibility into every OTHER team/cluster they still share this swimmer
  // with, not just the one being removed from. Real bug, reported live:
  // removing a swimmer from a legacy cluster ("Team KFS") also removed
  // them from an unrelated explicit team ("עולם המים"). Only the
  // no-explicit-team (legacy) case still needs to unlink coachUids, since
  // coachUids IS the membership mechanism there.
  const updates = teamId
    ? { teamIds: arrayRemove(teamId) }
    : { coachUids: arrayRemove(coachUid), coachEmails: arrayRemove(coachEmail) };
  await setDoc(doc(db, "swimmers", String(swimmerId)), updates, { merge: true });
}

// ── Coaches (config for the multi-coach access model) ────────────────
// coaches/{uid} = { email, name, createdAt }. Existence of this doc is what
// makes an account a "coach" — see isCoach() in firestore.rules. Created
// either by redeemInviteCode() (new coaches) or migrateLegacyAccess()
// (the two pre-existing family accounts, one time only).
export async function fetchCoach(uid) {
  const snap = await getDoc(doc(db, "coaches", uid));
  return snap.exists() ? snap.data() : null;
}

// Self-service rename of a coach's own account/team display name — the only
// field of another coach's own doc a non-owner may ever write (see
// firestore.rules: coaches/{uid} update carve-out).
export async function saveTeamName(uid, teamName) {
  await setDoc(doc(db, "coaches", uid), { teamName }, { merge: true });
}

// ── Explicit teams (teams/{id} = {name, createdBy, createdAt}) ─────────
// A real, nameable roster a coach creates under their OWN login — distinct
// from the older, purely-inferred coachUids-based grouping (how Team
// Har-Shai / Team KFS work, unaffected by any of this). Lets one email own
// more than one independent, empty-to-start roster with no second Google
// account. See clusterMySwimmers/groupCoachesIntoTeams for how swimmers
// carrying a teamId get grouped ahead of the legacy coachUids heuristic.
export async function createTeam(user, name) {
  const ref = doc(collection(db, "teams"));
  const team = { name, createdBy: user.uid, createdAt: Date.now() };
  await setDoc(ref, team);
  return { id: ref.id, ...team };
}
// Renaming an existing team, distinct from saveTeamName above (which
// renames the CALLER's own coach/account label, not any specific team).
// Firestore rules already permitted this (team creator, name-field-only
// diff) — just needed the function + UI. Mirrors swim_tracker.html.
export async function renameTeam(teamId, name) {
  await setDoc(doc(db, "teams", teamId), { name }, { merge: true });
}
export async function fetchTeam(teamId) {
  const snap = await getDoc(doc(db, "teams", teamId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
// Teams this coach created themselves — including ones with zero swimmers
// so far, which otherwise wouldn't surface anywhere (clustering is swimmer-
// driven; an empty team has no swimmer to derive it from).
export async function fetchMyTeams(uid) {
  const snap = await getDocs(query(collection(db, "teams"), where("createdBy", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// Deletes an explicit team a coach created: best-effort strips this teamId
// from every swimmer currently tagged with it (arrayRemove — never touches
// their other teams or legacy coachUids access), then deletes the
// teams/{id} doc itself. firestore.rules restricts the actual delete to
// the team's creator (or the owner) — a non-creator's call fails there,
// this function doesn't re-check that client-side. A swimmer this coach
// doesn't directly coach (e.g. added independently by another viewer while
// this team was active) may not be reachable by the arrayRemove — logged,
// not fatal, since the team doc itself is still deleted either way.
export async function deleteTeam(teamId) {
  const swimmers = await fetchSwimmersByTeam(teamId);
  const results = await Promise.allSettled(swimmers.map((sw) =>
    setDoc(doc(db, "swimmers", String(sw.id)), { teamIds: arrayRemove(teamId) }, { merge: true })
  ));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) console.error("deleteTeam: failed to unlink some swimmers", failed);
  await deleteDoc(doc(db, "teams", teamId));
}

async function createCoachDoc(user) {
  await setDoc(doc(db, "coaches", user.uid), {
    email: user.email, name: user.displayName || "", createdAt: Date.now(),
  });
}

// One-time bridge for the two pre-multi-coach family accounts (lhershey,
// sharos88) who already had full shared access to Noga/Gal under the old
// flat allow-list model. Runs harmlessly as a no-op for everyone else
// (new coaches go through redeemInviteCode() instead). Safe to call on
// every sign-in — it only does work once per account.
//
// Deliberately does NOT swallow errors: a permission-denied here means the
// rules/migration logic itself is broken, not "nothing to migrate" — that
// needs to surface (console + return value), not fail silently and leave
// someone quietly locked out with no clue why.
const LEGACY_SWIMMER_IDS = ["268117", "276401"]; // Noga, Gal
export async function migrateLegacyAccess(user) {
  if (!user) return { ran: false };
  const already = await fetchCoach(user.uid);
  if (already) return { ran: false };
  // A brand-new (non-legacy) coach can't read config/access at all yet — that's
  // expected (not a bug), so this specific read failing just means "nothing to
  // migrate," not an error to propagate.
  let accessList = [];
  try { accessList = await getAccessList(); } catch (e) { /* not on the legacy list — fine */ }
  if (!accessList.map((e) => e.toLowerCase()).includes((user.email || "").toLowerCase())) return { ran: false };
  await createCoachDoc(user);
  const results = await Promise.allSettled(LEGACY_SWIMMER_IDS.map((id) =>
    setDoc(doc(db, "swimmers", id), { coachUids: arrayUnion(user.uid), coachEmails: arrayUnion(user.email) }, { merge: true })
  ));
  const failed = results
    .map((r, i) => (r.status === "rejected" ? { id: LEGACY_SWIMMER_IDS[i], error: r.reason } : null))
    .filter(Boolean);
  if (failed.length) console.error("migrateLegacyAccess: failed to claim swimmer(s)", failed);
  return { ran: true, failed };
}

// Owner-only: the two-ID legacy bridge above only covers Noga/Gal, but the
// owner may have OTHER pre-multi-coach swimmers (e.g. their own profile)
// that predate coachUids entirely and were never migrated — those are
// invisible to everyone (including the owner's own filtered queries) until
// claimed. Owner bypass lets this safely discover every orphaned doc.
export async function claimOrphanedSwimmers(user) {
  if (!isOwner(user)) return;
  try {
    const snap = await getDocs(collection(db, "swimmers"));
    const orphaned = snap.docs.filter((d) => {
      const cu = d.data().coachUids;
      return !Array.isArray(cu) || cu.length === 0;
    });
    if (!orphaned.length) return;
    const results = await Promise.allSettled(orphaned.map((d) =>
      setDoc(doc(db, "swimmers", d.id), { coachUids: arrayUnion(user.uid) }, { merge: true })
    ));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) console.error("claimOrphanedSwimmers: failed to claim", failed);
  } catch (e) { console.error("claimOrphanedSwimmers failed:", e); }
}

// ── Invite codes ────────────────────────────────────────────────────
// inviteCodes/{code} = { createdAt, createdBy, usedBy, usedAt, note,
//   targetCoachUid?, swimmerIds? }.
// Two kinds: (1) a plain code (owner-only) creates a brand-new,
// independent coach with an empty roster; (2) a "join my team" code
// (any coach, for their own uid only — see firestore.rules) shares the
// creator's CURRENT swimmer list with whoever redeems it, same access
// a co-coach already has. Single-use, self-service to redeem either way.
export async function createInviteCode(user, note, shareWith) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const payload = { createdAt: Date.now(), createdBy: user.email, usedBy: null, usedAt: null, note: note || "" };
  if (shareWith) { payload.targetCoachUid = shareWith.targetCoachUid; payload.swimmerIds = shareWith.swimmerIds; }
  await setDoc(doc(db, "inviteCodes", code), payload);
  return code;
}

// Revokes a viewer's access to every swimmer in `swimmers` (this coach's
// current roster) that's shared with them — the inverse of createInviteCode
// (which grants access to the whole roster at once). Resolves email → uid
// via the coaches collection first (coachUids/coachEmails only store
// uids/emails, not a ready-made mapping), then arrayRemove on each swimmer.
// `myUid` is the caller's own uid — also strips the viewer from
// coaches/{myUid}.viewerUids/viewerEmails (self-write, always allowed) so a
// future createSwimmer() doesn't keep re-sharing new swimmers with someone
// who was just removed.
export async function removeViewer(swimmers, email, myUid) {
  const q = query(collection(db, "coaches"), where("email", "==", email));
  const snap = await getDocs(q);
  if (!snap.docs.length) throw new Error("Could not find that coach account.");
  const targetUid = snap.docs[0].id;
  for (const sw of swimmers) {
    const realEmail = (sw.coachEmails || []).find((e) => e.toLowerCase() === email.toLowerCase());
    if (!realEmail) continue;
    await setDoc(doc(db, "swimmers", String(sw.id)), { coachUids: arrayRemove(targetUid), coachEmails: arrayRemove(realEmail) }, { merge: true });
  }
  if (myUid) {
    await setDoc(doc(db, "coaches", myUid), { viewerUids: arrayRemove(targetUid), viewerEmails: arrayRemove(email) }, { merge: true });
  }
}

// ── Admin stats (owner-only; deliberately separate from the normal,
//    always-scoped fetchSwimmers()) — total coaches, swimmers per coach,
//    invite code status. This is the one place cross-coach visibility is
//    intentional, and it's a dedicated action, never the default list. ──
export async function fetchAllCoaches() {
  const snap = await getDocs(collection(db, "coaches"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
export async function fetchAllSwimmersAdmin() {
  const snap = await getDocs(collection(db, "swimmers"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function fetchAllInviteCodes() {
  const snap = await getDocs(collection(db, "inviteCodes"));
  return snap.docs.map((d) => ({ code: d.id, ...d.data() }));
}

// Owner-only, Admin panel: fully removes ONE coach's account from the app.
// Strips their access from every swimmer they coach (arrayRemove — never
// deletes a swimmer doc), removes them from every OTHER coach's
// viewerUids/viewerEmails (so they stop being an auto-share target for
// swimmers added in the future too — see createSwimmer), then deletes their
// own coaches/{uid} doc. The account holder's Google login itself is
// untouched — they'd just need a fresh invite code to use the app again.
// firestore.rules only lets the owner delete a coaches/{uid} doc or write
// arbitrary swimmers/coaches fields, so this is owner-gated by the rules
// themselves, not just the Admin-only UI that calls it.
export async function removeCoachAccount(uid, email) {
  const [swimmers, coaches] = await Promise.all([fetchAllSwimmersAdmin(), fetchAllCoaches()]);
  const ops = [];
  swimmers.forEach((sw) => {
    if ((sw.coachUids || []).includes(uid)) {
      ops.push(setDoc(doc(db, "swimmers", String(sw.id)), { coachUids: arrayRemove(uid), coachEmails: arrayRemove(email) }, { merge: true }));
    }
  });
  coaches.forEach((co) => {
    if (co.uid !== uid && (co.viewerUids || []).includes(uid)) {
      ops.push(setDoc(doc(db, "coaches", co.uid), { viewerUids: arrayRemove(uid), viewerEmails: arrayRemove(email) }, { merge: true }));
    }
  });
  const results = await Promise.allSettled(ops);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) console.error("removeCoachAccount: failed to unlink some docs", failed);
  await deleteDoc(doc(db, "coaches", uid));
}

export async function fetchInviteCode(code) {
  const snap = await getDoc(doc(db, "inviteCodes", code));
  return snap.exists() ? snap.data() : null;
}

// Redeem an invite code: marks it used by this account, creates the
// coaches/{uid} doc that grants base access, and — if this was a "join my
// team" code — self-writes pendingShares/{uid} (now also recording which
// coach this was redeemed for), registers this account as a standing
// VIEWER of the inviting coach (coaches/{targetCoachUid}.viewerUids —
// see firestore.rules), then shares the CURRENT roster snapshot from
// inv.swimmerIds. The viewer registration is what makes swimmers the
// inviter adds AFTER this redemption also visible automatically (see
// createSwimmer/swimSaveProfile), not just the one-time snapshot — so this
// runs even when inv.swimmerIds is empty (inviter had no swimmers yet when
// they generated the code). Throws if the code is missing/already used —
// caller should show that message to the user.
export async function redeemInviteCode(code, user) {
  const inv = await fetchInviteCode(code);
  if (!inv) throw new Error("Invite code not found.");
  if (inv.usedBy) throw new Error("This invite code has already been used.");
  await setDoc(doc(db, "inviteCodes", code), { usedBy: user.email, usedAt: Date.now() }, { merge: true });
  await createCoachDoc(user);
  if (inv.targetCoachUid) {
    const swimmerIds = Array.isArray(inv.swimmerIds) ? inv.swimmerIds : [];
    await setDoc(doc(db, "pendingShares", user.uid), { swimmerIds, targetCoachUid: inv.targetCoachUid, claimedAt: Date.now() });
    await setDoc(doc(db, "coaches", inv.targetCoachUid), {
      viewerUids: arrayUnion(user.uid), viewerEmails: arrayUnion(user.email),
    }, { merge: true });
    if (swimmerIds.length) {
      const results = await Promise.allSettled(swimmerIds.map((id) =>
        setDoc(doc(db, "swimmers", id), { coachUids: arrayUnion(user.uid), coachEmails: arrayUnion(user.email) }, { merge: true })
      ));
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) console.error("redeemInviteCode: failed to share some swimmers", failed);
    }
  }
}
