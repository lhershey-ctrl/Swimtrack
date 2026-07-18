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

// Live subscription to a single swimmer document.
export function subscribeSwimmer(swimmerId, callback) {
  return onSnapshot(
    doc(db, "swimmers", swimmerId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => console.error("Swimmer listener error:", err)
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
export async function createSwimmer(swimmerId, name, coachUid) {
  await setDoc(
    doc(db, "swimmers", String(swimmerId)),
    { id: String(swimmerId), name, createdAt: Date.now(), coachUids: arrayUnion(coachUid) },
    { merge: true }
  );
}

export async function deleteSwimmer(swimmerId) {
  await deleteDoc(doc(db, "swimmers", String(swimmerId)));
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
    setDoc(doc(db, "swimmers", id), { coachUids: arrayUnion(user.uid) }, { merge: true })
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

export async function fetchInviteCode(code) {
  const snap = await getDoc(doc(db, "inviteCodes", code));
  return snap.exists() ? snap.data() : null;
}

// Redeem an invite code: marks it used by this account, creates the
// coaches/{uid} doc that grants base access, and — if this was a "join my
// team" code — self-writes pendingShares/{uid} then adds this account to
// every listed swimmer's coachUids (see the matching bridge in
// firestore.rules). Throws if the code is missing/already used — caller
// should show that message to the user.
export async function redeemInviteCode(code, user) {
  const inv = await fetchInviteCode(code);
  if (!inv) throw new Error("Invite code not found.");
  if (inv.usedBy) throw new Error("This invite code has already been used.");
  await setDoc(doc(db, "inviteCodes", code), { usedBy: user.email, usedAt: Date.now() }, { merge: true });
  await createCoachDoc(user);
  if (inv.targetCoachUid && Array.isArray(inv.swimmerIds) && inv.swimmerIds.length) {
    await setDoc(doc(db, "pendingShares", user.uid), { swimmerIds: inv.swimmerIds, claimedAt: Date.now() });
    const results = await Promise.allSettled(inv.swimmerIds.map((id) =>
      setDoc(doc(db, "swimmers", id), { coachUids: arrayUnion(user.uid) }, { merge: true })
    ));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) console.error("redeemInviteCode: failed to share some swimmers", failed);
  }
}
