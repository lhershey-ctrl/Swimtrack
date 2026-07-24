function col(name) {
  window.__mockStore = window.__mockStore || {};
  window.__mockStore[name] = window.__mockStore[name] || {};
  return window.__mockStore[name];
}
let autoIdCounter = 0;
export function getFirestore(db) { return {}; }
export function doc(db, c, id) {
  if (db && db.__col !== undefined && c === undefined) {
    var autoId = 'auto' + (++autoIdCounter);
    return { __col: db.__col, __id: autoId, id: autoId };
  }
  if (id === undefined) { id = 'auto' + (++autoIdCounter); }
  return { __col: c, __id: String(id), id: String(id) };
}
export function setDoc(ref, data, opts) {
  var c = col(ref.__col);
  var existing = c[ref.__id] || {};
  var merged = (opts && opts.merge) ? Object.assign({}, existing) : {};
  Object.keys(data).forEach(function (k) {
    var v = data[k];
    if (v && v.__arrayUnion) {
      var arr = Array.isArray(merged[k]) ? merged[k].slice() : (Array.isArray(existing[k]) ? existing[k].slice() : []);
      v.__arrayUnion.forEach(function (x) { if (arr.indexOf(x) < 0) arr.push(x); });
      merged[k] = arr;
    } else merged[k] = v;
  });
  c[ref.__id] = merged;
  return Promise.resolve();
}
export function getDoc(ref) {
  var c = col(ref.__col);
  var data = c[ref.__id];
  return Promise.resolve({ exists: function () { return !!data; }, data: function () { return data; }, id: ref.__id });
}
export function collection(db, name) { return { __col: name }; }
export function query(colRef) {
  var conds = Array.prototype.slice.call(arguments, 1);
  return { __col: colRef.__col, __conds: conds };
}
export function where(field, op, value) { return { field: field, op: op, value: value }; }
export function getDocs(ref) {
  var c = col(ref.__col);
  var ids = Object.keys(c);
  if (ref.__conds) {
    ref.__conds.forEach(function (cond) {
      ids = ids.filter(function (id) {
        var v = c[id][cond.field];
        if (cond.op === 'array-contains') return Array.isArray(v) && v.indexOf(cond.value) >= 0;
        return v === cond.value;
      });
    });
  }
  return Promise.resolve({ docs: ids.map(function (id) { return { id: id, data: function () { return c[id]; } }; }) });
}
export function arrayUnion() { return { __arrayUnion: Array.prototype.slice.call(arguments) }; }
