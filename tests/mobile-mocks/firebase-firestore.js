function store() {
  window.__mockStore = window.__mockStore || {};
  return window.__mockStore;
}
function col(name) {
  const s = store();
  s[name] = s[name] || {};
  return s[name];
}
function listeners() {
  window.__mockListeners = window.__mockListeners || {};
  return window.__mockListeners;
}
let autoIdCounter = 0;

export function getFirestore(app) { return {}; }
export function collection(db, name) { return { __col: name }; }
export function doc(db, c, id) {
  if (db && db.__col !== undefined && c === undefined) {
    const autoId = 'auto' + (++autoIdCounter);
    return { __col: db.__col, __id: autoId, id: autoId };
  }
  if (id === undefined) id = 'auto' + (++autoIdCounter);
  return { __col: c, __id: String(id), id: String(id) };
}
export function query(colRef, ...conds) { return { __col: colRef.__col, __conds: conds }; }
export function where(field, op, value) { return { field, op, value }; }

function notify(colName, id) {
  const key = colName + '/' + id;
  const cbs = listeners()[key] || [];
  const data = col(colName)[id];
  cbs.forEach((cb) => cb({ exists: () => !!data, data: () => data, id }));
}

export function setDoc(ref, data, opts) {
  const c = col(ref.__col);
  const existing = c[ref.__id] || {};
  const merged = (opts && opts.merge) ? { ...existing } : {};
  Object.keys(data).forEach((k) => {
    const v = data[k];
    if (v && v.__arrayUnion) {
      const arr = Array.isArray(merged[k]) ? merged[k].slice() : (Array.isArray(existing[k]) ? existing[k].slice() : []);
      v.__arrayUnion.forEach((x) => { if (!arr.includes(x)) arr.push(x); });
      merged[k] = arr;
    } else if (v && v.__arrayRemove) {
      let arr2 = Array.isArray(merged[k]) ? merged[k].slice() : (Array.isArray(existing[k]) ? existing[k].slice() : []);
      v.__arrayRemove.forEach((x) => { arr2 = arr2.filter((y) => y !== x); });
      merged[k] = arr2;
    } else merged[k] = v;
  });
  c[ref.__id] = merged;
  notify(ref.__col, ref.__id);
  return Promise.resolve();
}
export function deleteDoc(ref) {
  const c = col(ref.__col);
  delete c[ref.__id];
  notify(ref.__col, ref.__id);
  return Promise.resolve();
}
export function getDoc(ref) {
  const data = col(ref.__col)[ref.__id];
  return Promise.resolve({ exists: () => !!data, data: () => data, id: ref.__id });
}
export function getDocs(ref) {
  const c = col(ref.__col);
  let ids = Object.keys(c);
  (ref.__conds || []).forEach((cond) => {
    ids = ids.filter((id) => {
      const v = c[id][cond.field];
      if (cond.op === 'array-contains') return Array.isArray(v) && v.includes(cond.value);
      return v === cond.value;
    });
  });
  return Promise.resolve({ docs: ids.map((id) => ({ id, data: () => c[id] })) });
}
export function onSnapshot(ref, onNext, onError) {
  const key = ref.__col + '/' + ref.__id;
  const L = listeners();
  L[key] = L[key] || [];
  L[key].push(onNext);
  const data = col(ref.__col)[ref.__id];
  // Optional per-doc delay (window.__mockDocDelayMs = {docId: ms}), mirrors
  // the desktop mock — for constructing adversarial "slow subscription"
  // races deterministically in a test, instead of a real network.
  const delay = (window.__mockDocDelayMs && window.__mockDocDelayMs[ref.__id]) || 0;
  setTimeout(() => onNext({ exists: () => !!data, data: () => data, id: ref.__id }), delay);
  return () => { L[key] = (L[key] || []).filter((cb) => cb !== onNext); };
}
export function arrayUnion(...args) { return { __arrayUnion: args }; }
export function arrayRemove(...args) { return { __arrayRemove: args }; }
