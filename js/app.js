/* Film Awards — UI. Plain JS, no build step. */
(function () {
  'use strict';
  var FA = window.FA, store = FA.store, tmdb = FA.tmdb;

  // ------------------------------------------------------------------------------------------
  // constants
  // ------------------------------------------------------------------------------------------
  var AW = {
    oscars: { name: 'Oscars', long: 'Academy Awards', group: 'films', kind: 'film' },
    goyas: { name: 'Goyas', long: 'Goya Awards', group: 'films', kind: 'film' },
    emmys: { name: 'Emmys', long: 'Primetime Emmy Awards', group: 'series', kind: 'tv' },
    globes: { name: 'Globes', long: 'Golden Globe Awards', group: 'series', kind: 'tv' },
  };
  var GROUPS = { films: ['oscars', 'goyas'], series: ['emmys', 'globes'] };
  var AWARDS = ['oscars', 'goyas', 'emmys', 'globes'];
  var CATS = {}; // award -> {order:[k], def:{k:{k,label,short,t,main,music}}}
  var STAR_PATH = 'M12 2.5l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 8.9l6-.9z';
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var NOTE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';
  var REGIONS = { ES: 'Spain', US: 'United States', GB: 'United Kingdom', MX: 'Mexico', AR: 'Argentina', CO: 'Colombia', CL: 'Chile', FR: 'France', DE: 'Germany', IT: 'Italy', PT: 'Portugal' };

  // ------------------------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------------------------
  var $app = document.getElementById('app');
  var $title = document.getElementById('title');
  var $back = document.getElementById('back');
  var $toast = document.getElementById('toast');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtRating(v) { return v % 1 ? v.toFixed(1) : String(v); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  function hue(s) { var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 360; return n; }
  function initials(t) {
    var w = tmdb.norm(t).replace(/^(the|a|an|el|la|los|las|un|una)\s+/, '').split(' ').filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }
  var toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, 3600);
  }
  FA.onStorageProblem = (function () {
    var shown = false;
    return function () {
      if (shown) return; shown = true;
      toast("Can't save on this browser (private mode?). Your marks will be lost when you close it.");
    };
  })();

  // ------------------------------------------------------------------------------------------
  // data
  // ------------------------------------------------------------------------------------------
  var DATA = {};
  var FILMS = {};
  var ALL = { oscars: [], goyas: [], emmys: [], globes: [] };
  var BY_TITLE = { oscars: new Map(), goyas: new Map(), emmys: new Map(), globes: new Map() };
  var UIDS = {};   // user-data id -> latest record (a TV series shares one id across years and awards)
  var BY_UID = {}; // user-data id -> all records
  FA.data = { DATA: DATA, FILMS: FILMS, ALL: ALL, UIDS: UIDS, CATS: CATS }; // handy for debugging in the console

  function indexData(award, data) {
    DATA[award] = data;
    var cm = { order: [], def: {} };
    data.cats.forEach(function (c) { cm.order.push(c.k); cm.def[c.k] = c; });
    CATS[award] = cm;
    data.years.sort(function (a, b) { return a.year - b.year; });
    data.years.forEach(function (y) {
      y.films.forEach(function (f) {
        f.award = award;
        f.kind = data.kind;
        f.uid = f.sid || f.id;
        f.cy = y.year;
        f.ceremony = y.ceremony;
        f.wins = f.noms.filter(function (n) { return n.w; }).length;
        FILMS[f.id] = f;
        ALL[award].push(f);
        if (!UIDS[f.uid] || f.cy >= UIDS[f.uid].cy) UIDS[f.uid] = f;
        (BY_UID[f.uid] = BY_UID[f.uid] || []).push(f);
        [f.title, f.titleEn].forEach(function (t) {
          if (!t) return;
          var k = tmdb.norm(t);
          if (!BY_TITLE[award].has(k)) BY_TITLE[award].set(k, []);
          BY_TITLE[award].get(k).push(f);
        });
      });
    });
  }
  function loadData() {
    return Promise.all(AWARDS.map(function (k) {
      return fetch('data/' + k + '.json').then(function (r) {
        if (!r.ok) throw new Error('Could not load data/' + k + '.json (' + r.status + ')');
        return r.json();
      }).then(function (d) { indexData(k, d); });
    }));
  }
  function yearObj(f) { return DATA[f.award].years.filter(function (y) { return y.year === f.cy; })[0]; }
  function ceremonyName(award, y) { return y.ceremony + ' ' + AW[award].long; }
  function label(f, c) { return CATS[f.award].def[c].label; }
  function shortLabel(f, c) { return CATS[f.award].def[c].short; }
  function isMain(f, c) { return !!CATS[f.award].def[c].main; }
  function uidOf(id) { return FILMS[id] ? FILMS[id].uid : id; }
  function seasonLabel(fy) { return 'Season ' + fy + '–' + String(fy + 1).slice(2); }
  function noun(award, n) { return AW[award].kind === 'tv' ? (n === 1 ? 'series' : 'series') : (n === 1 ? 'film' : 'films'); }
  function mainName(award) { return AW[award].kind === 'tv' ? 'Series' : CATS[award].def[CATS[award].order[0]].label; }
  function uniq(list) { var seen = {}, out = []; list.forEach(function (f) { if (!seen[f.uid]) { seen[f.uid] = 1; out.push(f); } }); return out; }

  // the same title in the sibling award (Oscars <-> Goyas, Emmys <-> Globes), or elsewhere for a series
  function crossFilms(f) {
    var seen = {}, out = [];
    if (f.kind === 'tv') {
      (BY_UID[f.uid] || []).forEach(function (g) { if (g.id !== f.id) out.push(g); });
      out.sort(function (a, b) { return b.cy - a.cy || a.award.localeCompare(b.award); });
      return out;
    }
    var other = f.award === 'oscars' ? 'goyas' : 'oscars';
    [f.title, f.titleEn].forEach(function (t) {
      if (!t) return;
      (BY_TITLE[other].get(tmdb.norm(t)) || []).forEach(function (g) {
        if (Math.abs(g.year - f.year) <= 1 && !seen[g.id]) { seen[g.id] = 1; out.push(g); }
      });
    });
    return out;
  }

  function winnersOf(award, y) {
    var out = [];
    CATS[award].order.forEach(function (c) {
      y.films.forEach(function (f) {
        f.noms.forEach(function (n) { if (n.c === c && n.w) out.push({ c: c, film: f, nom: n }); });
      });
    });
    return out;
  }

  function seenCount(films) { return uniq(films).filter(function (f) { return store.isSeen(f.uid); }).length; }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  // ------------------------------------------------------------------------------------------
  // small renderers
  // ------------------------------------------------------------------------------------------
  function posterHTML(f, size) {
    var e = tmdb.cached(f.uid);
    var src = e && e.p ? tmdb.img(e.p, size || 'w185') : '';
    return '<span class="ph" style="--h:' + hue(f.title) + '"><span>' + esc(initials(f.title)) + '</span></span>' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : '');
  }

  function tmdbScoreHTML(f) {
    var e = tmdb.cached(f.uid);
    if (e && e.r) return '★ <b>' + e.r.toFixed(1) + '</b> TMDB';
    if (e && e.i) return '★ <b>–</b> TMDB';
    if (!tmdb.hasKey() || (e && e.m)) return '';
    return '<span style="opacity:.5">★ …</span>';
  }

  function badgesHTML(f) {
    var out = [];
    var mains = f.noms.filter(function (n) { return isMain(f, n.c); });
    var wins = f.noms.filter(function (n) { return n.w && !isMain(f, n.c); });
    var mw = mains.filter(function (n) { return n.w; });
    if (mw.length) mw.slice(0, 2).forEach(function (n) { out.push('<span class="badge win">🏆 ' + esc(f.kind === 'tv' ? shortLabel(f, n.c) + ' series' : label(f, n.c)) + '</span>'); });
    else if (mains.length) out.push('<span class="badge nom">' + esc(f.kind === 'tv' ? shortLabel(f, mains[0].c) + ' series' : label(f, mains[0].c)) + ' nominee</span>');
    if (wins.length) {
      var max = mains.length ? 2 : 3;
      var shown = {};
      wins.forEach(function (n) {
        if (Object.keys(shown).length >= max || shown[n.c]) return;
        shown[n.c] = 1;
        out.push('<span class="badge win">🏆 ' + esc(shortLabel(f, n.c)) + '</span>');
      });
      var rest = wins.length - Object.keys(shown).length;
      if (rest > 0) out.push('<span class="badge win">+' + rest + '</span>');
    } else if (!mains.length) {
      var cats = [];
      f.noms.forEach(function (n) { if (cats.indexOf(n.c) < 0) cats.push(n.c); });
      cats.slice(0, 3).forEach(function (c) { out.push('<span class="badge nom">' + esc(shortLabel(f, c)) + '</span>'); });
      if (cats.length > 3) out.push('<span class="badge nom">+' + (cats.length - 3) + '</span>');
    }
    return out.join('');
  }

  function countHTML(f) {
    return (f.wins ? plural(f.wins, 'win') + ' · ' : '') + plural(f.noms.length, 'nomination');
  }

  var openNotes = new Set();

  function filmRow(f, opts) {
    opts = opts || {};
    var u = store.get(f.uid);
    var seen = !!u.s;
    var note = u.n || '';
    var open = openNotes.has(f.id);
    var sub = [];
    if (opts.context) sub.push(opts.context);
    if (f.titleEn) sub.push(f.titleEn);
    if (f.kind === 'tv') sub.push(seasonLabel(f.year));
    else sub.push(f.year);
    if (f.director) sub.push((f.kind === 'tv' ? 'By ' : 'Dir. ') + f.director);
    var e = tmdb.cached(f.uid);
    return '<li class="film' + (seen ? ' is-seen' : '') + '" data-id="' + f.id + '">' +
      '<a class="poster" href="#/film/' + f.id + '" tabindex="-1" aria-hidden="true" data-p="' + esc(e && e.p || '') + '">' + posterHTML(f) + '</a>' +
      '<div class="film-body">' +
        '<a class="film-title" href="#/film/' + f.id + '">' + esc(f.title) + '</a>' +
        '<div class="film-sub">' + esc(sub.join(' · ')) + '</div>' +
        '<div class="film-badges">' + badgesHTML(f) + '</div>' +
        '<div class="film-count">' + esc(countHTML(f)) + '</div>' +
        '<div class="film-scores"><span class="tmdb-score">' + tmdbScoreHTML(f) + '</span>' +
          (u.r ? '<span class="mine-score">★ ' + fmtRating(u.r) + ' you</span>' : '') + '</div>' +
      '</div>' +
      '<label class="seen"><input type="checkbox" data-act="seen"' + (seen ? ' checked' : '') + ' aria-label="Seen: ' + esc(f.title) + '">' +
        '<span class="box">' + CHECK + '</span><span class="lbl">Seen</span></label>' +
      '<div class="film-actions"><button type="button" class="note-btn' + (note ? ' has' : '') + '" data-act="note" aria-expanded="' + open + '">' +
        NOTE_ICON + (note ? 'Comment' : 'Add comment') + '</button></div>' +
      (note && !open ? '<p class="note-snip">“' + esc(note) + '”</p>' : '') +
      '<div class="note-box"' + (open ? '' : ' hidden') + '><textarea class="field" data-act="note-text" rows="3" maxlength="2000" placeholder="Your comments…" aria-label="Comments on ' + esc(f.title) + '">' + esc(note) + '</textarea></div>' +
    '</li>';
  }

  function starsHTML(value) {
    var out = '<span class="stars" role="group" aria-label="Your rating">';
    for (var i = 1; i <= 5; i++) {
      var fill = Math.max(0, Math.min(1, value - (i - 1)));
      out += '<button type="button" class="star" data-star="' + i + '" style="--cut:' + ((1 - fill) * 100) + '%" aria-label="' + i + ' stars">' +
        '<svg class="base" viewBox="0 0 24 24"><path d="' + STAR_PATH + '"/></svg>' +
        '<svg class="fill" viewBox="0 0 24 24"><path d="' + STAR_PATH + '"/></svg></button>';
    }
    return out + '</span>';
  }

  // ------------------------------------------------------------------------------------------
  // views — each returns {title, back, award, tab, html, after}
  // ------------------------------------------------------------------------------------------
  function awardSwitch(award) {
    var g = GROUPS[AW[award].group];
    return '<div class="seg" role="group" aria-label="Award">' + g.map(function (k) {
      return '<a class="seg-i' + (k === award ? ' active' : '') + '" data-award="' + k + '" href="#/' + k + '"' + (k === award ? ' aria-current="page"' : '') + '>' + esc(AW[k].name) + '</a>';
    }).join('') + '</div>';
  }

  function viewYears(award) {
    store.setPref('award', award);
    store.setPref('award.' + AW[award].group, award);
    var A = DATA[award];
    var tv = AW[award].kind === 'tv';
    var years = A.years.slice().reverse();
    var films = uniq(ALL[award]);
    var seen = seenCount(films);
    var winners = uniq(ALL[award].filter(function (f) { return f.pic === 'winner'; }));
    var winSeen = seenCount(winners);
    var cards = years.map(function (y) {
      var yw = y.films.filter(function (f) { return f.pic === 'winner'; });
      if (y.upcoming) {
        return '<a class="year-card upcoming" href="#/' + award + '/' + y.year + '">' +
          '<div class="yc-top"><span class="yc-year">' + y.year + '</span><span class="yc-ord">' + esc(y.ceremony) + '</span></div>' +
          '<div class="yc-win muted">Coming up · not announced yet</div></a>';
      }
      var s = seenCount(y.films);
      return '<a class="year-card" href="#/' + award + '/' + y.year + '">' +
        '<div class="yc-top"><span class="yc-year">' + y.year + '</span><span class="yc-ord">' + esc(y.ceremony) + '</span></div>' +
        '<div class="yc-win">🏆 ' + esc(yw.map(function (f) { return f.title; }).join(' · ') || '—') + '</div>' +
        '<div class="yc-prog"><div class="bar"><i style="width:' + pct(s, y.films.length) + '%"></i></div>' +
        '<span>' + s + ' / ' + y.films.length + ' seen</span></div></a>';
    }).join('');
    return {
      title: AW[award].name, award: award, tab: AW[award].group,
      html:
        awardSwitch(award) +
        '<div class="searchbar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
        '<input id="q" class="field" type="search" placeholder="Search ' + AW[award].name + ': title, ' + (tv ? 'actor, director…' : 'director, actor…') + '" autocomplete="off" autocapitalize="off" enterkeyhint="search"></div>' +
        '<div id="results" hidden></div>' +
        '<div id="years-wrap">' +
          '<div class="summary">' +
            '<div class="card"><b>' + seen + '<span> / ' + films.length + '</span></b><span>' + (tv ? 'series' : 'films') + ' seen</span></div>' +
            '<div class="card"><b>' + winSeen + '<span> / ' + winners.length + '</span></b><span>' + esc(mainName(award)) + ' winners seen</span></div>' +
          '</div>' +
          '<div class="year-grid">' + cards + '</div>' +
        '</div>',
      after: function () { bindSearch(award); },
    };
  }

  function bindSearch(award) {
    var input = document.getElementById('q');
    var box = document.getElementById('results');
    var wrap = document.getElementById('years-wrap');
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var q = tmdb.norm(input.value);
        if (q.length < 2) { box.hidden = true; wrap.hidden = false; return; }
        var res = searchFilms(award, q);
        wrap.hidden = true; box.hidden = false;
        box.innerHTML = res.length
          ? '<p class="muted small">' + plural(res.length, 'result') + (res.length >= 60 ? ' (showing first 60)' : '') + '</p><ul class="film-list">' +
            res.map(function (f) { return filmRow(f, { context: f.cy + ' ceremony' }); }).join('') + '</ul>'
          : '<p class="empty">Nothing matches “' + esc(input.value) + '”.</p>';
        observePosters();
      }, 160);
    });
  }

  function searchFilms(award, q) {
    var out = [];
    var all = ALL[award].slice().sort(function (a, b) { return b.cy - a.cy; });
    for (var i = 0; i < all.length && out.length < 60; i++) {
      var f = all[i];
      var hay = [f.title, f.titleEn, f.director].concat(f.noms.map(function (n) { return (n.p || '') + ' ' + (n.by || ''); })).join(' | ');
      if (tmdb.norm(hay).indexOf(q) >= 0) out.push(f);
    }
    return out;
  }

  var ctxYear = null; // film list currently on screen: {award, year, films}

  function sortFilms(list, sort) {
    var l = list.slice();
    function tm(f) { var e = tmdb.cached(f.uid); return e && e.r || 0; }
    if (sort === 'tmdb') l.sort(function (a, b) { return tm(b) - tm(a); });
    else if (sort === 'mine') l.sort(function (a, b) { return store.rating(b.uid) - store.rating(a.uid); });
    else if (sort === 'title') l.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return l;
  }
  function filterFilms(list, filter) {
    if (filter === 'unseen') return list.filter(function (f) { return !store.isSeen(f.uid); });
    if (filter === 'seen') return list.filter(function (f) { return store.isSeen(f.uid); });
    return list;
  }

  function viewYear(award, year) {
    var A = DATA[award];
    var idx = -1;
    A.years.forEach(function (y, i) { if (y.year === year) idx = i; });
    if (idx < 0) return notFound('That ceremony is not in the list.');
    var y = A.years[idx];
    var older = A.years[idx - 1], newer = A.years[idx + 1];
    ctxYear = { award: award, year: y };
    var wins = winnersOf(award, y);
    var winHTML = wins.map(function (w) {
      var who = w.nom.p ? esc(w.nom.p) + ' — ' : '';
      if (CATS[award].def[w.c].t === 'song') who = '“' + esc(w.nom.p) + '” — ';
      return '<div><small>' + esc(CATS[award].def[w.c].label) + '</small><span>' + who +
        '<a href="#/film/' + w.film.id + '">' + esc(w.film.title) + '</a></span></div>';
    }).join('');
    var s = seenCount(y.films);
    return {
      title: y.year + ' · ' + AW[award].name, back: '#/' + award, award: award, tab: AW[award].group,
      html:
        '<div class="year-head">' +
          '<a class="nav" href="' + (older ? '#/' + award + '/' + older.year : '#') + '" aria-label="' + (older ? 'Previous ceremony, ' + older.year : 'No earlier ceremony') + '"' + (older ? '' : ' aria-disabled="true"') + '><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>' +
          '<div><h2>' + esc(ceremonyName(award, y)) + '</h2><div class="muted small">' + (AW[award].kind === 'tv' ? seasonLabel(y.filmYear) + ' · ' + y.films.length + ' series' : 'Films of ' + y.filmYear + ' · ' + plural(y.films.length, 'film')) + '</div></div>' +
          '<a class="nav" href="' + (newer ? '#/' + award + '/' + newer.year : '#') + '" aria-label="' + (newer ? 'Next ceremony, ' + newer.year : 'No later ceremony') + '"' + (newer ? '' : ' aria-disabled="true"') + '><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></a>' +
        '</div>' +
        (y.upcoming ? '<p class="empty">🕑 This ceremony hasn\'t happened yet. The nominees will be added here once they are announced.</p>' : '') +
        '<div class="prog-line"' + (y.upcoming ? ' hidden' : '') + '><div class="bar"><i id="yprog" style="width:' + pct(s, y.films.length) + '%"></i></div><span id="ytxt">' + s + ' / ' + y.films.length + ' seen</span></div>' +
        '<details class="winners"' + (y.upcoming ? ' hidden' : '') + '><summary>Winners of the night</summary><div class="winners-list">' + winHTML + '</div></details>' +
        '<div class="controls"' + (y.upcoming ? ' hidden' : '') + '><div class="chips" role="group" aria-label="Filter">' +
          ['all', 'unseen', 'seen'].map(function (k) { return '<button type="button" class="chip" data-filter="' + k + '" aria-pressed="false">' + { all: 'All', unseen: 'Not seen', seen: 'Seen' }[k] + '</button>'; }).join('') +
        '</div><select class="field" id="sort" aria-label="Sort">' +
          '<option value="awards">Awards order</option><option value="tmdb">TMDB rating</option><option value="mine">My rating</option><option value="title">Title A–Z</option></select></div>' +
        '<ul class="film-list" id="film-list"></ul>',
      after: function () {
        document.getElementById('sort').value = store.getPref('sort', 'awards');
        refreshList();
      },
    };
  }

  function refreshList() {
    if (!ctxYear) return;
    var list = document.getElementById('film-list');
    if (!list || ctxYear.year.upcoming) return;
    var filter = store.getPref('filter', 'all');
    var sort = store.getPref('sort', 'awards');
    Array.prototype.forEach.call($app.querySelectorAll('[data-filter]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    });
    var films = sortFilms(filterFilms(ctxYear.year.films, filter), sort);
    list.innerHTML = films.length ? films.map(function (f) { return filmRow(f); }).join('')
      : '<li class="empty">' + (filter === 'seen' ? 'Nothing marked as seen yet.' : 'You have seen everything here. 🎉') + '</li>';
    observePosters();
  }

  function refreshProgress() {
    if (!ctxYear) return;
    var bar = document.getElementById('yprog'), txt = document.getElementById('ytxt');
    if (!bar) return;
    var s = seenCount(ctxYear.year.films), n = ctxYear.year.films.length;
    bar.style.width = pct(s, n) + '%';
    txt.textContent = s + ' / ' + n + ' seen';
  }

  // ---- film detail ---------------------------------------------------------------------------
  function viewFilm(id) {
    var f = FILMS[id];
    if (!f) return notFound('That film is not in the list.');
    var y = yearObj(f);
    var u = store.get(f.uid);
    var e = tmdb.cached(f.uid);
    var award = f.award;
    var tv = f.kind === 'tv';
    var def = CATS[award].def;

    var noms = f.noms.slice().sort(function (a, b) {
      return CATS[award].order.indexOf(a.c) - CATS[award].order.indexOf(b.c) || (b.w ? 1 : 0) - (a.w ? 1 : 0);
    });
    var nomRows = noms.map(function (n) {
      var who = '';
      if (def[n.c].t === 'song') who = '<b>“' + esc(n.p) + '”</b>' + (n.by ? '<small>' + esc(n.by) + '</small>' : '');
      else if (n.p) who = '<b>' + esc(n.p) + '</b>';
      return '<div class="nom-row' + (n.w ? ' won' : '') + '"><div class="cat">' + esc(label(f, n.c)) + '</div><div class="who">' + who + '</div>' +
        '<span class="res">' + (n.w ? '🏆 Winner' : 'Nominee') + '</span></div>';
    }).join('');

    // music block: score / theme / song nominations, and what won that night
    var music = '';
    var musicNoms = noms.filter(function (n) { return def[n.c].music; });
    if (musicNoms.length) {
      var allW = winnersOf(award, y);
      var parts = '', night = '';
      var small = { SCORE: 'Original score', SCORE_L: 'Original score (limited / movie)', THEME: 'Main title theme', SONG: 'Original song' };
      musicNoms.forEach(function (n) {
        var isSong = def[n.c].t === 'song';
        parts += '<div class="line"><small>' + esc(small[n.c] || def[n.c].label) + '</small><b>' + (isSong ? '“' + esc(n.p) + '”' : esc(n.p)) + '</b>' +
          (isSong && n.by ? ' <span class="muted">· ' + esc(n.by) + '</span>' : '') + ' <span class="tag">' + (n.w ? '🏆 won' : 'nominated') + '</span></div>';
      });
      var done = {};
      musicNoms.forEach(function (n) {
        if (done[n.c]) return; done[n.c] = 1;
        var w = allW.filter(function (x) { return x.c === n.c; })[0];
        if (!w || w.film.id === f.id) return;
        var isSong = def[n.c].t === 'song';
        night += '<div class="muted">' + esc((small[n.c] || def[n.c].label).replace(/^Original /, '')) + ' winner: <b>' + (isSong ? '“' + esc(w.nom.p) + '”' : esc(w.nom.p)) + '</b> — <a href="#/film/' + w.film.id + '" style="color:var(--accent)">' + esc(w.film.title) + '</a></div>';
      });
      music = '<h3>Music</h3><div class="card music-card">' + parts + (night ? '<div class="small muted">' + night + '</div>' : '') + '</div>';
    }

    var cross = crossFilms(f).map(function (g) {
      var won = g.noms.filter(function (n) { return n.w; }).length;
      return '<a class="badge nom" href="#/film/' + g.id + '">' + (tv ? esc(AW[g.award].name) + ' ' + g.cy + ' · ' + g.noms.length + (won ? ' (' + won + ' won)' : '')
        : 'Also at the ' + esc(AW[g.award].name) + ' ' + g.cy + ' · ' + plural(g.noms.length, 'nomination')) + '</a>';
    }).join('');

    var chips = '<a class="badge ' + (f.pic === 'winner' ? 'win' : 'nom') + '" href="#/' + award + '/' + f.cy + '">' +
      (f.pic === 'winner' ? '🏆 ' : '') + esc(ceremonyName(award, y)) + '</a>' +
      (tv && cross ? '<div class="small muted" style="width:100%;margin-top:6px">Other nominations of this series</div>' : '') + cross;

    var hint = tmdb.hasKey() ? '' :
      '<div class="hint" style="margin-top:16px">Add your free TMDB key in <a href="#/settings">Settings</a> to get posters, public ratings, synopsis, cast and where to watch.</div>';

    return {
      title: f.title, back: '#/' + award + '/' + f.cy, award: award, tab: AW[award].group,
      html:
        '<div id="detail" data-id="' + f.id + '">' +
        '<div class="hero"><a class="poster" id="d-poster" tabindex="-1" aria-hidden="true" data-p="' + esc(e && e.p || '') + '">' + posterHTML(f, 'w342') + '</a>' +
          '<div><h2>' + esc(f.title) + '</h2>' +
          (f.titleEn ? '<div class="muted">' + esc(f.titleEn) + '</div>' : '') +
          '<div class="meta" id="d-meta">' + (tv ? seasonLabel(f.year) : f.year) + '</div>' +
          '<div class="dir" id="d-dir">' + (f.director ? '<small>' + (tv ? 'Created by' : 'Director') + '</small>' + esc(f.director) : '') + '</div></div></div>' +
        '<div class="head-chips">' + chips + '</div>' +
        '<div class="card score-card">' +
          '<div class="cell"><small>TMDB rating</small><div class="big" id="d-tmdb">' + (e && e.r ? e.r.toFixed(1) + '<em> / 10</em>' : '<em>' + (tmdb.hasKey() ? '…' : '–') + '</em>') + '</div>' +
            '<div class="muted small" id="d-votes">' + (e && e.v ? e.v.toLocaleString('en-US') + ' votes' : '') + '</div></div>' +
          '<div class="cell"><small>Your rating</small><div id="d-stars">' + starsHTML(u.r || 0) + '</div><div class="muted small" id="d-mine">' + (u.r ? fmtRating(u.r) + ' / 5 · tap again to clear' : 'Tap left half of a star for ½') + '</div></div>' +
          '<div class="cell full"><label class="seen-big"><input type="checkbox" data-act="seen"' + (u.s ? ' checked' : '') + '><span class="box">' + CHECK + '</span><span>I\'ve seen it</span></label></div>' +
        '</div>' +
        hint +
        '<h3>' + esc(AW[award].name) + ' ' + f.cy + ' · ' + esc(String(f.wins ? f.wins + ' won, ' : '')) + plural(f.noms.length, 'nomination') + '</h3>' +
        '<div class="noms">' + nomRows + '</div>' +
        music +
        '<div id="d-info"><h3>About</h3>' + (tmdb.hasKey() ? '<div class="skeleton"></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div>' : '<p class="muted small">No TMDB key set.</p>') + '</div>' +
        '<h3>Your comments</h3>' +
        '<textarea class="field" id="d-note" data-act="note-text" rows="4" maxlength="2000" placeholder="What did you think?" aria-label="Your comments">' + esc(u.n || '') + '</textarea>' +
        '<div class="muted small" id="d-saved" style="margin-top:4px">Saved on this phone.</div>' +
        (tmdb.hasKey() ? '<div class="btn-row"><button type="button" class="btn small" data-act="match">Wrong poster or info? Fix the match</button></div>' : '') +
        '</div>',
      after: function () { if (tmdb.hasKey()) loadDetails(f); },
    };
  }

  function loadDetails(f) {
    tmdb.details(f).then(function (d) {
      var root = document.getElementById('detail');
      if (!root || root.dataset.id !== f.id) return;
      var info = document.getElementById('d-info');
      if (!d) {
        info.innerHTML = '<h3>About</h3><p class="muted small">Couldn\'t find this title on TMDB. Use “Fix the match” below to paste its TMDB link.</p>';
        return;
      }
      var tv = f.kind === 'tv';
      var meta = [tv ? seasonLabel(f.year) : f.year];
      if (tv) {
        if (d.seasons) meta.push(plural(d.seasons, 'season') + (d.eps ? ' · ' + d.eps + ' eps' : ''));
        if (d.rt) meta.push('~' + d.rt + ' min');
      } else if (d.rt) meta.push(Math.floor(d.rt / 60) + 'h ' + (d.rt % 60) + 'm');
      if (d.g.length) meta.push(d.g.slice(0, 3).join(', '));
      document.getElementById('d-meta').textContent = meta.join(' · ');
      if (!f.director && d.dir.length) {
        document.getElementById('d-dir').innerHTML = '<small>' + (tv ? 'Created by' : 'Director') + '</small>' + esc(d.dir.join(', '));
      }
      if (d.r) {
        document.getElementById('d-tmdb').innerHTML = d.r.toFixed(1) + '<em> / 10</em>';
        document.getElementById('d-votes').textContent = d.v.toLocaleString('en-US') + ' votes';
      }
      if (d.p) {
        var pz = document.getElementById('d-poster');
        if (pz.dataset.p !== d.p) { pz.dataset.p = d.p; pz.innerHTML = posterHTML(f, 'w342'); }
      }
      var lang = '';
      try { lang = d.lang ? new Intl.DisplayNames(['en'], { type: 'language' }).of(d.lang) : ''; } catch (e) { lang = d.lang; }
      var tvInfo = tv ? [d.rd ? (d.rd.slice(0, 4) + (d.status === 'Ended' && d.last ? '–' + d.last.slice(0, 4) : '–')) : '', d.status].concat(d.nets || []) : [];
      var pills = tvInfo.concat([lang]).concat(d.c.slice(0, 3)).concat(d.g).filter(Boolean);
      var html = '<h3>About</h3>' +
        (d.tag ? '<p class="tagline">' + esc(d.tag) + '</p>' : '') +
        '<p class="prose">' + (d.ov ? esc(d.ov) : '<span class="muted">No synopsis available.</span>') + '</p>' +
        (pills.length ? '<div class="pills" style="margin-top:12px">' + pills.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join('') + '</div>' : '');
      if (d.cast.length) {
        html += '<h3>Main cast</h3><ul class="cast-list">' + d.cast.slice(0, 6).map(function (c) {
          return '<li>' + esc(c.n) + (c.ch ? ' <span>as ' + esc(c.ch) + '</span>' : '') + '</li>';
        }).join('') + '</ul>';
      }
      html += '<div id="d-prov"></div>' +
        '<h3>Links</h3><div class="linkrow"><a href="https://www.themoviedb.org/' + (tv ? 'tv' : 'movie') + '/' + d.id + '" target="_blank" rel="noopener">TMDB</a>' +
        (d.imdb ? '<a href="https://www.imdb.com/title/' + esc(d.imdb) + '/" target="_blank" rel="noopener">IMDb</a>' : '') + '</div>' +
        '<p class="attrib">Data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>';
      info.innerHTML = html;

      var region = store.getRegion();
      tmdb.providers(d.id, region, f.kind).then(function (p) {
        var box = document.getElementById('d-prov');
        if (!box || !document.getElementById('detail') || document.getElementById('detail').dataset.id !== f.id) return;
        var rows = [];
        if (p.f.length) rows.push('<div><b>Stream:</b> ' + esc(p.f.join(', ')) + '</div>');
        if (p.r.length) rows.push('<div><b>Rent:</b> ' + esc(p.r.join(', ')) + '</div>');
        if (p.b.length) rows.push('<div><b>Buy:</b> ' + esc(p.b.join(', ')) + '</div>');
        box.innerHTML = '<h3>Where to watch · ' + esc(REGIONS[region] || region) + '</h3>' +
          (rows.length ? '<div class="card small" style="display:grid;gap:6px">' + rows.join('') + '</div>' : '<p class="muted small">Not listed for streaming, rent or purchase in this region.</p>') +
          '<p class="attrib">Availability data by JustWatch (via TMDB).</p>';
      }).catch(function () { /* providers are optional */ });
    }).catch(function (er) {
      var info = document.getElementById('d-info');
      if (!info) return;
      var msg = er && er.code === 'bad-key' ? 'TMDB rejected your key — check it in Settings.'
        : er && er.code === 'network' ? 'Couldn\'t reach TMDB (offline?).' : 'Couldn\'t load TMDB info right now.';
      info.innerHTML = '<h3>About</h3><p class="muted small">' + esc(msg) + '</p>';
    });
  }

  // ---- my films ------------------------------------------------------------------------------
  function viewMine() {
    var mode = store.getPref('mine', 'seen');
    var all = store.all();
    var ids = Object.keys(all).filter(function (id) { return UIDS[id]; });
    var seen = ids.filter(function (id) { return all[id].s; });
    var rated = ids.filter(function (id) { return all[id].r; });
    var avg = rated.length ? rated.reduce(function (a, id) { return a + all[id].r; }, 0) / rated.length : 0;
    var shown = ids.filter(function (id) {
      return mode === 'seen' ? all[id].s : mode === 'rated' ? all[id].r : all[id].n;
    }).sort(function (a, b) { return (all[b].t || 0) - (all[a].t || 0); });
    var prog = AWARDS.map(function (a) {
      var w = uniq(ALL[a].filter(function (f) { return f.pic === 'winner'; }));
      var sn = seenCount(w);
      return '<div class="card"><b>' + sn + '<span> / ' + w.length + '</span></b><span>' + AW[a].name + ' ' + esc(mainName(a).replace('Best ', '')) + ' winners</span><div class="bar" style="margin-top:8px"><i style="width:' + pct(sn, w.length) + '%"></i></div></div>';
    }).join('');
    var nSeries = seen.filter(function (id) { return UIDS[id].kind === 'tv'; }).length;
    var tabs = [['seen', 'Seen'], ['rated', 'Rated'], ['noted', 'Commented']].map(function (t) {
      return '<button type="button" class="chip" data-mine="' + t[0] + '" aria-pressed="' + (mode === t[0]) + '">' + t[1] + '</button>';
    }).join('');
    return {
      title: 'My list', tab: 'mine', award: store.getPref('award', 'oscars'),
      html:
        '<div class="summary"><div class="card"><b>' + seen.length + '</b><span>seen · ' + (seen.length - nSeries) + ' films, ' + nSeries + ' series</span></div>' +
        '<div class="card"><b>' + (rated.length ? avg.toFixed(1) : '–') + '<span> / 5</span></b><span>average of ' + plural(rated.length, 'rating') + '</span></div></div>' +
        '<div class="summary">' + prog + '</div>' +
        '<div class="controls"><div class="chips">' + tabs + '</div></div>' +
        (shown.length
          ? '<ul class="film-list">' + shown.map(function (id) { var f = UIDS[id]; return filmRow(f, { context: AW[f.award].name + ' ' + f.cy }); }).join('') + '</ul>'
          : '<p class="empty">Nothing here yet. Tick “Seen”, rate or comment on a film or series and it shows up here.</p>'),
      after: function () { observePosters(); },
    };
  }

  // ---- settings ------------------------------------------------------------------------------
  function viewSettings() {
    var key = store.getKey();
    var region = store.getRegion();
    var userCount = Object.keys(store.all()).length;
    return {
      title: 'Settings', tab: 'settings', award: store.getPref('award', 'oscars'),
      html:
        '<h3 style="margin-top:6px">Posters, ratings &amp; info (TMDB)</h3>' +
        '<div class="card stack">' +
          '<p class="small muted" style="margin:0">Posters, public ratings, synopsis and cast come from The Movie Database. It\'s free: create an account at themoviedb.org → Settings → API, and paste the <b>API Key</b> here. It stays on this phone only.</p>' +
          '<div><label for="key">TMDB API key</label><input id="key" class="field" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(key) + '" placeholder="Paste your key"></div>' +
          '<div class="btn-row" style="margin-top:0"><button class="btn primary" type="button" data-act="save-key">Save &amp; test</button>' +
          '<button class="btn" type="button" data-act="show-key">Show</button></div>' +
          '<div class="status" id="key-status" role="status"></div>' +
          '<div><label for="region">Where to watch: region</label><select id="region" class="field" data-act="region">' +
            Object.keys(REGIONS).map(function (c) { return '<option value="' + c + '"' + (c === region ? ' selected' : '') + '>' + REGIONS[c] + '</option>'; }).join('') + '</select></div>' +
          '<div><div class="small muted">Posters load as you scroll. To fetch everything in one go (' + Object.keys(UIDS).length.toLocaleString('en-US') + ' titles, several minutes):</div>' +
          '<div class="btn-row"><button class="btn" type="button" data-act="preload"' + (key ? '' : ' disabled') + '>Load all posters &amp; ratings</button>' +
          '<button class="btn" type="button" data-act="cancel-preload" id="cancel-preload" hidden>Stop</button>' +
          '<button class="btn danger" type="button" data-act="clear-cache">Clear TMDB cache</button></div>' +
          '<div class="progress-wrap" id="preload-wrap" hidden><div class="bar"><i id="preload-bar" style="width:0"></i></div><div class="small muted" id="preload-text"></div></div></div>' +
        '</div>' +

        '<h3>Backup</h3>' +
        '<div class="card stack">' +
          '<p class="small muted" style="margin:0">Your “seen” marks, ratings and comments (' + userCount + ' films so far) live only in this browser. Export a backup now and then, and use it to move to a new phone or browser.</p>' +
          '<div class="btn-row" style="margin-top:0"><button class="btn primary" type="button" data-act="export">Export backup</button>' +
          '<button class="btn" type="button" data-act="export-copy">Copy as text</button></div>' +
          '<div><label for="imp-file">Import a backup file</label><input id="imp-file" class="field" type="file" accept=".json,application/json" data-act="import-file"></div>' +
          '<div><label for="imp-text">…or paste backup text</label><textarea id="imp-text" class="field" rows="3" placeholder="{&quot;app&quot;:&quot;film-awards&quot;, …}"></textarea></div>' +
          '<label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="imp-replace"> Replace everything instead of merging</label>' +
          '<div class="btn-row" style="margin-top:0"><button class="btn" type="button" data-act="import-text">Import pasted text</button></div>' +
          '<div class="status" id="backup-status" role="status"></div>' +
        '</div>' +

        '<h3>About</h3>' +
        '<div class="card small muted" style="display:grid;gap:6px">' +
          AWARDS.map(function (k) {
            var ys = DATA[k].years.filter(function (y) { return !y.upcoming; });
            return '<div>' + AW[k].name + ': ' + ys[0].year + '–' + ys[ys.length - 1].year + ' ceremonies · ' + uniq(ALL[k]).length + (AW[k].kind === 'tv' ? ' series' : ' films') + '</div>';
          }).join('') +
          '<div>Films: Picture, Director, the four acting awards, Original Score and Song. Series (Emmys): series, lead and supporting acting, directing, music. Series (Globes): series and acting.</div>' +
          '<div>Ceremony year = year the awards were held. For the Emmys it is the year the TV season ended (the 2023 Emmys, held in January 2024, are listed under 2023).</div>' +
          '<div style="margin-top:6px">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by JustWatch.</div>' +
        '</div>',
    };
  }

  function notFound(msg) {
    return { title: 'Not found', back: '#/', tab: '', award: 'oscars', html: '<p class="empty">' + esc(msg || 'Page not found.') + '</p>' };
  }

  // ------------------------------------------------------------------------------------------
  // poster lookups for rows on screen
  // ------------------------------------------------------------------------------------------
  var io = null;
  function observePosters() {
    if (!tmdb.hasKey() || !('IntersectionObserver' in window)) return;
    if (io) io.disconnect();
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var f = FILMS[en.target.dataset.id];
        if (f) tmdb.queue(f);
      });
    }, { rootMargin: '400px 0px' });
    Array.prototype.forEach.call($app.querySelectorAll('.film[data-id]'), function (li) { io.observe(li); });
  }

  function patchRow(li) {
    var f = FILMS[li.dataset.id];
    if (!f) return;
    var e = tmdb.cached(f.uid);
    var pz = li.querySelector('.poster');
    var p = (e && e.p) || '';
    if (pz && pz.dataset.p !== p) { pz.dataset.p = p; pz.innerHTML = posterHTML(f); }
    var sc = li.querySelector('.tmdb-score');
    if (sc) sc.innerHTML = tmdbScoreHTML(f);
  }

  // a poster that fails to load just falls back to the placeholder underneath
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.closest && t.closest('.poster')) t.remove();
  }, true);

  tmdb.on(function (type, id) {
    if (type === 'film') {
      Array.prototype.forEach.call($app.querySelectorAll('.film[data-id]'), function (li) {
        if (!id || uidOf(li.dataset.id) === id) patchRow(li);
      });
      var d = document.getElementById('detail');
      if (d && (!id || uidOf(d.dataset.id) === id)) {
        var e = tmdb.cached(uidOf(d.dataset.id));
        var t = document.getElementById('d-tmdb');
        if (t && e && e.r) t.innerHTML = e.r.toFixed(1) + '<em> / 10</em>';
      }
    } else if (type === 'error') {
      if (id && id.code === 'bad-key') toast('TMDB rejected your key. Check it in Settings.');
      else if (id && id.code === 'network') toast('Can\'t reach TMDB right now.');
    }
  });

  // ------------------------------------------------------------------------------------------
  // router
  // ------------------------------------------------------------------------------------------
  var scrollPos = {};
  var lastHash = null;

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    return h.split('?')[0].split('/').filter(Boolean).map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
  }
  function depth() { return (history.state && history.state.d) || 0; }

  function navigate(hash, replace) {
    if (hash === location.hash) { window.scrollTo(0, 0); return; }
    flushNotes();
    scrollPos[location.hash || '#/'] = window.scrollY;
    if (replace) history.replaceState({ d: depth() }, '', hash);
    else history.pushState({ d: depth() + 1 }, '', hash);
    render(false);
  }

  function render(restore) {
    flushNotes();
    lastHash = location.hash;
    ctxYear = null;
    var p = parseHash();
    var out;
    if (!p.length) { history.replaceState({ d: depth() }, '', '#/' + store.getPref('award', 'oscars')); p = parseHash(); }
    try {
      if (AW[p[0]] && p.length === 1) out = viewYears(p[0]);
      else if (AW[p[0]] && p.length >= 2) out = viewYear(p[0], parseInt(p[1], 10));
      else if (p[0] === 'film' && p[1]) out = viewFilm(p[1]);
      else if (p[0] === 'films' || p[0] === 'series') out = viewYears(store.getPref('award.' + p[0], GROUPS[p[0]][0]));
      else if (p[0] === 'mine') out = viewMine();
      else if (p[0] === 'settings') out = viewSettings();
      else out = notFound();
    } catch (er) {
      console.error(er);
      out = notFound('Something went wrong showing this page.');
    }
    document.documentElement.dataset.award = out.award || 'oscars';
    $title.textContent = out.title;
    document.title = out.title + ' · Film Awards';
    if (out.back) { $back.hidden = false; $back.dataset.parent = out.back; $back.setAttribute('href', out.back); }
    else $back.hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('#tabbar [data-tab]'), function (a) {
      if (GROUPS[a.dataset.tab]) a.setAttribute('href', '#/' + store.getPref('award.' + a.dataset.tab, GROUPS[a.dataset.tab][0]));
      var on = a.dataset.tab === out.tab;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $app.innerHTML = out.html;
    out.after && out.after();
    if (io && !document.querySelector('#results:not([hidden])')) observePosters();
    else if (tmdb.hasKey()) observePosters();
    window.scrollTo(0, restore ? (scrollPos[location.hash || '#/'] || 0) : 0);
  }

  window.addEventListener('popstate', function () { if (location.hash !== lastHash) render(true); });
  window.addEventListener('hashchange', function () { if (location.hash !== lastHash) render(true); });

  // ------------------------------------------------------------------------------------------
  // events (delegated)
  // ------------------------------------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    var href = a.getAttribute('href');
    if (href === '#') { e.preventDefault(); return; }
    e.preventDefault();
    if (a.id === 'back') {
      if (depth() > 0) history.back(); else navigate(href, true);
      return;
    }
    navigate(href);
  });

  var noteTimers = {};
  function saveNote(id, value) {
    store.set(uidOf(id), { n: value });
    var saved = document.getElementById('d-saved');
    if (saved && document.getElementById('detail') && document.getElementById('detail').dataset.id === id) saved.textContent = 'Saved on this phone ✓';
  }
  function flushNotes() {
    Object.keys(noteTimers).forEach(function (id) {
      var t = noteTimers[id];
      clearTimeout(t.timer);
      saveNote(id, t.value);
      delete noteTimers[id];
    });
  }
  window.addEventListener('pagehide', function () { flushNotes(); tmdb.flush(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { flushNotes(); tmdb.flush(); } });

  $app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.act !== 'note-text') return;
    var holder = t.closest('[data-id]');
    if (!holder) return;
    var id = holder.dataset.id;
    if (noteTimers[id]) clearTimeout(noteTimers[id].timer);
    noteTimers[id] = {
      value: t.value,
      timer: setTimeout(function () { var v = noteTimers[id].value; delete noteTimers[id]; saveNote(id, v); }, 500),
    };
  });

  $app.addEventListener('change', function (e) {
    var t = e.target;
    var act = t.dataset.act;
    if (act === 'seen') {
      var holder = t.closest('[data-id]');
      store.set(uidOf(holder.dataset.id), { s: t.checked ? 1 : 0 });
      holder.classList.toggle('is-seen', t.checked);
      refreshProgress();
    } else if (t.id === 'sort') {
      store.setPref('sort', t.value);
      refreshList();
    } else if (act === 'region') {
      store.setRegion(t.value);
      toast('Region set to ' + (REGIONS[t.value] || t.value));
    } else if (act === 'import-file') {
      var file = t.files && t.files[0];
      if (!file) return;
      file.text().then(function (txt) { doImport(txt); t.value = ''; }, function () { setStatus('backup-status', 'Couldn\'t read that file.', 'bad'); });
    }
  });

  function setStatus(id, msg, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function doImport(text) {
    try {
      var obj = JSON.parse(text);
      var replace = document.getElementById('imp-replace') && document.getElementById('imp-replace').checked;
      var r = store.importData(obj, replace ? 'replace' : 'merge');
      setStatus('backup-status', 'Imported: ' + r.added + ' new, ' + r.updated + ' updated, ' + r.kept + ' kept. ' + r.total + ' films in total.', 'ok');
    } catch (er) {
      setStatus('backup-status', er.message && er.message.indexOf('Film Awards') >= 0 ? er.message : 'That isn\'t a valid backup (' + er.message + ').', 'bad');
    }
  }

  function backupText() { return JSON.stringify(store.exportData(), null, 1); }

  function exportBackup() {
    var text = backupText();
    var name = 'film-awards-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    var file = null;
    try { file = new File([text], name, { type: 'application/json' }); } catch (er) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Film Awards backup' }).catch(function (er) {
        if (er && er.name === 'AbortError') return;
        downloadText(name, text);
      });
      return;
    }
    downloadText(name, text);
  }
  function downloadText(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    setStatus('backup-status', 'Backup downloaded as ' + name + '.', 'ok');
  }

  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act],[data-filter],[data-mine],[data-star]');
    if (!t) return;

    if (t.dataset.star) {
      var holder = t.closest('[data-id]');
      var n = parseInt(t.dataset.star, 10);
      var rect = t.getBoundingClientRect();
      var half = e.clientX && e.clientX - rect.left < rect.width / 2;
      var v = half ? n - 0.5 : n;
      var cur = store.rating(uidOf(holder.dataset.id));
      if (v === cur) v = 0;
      store.set(uidOf(holder.dataset.id), { r: v });
      document.getElementById('d-stars').innerHTML = starsHTML(v);
      document.getElementById('d-mine').textContent = v ? fmtRating(v) + ' / 5 · tap again to clear' : 'Tap left half of a star for ½';
      return;
    }
    if (t.dataset.filter) { store.setPref('filter', t.dataset.filter); refreshList(); return; }
    if (t.dataset.mine) { store.setPref('mine', t.dataset.mine); render(true); return; }

    var act = t.dataset.act;
    if (act === 'note') {
      var li = t.closest('[data-id]');
      var id = li.dataset.id;
      var open = !openNotes.has(id);
      if (open) openNotes.add(id); else { flushNotes(); openNotes.delete(id); }
      var box = li.querySelector('.note-box');
      box.hidden = !open;
      t.setAttribute('aria-expanded', String(open));
      var snip = li.querySelector('.note-snip');
      if (snip) snip.hidden = open;
      if (!open) {
        // closing: refresh label + snippet
        var note = store.note(uidOf(id));
        t.classList.toggle('has', !!note);
        t.lastChild.textContent = note ? 'Comment' : 'Add comment';
        if (snip) { if (note) snip.textContent = '“' + note + '”'; else snip.remove(); }
        else if (note) {
          var p = document.createElement('p'); p.className = 'note-snip'; p.textContent = '“' + note + '”';
          li.insertBefore(p, box);
        }
      } else box.querySelector('textarea').focus();
    } else if (act === 'save-key') {
      var val = document.getElementById('key').value.trim();
      store.setKey(val);
      tmdb.unblock();
      if (!val) { setStatus('key-status', 'Key removed.', ''); return; }
      setStatus('key-status', 'Testing…', '');
      tmdb.test().then(function (ok) {
        setStatus('key-status', ok ? 'Key works ✓ Posters and ratings will load as you browse.' : 'TMDB did not accept that key.', ok ? 'ok' : 'bad');
        var b = $app.querySelector('[data-act="preload"]'); if (b) b.disabled = !ok;
      }, function (er) {
        setStatus('key-status', er.code === 'bad-key' ? 'TMDB rejected that key. Use the “API Key” (v3) from your TMDB account settings.' : 'Couldn\'t reach TMDB. Check your connection and try again.', 'bad');
      });
    } else if (act === 'show-key') {
      var inp = document.getElementById('key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      t.textContent = inp.type === 'password' ? 'Show' : 'Hide';
    } else if (act === 'preload') {
      var wrap = document.getElementById('preload-wrap');
      var bar = document.getElementById('preload-bar');
      var txt = document.getElementById('preload-text');
      wrap.hidden = false; t.disabled = true;
      document.getElementById('cancel-preload').hidden = false;
      txt.textContent = 'Starting…';
      tmdb.preload(Object.keys(UIDS).map(function (k) { return UIDS[k]; }), function (done, total) {
        var b = document.getElementById('preload-bar'), x = document.getElementById('preload-text');
        if (b) b.style.width = pct(done, total) + '%';
        if (x) x.textContent = done + ' / ' + total;
      }).then(function (r) {
        var x = document.getElementById('preload-text');
        if (x) x.textContent = r.cancelled ? 'Stopped at ' + r.done + ' / ' + r.total + '.' : r.blocked ? 'Stopped: TMDB key problem.' : r.total ? 'Done ✓ ' + r.done + ' titles loaded.' : 'Everything is already loaded ✓';
        var c = document.getElementById('cancel-preload'); if (c) c.hidden = true;
        var pb = $app.querySelector('[data-act="preload"]'); if (pb) pb.disabled = false;
      });
    } else if (act === 'cancel-preload') {
      tmdb.cancelPreload();
    } else if (act === 'clear-cache') {
      tmdb.clearCache();
      toast('TMDB cache cleared. Your marks and comments are untouched.');
    } else if (act === 'export') {
      exportBackup();
    } else if (act === 'export-copy') {
      var text = backupText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { setStatus('backup-status', 'Backup copied. Paste it somewhere safe (a note, an email to yourself).', 'ok'); },
          function () { setStatus('backup-status', 'Couldn\'t access the clipboard. Use “Export backup” instead.', 'bad'); });
      } else setStatus('backup-status', 'Clipboard not available here. Use “Export backup” instead.', 'bad');
    } else if (act === 'import-text') {
      var v2 = document.getElementById('imp-text').value.trim();
      if (!v2) { setStatus('backup-status', 'Paste your backup text first.', 'bad'); return; }
      doImport(v2);
    } else if (act === 'match') {
      var fid = t.closest('[data-id]').dataset.id;
      var f = FILMS[fid];
      var input = window.prompt('Paste the TMDB link or number of the right film\n(e.g. https://www.themoviedb.org/movie/12345-title).\nLeave empty to go back to automatic matching.', '');
      if (input === null) return;
      var m = String(input).match(/(\d{2,})/);
      tmdb.setOverride(f, m ? parseInt(m[1], 10) : 0).then(function () { render(true); }, function () { toast('Couldn\'t load that TMDB entry.'); });
    }
  });

  // storage changes made in another tab
  store.onChange(function () { /* views re-read from store on render */ });

  // ------------------------------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------------------------------
  loadData().then(function () {
    render(true);
  }).catch(function (er) {
    console.error(er);
    $app.innerHTML = '<p class="empty">Couldn\'t load the film data.<br><small>' + esc(er.message) + '</small></p>';
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ }); });
  }
})();
