/* Film Awards — local storage layer.
 * Everything the user does (seen, own rating, comments, TMDB key) lives in this phone's
 * localStorage. Nothing is ever sent anywhere except TMDB lookups made with the user's own key.
 */
(function () {
  'use strict';
  var FA = (window.FA = window.FA || {});
  var NS = 'fa.v1.';
  var memory = {}; // fallback when localStorage is blocked (private mode, etc.)
  var storageOk = true;

  function rawGet(k) {
    try {
      var v = localStorage.getItem(NS + k);
      return v == null ? (k in memory ? memory[k] : null) : v;
    } catch (e) {
      storageOk = false;
      return k in memory ? memory[k] : null;
    }
  }
  function rawSet(k, v) {
    try {
      localStorage.setItem(NS + k, v);
      return true;
    } catch (e) {
      storageOk = false;
      memory[k] = v;
      return false;
    }
  }
  function rawDel(k) {
    delete memory[k];
    try { localStorage.removeItem(NS + k); } catch (e) { /* ignore */ }
  }
  function read(k, fallback) {
    var v = rawGet(k);
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }
  function write(k, val) { return rawSet(k, JSON.stringify(val)); }
  function keys(prefix) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS + (prefix || '')) === 0) out.push(k.slice(NS.length));
      }
    } catch (e) { /* ignore */ }
    return out;
  }

  // ---- user data: id -> {s:1, r:4.5, n:"note", t:timestamp} --------------------------------
  var user = read('user', {});
  var listeners = [];
  var saveTimer = null;

  function persistUser() {
    var ok = write('user', user);
    if (!ok && storageOk === false) FA.onStorageProblem && FA.onStorageProblem();
  }
  function emit(id) { listeners.forEach(function (fn) { try { fn(id); } catch (e) { console.error(e); } }); }

  var store = {
    ok: function () { return storageOk; },
    read: read,
    write: write,
    remove: rawDel,
    keys: keys,
    onChange: function (fn) { listeners.push(fn); },

    get: function (id) { return user[id] || {}; },
    all: function () { return user; },
    isSeen: function (id) { return !!(user[id] && user[id].s); },
    rating: function (id) { return (user[id] && user[id].r) || 0; },
    note: function (id) { return (user[id] && user[id].n) || ''; },

    set: function (id, patch) {
      var next = Object.assign({}, user[id] || {}, patch, { t: Date.now() });
      if (!next.s) delete next.s;
      if (!next.r) delete next.r;
      if (!next.n || !String(next.n).trim()) delete next.n;
      if (!next.s && !next.r && !next.n) delete user[id];
      else user[id] = next;
      persistUser();
      emit(id);
    },

    // ---- settings ----------------------------------------------------------------------
    getKey: function () { return (rawGet('key') || '').trim(); },
    setKey: function (k) { k = (k || '').trim(); if (k) rawSet('key', k); else rawDel('key'); },
    getRegion: function () { return rawGet('region') || 'ES'; },
    setRegion: function (r) { rawSet('region', r); },
    getPref: function (name, def) { var p = read('prefs', {}); return name in p ? p[name] : def; },
    setPref: function (name, val) { var p = read('prefs', {}); p[name] = val; write('prefs', p); },

    // manual TMDB id overrides: filmId -> tmdbId
    getOverrides: function () { return read('map', {}); },
    setOverride: function (filmId, tmdbId) {
      var m = read('map', {});
      if (tmdbId) m[filmId] = tmdbId; else delete m[filmId];
      write('map', m);
    },

    // ---- backup ------------------------------------------------------------------------
    exportData: function () {
      return {
        app: 'film-awards',
        version: 1,
        exported: new Date().toISOString(),
        user: user,
        overrides: read('map', {}),
      };
    },
    // mode: 'merge' (newest entry per film wins) or 'replace'
    importData: function (obj, mode) {
      if (!obj || obj.app !== 'film-awards' || typeof obj.user !== 'object' || obj.user === null) {
        throw new Error('This does not look like a Film Awards backup.');
      }
      var added = 0, updated = 0, kept = 0;
      if (mode === 'replace') {
        user = {};
      }
      Object.keys(obj.user).forEach(function (id) {
        var inc = obj.user[id];
        if (!inc || typeof inc !== 'object') return;
        var cur = user[id];
        if (!cur) { user[id] = inc; added++; }
        else if ((inc.t || 0) > (cur.t || 0)) { user[id] = inc; updated++; }
        else kept++;
      });
      if (obj.overrides && typeof obj.overrides === 'object') {
        var m = read('map', {});
        Object.keys(obj.overrides).forEach(function (k) { if (!(k in m)) m[k] = obj.overrides[k]; });
        write('map', m);
      }
      persistUser();
      emit(null);
      return { added: added, updated: updated, kept: kept, total: Object.keys(user).length };
    },
  };

  FA.store = store;
  window.addEventListener('pagehide', function () { clearTimeout(saveTimer); });
})();
