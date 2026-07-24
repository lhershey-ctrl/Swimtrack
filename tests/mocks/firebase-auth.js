export function getAuth(app) { return { currentUser: null, _cbs: [] }; }
export class GoogleAuthProvider {}
export function signInWithPopup(auth, provider) {
  auth.currentUser = window.__FAKE_USER;
  auth._cbs.forEach(function (cb) { cb(auth.currentUser); });
  return Promise.resolve({ user: auth.currentUser });
}
export function signOut(auth) {
  auth.currentUser = null;
  auth._cbs.forEach(function (cb) { cb(null); });
  return Promise.resolve();
}
export function onAuthStateChanged(auth, cb) {
  auth._cbs.push(cb);
  setTimeout(function () { cb(auth.currentUser); }, 0);
  return function () {};
}
