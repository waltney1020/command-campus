/* Storage adapter: local-first (localStorage), optional Supabase (REST, no library).
   Every change is written locally at once and queued in an outbox; if a Supabase URL + anon key
   are saved in Settings the outbox is pushed and remote data is pulled every few seconds. */
(function (root) {
  var LS = 'cc_state_v1', OB = 'cc_outbox_v1', CFG = 'cc_sync_cfg_v1';
  var now = Date.now;
  function uid() { return Math.random().toString(36).slice(2, 10) + now().toString(36); }
  var ago = function (m) { return now() - m * 60000; };
  var USAGE_DEFAULTS = [
    { id: 'codex', platform: 'codex', plan: '', used: '', limit: '', reset_date: '', note: '', url: 'https://chatgpt.com/settings/usage', updated_at: 0 },
    { id: 'claude', platform: 'claude', plan: '', used: '', limit: '', reset_date: '', note: '', url: 'https://claude.ai/settings/usage', updated_at: 0 },
    { id: 'grok', platform: 'grok', plan: '', used: '', limit: '', reset_date: '', note: '', url: 'https://grok.com/dashboard', updated_at: 0 }
  ];

  function seedUsage() { return USAGE_DEFAULTS.map(function (u) { return Object.assign({}, u); }); }
  function migrate(state) {
    if (!state.usage) state.usage = [];
    USAGE_DEFAULTS.forEach(function (d) {
      var hit = state.usage.filter(function (u) { return u.id === d.id; })[0];
      if (!hit) state.usage.push(Object.assign({}, d));
      else if (!hit.url) hit.url = d.url;
    });
    (state.projects || []).forEach(function (p) {
      if (!p.status_mode) p.status_mode = 'manual';
      if (p.heartbeat_minutes == null || p.heartbeat_minutes === '') p.heartbeat_minutes = 10;
    });
    if (!state.heartbeats) state.heartbeats = [];
    return state;
  }
  function seed() {
    var P = function (i, name, platform, status, avatar, agents, mins) {
      return { id: 'seed_' + i, name: name, platform: platform, status: status, avatar: avatar,
        agents: agents || [], sort: i, updated_at: ago(mins), status_mode: 'manual', heartbeat_minutes: 10 };
    };
    return migrate({ projects: [
      P(1, 'Golden Clone', 'codex', 'working', 'golden', [], 2),
      P(2, 'Polyclone', 'codex', 'needs', 'polyclone', [], 6),
      P(3, 'James Hub', 'claude', 'working', 'james', [], 11),
      P(4, 'BMO', 'grok', 'idle', 'bmo', [], 60),
      P(5, 'OP Lockin', 'codex', 'idle', 'oplockin', [], 180),
      P(6, 'Engineering Strike Team', 'grok', 'working', 'eng', [
        { name: 'Eng Builder', status: 'working' }, { name: 'Eng Tester', status: 'working' },
        { name: 'Eng Auditor', status: 'idle' }, { name: 'Eng Research', status: 'idle' },
        { name: 'Eng Designer', status: 'working' }], 1),
      P(7, 'Studio Team', 'grok', 'working', 'studio', [], 14),
      P(8, 'Life Help', 'claude', 'needs', 'life', [], 22)
    ], notes: [], usage: seedUsage(), heartbeats: [] });
  }
  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function usageToRow(u) {
    return { id: u.id, platform: u.platform, plan: u.plan || '', used: u.used || '', quota: u.limit || '',
      reset_date: u.reset_date || '', note: u.note || '', url: u.url || '', updated_at: u.updated_at || 0 };
  }
  function usageFromRow(r) {
    return { id: r.id, platform: r.platform, plan: r.plan || '', used: r.used || '', limit: r.quota || r.limit || '',
      reset_date: r.reset_date || '', note: r.note || '', url: r.url || '', updated_at: r.updated_at || 0 };
  }

  function createStore() {
    var raw = jget(LS, null);
    var state = migrate(raw ? raw : seed());
    var outbox = jget(OB, []);
    var cfg = jget(CFG, { url: '', key: '' });
    var info = { mode: 'local', ok: true, last: 0, error: '' };
    var listeners = [];
    function persist() { jset(LS, state); jset(OB, outbox); }
    persist();
    function emit() { listeners.forEach(function (f) { f(); }); }
    function remoteOn() { return !!(cfg.url && cfg.key); }
    function base() { return cfg.url.replace(/\/+$/, '') + '/rest/v1/'; }
    function H(extra) {
      var h = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
      for (var k in extra) h[k] = extra[k]; return h;
    }
    function rq(method, path, body, extra) {
      return fetch(base() + path, { method: method, headers: H(extra || {}), body: body ? JSON.stringify(body) : undefined })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
          return r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; });
        });
    }
    var UP = { 'Prefer': 'resolution=merge-duplicates,return=minimal' };
    function upsertIfNewer(table, row, toRow) {
      var body = toRow ? toRow(row) : row;
      return rq('GET', table + '?id=eq.' + encodeURIComponent(row.id) + '&select=id,updated_at').then(function (rows) {
        var rem = rows && rows[0];
        if (rem && (Number(rem.updated_at) || 0) > (Number(row.updated_at) || 0)) return;
        return rq('POST', table + '?on_conflict=id', body, UP);
      }, function () { return rq('POST', table + '?on_conflict=id', body, UP); });
    }
    function runOp(o) {
      if (o.t === 'upP') return upsertIfNewer('projects', o.d);
      if (o.t === 'upN') return upsertIfNewer('notes', o.d);
      if (o.t === 'upU') return upsertIfNewer('usage', o.d, usageToRow);
      if (o.t === 'delP') return rq('DELETE', 'projects?id=eq.' + encodeURIComponent(o.id));
      if (o.t === 'delN') return rq('DELETE', 'notes?id=eq.' + encodeURIComponent(o.id));
      return Promise.resolve();
    }
    function flush() {
      if (!remoteOn()) return Promise.resolve();
      function step() {
        if (!outbox.length) return Promise.resolve();
        return runOp(outbox[0]).then(function () { outbox.shift(); persist(); return step(); });
      }
      return step();
    }
    function softGet(path) {
      return rq('GET', path).catch(function () { return null; });
    }
    var busy = false;
    function sync() {
      if (!remoteOn()) { info.mode = 'local'; info.ok = true; emit(); return Promise.resolve(false); }
      if (busy) return Promise.resolve(false);
      busy = true; info.mode = 'supabase';
      return flush().then(function () {
        return Promise.all([
          rq('GET', 'projects?select=*&order=sort.asc'),
          rq('GET', 'notes?select=*&order=created_at.asc'),
          softGet('usage?select=*'),
          softGet('heartbeats?select=card_id,status,message,updated_at&order=updated_at.desc')
        ]);
      }).then(function (res) {
        var rp = res[0] || [], rn = res[1] || [], ru = res[2], rh = res[3];
        if (!cfg.seeded && rp.length === 0 && state.projects.length) {
          state.projects.forEach(function (p) { outbox.push({ t: 'upP', d: p }); });
          state.notes.forEach(function (n) { outbox.push({ t: 'upN', d: n }); });
          state.usage.forEach(function (u) { outbox.push({ t: 'upU', d: u }); });
          cfg.seeded = true; jset(CFG, cfg); persist(); busy = false;
          return flush().then(function () { info.last = now(); info.ok = true; info.error = ''; emit(); return true; });
        }
        cfg.seeded = true; jset(CFG, cfg);
        if (!outbox.length) {
          rp.forEach(function (p) {
            if (typeof p.agents === 'string') try { p.agents = JSON.parse(p.agents); } catch (e) { p.agents = []; }
            p.agents = p.agents || [];
            if (!p.status_mode) p.status_mode = 'manual';
            if (p.heartbeat_minutes == null) p.heartbeat_minutes = 10;
          });
          function lww(localArr, remoteArr, requeue) {
            var loc = {};
            (localArr || []).forEach(function (x) { loc[x.id] = x; });
            var seen = {}, out = [];
            (remoteArr || []).forEach(function (r) {
              seen[r.id] = true;
              var l = loc[r.id];
              if (l && (Number(l.updated_at) || 0) > (Number(r.updated_at) || 0)) { out.push(l); if (requeue) requeue(l); }
              else out.push(r);
            });
            return out;
          }
          function reP(p) { outbox.push({ t: 'upP', d: p }); }
          function reN(n) { outbox.push({ t: 'upN', d: n }); }
          function reU(u) { outbox.push({ t: 'upU', d: u }); }
          state.projects = lww(state.projects, rp, reP);
          state.notes = lww(state.notes, rn, reN);
          if (Array.isArray(ru)) state.usage = lww(state.usage, ru.map(usageFromRow), reU);
          if (Array.isArray(rh)) state.heartbeats = rh;
          persist();
          info.last = now(); info.ok = true; info.error = ''; busy = false; emit();
          if (outbox.length) flush();
          return true;
        }
        busy = false; return false;
      }).catch(function (e) { busy = false; info.ok = false; info.error = String(e.message || e); emit(); return false; });
    }
    function q(op) { outbox.push(op); persist(); if (remoteOn()) { sync(); } }
    var timer = null;
    function startPolling() { if (timer) clearInterval(timer); timer = setInterval(sync, 5000); }
    startPolling();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', sync);
      window.addEventListener('online', function () { info.ok = true; info.error = ''; emit(); sync(); });
      window.addEventListener('offline', function () { info.ok = false; info.error = 'offline'; emit(); });
    }

    return {
      info: info, uid: uid,
      get projects() { return state.projects.slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }); },
      notes: function (pid) { return state.notes.filter(function (n) { return n.project_id === pid; }).sort(function (a, b) { return a.created_at - b.created_at; }); },
      allNotes: function () { return state.notes; },
      project: function (id) { return state.projects.filter(function (p) { return p.id === id; })[0]; },
      get usageList() { return USAGE_DEFAULTS.map(function (d) { return state.usage.filter(function (u) { return u.id === d.id; })[0] || Object.assign({}, d); }); },
      usage: function (id) { return state.usage.filter(function (u) { return u.id === id; })[0]; },
      saveUsage: function (u) {
        u.updated_at = now();
        var i = state.usage.findIndex(function (x) { return x.id === u.id; });
        if (i < 0) state.usage.push(u); else state.usage[i] = u;
        q({ t: 'upU', d: u }); emit();
      },
      heartbeats: function () { return state.heartbeats || []; },
      latestBeat: function (id) { return (root.CCMap && CCMap.latestByCard(state.heartbeats || [])[id]) || null; },
      display: function (p, nowMs) { return (root.CCMap && CCMap.derive(p, this.latestBeat(p && p.id), nowMs)) || { status: (p && p.status) || 'idle', source: 'manual' }; },
      lights: function () { return root.CCMap ? CCMap.lights(this.projects, state.heartbeats || []) : []; },
      saveProject: function (p) {
        p.updated_at = now();
        if (!p.status_mode) p.status_mode = 'manual';
        if (p.heartbeat_minutes == null) p.heartbeat_minutes = 10;
        var i = state.projects.findIndex(function (x) { return x.id === p.id; });
        if (i < 0) { p.sort = (state.projects.reduce(function (m, x) { return Math.max(m, x.sort || 0); }, 0)) + 1; state.projects.push(p); } else state.projects[i] = p;
        q({ t: 'upP', d: p }); emit();
      },
      deleteProject: function (id) {
        state.projects = state.projects.filter(function (p) { return p.id !== id; });
        state.notes = state.notes.filter(function (n) { return n.project_id !== id; });
        q({ t: 'delP', id: id }); emit();
      },
      saveNote: function (n) {
        n.updated_at = now();
        var i = state.notes.findIndex(function (x) { return x.id === n.id; });
        if (i < 0) state.notes.push(n); else state.notes[i] = n;
        q({ t: 'upN', d: n });
        var p = state.projects.filter(function (x) { return x.id === n.project_id; })[0];
        if (p) { p.updated_at = now(); q({ t: 'upP', d: p }); }
        emit();
      },
      deleteNote: function (id) { state.notes = state.notes.filter(function (n) { return n.id !== id; }); q({ t: 'delN', id: id }); emit(); },
      getConfig: function () { return { url: cfg.url, key: cfg.key }; },
      setConfig: function (url, key) {
        cfg = { url: (url || '').trim(), key: (key || '').trim(), seeded: false }; jset(CFG, cfg);
        info.mode = remoteOn() ? 'supabase' : 'local'; info.error = ''; emit(); return sync();
      },
      testConnection: function (url, key) {
        var save = cfg; cfg = { url: url.trim(), key: key.trim() };
        return rq('GET', 'projects?select=id&limit=1').then(function () { cfg = save; return 'ok'; }, function (e) { cfg = save; throw e; });
      },
      sync: sync, onChange: function (f) { listeners.push(f); }, pending: function () { return outbox.length; }
    };
  }
  root.CCStore = createStore;
  if (typeof module !== 'undefined') module.exports = { createStore: createStore };
})(typeof window !== 'undefined' ? window : globalThis);
