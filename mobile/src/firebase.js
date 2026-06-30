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

// One-time fetch of the swimmer list (id + name) for the picker.
export async function fetchSwimmers() {
  const snap = await getDocs(collection(db, "swimmers"));
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

export async function saveAccessList(emails) {
  await setDoc(doc(db, "config", "access"), { emails });
}
