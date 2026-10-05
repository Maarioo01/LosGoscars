/* Film Awards — TMDB lookups (poster, public rating, synopsis, cast, where to watch).
 * Uses the visitor's own TMDB key, stored only in this browser. All calls are defensive:
 * if anything fails the app simply shows placeholders.
 * This product uses the TMDB API but is not endorsed or certified by TMDB.
 */
(function () {
  'use strict';
  var FA = window.FA;
  var store = FA.store;

  var API = 'https://api.themoviedb.org/3';
  var IMG = 'https://image.tmdb.org/t/p/';
  var DAY = 86400000;
  var FRESH = 45 * DAY;       // refresh rating/poster after 45 days
  var MISS_TTL = 10 * DAY;    // retry "not found" after 10 days
  var DETAIL_TTL = 30 * DAY;
  var PROV_TTL = 3 * DAY;
  var MAX_ACTIVE = 4;

  // list cache: filmId -> {i: tmdbId, p: poster_path, r: rating, v: votes, t: ts} | {m: 1, t: ts}
  var cache = store.read('tmdb', {});
  var persistTimer = null;
  function persistNow() {
    clearTimeout(persistTimer);
    persistTimer = null;
    if (!store.write('tmdb', cache)) {
      // quota problem: drop the heavy caches and try once more
      store.keys('d.').concat(store.keys('p.')).forEach(store.remove);
      store.write('tmdb', cache);
    }
  }
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 600);
  }

  var listeners = [];
  function emit(type, detail) {
    listeners.forEach(function (fn) { try { fn(type, detail); } catch (e) { console.error(e); } });
  }

  function isBearer(key) { return key.length > 60 || key.indexOf('eyJ') === 0; }

  function err(code, extra) { var e = new Error(code); e.code = code; e.extra = extra; return e; }

  function req(path, params) {
    var key = store.getKey();
    if (!key) return Promise.reject(err('no-key'));
    var url = new URL(API + path);
    Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
    var opts = { headers: { Accept: 'application/json' } };
    if (isBearer(key)) opts.headers.Authorization = 'Bearer ' + key;
    else url.searchParams.set('api_key', key);
    return fetch(url.toString(), opts).then(function (r) {
      if (r.status === 401) throw err('bad-key');
      if (r.status === 429) throw err('rate', parseInt(r.headers.get('Retry-After') || '3', 10));
      if (r.status === 404) throw err('not-found');
      if (!r.ok) throw err('http-' + r.status);
      return r.json();
    }, function () { throw err('network'); });
  }

  function K(film) { return film.uid || film.id; }
  function isTV(film) { return film.kind === 'tv'; }

  // ---- title matching -----------------------------------------------------------------------
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function strip(n) { return n.replace(/^(the|a|an|el|la|los|las|un|una|le|les|l|il|der|die|das)\s+/, ''); }

  function scoreResult(r, wanted, year, tv) {
    var names = [r.title, r.original_title, r.name, r.original_name].filter(Boolean).map(function (n) { return strip(norm(n)); });
    var exact = wanted.some(function (w) { return names.indexOf(w) >= 0; });
    var loose = !exact && wanted.some(function (w) {
      return w.length > 3 && names.some(function (n) { return n.indexOf(w) === 0 || w.indexOf(n) === 0; });
    });
    var ds = r.release_date || r.first_air_date;
    var ry = ds ? parseInt(ds.slice(0, 4), 10) : NaN;
    var dy = isNaN(ry) ? 4 : Math.abs(ry - year);
    var s = 0;
    if (tv) {
      // a series keeps airing for years: only penalise ones that started after the nomination
      dy = isNaN(ry) || ry <= year + 1 ? 0 : ry - year;
    }
    if (exact) s += 10; else if (loose) s += 5;
    if (dy === 0) s += 4; else if (dy === 1) s += 3; else if (dy > 2) s -= 4 * (dy - 2);
    s += Math.min(2, Math.log10(1 + (r.popularity || 0)) / 2);
    if ((r.vote_count || 0) > 20) s += 0.5;
    return s;
  }

  function pick(cands, wanted, year, tv) {
    var best = null, bestScore = -99;
    cands.forEach(function (r) {
      var s = scoreResult(r, wanted, year, tv);
      if (s > bestScore) { best = r; bestScore = s; }
    });
    return bestScore >= 8 ? best : null;
  }

  function entryFrom(j) {
    return { i: j.id, p: j.poster_path || null, r: j.vote_average || 0, v: j.vote_count || 0, t: Date.now() };
  }

  function searchFilm(film) {
    var titles = [film.title];
    if (film.titleEn && film.titleEn !== film.title) titles.push(film.titleEn);
    var wanted = titles.map(function (t) { return strip(norm(t)); });
    var cands = new Map();
    var topOfYear = null;
    var tv = isTV(film);

    function run(q, year) {
      var p = { query: q, include_adult: 'false', language: 'en-US' };
      if (year && !tv) p.year = String(year);
      return req(tv ? '/search/tv' : '/search/movie', p).then(function (j) {
        var res = j.results || [];
        res.forEach(function (r) { if (!cands.has(r.id)) cands.set(r.id, r); });
        if (year && year === film.year && res.length && !topOfYear) topOfYear = res[0];
        return pick(cands, wanted, film.year, tv);
      });
    }

    var steps = tv ? [[titles[0], 0]] : [[titles[0], 0], [titles[0], film.year]];
    if (titles[1]) steps.push([titles[1], 0]);
    if (titles[1] && !tv) steps.push([titles[1], film.year]);

    var chain = Promise.resolve(null);
    steps.forEach(function (st) {
      chain = chain.then(function (found) { return found || run(st[0], st[1]); });
    });
    return chain.then(function (found) {
      if (!found && topOfYear && !tv) {
        var ry = topOfYear.release_date ? parseInt(topOfYear.release_date.slice(0, 4), 10) : NaN;
        if (!isNaN(ry) && Math.abs(ry - film.year) <= 1) found = topOfYear; // weak fallback
      }
      return found ? entryFrom(found) : { m: 1, t: Date.now() };
    });
  }

  function fromId(id, tv) {
    return req((tv ? '/tv/' : '/movie/') + id, { language: 'en-US' }).then(entryFrom);
  }

  // ---- resolve one film to a cache entry ---------------------------------------------------
  var pending = new Map();

  function isFresh(film) {
    var ov = store.getOverrides()[K(film)];
    var e = cache[K(film)];
    if (!e) return false;
    if (ov && e.i !== ov) return false;
    var age = Date.now() - (e.t || 0);
    return e.m ? age < MISS_TTL : age < FRESH;
  }

  function resolve(film) {
    if (pending.has(K(film))) return pending.get(K(film));
    var ov = store.getOverrides()[K(film)];
    var e = cache[K(film)];
    var p;
    if (isFresh(film)) p = Promise.resolve(e);
    else if (ov) p = fromId(ov, isTV(film));
    else if (e && e.i) p = fromId(e.i, isTV(film)).catch(function (er) { if (er.code === 'not-found') return searchFilm(film); throw er; });
    else p = searchFilm(film);
    p = p.then(function (ne) {
      cache[K(film)] = ne;
      persistSoon();
      emit('film', K(film));
      return ne;
    });
    pending.set(K(film), p);
    var done = function () { pending.delete(K(film)); };
    p.then(done, done);
    return p;
  }

  // ---- background queue (newest request first, so what you see loads first) -----------------
  var queue = [];
  var queued = new Set();
  var active = 0;
  var pausedUntil = 0;
  var blocked = false;
  var idleCbs = [];

  function pump() {
    if (blocked) { queue.length = 0; queued.clear(); }
    var now = Date.now();
    if (now < pausedUntil) { setTimeout(pump, pausedUntil - now + 50); return; }
    while (active < MAX_ACTIVE && queue.length) {
      var film = queue.shift();
      queued.delete(K(film));
      active++;
      resolve(film).then(null, function (er) {
        if (er.code === 'bad-key') { blocked = true; emit('error', er); }
        else if (er.code === 'rate') { pausedUntil = Date.now() + (er.extra || 3) * 1000; queue.unshift(film); queued.add(K(film)); }
        else if (er.code === 'network') { emit('error', er); }
      }).then(function () { active--; pump(); });
    }
    if (!active && !queue.length) { var cbs = idleCbs; idleCbs = []; cbs.forEach(function (f) { f(); }); }
  }

  function enqueue(film, low) {
    if (!store.getKey() || blocked) return;
    if (isFresh(film) || pending.has(K(film)) || queued.has(K(film))) return;
    queued.add(K(film));
    if (low) queue.push(film); else queue.unshift(film);
    pump();
  }

  // ---- details & providers ------------------------------------------------------------------
  function details(film) {
    return resolve(film).then(function (e) {
      if (!e || !e.i) return null;
      var tv = isTV(film);
      var key = 'd.' + (tv ? 'tv.' : '') + e.i;
      var d = store.read(key, null);
      if (d && Date.now() - d.t < DETAIL_TTL) return d;
      return req((tv ? '/tv/' : '/movie/') + e.i, { language: 'en-US', append_to_response: tv ? 'aggregate_credits,external_ids' : 'credits' }).then(function (j) {
        if (tv) return tvOut(j, key, film);
        var crew = (j.credits && j.credits.crew) || [];
        var cast = (j.credits && j.credits.cast) || [];
        var out = {
          t: Date.now(), id: j.id, title: j.title, ot: j.original_title, tag: j.tagline || '', ov: j.overview || '',
          rt: j.runtime || 0, g: (j.genres || []).map(function (x) { return x.name; }),
          rd: j.release_date || '', lang: j.original_language || '',
          c: (j.production_countries || []).map(function (x) { return x.name; }),
          r: j.vote_average || 0, v: j.vote_count || 0, imdb: j.imdb_id || '', p: j.poster_path || null,
          dir: crew.filter(function (x) { return x.job === 'Director'; }).map(function (x) { return x.name; }),
          cast: cast.slice(0, 8).map(function (x) { return { n: x.name, ch: x.character || '' }; }),
        };
        if (!store.write(key, out)) {
          store.keys('d.').concat(store.keys('p.')).forEach(store.remove);
          store.write(key, out);
        }
        cache[K(film)] = { i: j.id, p: out.p, r: out.r, v: out.v, t: Date.now() };
        persistSoon();
        emit('film', K(film));
        return out;
      });
    });
  }

  function tvOut(j, key, film) {
    var ac = (j.aggregate_credits && j.aggregate_credits.cast) || [];
    var out = {
      t: Date.now(), id: j.id, kind: 'tv', title: j.name, ot: j.original_name, tag: j.tagline || '', ov: j.overview || '',
      rt: (j.episode_run_time && j.episode_run_time[0]) || 0, g: (j.genres || []).map(function (x) { return x.name; }),
      rd: j.first_air_date || '', last: j.last_air_date || '', lang: j.original_language || '',
      c: (j.origin_country || []).slice(),
      r: j.vote_average || 0, v: j.vote_count || 0, imdb: (j.external_ids && j.external_ids.imdb_id) || '', p: j.poster_path || null,
      dir: (j.created_by || []).map(function (x) { return x.name; }),
      seasons: j.number_of_seasons || 0, eps: j.number_of_episodes || 0, status: j.status || '',
      nets: (j.networks || []).map(function (x) { return x.name; }).slice(0, 3),
      cast: ac.slice(0, 8).map(function (x) { return { n: x.name, ch: (x.roles && x.roles[0] && x.roles[0].character) || '' }; }),
    };
    if (!store.write(key, out)) {
      store.keys('d.').concat(store.keys('p.')).forEach(store.remove);
      store.write(key, out);
    }
    cache[K(film)] = { i: j.id, p: out.p, r: out.r, v: out.v, t: Date.now() };
    persistSoon();
    emit('film', K(film));
    return out;
  }

  function providers(tmdbId, region, kind) {
    var tv = kind === 'tv';
    var key = 'p.' + (tv ? 'tv.' : '') + tmdbId;
    var c = store.read(key, null);
    if (c && c.region === region && Date.now() - c.t < PROV_TTL) return Promise.resolve(c);
    return req((tv ? '/tv/' : '/movie/') + tmdbId + '/watch/providers', {}).then(function (j) {
      var r = (j.results && j.results[region]) || {};
      function names(a) { return (a || []).map(function (x) { return x.provider_name; }); }
      var out = { t: Date.now(), region: region, f: names(r.flatrate), r: names(r.rent), b: names(r.buy), l: r.link || '' };
      store.write(key, out);
      return out;
    });
  }

  FA.tmdb = {
    hasKey: function () { return !!store.getKey(); },
    flush: function () { if (persistTimer) persistNow(); },
    cached: function (filmId) { return cache[filmId]; },
    img: function (path, size) { return path ? IMG + (size || 'w185') + path : ''; },
    queue: function (film, low) { enqueue(film, low); },
    resolve: resolve,
    details: details,
    providers: providers,
    on: function (fn) { listeners.push(fn); },
    unblock: function () { blocked = false; },
    setOverride: function (film, tmdbId) {
      store.setOverride(K(film), tmdbId);
      delete cache[K(film)];
      persistSoon();
      return resolve(film);
    },
    clearCache: function () {
      cache = {};
      store.remove('tmdb');
      store.keys('d.').concat(store.keys('p.')).forEach(store.remove);
      emit('film', null);
    },
    test: function () { return req('/authentication', {}).then(function (j) { return !!j.success; }); },
    // load everything in the background; onProgress(done, total); resolves when finished or cancelled
    preload: function (films, onProgress) {
      var todo = films.filter(function (f) { return !isFresh(f); });
      var total = todo.length, done = 0, cancelled = false, finished = false;
      blocked = false;
      return new Promise(function (resolveAll) {
        function finish() {
          if (finished) return;
          finished = true;
          resolveAll({ done: done, total: total, cancelled: cancelled, blocked: blocked });
        }
        FA.tmdb._cancel = function () { cancelled = true; finish(); };
        if (!total) return finish();
        var lanes = Math.min(MAX_ACTIVE, total);
        var running = lanes;
        function step() {
          if (cancelled || blocked || !todo.length) { if (--running === 0) finish(); return; }
          var f = todo.shift();
          resolve(f).then(function () {
            done++;
            onProgress && onProgress(done, total);
          }, function (er) {
            if (er.code === 'bad-key') { blocked = true; emit('error', er); }
            else if (er.code === 'rate') { pausedUntil = Date.now() + (er.extra || 3) * 1000; todo.push(f); }
            else { done++; onProgress && onProgress(done, total); }
          }).then(function () {
            setTimeout(step, Math.max(0, pausedUntil - Date.now()));
          });
        }
        for (var k = 0; k < lanes; k++) step();
      });
    },
    cancelPreload: function () { if (FA.tmdb._cancel) FA.tmdb._cancel(); },
    norm: norm,
  };
})();
