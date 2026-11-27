(function () {
  var store = CCStore();
  var $app = document.getElementById('app'), $modal = document.getElementById('modal');
  var STATUS = { working: 'Working', idle: 'Idle', needs: 'Needs you' };
  var ORDER = ['working', 'idle', 'needs'];
  var PLAT = { codex: 'Codex', grok: 'Grok', claude: 'Claude' };
  var AVATARS = { golden: 'Golden', polyclone: 'Lavender', james: 'Hoodie', bmo: 'Robot', oplockin: 'Hooded', eng: 'Team', studio: 'Artist', life: 'Helper' };
  var filter = localStorage.getItem('cc_filter') || 'all';
  var lastSig = '';
  var usageTimer = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rel(ms) {
    if (!ms) return 'never';
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago';
  }
  function clock(ms) {
    var d = new Date(ms), t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return dayLabel(ms) + ', ' + t;
  }
  function dayLabel(ms) {
    var d = new Date(ms), n = new Date(), y = new Date(Date.now() - 864e5);
    if (d.toDateString() === n.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function openCount(id) { return store.notes(id).filter(function (n) { return !n.done; }).length; }
  function route() { var m = location.hash.match(/^#\/p\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; }
  function badge(p, cls) { return '<img class="badge ' + (cls || '') + '" src="assets/badge_' + esc(p) + '.png" alt="' + esc(PLAT[p] || p) + '" title="' + esc(PLAT[p] || p) + '">'; }
  function syncPill() {
    var i = store.info, pend = store.pending();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return '<span class="sync err" title="Changes are saved on this device and will upload when you are back online.">● Offline, will sync</span>';
    if (i.mode === 'local') return '<span class="sync local" title="Saved on this device only. Open Settings to turn on sync.">● This device only</span>';
    if (!i.ok) return '<span class="sync err" title="' + esc(i.error) + '">● Sync problem</span>';
    return '<span class="sync ok">● Synced across devices' + (pend ? ' (saving…)' : '') + '</span>';
  }
  function disp(p) { return store.display(p); }
  function usagePct(u) {
    var used = String(u.used || '').trim(), lim = String(u.limit || '').trim();
    if (/%\s*$/.test(used)) return Math.min(100, Math.max(0, parseFloat(used) || 0));
    var a = parseFloat(used), b = parseFloat(lim);
    if (!isNaN(a) && !isNaN(b) && b > 0) return Math.min(100, Math.max(0, a / b * 100));
    if (!isNaN(a) && !lim) return Math.min(100, Math.max(0, a));
    return 0;
  }
  function barTone(pct) { return pct >= 90 ? 'hot' : pct >= 70 ? 'warm' : 'ok'; }

  /* ---------- board ---------- */
  function usageHTML() {
    return '<section class="usage-sec"><h2>Usage</h2><p class="hint">Paste the numbers from each platform’s usage page. They are not pulled automatically.</p><div class="usage-grid">' +
      store.usageList.map(function (u) {
        var pct = usagePct(u), href = u.url || '#';
        return '<article class="ucard" data-usage="' + esc(u.id) + '">' +
          '<div class="uhead">' + badge(u.platform) + '<h3>' + esc(PLAT[u.platform]) + '</h3>' +
          '<a class="btn ghost openpg" href="' + esc(href) + '" target="_blank" rel="noopener">Open usage page</a></div>' +
          '<label>Plan <input name="plan" value="' + esc(u.plan) + '" placeholder="Plus, Pro, Max…"></label>' +
          '<div class="row2"><label>Used <input name="used" value="' + esc(u.used) + '" placeholder="40 or 40%"></label>' +
          '<label>Limit <input name="limit" value="' + esc(u.limit) + '" placeholder="100 or credits"></label></div>' +
          '<div class="bar ' + barTone(pct) + '" title="' + Math.round(pct) + '%"><i style="width:' + pct + '%"></i></div>' +
          '<label>Resets <input name="reset_date" value="' + esc(u.reset_date) + '" placeholder="e.g. Dec 3 or Friday 5 PM"></label>' +
          '<label>Note <input name="note" value="' + esc(u.note) + '" placeholder="Optional"></label>' +
          '<label>Usage page URL <input name="url" value="' + esc(u.url) + '"></label>' +
          '<div class="umeta">Last updated ' + rel(u.updated_at) + '</div></article>';
      }).join('') + '</div></section>';
  }
  function boardHTML() {
    var all = store.projects, c = { working: 0, idle: 0, needs: 0 };
    all.forEach(function (p) { var s = disp(p).status; c[s] = (c[s] || 0) + 1; });
    var shown = all.filter(function (p) { return filter === 'all' || p.platform === filter; });
    var chips = ['all', 'codex', 'grok', 'claude'].map(function (f) {
      return '<button class="chip' + (filter === f ? ' on' : '') + '" data-filter="' + f + '">' + (f === 'all' ? 'All' : badge(f, 'tiny') + PLAT[f]) + '</button>';
    }).join('');
    var cards = shown.map(function (p) {
      var ag = (p.agents || []).length, d = disp(p);
      return '<article class="card s-' + d.status + '" data-open="' + esc(p.id) + '">' +
        '<div class="art"><img src="assets/av_' + esc(p.avatar || 'golden') + '.jpg" alt="">' + badge(p.platform, 'corner') + '</div>' +
        '<div class="body"><h3>' + esc(p.name) + '</h3>' +
        '<div class="statrow">' +
        '<button class="status s-' + d.status + '" data-cycle="' + esc(p.id) + '" title="' + (p.status_mode === 'auto' ? 'Tap to override Auto and set status by hand' : 'Tap to change status') + '"><i></i>' + STATUS[d.status] + '</button>' +
        '<button class="auto-tog' + (p.status_mode === 'auto' ? ' on' : '') + '" data-auto="' + esc(p.id) + '" title="Auto: status from agent heartbeats">' + (p.status_mode === 'auto' ? 'Auto' : 'Manual') + '</button>' +
        '</div>' +
        '<div class="meta"><span>Last update ' + rel(p.updated_at) + '</span><span><b>' + openCount(p.id) + '</b> open</span></div>' +
        (ag ? '<div class="meta dim">' + ag + ' agents</div>' : '') +
        (p.status_mode === 'auto' && d.stale ? '<div class="meta dim">No heartbeat in ' + (p.heartbeat_minutes || 10) + 'm</div>' : '') +
        '</div><button class="edit" data-edit="' + esc(p.id) + '" title="Edit">✎</button>' +
        '<button class="connect" data-connect="' + esc(p.id) + '" title="Connect heartbeat">⌁</button></article>';
    }).join('');
    return '<header class="top"><div class="brand"><span class="logo">C</span><h1>Command Campus</h1></div>' +
      '<div class="pills"><span class="pill g"><i></i>' + c.working + ' Working</span><span class="pill r"><i></i>' + c.idle + ' Idle</span><span class="pill a"><i></i>' + c.needs + ' Need you</span></div>' +
      '<div class="tools"><button class="btn" data-add>+ Add</button><button class="btn ghost" data-settings>⚙ Settings</button></div></header>' +
      '<div class="filters">' + chips + '</div>' +
      '<main class="grid">' + (cards || '<p class="empty">No cards here. Tap + Add.</p>') + '</main>' +
      usageHTML() +
      '<footer class="foot">' + syncPill() + '</footer>';
  }

  /* ---------- detail ---------- */
  function threadHTML(p) {
    var ns = store.notes(p.id), out = '', lastDay = '';
    ns.forEach(function (n) {
      var d = dayLabel(n.created_at);
      if (d !== lastDay) { out += '<div class="day"><span>' + esc(d) + '</span></div>'; lastDay = d; }
      out += '<div class="msg' + (n.done ? ' done' : '') + '"><div class="bubble"><div class="txt">' + esc(n.text) + '</div>' +
        '<div class="mf"><span class="ts">' + esc(clock(n.created_at)) + '</span>' +
        '<button class="dchip' + (n.done ? ' on' : '') + '" data-done="' + esc(n.id) + '">' + (n.done ? '✓ Done' : '○ Done') + '</button>' +
        '<button class="x" data-delnote="' + esc(n.id) + '" title="Delete message">✕</button></div></div></div>';
    });
    return out || '<p class="empty">Paste what the agent said below, then hit Send.</p>';
  }
  function detailHTML(p) {
    var ag = (p.agents || []), d = disp(p);
    var agents = '<div class="agent self"><img src="assets/av_' + esc(p.avatar) + '.jpg" alt=""><div><b>' + esc(p.name) + '</b><button class="status s-' + d.status + '" data-cycle="' + esc(p.id) + '"><i></i>' + STATUS[d.status] + '</button></div></div>' +
      ag.map(function (a, i) {
        return '<div class="agent"><span class="dot s-' + a.status + '"></span><div><b>' + esc(a.name) + '</b><button class="status sm s-' + a.status + '" data-agent="' + i + '"><i></i>' + STATUS[a.status] + '</button></div></div>';
      }).join('');
    return '<header class="top det"><button class="btn ghost" data-back>‹ Board</button><h1>' + esc(p.name) + '</h1>' +
      '<button class="status s-' + d.status + '" data-cycle="' + esc(p.id) + '"><i></i>' + STATUS[d.status] + '</button>' +
      '<button class="auto-tog' + (p.status_mode === 'auto' ? ' on' : '') + '" data-auto="' + esc(p.id) + '">' + (p.status_mode === 'auto' ? 'Auto' : 'Manual') + '</button>' +
      badge(p.platform, 'tiny') +
      '<span class="grow"></span>' + syncPill() +
      '<button class="btn ghost" data-connect="' + esc(p.id) + '">Connect</button>' +
      '<button class="btn ghost" data-edit="' + esc(p.id) + '">✎ Edit</button></header>' +
      '<div class="split"><aside class="agents"><h2>' + (ag.length ? 'Agents' : 'Agent') + '</h2>' + agents + '</aside>' +
      '<section class="notes"><h2>Notes <small>' + openCount(p.id) + ' open</small></h2><div class="thread" id="thread">' + threadHTML(p) + '</div>' +
      '<form class="composer" id="composer"><textarea id="msg" rows="1" placeholder="Paste agent update…"></textarea>' +
      '<button type="button" class="btn ghost" data-paste>Paste</button><button type="submit" class="btn send">Send</button></form></section></div>';
  }

  /* ---------- render ---------- */
  function render(force) {
    var ae = document.activeElement;
    if (!force && ae && ae.closest && ae.closest('.ucard, .sheet')) return;
    var id = route(), p = id && store.project(id);
    var sig = JSON.stringify([id, filter, store.projects, id ? store.notes(id) : 0, store.usageList, store.heartbeats(), store.info.mode, store.info.ok, store.pending(),
      store.projects.map(function (x) { return disp(x); })]);
    sig += Math.floor(Date.now() / 60000);
    if (!force && sig === lastSig) return; lastSig = sig;
    var keep = document.getElementById('msg'), draft = keep ? keep.value : '', hadFocus = keep && ae === keep;
    var th = document.getElementById('thread'), atBottom = !th || th.scrollHeight - th.scrollTop - th.clientHeight < 80;
    var prevTop = th ? th.scrollTop : 0;
    if (id && !p) { location.hash = '#/'; return; }
    $app.className = p ? 'view-detail' : 'view-board';
    $app.innerHTML = p ? detailHTML(p) : boardHTML();
    if (p) {
      var m = document.getElementById('msg'); if (m) { m.value = draft; autosize(m); if (hadFocus) m.focus(); }
      var t = document.getElementById('thread');
      if (t) { if (force || atBottom || !th) t.scrollTop = t.scrollHeight; else t.scrollTop = prevTop; }
    }
  }
  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }

  /* ---------- connect / heartbeat commands (placeholders only, never real keys) ---------- */
  function heartbeatCmds(cardId, status, message) {
    var body = '{"card_id":"' + cardId + '","status":"' + status + '","message":"' + message + '"}';
    var curl = 'curl -sS -X POST "YOUR_PROJECT_URL/rest/v1/heartbeats" \\\n  -H "apikey: YOUR_ANON_KEY" \\\n  -H "Authorization: Bearer YOUR_ANON_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Prefer: return=minimal" \\\n  -d \'' + body + '\'';
    var ps = 'Invoke-RestMethod -Method Post -Uri "YOUR_PROJECT_URL/rest/v1/heartbeats" -Headers @{apikey="YOUR_ANON_KEY"; Authorization="Bearer YOUR_ANON_KEY"; Prefer="return=minimal"} -ContentType "application/json" -Body \'' + body + '\'';
    return { curl: curl, ps: ps };
  }
  function connectModal(id) {
    var p = store.project(id); if (!p) return;
    var w = heartbeatCmds(p.id, 'working', 'started');
    var i = heartbeatCmds(p.id, 'idle', 'finished');
    var n = heartbeatCmds(p.id, 'needs_you', 'needs Waltney');
    var instruct = 'Paste this to your Codex, Grok or Claude agent: When you start work, run the working heartbeat. When you finish, run the idle heartbeat. If you need Waltney, run the needs_you heartbeat. Use the Project URL and anon key from Command Campus Settings in place of the placeholders. Never put the real key in a chat or a public file.';
    function block(title, cmd, kind) {
      return '<h3>' + title + '</h3><pre class="cmd">' + esc(cmd) + '</pre><button type="button" class="btn ghost" data-copy="' + kind + '">Copy</button>';
    }
    $modal.innerHTML = '<div class="sheet wide"><h2>Connect · ' + esc(p.name) + '</h2>' +
      '<p class="hint">Card id: <code>' + esc(p.id) + '</code>. Auto window: ' + (p.heartbeat_minutes || 10) + ' minutes. Placeholders only — YOUR_PROJECT_URL and YOUR_ANON_KEY, never a real key.</p>' +
      '<label>Instruction to paste to an agent</label><textarea class="instruct" id="instruct" readonly>' + esc(instruct) + '</textarea>' +
      '<button type="button" class="btn ghost" data-copy="instruct">Copy instruction</button>' +
      block('Working (curl)', w.curl, 'cw') +
      block('Idle (curl)', i.curl, 'ci') +
      block('Needs you (curl)', n.curl, 'cn') +
      block('Working (PowerShell one-liner)', w.ps, 'pw') +
      block('Idle (PowerShell one-liner)', i.ps, 'pi') +
      block('Needs you (PowerShell one-liner)', n.ps, 'pn') +
      '<div class="actions"><span class="grow"></span><button type="button" class="btn send" data-cancel>Close</button></div></div>';
    $modal.classList.remove('hidden');
    var cmds = { cw: w.curl, ci: i.curl, cn: n.curl, pw: w.ps, pi: i.ps, pn: n.ps, instruct: instruct };
    $modal.onclick = function (e) {
      if (e.target === $modal || e.target.closest('[data-cancel]')) return closeModal();
      var b = e.target.closest('[data-copy]');
      if (b) {
        var txt = cmds[b.dataset.copy];
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
        b.textContent = 'Copied'; setTimeout(function () { b.textContent = b.dataset.copy === 'instruct' ? 'Copy instruction' : 'Copy'; }, 1200);
      }
    };
  }

  /* ---------- modals ---------- */
  function closeModal() { $modal.classList.add('hidden'); $modal.innerHTML = ''; }
  function editModal(id) {
    var p = id ? Object.assign({}, store.project(id)) : { id: '', name: '', platform: 'codex', status: 'idle', avatar: 'golden', agents: [], status_mode: 'manual', heartbeat_minutes: 10 };
    if (p.status_mode == null) p.status_mode = 'manual';
    if (p.heartbeat_minutes == null) p.heartbeat_minutes = 10;
    var plats = Object.keys(PLAT).map(function (k) { return '<option value="' + k + '"' + (p.platform === k ? ' selected' : '') + '>' + PLAT[k] + '</option>'; }).join('');
    var avs = Object.keys(AVATARS).map(function (k) { return '<button type="button" class="av' + (p.avatar === k ? ' on' : '') + '" data-av="' + k + '"><img src="assets/av_' + k + '.jpg" alt="' + AVATARS[k] + '"></button>'; }).join('');
    var sts = ORDER.map(function (k) { return '<option value="' + k + '"' + (p.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('');
    $modal.innerHTML = '<div class="sheet"><h2>' + (id ? 'Edit card' : 'Add card') + '</h2><form id="editform">' +
      '<label>Name<input name="name" required maxlength="60" value="' + esc(p.name) + '"></label>' +
      '<div class="row2"><label>Platform<select name="platform">' + plats + '</select></label><label>Status<select name="status">' + sts + '</select></label></div>' +
      '<label class="chk"><input type="checkbox" name="auto"' + (p.status_mode === 'auto' ? ' checked' : '') + '> Auto status from heartbeats</label>' +
      '<label>Idle after (minutes)<input name="heartbeat_minutes" type="number" min="1" max="1440" value="' + esc(p.heartbeat_minutes || 10) + '"></label>' +
      '<label>Agents (optional, comma separated)<input name="agents" placeholder="Eng Builder, Eng Tester" value="' + esc((p.agents || []).map(function (a) { return a.name; }).join(', ')) + '"></label>' +
      '<label>Avatar</label><div class="avs">' + avs + '</div><input type="hidden" name="avatar" value="' + esc(p.avatar) + '">' +
      '<div class="actions">' + (id ? '<button type="button" class="btn danger" data-del>Delete</button><button type="button" class="btn ghost" data-openconnect>Connect</button>' : '') +
      '<span class="grow"></span><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn send">Save</button></div></form></div>';
    $modal.classList.remove('hidden');
    $modal.querySelector('[name=name]').focus();
    $modal.onclick = function (e) {
      var t = e.target;
      if (t === $modal || t.closest('[data-cancel]')) return closeModal();
      var av = t.closest('[data-av]');
      if (av) { $modal.querySelector('[name=avatar]').value = av.dataset.av; [].forEach.call($modal.querySelectorAll('.av'), function (b) { b.classList.toggle('on', b === av); }); }
      if (t.closest('[data-openconnect]')) { closeModal(); return connectModal(id); }
      if (t.closest('[data-del]') && confirm('Delete "' + p.name + '" and all its notes?')) { store.deleteProject(id); closeModal(); location.hash = '#/'; render(true); }
    };
    document.getElementById('editform').onsubmit = function (e) {
      e.preventDefault(); var f = e.target, old = p.agents || [];
      var names = f.agents.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      p.name = f.name.value.trim(); p.platform = f.platform.value; p.status = f.status.value; p.avatar = f.avatar.value;
      p.status_mode = f.auto.checked ? 'auto' : 'manual';
      p.heartbeat_minutes = Math.max(1, parseInt(f.heartbeat_minutes.value, 10) || 10);
      p.agents = names.map(function (n) { var o = old.filter(function (a) { return a.name === n; })[0]; return o || { name: n, status: 'idle' }; });
      if (!p.id) p.id = store.uid();
      store.saveProject(p); closeModal(); render(true);
    };
  }
  function settingsModal() {
    var c = store.getConfig();
    $modal.innerHTML = '<div class="sheet"><h2>Settings: sync</h2><p class="hint">Without these, notes stay on this device only. To share between PC, laptop and phone, paste your Supabase Project URL and anon key, or import the keys file from your connect pack.</p>' +
      '<form id="setform"><label>Supabase URL<input name="url" placeholder="https://xxxx.supabase.co" value="' + esc(c.url) + '"></label>' +
      '<label>Supabase anon key<input name="key" placeholder="eyJ..." value="' + esc(c.key) + '"></label>' +
      '<label class="import">Import connection file <input type="file" id="importkeys" accept=".txt,.json,.js,.local"></label>' +
      '<p id="setmsg" class="hint"></p>' +
      '<div class="actions"><button type="button" class="btn ghost" data-clear>Turn sync off</button><span class="grow"></span><button type="button" class="btn ghost" data-cancel>Close</button><button class="btn send">Test &amp; save</button></div></form></div>';
    $modal.classList.remove('hidden');
    var msg = document.getElementById('setmsg');
    $modal.onclick = function (e) {
      if (e.target === $modal || e.target.closest('[data-cancel]')) return closeModal();
      if (e.target.closest('[data-clear]')) { store.setConfig('', ''); closeModal(); render(true); }
    };
    var fi = document.getElementById('importkeys');
    if (fi) fi.onchange = function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed = parseConnectFile(String(reader.result || ''));
        if (!parsed.url || !parsed.key) { msg.textContent = 'Could not find a Project URL and anon key in that file.'; return; }
        $modal.querySelector('#setform [name=url]').value = parsed.url;
        $modal.querySelector('#setform [name=key]').value = parsed.key;
        msg.textContent = 'Imported. Click Test & save to connect.';
      };
      reader.readAsText(file);
    };
    document.getElementById('setform').onsubmit = function (e) {
      e.preventDefault(); var f = e.target; msg.textContent = 'Testing…';
      store.testConnection(f.url.value, f.key.value).then(function () {
        msg.textContent = 'Connected. Syncing…'; return store.setConfig(f.url.value, f.key.value);
      }).then(function () { closeModal(); render(true); }, function (err) { msg.textContent = 'Could not connect: ' + err.message + ' (did you run the SQL in SETUP_SYNC.md?)'; });
    };
  }

  /* ---------- events ---------- */
  function readUsageCard(card) {
    var id = card.dataset.usage, u = Object.assign({}, store.usage(id) || { id: id, platform: id });
    ['plan', 'used', 'limit', 'reset_date', 'note', 'url'].forEach(function (k) {
      var inp = card.querySelector('[name=' + k + ']'); if (inp) u[k] = inp.value;
    });
    return u;
  }
  function saveUsageCard(card) { store.saveUsage(readUsageCard(card)); }
  function sendNote() {
    var id = route(), m = document.getElementById('msg'), text = m.value.replace(/\s+$/, '');
    if (!text.trim()) return;
    m.value = ''; autosize(m);
    store.saveNote({ id: store.uid(), project_id: id, text: text, created_at: Date.now(), done: false, done_at: null });
    render(true);
  }
  function toggleAuto(id) {
    var p = Object.assign({}, store.project(id));
    if (p.status_mode === 'auto') {
      p.status = disp(p).status;
      p.status_mode = 'manual';
    } else {
      p.status_mode = 'auto';
    }
    store.saveProject(p);
  }
  document.addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-cycle]'))) {
      e.stopPropagation();
      var p = Object.assign({}, store.project(el.dataset.cycle));
      var cur = p.status_mode === 'auto' ? disp(p).status : p.status;
      p.status = ORDER[(ORDER.indexOf(cur) + 1) % 3];
      p.status_mode = 'manual';
      store.saveProject(p); return;
    }
    if ((el = t.closest('[data-auto]'))) { e.stopPropagation(); return toggleAuto(el.dataset.auto); }
    if ((el = t.closest('[data-connect]'))) { e.stopPropagation(); return connectModal(el.dataset.connect); }
    if ((el = t.closest('[data-agent]'))) { var pr = store.project(route()), a = pr.agents[+el.dataset.agent]; a.status = ORDER[(ORDER.indexOf(a.status) + 1) % 3]; store.saveProject(Object.assign({}, pr)); return; }
    if ((el = t.closest('[data-edit]'))) { e.stopPropagation(); return editModal(el.dataset.edit); }
    if ((el = t.closest('[data-filter]'))) { filter = el.dataset.filter; localStorage.setItem('cc_filter', filter); return render(true); }
    if (t.closest('[data-add]')) return editModal(null);
    if (t.closest('[data-settings]')) return settingsModal();
    if (t.closest('[data-back]')) { location.hash = '#/'; return; }
    if ((el = t.closest('[data-done]'))) { var n = store.allNotes().filter(function (x) { return x.id === el.dataset.done; })[0]; n = Object.assign({}, n); n.done = !n.done; n.done_at = n.done ? Date.now() : null; store.saveNote(n); return; }
    if ((el = t.closest('[data-delnote]'))) { if (confirm('Delete this message?')) store.deleteNote(el.dataset.delnote); return; }
    if (t.closest('[data-paste]')) {
      var m = document.getElementById('msg');
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (s) { m.value += s; autosize(m); m.focus(); }, function () { m.focus(); });
      else m.focus(); return;
    }
    if (t.closest('.openpg')) return;
    if ((el = t.closest('[data-open]'))) { location.hash = '#/p/' + encodeURIComponent(el.dataset.open); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'msg') autosize(e.target);
    var card = e.target.closest && e.target.closest('.ucard');
    if (card) {
      if (e.target.name === 'url') {
        var a = card.querySelector('.openpg'); if (a) a.href = e.target.value || '#';
      }
      var bar = card.querySelector('.bar i'), wrap = card.querySelector('.bar');
      if (bar) { var u = readUsageCard(card), pct = usagePct(u); bar.style.width = pct + '%'; wrap.className = 'bar ' + barTone(pct); wrap.title = Math.round(pct) + '%'; }
      clearTimeout(usageTimer);
      usageTimer = setTimeout(function () { saveUsageCard(card); }, 400);
    }
  });
  document.addEventListener('focusout', function (e) {
    var card = e.target.closest && e.target.closest('.ucard');
    if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
      clearTimeout(usageTimer); saveUsageCard(card);
    }
  });
  document.addEventListener('submit', function (e) { if (e.target.id === 'composer') { e.preventDefault(); sendNote(); } });
  document.addEventListener('keydown', function (e) {
    if (e.target.id === 'msg' && e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendNote(); }
    if (e.key === 'Escape') closeModal();
  });
  function parseConnectFile(text) {
    var url = '', key = '';
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var t = line.trim(); if (!t || t.charAt(0) === '#') return;
      var m = t.match(/^(?:PROJECT_URL|SUPABASE_URL|url)\s*[=:]\s*(.+)$/i); if (m) url = m[1].trim().replace(/^["']|["']$/g, '');
      m = t.match(/^(?:ANON_KEY|PUBLISHABLE_KEY|SUPABASE_ANON_KEY|key)\s*[=:]\s*(.+)$/i); if (m && (!key || /^ANON_KEY/i.test(t))) key = m[1].trim().replace(/^["']|["']$/g, '');
      m = t.match(/url:\s*['"]([^'"]+)['"]/); if (m) url = m[1];
      m = t.match(/key:\s*['"]([^'"]+)['"]/); if (m) key = m[1];
    });
    if (!url) { var u = text.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i); if (u) url = u[0]; }
    return { url: url, key: key };
  }
  function applyPrefill() {
    var p = window.CC_PREFILL; if (!p || !p.url || !p.key) return;
    var c = store.getConfig(); if (c.url && c.key) return;
    store.setConfig(p.url, p.key);
  }
  function loadPrefill() {
    if (window.CC_PREFILL) { applyPrefill(); return; }
    var el = document.createElement('script');
    el.src = 'cc-connect.js';
    el.onload = applyPrefill;
    el.onerror = function () {};
    document.head.appendChild(el);
  }
  window.addEventListener('hashchange', function () { render(true); });
  window.addEventListener('online', function () { render(true); store.sync(); });
  window.addEventListener('offline', function () { render(true); });
  store.onChange(function () { render(false); });
  setInterval(function () { render(false); }, 15000);
  window.__cc = store;
  window.parseConnectFile = parseConnectFile;
  render(true); loadPrefill(); store.sync();
})();
