/* 比赛模式前端：大厅 → 等待 → 比赛 → 结算，另有观战（导播台）
 * 打字区使用 typing-engine.js，与首页同一套分段、判定与样式，避免改变用户手感。
 */
(function () {
  'use strict';

  var state = {
    token: null, raceToken: null, code: null, snap: null,
    pollTimer: null, listTimer: null,
    isSpectator: false, engine: null, engineReady: false,
    finished: false, focusNick: null, lastRank: {},
    tickFailures: 0, reconnectShown: false
  };

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var el = $('race-toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 2800);
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var tk = state.raceToken || state.token;
    if (tk) headers.Authorization = 'Bearer ' + tk;
    return fetch(path, {
      method: opts.method || 'GET', headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = { error: t }; }
        if (!r.ok) { var err = new Error((data && data.error) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
        return data;
      });
    });
  }

  /* ---------- 大厅 ---------- */
  function setReconnectBanner(show) {
    var el = $('race-reconnect-banner');
    if (!el) return;
    el.style.display = show ? 'block' : 'none';
    state.reconnectShown = !!show;
  }
  function persistRaceRestore() {
    if (!state.code) return;
    try { localStorage.setItem('lastRaceCode', state.code); } catch (e) {}
    // 登录用户重连靠 localStorage.token；sessionStorage 只存游客短期票，登出后不残留
    if (!state.token) {
      var tk = state.raceToken;
      if (tk) {
        try { sessionStorage.setItem('raceToken:' + state.code, tk); } catch (e) {}
      }
    }
  }
  function clearRaceRestore() {
    var code = state.code;
    try { localStorage.removeItem('lastRaceCode'); } catch (e) {}
    if (code) {
      try { sessionStorage.removeItem('raceToken:' + code); } catch (e) {}
    }
    setReconnectBanner(false);
    state.tickFailures = 0;
  }

  function loadArticles() {
    api('/api/articles?limit=100').then(function (list) {
      var arr = Array.isArray(list) ? list : (list && list.articles) || [];
      var sel = $('create-article');
      sel.innerHTML = '';
      arr.filter(function (a) { return !a.status || a.status === 'approved'; }).forEach(function (a) {
        var o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.title + '（' + (a.content ? a.content.length : (a.charCount || '?')) + ' 字）';
        sel.appendChild(o);
      });
      if (!sel.options.length) {
        var o = document.createElement('option');
        o.value = ''; o.textContent = '没有可用文章';
        sel.appendChild(o);
      }
    }).catch(function () {});
  }

  function renderList(list) {
    var box = $('room-list');
    $('list-count').textContent = list.length ? '（' + list.length + '）' : '';
    if (!list.length) { box.innerHTML = '<div class="race-empty">现在没有公开房间，自己开一个吧</div>'; return; }
    box.innerHTML = '';
    list.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'race-room-row';
      row.innerHTML =
        '<div class="race-room-row-main"><span class="race-room-code">' + esc(r.code) + '</span>' +
        '<span class="race-room-article">' + esc(r.articleTitle) + '</span></div>' +
        '<div class="race-room-row-meta"><span>' + r.playerCount + '/' + r.maxPlayers + ' 人</span>' +
        '<span>' + r.charCount + ' 字</span><span>房主 ' + esc(r.hostNickname) + '</span></div>' +
        '<button class="race-btn race-btn-small" data-code="' + esc(r.code) + '">加入</button>';
      row.querySelector('button').onclick = function () { quickJoin(r.code); };
      box.appendChild(row);
    });
  }
  function refreshList() {
    api('/api/race/list').then(renderList).catch(function (e) {
      $('room-list').innerHTML = '<div class="race-empty">' + esc(e.message) + '</div>';
    });
  }
  function quickJoin(code) {
    var pw = prompt('该房间需要密码（4 位数字）：');
    if (pw === null) return;
    doJoin({ code: code, password: pw });
  }

  /* ---------- 建房 / 加入 ---------- */
  function doCreate() {
    if (!state.token) { toast('请先登录后再创建比赛'); return; }
    var password = $('create-password').value.trim();
    if (!/^\d{4}$/.test(password)) { toast('密码必须是 4 位数字'); return; }
    api('/api/race/create', {
      method: 'POST',
      body: {
        articleId: Number($('create-article').value), password: password,
        maxPlayers: Number($('create-max').value), isPublic: $('create-public').checked
      }
    }).then(function (r) { state.raceToken = state.token; enterRoom(r.code); })
      .catch(function (e) { toast(e.message); });
  }

  function doJoin(opts) {
    var asSpectator = !!opts.asSpectator;
    var payload = { code: opts.code, password: opts.password };
    if (asSpectator) payload.asSpectator = true;
    if (!state.token) {
      var nick = $('join-nickname').value.trim();
      if (!nick) { toast('请先填写昵称'); return; }
      payload.nickname = nick;
    }
    api('/api/race/join', { method: 'POST', body: payload }).then(function (r) {
      state.raceToken = r.token;
      state.isSpectator = !!r.spectator;
      if (!state.token) sessionStorage.setItem('raceToken:' + opts.code.toUpperCase(), r.token);
      else sessionStorage.removeItem('raceToken:' + opts.code.toUpperCase());
      toast((state.isSpectator ? '已进入观战席：' : '已加入，你的昵称是 ') + r.nickname);
      enterRoom(opts.code.toUpperCase());
    }).catch(function (e) { toast(e.message); });
  }

  /* ---------- 轮询 ---------- */
  function enterRoom(code) {
    state.code = code;
    state.finished = false;
    state.engineReady = false;
    if (state.engine) { state.engine.destroy(); state.engine = null; }
    showView(state.isSpectator ? 'spectate' : 'room');
    $('race-code-chip').style.display = 'block';
    $('race-code-chip').textContent = '房间 ' + code;
    $('room-code').textContent = code;
    state.tickFailures = 0;
    setReconnectBanner(false);
    persistRaceRestore();
    startPolling();
  }
  function startPolling() { stopPolling(); state.pollTimer = setInterval(tick, 1200); tick(); }
  function stopPolling() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }

  function tick() {
    var body = {};
    if (!state.isSpectator && state.engine && state.snap && state.snap.race.status === 'racing') {
      body.progress = state.engine.state().typed;
    }
    api('/api/race/tick', { method: 'POST', body: body }).then(function (snap) {
      state.tickFailures = 0;
      if (state.reconnectShown) {
        setReconnectBanner(false);
        toast('已重新连接');
      }
      state.snap = snap;
      persistRaceRestore();
      render();
    }).catch(function (e) {
      if (e.status === 401 || e.status === 400) {
        stopPolling();
        var msg = e.message || '';
        var interrupted = msg.indexOf('已不在该房间') >= 0 || msg.indexOf('你不在任何房间中') >= 0;
        toast(interrupted ? '比赛已中断' : ('已离开房间：' + msg));
        backToLobby();
        return;
      }
      state.tickFailures += 1;
      if (state.tickFailures >= 3) setReconnectBanner(true);
    });
  }

  function render() {
    var snap = state.snap;
    if (!snap) return;
    var st = snap.race.status;
    if (st === 'cancelled') {
      stopPolling();
      toast('房间已解散' + (snap.race.cancelledReason === 'admin' ? '（管理员操作）' : ''));
      backToLobby();
      return;
    }
    if (state.isSpectator) { showView('spectate'); renderSpectate(snap); return; }
    if (st === 'waiting') { showView('room'); renderRoom(snap); }
    else if (st === 'countdown') { showView('race'); renderCountdown(snap); }
    else if (st === 'racing') { showView('race'); renderRacing(snap); }
    else if (st === 'finished' || st === 'aborted') {
      clearRaceRestore();
      showView('result'); renderResult(snap); stopPolling();
    }
  }

  /* ---------- 等待房间 ---------- */
  function renderRoom(snap) {
    var me = snap.me;
    $('room-article').textContent = snap.race.articleTitle + ' · ' + snap.race.charCount + ' 字 · 上限 ' + snap.race.maxPlayers + ' 人';
    $('btn-ready').textContent = me && me.ready ? '取消准备' : '准备';
    var isHost = me && me.userId && me.userId === snap.race.hostUserId;
    $('btn-start').style.display = isHost ? 'inline-block' : 'none';
    var allReady = snap.players.every(function (p) { return p.ready; });
    $('btn-start').disabled = !allReady;
    $('room-status').textContent = allReady
      ? '全员已准备，房主可以开始'
      : '等待所有人准备（' + snap.players.filter(function (p) { return p.ready; }).length + '/' + snap.players.length + '）';
    $('spectator-setting-wrap').style.display = isHost ? 'flex' : 'none';
    $('room-allow-spectator').checked = snap.race.allowSpectator !== false;
    $('room-spectators').textContent = '观战 ' + (snap.race.spectatorCount || 0) + ' 人';

    var box = $('room-players');
    box.innerHTML = '';
    snap.players.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'race-player-row';
      var tags = (p.isHost ? '<span class="race-tag race-tag-host">房主</span>' : '') + (p.isGuest ? '<span class="race-tag">游客</span>' : '');
      row.innerHTML = '<span class="race-player-name">' + esc(p.nickname) + tags + '</span>' +
        '<span class="' + (p.ready ? 'race-ready-on' : 'race-ready-off') + '">' + (p.ready ? '已准备' : '未准备') + '</span>';
      if (isHost && !p.isHost) {
        var kick = document.createElement('button');
        kick.className = 'race-btn race-btn-small race-btn-ghost';
        kick.textContent = '踢出';
        kick.onclick = function () { doKick(p); };
        row.appendChild(kick);
      }
      box.appendChild(row);
    });
  }

  function doKick(p) {
    if (!confirm('把 ' + p.nickname + ' 移出房间？')) return;
    var body = p.userId ? { targetUserId: p.userId } : { targetGuestId: p.guestId };
    api('/api/race/kick', { method: 'POST', body: body }).then(tick).catch(function (e) { toast(e.message); });
  }

  /* ---------- 比赛（与首页同一套打字交互） ---------- */
  function renderCountdown(snap) {
    $('race-article').textContent = snap.race.articleTitle;
    $('race-meta').textContent = snap.race.charCount + ' 字';
    var offset = snap.race.serverNow - Date.now();
    var left = Math.ceil((snap.race.startsAt - (Date.now() + offset)) / 1000);
    var cd = $('race-countdown');
    cd.style.display = 'flex';
    cd.textContent = left > 0 ? String(left) : 'GO';
    mountEngine(snap, false);
    renderRank(snap);
  }

  function renderRacing(snap) {
    $('race-countdown').style.display = 'none';
    $('race-article').textContent = snap.race.articleTitle;
    $('race-meta').textContent = snap.race.charCount + ' 字';
    mountEngine(snap, true);
    renderRank(snap);

    if (snap.me && state.engine) {
      var st = state.engine.state();
      renderMine(snap, st.typed, st.accuracy);
    }
  }

  function renderMine(snap, typed, accuracy) {
    var elapsed = snap.race.startsAt ? Math.max(1, (snap.race.serverNow || Date.now()) - snap.race.startsAt) : 1;
    var speed = typed > 0 ? Math.round(typed * 60000 / elapsed) : 0;
    $('race-mine').innerHTML =
      '<div>进度 ' + typed + ' / ' + snap.race.charCount + '</div>' +
      '<div>速度 ' + speed + ' 字/分</div>' +
      '<div>正确率 ' + accuracy + '%</div>';
  }

  function mountEngine(snap, enable) {
    if (!state.engine) {
      state.engine = window.TypingEngine.create($('race-typing'), {
        text: snap.race.content || '',
        enabled: false,
        onChange: function (st) {
          if (state.snap && state.snap.me) {
            renderMine(state.snap, st.typed, st.accuracy);
          }
        },
        onFinish: function (st) {
          if (state.finished) return;
          state.finished = true;
          api('/api/race/finish', { method: 'POST', body: { accuracy: st.accuracy } })
            .then(function (r) { toast('完赛：第 ' + r.rank + ' 名'); tick(); })
            .catch(function (e) { toast(e.message); });
        }
      });
      state.engineReady = true;
      if (snap.me && snap.me.progress > 0 && state.engine.restore) {
        state.engine.restore(snap.me.progress);
      }
    }
    if (enable && state.engineReady) { state.engine.enable(true); }
  }

  function renderRank(snap) {
    var box = $('race-rank');
    box.innerHTML = '';
    snap.players.forEach(function (p, i) {
      var pct = Math.round((p.progress || 0) / Math.max(1, snap.race.charCount) * 100);
      var row = document.createElement('div');
      row.className = 'race-rank-row' + (snap.me && p.nickname === snap.me.nickname ? ' race-rank-me' : '');
      row.innerHTML = '<span class="race-rank-no">' + (i + 1) + '</span>' +
        '<span class="race-rank-name">' + esc(p.nickname) + '</span>' +
        '<span class="race-rank-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="race-rank-pct">' + (p.finishedAt ? '完成' : pct + '%') + '</span>';
      box.appendChild(row);
    });
  }

  /* ---------- 观战（导播台） ---------- */
  function renderSpectate(snap) {
    var r = snap.race;
    $('spec-article').textContent = r.articleTitle;
    $('spec-meta').textContent = r.charCount + ' 字 · ' + ({ waiting: '等待中', countdown: '倒计时', racing: '比赛中', finished: '已结束', aborted: '已中断' }[r.status] || r.status);

    // 焦点：默认第一名，可点击切换
    var focus = snap.players[0] || null;
    if (state.focusNick) {
      var found = snap.players.filter(function (p) { return p.nickname === state.focusNick; })[0];
      if (found) focus = found;
    }
    if (focus) {
      var pct = Math.round((focus.progress || 0) / Math.max(1, r.charCount) * 100);
      $('spec-focus-name').textContent = focus.nickname + (focus.isHost ? '（房主）' : '');
      $('spec-focus-meta').textContent = '进度 ' + pct + '% · ' + (focus.progress || 0) + '/' + r.charCount + ' 字';
      $('spec-focus-stats').innerHTML =
        '<div>' + (focus.finishedAt ? '已完成（第 ' + focus.rank + ' 名）' : '进行中') + '</div>' +
        '<div>速度 ' + (focus.speed ? Math.round(focus.speed) : '—') + ' 字/分</div>' +
        '<div>正确率 ' + (focus.accuracy ? focus.accuracy + '%' : '—') + '</div>' +
        '<div>用时 ' + (focus.timeSeconds ? focus.timeSeconds + 's' : '—') + '</div>';
    }

    var board = $('spec-board');
    board.innerHTML = '';
    snap.players.forEach(function (p, i) {
      var pct = Math.round((p.progress || 0) / Math.max(1, r.charCount) * 100);
      var row = document.createElement('div');
      row.className = 'race-board-row' + (focus && p.nickname === focus.nickname ? ' is-focus' : '');
      row.innerHTML =
        '<span class="race-board-rank">' + (i + 1) + '</span>' +
        '<span class="race-board-name">' + esc(p.nickname) + (p.isHost ? ' <em>房主</em>' : '') + (p.isGuest ? ' <em>游客</em>' : '') + '</span>' +
        '<span class="race-board-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="race-board-pct">' + pct + '%</span>' +
        '<span class="race-board-stat">' + (p.finishedAt ? ('完成 ' + (p.timeSeconds || '?') + 's') : (p.speed ? Math.round(p.speed) + ' 字/分' : '—')) + '</span>';
      row.onclick = function () { state.focusNick = p.nickname; renderSpectate(snap); };
      board.appendChild(row);
    });
    if (!snap.players.length) board.innerHTML = '<div class="race-empty">还没有选手</div>';

    $('spec-audience').innerHTML =
      '<div>观战 ' + (r.spectatorCount || 0) + ' 人</div>' +
      '<div>我：' + esc(snap.spectator ? snap.spectator.nickname : '') + '</div>' +
      '<button class="race-btn race-btn-small" id="btn-spec-leave" style="margin-top:8px">离开观战</button>';
    var lv = $('btn-spec-leave');
    if (lv) lv.onclick = leaveRoom;
  }

  /* ---------- 结算 ---------- */
  function renderResult(snap) {
    var box = $('result-list');
    box.innerHTML = '';
    snap.players.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'race-result-row' + (snap.me && p.nickname === snap.me.nickname ? ' race-result-me' : '');
      var medal = ['金', '银', '铜'][i] || '';
      row.innerHTML = '<span class="race-result-rank">' + (i + 1) + (medal ? ' <em>' + medal + '</em>' : '') + '</span>' +
        '<span class="race-result-name">' + esc(p.nickname) + '</span>' +
        '<span class="race-result-stat">' + (p.finishedAt ? '完赛 ' + (p.timeSeconds || '?') + 's · ' + Math.round(p.speed || 0) + ' 字/分' : '未完赛') + '</span>';
      box.appendChild(row);
    });
    if (snap.race.status === 'aborted') {
      box.innerHTML = '<div class="race-empty">比赛已中断（服务端重启等原因），本场不计成绩</div>';
    }
  }

  /* ---------- 视图 ---------- */
  function showView(name) {
    ['lobby', 'room', 'race', 'spectate', 'result'].forEach(function (v) {
      $('view-' + v).style.display = v === name ? 'block' : 'none';
    });
    $('page-title').textContent = { lobby: '比赛大厅', room: '等待开始', race: '比赛中', spectate: '观战中', result: '比赛结果' }[name] || '比赛';
    if (name === 'lobby') {
      if (state.listTimer) clearInterval(state.listTimer);
      refreshList();
      state.listTimer = setInterval(refreshList, 3000);
    } else if (state.listTimer) { clearInterval(state.listTimer); state.listTimer = null; }
  }

  function backToLobby() {
    stopPolling();
    clearRaceRestore();
    if (state.engine) { state.engine.destroy(); state.engine = null; }
    state.snap = null; state.code = null; state.raceToken = state.token;
    state.finished = false; state.isSpectator = false; state.focusNick = null;
    $('race-code-chip').style.display = 'none';
    showView('lobby');
  }
  function leaveRoom() { api('/api/race/leave', { method: 'POST', body: {} }).catch(function () {}).then(backToLobby); }

  function restoreRace() {
    var queryCode = '';
    try { queryCode = (new URLSearchParams(location.search).get('code') || '').toUpperCase(); } catch (e) {}
    if (queryCode) $('join-code').value = queryCode;
    var lastCode = '';
    try { lastCode = localStorage.getItem('lastRaceCode') || ''; } catch (e) {}
    var guestToken = null;
    if (!state.token && lastCode) {
      try { guestToken = sessionStorage.getItem('raceToken:' + lastCode); } catch (e) {}
    }
    if (!state.token && !guestToken) {
      if (lastCode) { try { localStorage.removeItem('lastRaceCode'); } catch (e) {} }
      if (queryCode) toast('请用房间码和密码加入');
      return;
    }
    state.raceToken = state.token || guestToken;
    api('/api/race/active').then(function (r) {
      if (r && r.code) {
        state.isSpectator = !!r.isSpectator;
        toast('已恢复上次的比赛');
        enterRoom(r.code);
        return;
      }
      // 没有活动房间：清掉上次恢复点，并尽量区分“比赛已中断”
      try { localStorage.removeItem('lastRaceCode'); } catch (e) {}
      if (lastCode) {
        try { sessionStorage.removeItem('raceToken:' + lastCode); } catch (e) {}
      }
      if (queryCode) $('join-code').value = queryCode;
      var probeCode = lastCode || queryCode;
      if (!probeCode) return;
      api('/api/race/' + encodeURIComponent(probeCode)).then(function () {
        if (queryCode) toast('请用房间码和密码加入');
      }).catch(function (e) {
        var msg = e.message || '';
        toast(msg.indexOf('比赛已中断') >= 0 ? '比赛已中断' : '请用房间码和密码加入');
      });
    }).catch(function (e) {
      if (e.status === 401) state.raceToken = null;
      if (queryCode) toast('请用房间码和密码加入');
    });
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('btn-create').onclick = doCreate;
    $('btn-join').onclick = function () {
      var code = ($('join-code').value || '').trim().toUpperCase();
      var pw = ($('join-password').value || '').trim();
      if (!code) { toast('请输入房间码'); return; }
      doJoin({ code: code, password: pw, asSpectator: $('join-spectator').checked });
    };
    $('btn-ready').onclick = function () {
      var me = state.snap && state.snap.me;
      api('/api/race/ready', { method: 'POST', body: { ready: !(me && me.ready) } }).then(tick).catch(function (e) { toast(e.message); });
    };
    $('btn-start').onclick = function () {
      api('/api/race/start', { method: 'POST', body: {} }).then(tick).catch(function (e) { toast(e.message); });
    };
    $('btn-leave').onclick = leaveRoom;
    $('btn-leave2').onclick = leaveRoom;
    $('btn-back-lobby').onclick = leaveRoom;
    $('room-allow-spectator').onchange = function () {
      api('/api/race/spectator-setting', { method: 'POST', body: { allow: $('room-allow-spectator').checked } })
        .then(function (r) { toast(r.allowSpectator ? '已开放观战' : '已关闭观战'); tick(); })
        .catch(function (e) { toast(e.message); });
    };
  }

  state.token = localStorage.getItem('token');
  bind();
  showView('lobby');
  loadArticles();
  restoreRace();
})();
