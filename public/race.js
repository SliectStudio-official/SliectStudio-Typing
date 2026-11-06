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
    tickFailures: 0, reconnectShown: false,
    countdownTimer: null, countdownOffset: 0, countdownHideTimer: null,
    lastDissolveNoticeAt: 0,
    polling: false, tickInFlight: false, raceContent: null, needContent: false,
    rankExpanded: false
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
  function readJson(res, url) {
    var ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') < 0) {
      console.error('[接口] 非 JSON 响应', url || res.url, res.status);
      return Promise.reject(new Error('接口返回异常（HTTP ' + res.status + '），请刷新重试'));
    }
    return res.json().catch(function () {
      console.error('[接口] JSON 解析失败', url || res.url, res.status);
      throw new Error('接口返回异常（HTTP ' + res.status + '），请刷新重试');
    });
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
      return readJson(r, path).then(function (data) {
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
        '<span>' + r.charCount + ' 字</span><span>房主 ' + esc(r.hostNickname) + '</span>' +
        (r.spectatorEnabled ? '<span>观战 ' + (r.spectatorCount || 0) + '/' + (r.spectatorSeats || 0) + '</span>' : '') + '</div>' +
        '<div class="race-room-row-actions">' +
        '<button class="race-btn race-btn-small" data-action="join">加入</button>' +
        '<button class="race-btn race-btn-small race-btn-ghost" data-action="spectate">观战</button></div>';
      row.querySelector('[data-action="join"]').onclick = function () { quickJoin(r.code); };
      row.querySelector('[data-action="spectate"]').onclick = function () { quickSpectate(r.code); };
      box.appendChild(row);
    });
  }
  function refreshList() {
    api('/api/race/list').then(renderList).catch(function (e) {
      $('room-list').innerHTML = '<div class="race-empty">' + esc(e.message) + '</div>';
    });
  }
  /* ---------- 快速匹配（全局底部条由 nav.js 管理） ---------- */
  function updateQuickMatchVisibility() {
    var btn = $('btn-quick-match');
    var hint = $('quick-match-guest-hint');
    if (btn) btn.style.display = state.token ? 'inline-flex' : 'none';
    if (hint) hint.style.display = state.token ? 'none' : 'block';
  }
  function startQuickMatch() {
    if (!state.token) { toast('请先登录后再快速匹配'); return; }
    api('/api/race/match/join', { method: 'POST', body: {} }).then(function () {
      try {
        localStorage.setItem('raceMatchPending', '1');
        localStorage.setItem('raceMatchPendingSince', String(Date.now()));
      } catch (e) {}
      window.dispatchEvent(new Event('race-match-pending'));
    }).catch(function (e) {
      toast(e.message);
    });
  }

  function quickJoin(code) {
    var pw = prompt('该房间需要密码（4 位数字）：');
    if (pw === null) return;
    doJoin({ code: code, password: pw });
  }
  function quickSpectate(code) {
    var pw = prompt('以观战身份进入该房间，请输入 4 位密码：');
    if (pw === null) return;
    doJoin({ code: code, password: pw, asSpectator: true });
  }

  /* ---------- 建房 / 加入 ---------- */
  function validateCreateMax(showToast) {
    var input = $('create-max');
    var value = Number(input.value);
    var valid = Number.isInteger(value) && value >= 2 && value <= 100;
    var hint = $('create-max-hint');
    if (hint) hint.textContent = valid ? '2–100 人，观战席自动为约 10%' : '请输入 2–100 之间的整数';
    var btn = $('btn-create');
    if (btn) btn.disabled = !valid;
    var quick = document.querySelectorAll('#create-max-quick .race-max-quick-btn');
    for (var i = 0; i < quick.length; i++) {
      quick[i].classList.toggle('active', Number(quick[i].dataset.max) === value);
    }
    if (!valid && showToast) toast('房间人数上限必须在 2 到 100 之间');
    return valid;
  }
  function doCreate() {
    if (!state.token) { toast('请先登录后再创建比赛'); return; }
    if (!validateCreateMax(true)) return;
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
    try { window.dispatchEvent(new Event('race-room-entered')); } catch (e) {}
    hideCountdownOverlay();
    state.code = code;
    state.finished = false;
    state.engineReady = false;
    state.raceContent = null;
    state.needContent = true;
    state.rankExpanded = false;
    if (state.engine) { state.engine.destroy(); state.engine = null; }
    showView(state.isSpectator ? 'spectate' : 'room');
    $('race-subnav-center').style.display = 'block';
    $('race-code-chip').textContent = '房间 ' + code;
    $('room-code').textContent = code;
    $('btn-exit-race').style.display = 'inline-flex';
    state.tickFailures = 0;
    setReconnectBanner(false);
    persistRaceRestore();
    startPolling();
  }
  function pollDelay() {
    var snap = state.snap;
    if (!snap) return 1200;
    if (state.needContent) return 1200;
    var st = snap.race.status;
    if (st === 'countdown') return 1200;
    if (st === 'racing' && !state.isSpectator && state.engine) {
      var engineState = state.engine.state();
      if (engineState.typed > 0 && engineState.typed < snap.race.charCount && !state.finished) return 1200;
    }
    var n = snap.players ? snap.players.length : 0;
    if (n <= 8) return 1200;
    if (n <= 32) return 2000;
    return 3000;
  }
  function scheduleNextPoll() {
    if (!state.polling) return;
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
    state.pollTimer = setTimeout(tick, pollDelay());
  }
  function startPolling() { stopPolling(); state.polling = true; tick(); }
  function stopPolling() {
    state.polling = false;
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
  }

  function tick() {
    if (state.tickInFlight) return;
    state.tickInFlight = true;
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
    var body = {};
    if (state.needContent) body.wantContent = true;
    if (!state.isSpectator && state.engine && state.snap && state.snap.race.status === 'racing') {
      body.progress = state.engine.state().typed;
    }
    api('/api/race/tick', { method: 'POST', body: body }).then(function (snap) {
      state.tickFailures = 0;
      if (state.reconnectShown) {
        setReconnectBanner(false);
        toast('已重新连接');
      }
      if (snap.race && snap.race.content) {
        state.raceContent = snap.race.content;
        state.needContent = false;
      } else if (!state.raceContent && snap.race && snap.race.status === 'racing') {
        state.needContent = true;
      }
      state.snap = normalizeSnapshot(snap);
      state.isSpectator = mySeat(state.snap) === 'spectator';
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
    }).finally(function () {
      state.tickInFlight = false;
      scheduleNextPoll();
    });
  }

  function render() {
    var snap = state.snap;
    if (!snap) return;
    var st = snap.race.status;
    var seat = mySeat(snap);
    state.isSpectator = seat === 'spectator';
    processDissolveNotice(snap);
    renderDissolve(snap);
    if (st === 'cancelled') {
      stopPolling();
      var reason = snap.race.cancelledReason;
      var reasonText = CANCELLED_TEXT[reason] || '房间已结束';
      toast(reasonText);
      backToLobby();
      return;
    }
    if (st === 'finished' || st === 'aborted') {
      clearRaceRestore();
      showView('result'); renderResult(snap); stopPolling();
      return;
    }
    if (seat === 'spectator') {
      if (st === 'waiting') { showView('room'); renderRoom(snap); }
      else { showView('spectate'); renderSpectate(snap); }
      return;
    }
    if (st === 'waiting') { showView('room'); renderRoom(snap); }
    else if (st === 'countdown') { showView('race'); renderCountdown(snap); }
    else if (st === 'racing') { showView('race'); renderRacing(snap); }
  }

  /* ---------- 等待房间 ---------- */
  function normalizeSnapshot(snap) {
    if (!snap || !snap.compactPlayers || !Array.isArray(snap.players)) return snap;
    snap.players = snap.players.map(function (x) {
      return {
        userId: x.u == null ? null : x.u,
        guestId: x.g || null,
        nickname: x.n,
        isHost: !!x.h,
        isGuest: !!x.i,
        ready: !!x.r,
        progress: x.p || 0,
        finishedAt: x.f ? 1 : null,
        rank: x.k == null ? null : x.k,
        speed: x.s == null ? null : x.s,
        accuracy: x.a == null ? null : x.a,
        timeSeconds: x.t == null ? null : x.t,
        lastSeen: null
      };
    });
    return snap;
  }

  function mySeat(snap) {
    if (snap.race && snap.race.mySeat) return snap.race.mySeat;
    if (snap.me) return 'player';
    return snap.spectator ? 'spectator' : null;
  }
  function isHostSnap(snap) {
    return !!(snap.race.isHost || (snap.me && snap.me.userId !== null && snap.me.userId === snap.race.hostUserId));
  }
  function spectatorCapacity(race) {
    return race.spectatorEnabled ? (race.spectatorSeats || 0) : 0;
  }
  function tagHtml(isHost, isGuest) {
    return (isHost ? '<span class="race-tag race-tag-host">房主</span>' : '') +
      (isGuest ? '<span class="race-tag">游客</span>' : '');
  }
  function makeKickButton(target) {
    var kick = document.createElement('button');
    kick.className = 'race-btn race-btn-small race-btn-ghost';
    kick.textContent = '移出';
    kick.onclick = function () { doKick(target); };
    return kick;
  }
  function renderRoom(snap) {
    var race = snap.race;
    var seat = mySeat(snap);
    var isHost = isHostSnap(snap);
    var cap = spectatorCapacity(race);
    var me = snap.me;
    $('room-article').textContent = race.articleTitle + ' · ' + race.charCount + ' 字 · 上限 ' + race.maxPlayers + ' 人';
    $('btn-ready').style.display = seat === 'player' ? 'inline-block' : 'none';
    $('btn-ready').textContent = me && me.ready ? '取消准备' : '准备';
    $('btn-start').style.display = isHost ? 'inline-block' : 'none';
    var allReady = snap.players.length > 0 && snap.players.every(function (p) { return p.ready; });
    $('btn-start').disabled = !allReady;
    if (!snap.players.length) {
      $('room-status').textContent = '没有选手，无法开始';
    } else {
      $('room-status').textContent = allReady
        ? '全员已准备，房主可以开始'
        : '等待所有人准备（' + snap.players.filter(function (p) { return p.ready; }).length + '/' + snap.players.length + '）';
    }

    var box = $('room-players');
    box.innerHTML = '';
    snap.players.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'race-player-row';
      row.innerHTML = '<span class="race-player-name">' + esc(p.nickname) + tagHtml(p.isHost, p.isGuest) + '</span>' +
        '<span class="' + (p.ready ? 'race-ready-on' : 'race-ready-off') + '">' + (p.ready ? '已准备' : '未准备') + '</span>';
      if (isHost && !p.isHost) {
        var toSpec = document.createElement('button');
        toSpec.className = 'race-btn race-btn-small race-btn-ghost';
        toSpec.textContent = '转观战';
        toSpec.disabled = !race.spectatorEnabled || race.spectatorCount >= cap;
        if (!race.spectatorEnabled) toSpec.title = '请先开启观战';
        else if (race.spectatorCount >= cap) toSpec.title = '观战席已满';
        toSpec.onclick = function () { assignSeat(p, 'spectator'); };
        row.appendChild(toSpec);
        row.appendChild(makeKickButton(p));
      }
      box.appendChild(row);
    });
    snap.spectators.filter(function (s) { return s.fromPlayer; }).forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'race-player-row race-player-spectating';
      row.innerHTML = '<span class="race-player-name">' + esc(s.nickname) + tagHtml(s.isHost, s.isGuest) + '</span>' +
        '<span class="race-ready-off">观战中</span>';
      if (isHost && !s.isHost) {
        var toPlayer = document.createElement('button');
        toPlayer.className = 'race-btn race-btn-small race-btn-ghost';
        toPlayer.textContent = '回选手席';
        toPlayer.disabled = snap.players.length >= race.maxPlayers;
        if (toPlayer.disabled) toPlayer.title = '选手席已满';
        toPlayer.onclick = function () { assignSeat(s, 'player'); };
        row.appendChild(toPlayer);
        row.appendChild(makeKickButton(s));
      }
      box.appendChild(row);
    });

    renderSpectatorPanel(snap, isHost, seat);
  }

  function renderSpectatorPanel(snap, isHost, seat) {
    var race = snap.race;
    var cap = spectatorCapacity(race);
    var count = race.spectatorCount || 0;
    $('spec-seats-count').textContent = count + '/' + cap;
    $('spec-mode-note').textContent = !race.spectatorEnabled
      ? '观战已关闭'
      : (race.spectatorMode === 'host' ? '观战席位由房主安排' : '玩家可自行进入观战席');

    var list = $('spec-list');
    list.innerHTML = '';
    if (!snap.spectators.length) {
      list.innerHTML = '<div class="race-spectate-empty">暂无观战者</div>';
    } else {
      snap.spectators.forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'race-spectate-item';
        item.innerHTML = '<span class="race-spectate-name">' + esc(s.nickname) + tagHtml(s.isHost, s.isGuest) + '</span>' +
          (s.fromPlayer ? '<span class="race-tag race-tag-muted">选手转入</span>' : '');
        if (isHost && !s.isHost) {
          var pull = document.createElement('button');
          pull.className = 'race-btn race-btn-small race-btn-ghost';
          pull.textContent = '回选手席';
          pull.disabled = snap.players.length >= race.maxPlayers;
          if (pull.disabled) pull.title = '选手席已满';
          pull.onclick = function () { assignSeat(s, 'player'); };
          item.appendChild(pull);
        }
        list.appendChild(item);
      });
    }

    var actions = $('spec-actions');
    actions.innerHTML = '';
    if (seat === 'spectator') {
      var selfNote = document.createElement('div');
      selfNote.className = 'race-spectate-self';
      selfNote.textContent = '你正在观战';
      actions.appendChild(selfNote);
    }
    var canReturn = snap.players.length < race.maxPlayers;
    if (isHost) {
      var hostBtn = document.createElement('button');
      hostBtn.className = 'race-btn race-btn-small';
      if (seat === 'spectator') {
        hostBtn.textContent = '回到选手席';
        hostBtn.disabled = !canReturn;
        if (!canReturn) hostBtn.title = '选手席已满';
        hostBtn.onclick = function () { spectateSelf('leave'); };
      } else {
        hostBtn.textContent = '进入观战席';
        hostBtn.disabled = !race.spectatorEnabled || count >= cap;
        if (!race.spectatorEnabled) hostBtn.title = '请先开启观战';
        else if (count >= cap) hostBtn.title = '观战席已满';
        hostBtn.onclick = function () { spectateSelf('enter'); };
      }
      actions.appendChild(hostBtn);
    } else if (seat === 'spectator') {
      if (race.spectatorEnabled && race.spectatorMode === 'free') {
        var back = document.createElement('button');
        back.className = 'race-btn race-btn-small';
        back.textContent = '回到选手席';
        back.disabled = !canReturn;
        if (!canReturn) back.title = '选手席已满';
        back.onclick = function () { spectateSelf('leave'); };
        actions.appendChild(back);
      } else {
        actions.insertAdjacentHTML('beforeend', '<div class="race-hint">观战席位由房主安排</div>');
      }
    } else if (seat === 'player') {
      if (!race.spectatorEnabled) {
        actions.innerHTML = '<div class="race-hint">观战已关闭</div>';
      } else if (race.spectatorMode === 'host') {
        actions.innerHTML = '<div class="race-hint">观战席位由房主安排</div>';
      } else {
        var enter = document.createElement('button');
        enter.className = 'race-btn race-btn-small';
        enter.textContent = '进入观战席';
        enter.disabled = count >= cap;
        if (count >= cap) enter.title = '观战席已满';
        enter.onclick = function () { spectateSelf('enter'); };
        actions.appendChild(enter);
      }
    }

    $('spec-host-controls').style.display = isHost ? 'block' : 'none';
    if (isHost) {
      $('spec-enabled').checked = !!race.spectatorEnabled;
      $('spec-mode-free').checked = race.spectatorMode !== 'host';
      $('spec-mode-host').checked = race.spectatorMode === 'host';
      var input = $('spec-seats-input');
      input.max = String(race.maxSpectators || cap || 1);
      input.disabled = !race.spectatorEnabled;
      if (document.activeElement !== input) input.value = String(race.spectatorSeats || 0);
      $('spec-cap-hint').textContent = '席位数范围 1~' + (race.maxSpectators || cap || 1) + '（按人数 10% 计算，至少 1 席）';
    }
  }

  function spectateSelf(action) {
    api('/api/race/spectate/self', { method: 'POST', body: { action: action } })
      .then(function () { return tick(); })
      .catch(function (e) { toast(e.message); });
  }
  function assignSeat(target, to) {
    var targetType = target.isGuest ? 'guest' : 'user';
    var targetId = target.isGuest ? target.guestId : target.userId;
    api('/api/race/spectate/assign', { method: 'POST', body: { targetType: targetType, targetId: targetId, to: to } })
      .then(function () { return tick(); })
      .catch(function (e) { toast(e.message); });
  }
  function updateSpectatorSetting(body) {
    return api('/api/race/spectate/settings', { method: 'POST', body: body })
      .then(function (r) { toast('观战席已更新'); tick(); return r; })
      .catch(function (e) { toast(e.message); tick(); });
  }

  function renderSpectatorLive(snap) {
    var race = snap.race;
    var cap = spectatorCapacity(race);
    $('race-spectator-live-count').textContent = !race.spectatorEnabled
      ? '观战已关闭'
      : ('观战 ' + (race.spectatorCount || 0) + '/' + cap + ' 人');
    var box = $('race-spectator-live-list');
    box.innerHTML = '';
    snap.spectators.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'race-spectate-live-row';
      row.innerHTML = esc(s.nickname) + tagHtml(s.isHost, s.isGuest);
      box.appendChild(row);
    });
    if (!snap.spectators.length) box.innerHTML = '<div class="race-spectate-empty">暂无观战者</div>';
  }

  function doKick(p) {
    if (!confirm('把 ' + p.nickname + ' 移出房间？')) return;
    var body = p.userId ? { targetUserId: p.userId } : { targetGuestId: p.guestId };
    api('/api/race/kick', { method: 'POST', body: body }).then(tick).catch(function (e) { toast(e.message); });
  }

  /* ---------- 全屏倒计时 ---------- */
  function updateCountdownNumber() {
    if (!state.snap || state.snap.race.status !== 'countdown') return;
    var race = state.snap.race;
    var leftMs = race.startsAt - (Date.now() + state.countdownOffset);
    var n = Math.ceil(leftMs / 1000);
    var text = n > 0 ? String(n) : 'GO';
    var el = $('race-countdown-number');
    if (el && el.textContent !== text) {
      el.textContent = text;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }
  }
  function showCountdownOverlay(snap) {
    var overlay = $('race-countdown-overlay');
    if (!overlay) return;
    if (state.countdownHideTimer) { clearTimeout(state.countdownHideTimer); state.countdownHideTimer = null; }
    overlay.style.display = 'flex';
    overlay.classList.remove('closing');
    state.countdownOffset = (snap.race.serverNow || Date.now()) - Date.now();
    var title = $('race-countdown-title');
    var meta = $('race-countdown-meta');
    if (title) title.textContent = '即将开始 · ' + snap.race.articleTitle;
    if (meta) meta.textContent = snap.race.charCount + ' 字';
    updateCountdownNumber();
    if (!state.countdownTimer) state.countdownTimer = setInterval(updateCountdownNumber, 100);
  }
  function hideCountdownOverlay() {
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    var overlay = $('race-countdown-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    overlay.classList.add('closing');
    if (state.countdownHideTimer) clearTimeout(state.countdownHideTimer);
    state.countdownHideTimer = setTimeout(function () {
      overlay.style.display = 'none';
      overlay.classList.remove('closing');
      state.countdownHideTimer = null;
    }, 200);
  }

  /* ---------- 比赛（与首页同一套打字交互） ---------- */
  function renderCountdown(snap) {
    $('race-article').textContent = snap.race.articleTitle;
    $('race-meta').textContent = snap.race.charCount + ' 字';
    var cd = $('race-countdown');
    if (cd) cd.style.display = 'none';
    showCountdownOverlay(snap);
    mountEngine(snap, false);
    renderRank(snap);
    renderSpectatorLive(snap);
  }

  function renderRacing(snap) {
    $('race-countdown').style.display = 'none';
    hideCountdownOverlay();
    $('race-article').textContent = snap.race.articleTitle;
    $('race-meta').textContent = snap.race.charCount + ' 字';
    mountEngine(snap, true);
    renderRank(snap);
    renderSpectatorLive(snap);

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
      var text = snap.race.content || state.raceContent;
      if (!text) {
        state.needContent = true;
        return;
      }
      state.engine = window.TypingEngine.create($('race-typing'), {
        text: text,
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
    var players = snap.players;
    var shown = [];
    var more = 0;
    if (players.length > 20 && !state.rankExpanded) {
      var extras = [];
      players.forEach(function (p, i) {
        var isMe = snap.me && ((p.userId != null && p.userId === snap.me.userId) ||
          (p.guestId && p.guestId === snap.me.guestId));
        if (isMe || p.isHost) extras.push({ p: p, i: i });
        else if (shown.length < 20) shown.push({ p: p, i: i });
      });
      shown = shown.concat(extras).sort(function (a, b) { return a.i - b.i; });
      more = players.length - shown.length;
    } else {
      players.forEach(function (p, i) { shown.push({ p: p, i: i }); });
    }
    shown.forEach(function (entry) {
      var p = entry.p;
      var pct = Math.round((p.progress || 0) / Math.max(1, snap.race.charCount) * 100);
      var row = document.createElement('div');
      row.className = 'race-rank-row' + (snap.me && p.nickname === snap.me.nickname ? ' race-rank-me' : '');
      row.innerHTML = '<span class="race-rank-no">' + (entry.i + 1) + '</span>' +
        '<span class="race-rank-name">' + esc(p.nickname) + '</span>' +
        '<span class="race-rank-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="race-rank-pct">' + (p.finishedAt ? '完成' : pct + '%') + '</span>';
      box.appendChild(row);
    });
    if (more > 0) {
      var moreBtn = document.createElement('button');
      moreBtn.className = 'race-btn race-btn-small race-rank-more';
      moreBtn.textContent = '还有 ' + more + ' 人';
      moreBtn.onclick = function () { state.rankExpanded = true; renderRank(snap); };
      box.appendChild(moreBtn);
    } else if (players.length > 20 && state.rankExpanded) {
      var lessBtn = document.createElement('button');
      lessBtn.className = 'race-btn race-btn-small race-rank-more';
      lessBtn.textContent = '收起排名';
      lessBtn.onclick = function () { state.rankExpanded = false; renderRank(snap); };
      box.appendChild(lessBtn);
    }
    snap.spectators.filter(function (s) { return s.fromPlayer; }).forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'race-rank-row race-rank-spectating';
      row.innerHTML = '<span class="race-rank-no">—</span>' +
        '<span class="race-rank-name">' + esc(s.nickname) + '</span>' +
        '<span class="race-rank-bar"></span>' +
        '<span class="race-rank-pct">观战中</span>';
      box.appendChild(row);
    });
    (snap.abandonedPlayers || []).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'race-rank-row race-rank-abandoned';
      row.innerHTML = '<span class="race-rank-no">—</span>' +
        '<span class="race-rank-name">' + esc(p.nickname) + '</span>' +
        '<span class="race-rank-bar"></span>' +
        '<span class="race-rank-pct">已退出</span>';
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
    } else {
      $('spec-focus-name').textContent = '—';
      $('spec-focus-meta').textContent = '还没有选手';
      $('spec-focus-stats').innerHTML = '';
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
    snap.spectators.filter(function (s) { return s.fromPlayer; }).forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'race-board-row race-board-spectating';
      row.innerHTML =
        '<span class="race-board-rank">—</span>' +
        '<span class="race-board-name">' + esc(s.nickname) + (s.isHost ? ' <em>房主</em>' : '') + (s.isGuest ? ' <em>游客</em>' : '') + '</span>' +
        '<span class="race-board-bar"></span><span class="race-board-pct">—</span><span class="race-board-stat">观战中</span>';
      board.appendChild(row);
    });
    (snap.abandonedPlayers || []).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'race-board-row race-board-abandoned';
      row.innerHTML =
        '<span class="race-board-rank">—</span>' +
        '<span class="race-board-name">' + esc(p.nickname) + (p.isGuest ? ' <em>游客</em>' : '') + '</span>' +
        '<span class="race-board-bar"></span><span class="race-board-pct">—</span><span class="race-board-stat">已退出</span>';
      board.appendChild(row);
    });
    if (!snap.players.length) board.innerHTML = '<div class="race-empty">还没有选手</div>';

    var cap = spectatorCapacity(r);
    var audience = '<div class="race-spectate-live-head">观战 ' + (r.spectatorEnabled ? ((r.spectatorCount || 0) + '/' + cap) : '已关闭') + '</div>' +
      '<div class="race-spectate-live-self">你正在观战：' + esc(snap.spectator ? snap.spectator.nickname : '') + '</div>';
    if (snap.spectators.length) {
      audience += '<div class="race-spectate-live-list">';
      snap.spectators.forEach(function (s) {
        audience += '<div class="race-spectate-live-row">' + esc(s.nickname) + tagHtml(s.isHost, s.isGuest) + '</div>';
      });
      audience += '</div>';
    } else {
      audience += '<div class="race-spectate-empty">暂无观战者</div>';
    }
    $('spec-audience').innerHTML = audience;
  }

  /* ---------- 结算 ---------- */
  function renderResult(snap) {
    var box = $('result-list');
    box.innerHTML = '';
    if (mySeat(snap) === 'spectator') {
      box.innerHTML = '<div class="race-empty">你以观战身份参与了本场比赛</div>';
      return;
    }
    snap.players.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'race-result-row' + (snap.me && p.nickname === snap.me.nickname ? ' race-result-me' : '');
      var medal = ['金', '银', '铜'][i] || '';
      row.innerHTML = '<span class="race-result-rank">' + (i + 1) + (medal ? ' <em>' + medal + '</em>' : '') + '</span>' +
        '<span class="race-result-name">' + esc(p.nickname) + '</span>' +
        '<span class="race-result-stat">' + (p.finishedAt ? '完赛 ' + (p.timeSeconds || '?') + 's · ' + Math.round(p.speed || 0) + ' 字/分' : '未完赛') + '</span>';
      box.appendChild(row);
    });
    if (snap.abandonedPlayers && snap.abandonedPlayers.length) {
      var abandoned = document.createElement('div');
      abandoned.className = 'race-result-abandoned';
      abandoned.innerHTML = '<div class="race-result-abandoned-title">中途退出</div>' +
        snap.abandonedPlayers.map(function (p) {
          return '<div>' + esc(p.nickname) + (p.isGuest ? '（游客）' : '') + ' · ' + (p.atChar || 0) + ' 字</div>';
        }).join('');
      box.appendChild(abandoned);
    }
    if (snap.race.status === 'aborted') {
      box.innerHTML = '<div class="race-empty">比赛已中断（服务端重启等原因），本场不计成绩</div>';
    }
  }

  /* ---------- 顶部退出入口 ---------- */
  var CANCELLED_TEXT = {
    host_leave: '房主已解散房间',
    host_disconnect: '房主长时间离线，房间已解散',
    all_left: '选手都已离开，房间已结束',
    all_disconnected: '所有选手离线，房间已结束',
    time_limit: '比赛超时，已结束',
    dissolve_direct: '房主已解散本局',
    vote_dissolved: '解散投票已通过，本局结束',
    admin: '管理员已解散房间'
  };

  function exitConfig(snap) {
    var isHost = !!snap && isHostSnap(snap);
    var seat = snap ? mySeat(snap) : (state.isSpectator ? 'spectator' : 'player');
    var st = snap && snap.race ? snap.race.status : 'waiting';
    var playerCount = snap && snap.players ? snap.players.length : 0;
    var spectatorFromPlayer = !!(snap && snap.spectator && snap.spectator.fromPlayer);
    if (seat === 'spectator') {
      if (st === 'waiting' && (isHost || spectatorFromPlayer)) {
        return { label: '回到选手席', confirm: '', title: '', text: '', action: 'spectateLeave', danger: false };
      }
      if (!isHost) {
        return {
          label: '退出观战', confirm: '退出观战', title: '退出观战',
          text: '退出后不再占用观战席，比赛照常进行。', action: 'leave', danger: false
        };
      }
    }
    if (st === 'waiting' && isHost && seat === 'player') {
      if (playerCount >= 3) {
        return { label: '发起解散投票', confirm: '', title: '', text: '', action: 'dissolve', danger: true };
      }
      return {
        label: '解散房间', confirm: '解散房间', title: '解散房间',
        text: '你是房主，解散后<strong>所有选手会被请回大厅</strong>，本局不产生成绩。',
        action: 'leave', danger: true
      };
    }
    if (st === 'waiting') {
      return {
        label: '退出比赛', confirm: '退出', title: '退出比赛',
        text: '退出后本局不再保留你的席位。', action: 'leave', danger: false
      };
    }
    if (st === 'countdown' || st === 'racing') {
      var text = '比赛已开始，退出后本局记为<strong>中途退出</strong>：不计名次、不计成绩，且不能重新加入本局。';
      if (isHost) text += '房主身份将转给剩余选手中最早加入的一位，<strong>房间不会解散</strong>。';
      return {
        label: '退出比赛', confirm: '确认退出', title: '退出比赛',
        text: text, action: 'leave', danger: false
      };
    }
    return {
      label: '退出', confirm: '退出', title: '退出比赛',
      text: '返回大厅并关闭本房间。', action: 'leave', danger: false
    };
  }
  function updateRaceChrome() {
    var hasRoom = !!state.code;
    $('race-subnav-center').style.display = hasRoom ? 'block' : 'none';
    var snap = state.snap;
    var isHost = !!(snap && isHostSnap(snap));
    var seat = snap ? mySeat(snap) : (state.isSpectator ? 'spectator' : 'player');
    var st = snap && snap.race ? snap.race.status : 'waiting';
    var playerCount = snap && snap.players ? snap.players.length : 0;
    var hostWaitingVote = isHost && seat === 'player' && st === 'waiting' && playerCount >= 3;
    var canDissolve = hasRoom && isHost && ((hostWaitingVote) || st === 'countdown' || st === 'racing');
    var dissolveBtn = $('btn-dissolve-race');
    if (dissolveBtn) {
      dissolveBtn.style.display = canDissolve ? 'inline-flex' : 'none';
      dissolveBtn.textContent = '发起解散投票';
    }
    var showExit = hasRoom && !(isHost && seat === 'player' && st === 'waiting' && playerCount >= 3);
    $('btn-exit-race').style.display = showExit ? 'inline-flex' : 'none';
    if (!hasRoom) return;
    var cfg = exitConfig(state.snap);
    var label = cfg.label;
    if (window.innerWidth <= 480) {
      if (cfg.danger) label = '解散';
      else if (label === '回到选手席') label = '返回';
      else if (label !== '退出观战') label = '退出';
    }
    $('btn-exit-race').textContent = label;
    $('btn-exit-race').classList.toggle('race-btn-danger', !!cfg.danger);
  }
  var exitReturnFocus = null;
  function openExitDialog() {
    var cfg = exitConfig(state.snap);
    $('race-exit-title').textContent = cfg.title;
    $('race-exit-text').innerHTML = cfg.text;
    $('race-exit-confirm').textContent = cfg.confirm;
    exitReturnFocus = document.activeElement;
    $('race-exit-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    $('race-exit-cancel').focus();
  }
  function closeExitDialog(restoreFocus) {
    $('race-exit-overlay').style.display = 'none';
    document.body.style.overflow = '';
    if (restoreFocus && exitReturnFocus && exitReturnFocus.focus) exitReturnFocus.focus();
    exitReturnFocus = null;
  }
  function confirmExitRace() {
    closeExitDialog(false);
    var cfg = exitConfig(state.snap);
    if (cfg.action === 'spectateLeave') { spectateSelf('leave'); return; }
    leaveRoom();
  }

  /* ---------- 解散比赛投票（H 组） ---------- */
  function dissolveRemaining(snap) {
    var d = snap.dissolve;
    if (!d) return 0;
    var offset = (snap.race.serverNow || Date.now()) - Date.now();
    return Math.max(0, Math.ceil((d.expiresAt - (Date.now() + offset)) / 1000));
  }
  function processDissolveNotice(snap) {
    var notice = snap.dissolveNotice;
    if (!notice || !notice.at || notice.at === state.lastDissolveNoticeAt) return;
    state.lastDissolveNoticeAt = notice.at;
    if (notice.type === 'expired') toast('解散投票未通过（' + notice.agreed + '/' + notice.total + '）');
    else toast('解散投票已取消');
  }
  function dissolveCardHtml(snap, d, seat, isHost) {
    var blocks = '';
    for (var i = 0; i < d.needed; i++) {
      blocks += '<span class="race-dissolve-seg' + (i < d.agreed ? ' filled' : '') + '"></span>';
    }
    var buttons = '';
    var myVote = d.myVote || null;
    if (seat === 'player') {
      buttons += '<button class="race-btn race-btn-small race-dissolve-agree' + (myVote === 'agree' ? ' is-selected' : '') + '" aria-pressed="' + (myVote === 'agree') + '"' + (myVote ? ' disabled' : '') + '>同意</button>';
      buttons += '<button class="race-btn race-btn-small race-dissolve-reject' + (myVote === 'no' ? ' is-selected' : '') + '" aria-pressed="' + (myVote === 'no') + '"' + (myVote ? ' disabled' : '') + '>拒绝</button>';
    } else {
      buttons += '<div class="race-dissolve-readonly">观战者不参与投票</div>';
    }
    if (isHost) buttons += '<button class="race-btn race-btn-small race-btn-ghost race-dissolve-withdraw">撤回</button>';
    return '<div class="race-dissolve-card">' +
      '<div class="race-dissolve-title">房主发起了解散投票</div>' +
      '<div class="race-dissolve-blocks" id="race-dissolve-blocks" role="progressbar" aria-valuenow="' + d.agreed + '" aria-valuemin="0" aria-valuemax="' + d.needed + '">' + blocks + '</div>' +
      '<div class="race-dissolve-count">' + d.agreed + '/' + d.needed + ' 人同意 · 剩余 ' + dissolveRemaining(snap) + 's</div>' +
      '<div class="race-dissolve-actions">' + buttons + '</div>' +
      '</div>';
  }
  function renderDissolve(snap) {
    var ids = ['race-dissolve-wait', 'race-dissolve-block', 'race-dissolve-spectate'];
    ids.forEach(function (id) {
      var el = $(id);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });
    if (!snap || !snap.dissolve) return;
    var seat = mySeat(snap);
    var isHost = isHostSnap(snap);
    var st = snap.race.status;
    var target = 'race-dissolve-block';
    if (st === 'waiting') target = 'race-dissolve-wait';
    else if (seat === 'spectator') target = 'race-dissolve-spectate';
    var el = $(target);
    if (!el) return;
    el.innerHTML = dissolveCardHtml(snap, snap.dissolve, seat, isHost);
    el.style.display = 'block';
    var agree = el.querySelector('.race-dissolve-agree');
    var reject = el.querySelector('.race-dissolve-reject');
    var withdraw = el.querySelector('.race-dissolve-withdraw');
    if (agree) agree.onclick = function () { voteDissolve(true); };
    if (reject) reject.onclick = function () { voteDissolve(false); };
    if (withdraw) withdraw.onclick = function () { withdrawDissolve(); };
  }
  function voteDissolve(agree) {
    var d = state.snap && state.snap.dissolve;
    if (!d || d.myVote) return;
    var prev = d.myVote;
    if (prev === 'agree') d.agreed -= 1;
    d.myVote = agree ? 'agree' : 'no';
    if (agree && prev !== 'agree') d.agreed += 1;
    renderDissolve(state.snap);
    api('/api/race/dissolve/vote', { method: 'POST', body: { agree: agree } })
      .then(function (r) {
        if (state.snap && state.snap.dissolve && r) {
          state.snap.dissolve.agreed = r.agreed;
          state.snap.dissolve.needed = r.needed;
          state.snap.dissolve.total = r.total;
          renderDissolve(state.snap);
        }
        tick();
      })
      .catch(function (e) { toast(e.message); tick(); });
  }
  function withdrawDissolve() {
    api('/api/race/dissolve/cancel', { method: 'POST', body: {} })
      .then(function () { tick(); })
      .catch(function (e) { toast(e.message); });
  }
  var dissolveReturnFocus = null;
  function openDissolveDialog() {
    var snap = state.snap;
    if (!snap) return;
    var count = snap.players.length;
    $('race-dissolve-text').innerHTML = count < 3
      ? '房间内不足 3 人，确认后<strong>立即解散本局</strong>。'
      : '发起后需要<strong>超过一半的人同意</strong>（当前需 ' + (Math.floor(count / 2) + 1) + ' 人）才能解散，投票 30 秒内有效。';
    dissolveReturnFocus = document.activeElement;
    $('race-dissolve-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    $('race-dissolve-cancel').focus();
  }
  function closeDissolveDialog(restoreFocus) {
    $('race-dissolve-overlay').style.display = 'none';
    document.body.style.overflow = '';
    if (restoreFocus && dissolveReturnFocus && dissolveReturnFocus.focus) dissolveReturnFocus.focus();
    dissolveReturnFocus = null;
  }
  function confirmDissolve() {
    closeDissolveDialog(false);
    api('/api/race/dissolve/start', { method: 'POST', body: {} })
      .then(function (r) {
        if (r && r.result === 'cancelled') toast('房间已解散');
        tick();
      })
      .catch(function (e) { toast(e.message); });
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
    updateRaceChrome();
  }

  function backToLobby() {
    stopPolling();
    hideCountdownOverlay();
    clearRaceRestore();
    if (state.engine) { state.engine.destroy(); state.engine = null; }
    state.snap = null; state.code = null; state.raceToken = state.token;
    state.finished = false; state.isSpectator = false; state.focusNick = null;
    state.raceContent = null; state.needContent = false; state.rankExpanded = false;
    $('race-subnav-center').style.display = 'none';
    $('btn-exit-race').style.display = 'none';
    var db = $('btn-dissolve-race'); if (db) db.style.display = 'none';
    ['race-dissolve-wait', 'race-dissolve-block', 'race-dissolve-spectate'].forEach(function (id) {
      var el = $(id); if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });
    try {
      localStorage.removeItem('raceMatchPending');
      localStorage.removeItem('raceMatchPendingSince');
    } catch (e) {}
    try { window.dispatchEvent(new Event('race-match-cancel-local')); } catch (e) {}
    showView('lobby');
  }
  function leaveRoom() {
    return api('/api/race/leave', { method: 'POST', body: {} })
      .then(backToLobby)
      .catch(function (e) { toast(e.message); });
  }

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
    $('btn-quick-match').onclick = startQuickMatch;
    $('btn-create').onclick = doCreate;
    $('create-max').addEventListener('input', function () { validateCreateMax(false); });
    var maxQuick = document.querySelectorAll('#create-max-quick .race-max-quick-btn');
    for (var qi = 0; qi < maxQuick.length; qi++) {
      maxQuick[qi].addEventListener('click', function () {
        $('create-max').value = this.dataset.max;
        validateCreateMax(false);
      });
    }
    validateCreateMax(false);
    $('btn-join').onclick = function () {
      var code = ($('join-code').value || '').trim().toUpperCase();
      var pw = ($('join-password').value || '').trim();
      if (!code) { toast('请输入房间码'); return; }
      doJoin({ code: code, password: pw });
    };
    $('btn-ready').onclick = function () {
      var me = state.snap && state.snap.me;
      api('/api/race/ready', { method: 'POST', body: { ready: !(me && me.ready) } }).then(tick).catch(function (e) { toast(e.message); });
    };
    $('btn-start').onclick = function () {
      api('/api/race/start', { method: 'POST', body: {} }).then(tick).catch(function (e) { toast(e.message); });
    };
    $('btn-leave2').onclick = leaveRoom;
    $('btn-back-lobby').onclick = leaveRoom;
    $('btn-exit-race').onclick = function () {
      var cfg = exitConfig(state.snap);
      if (cfg.action === 'spectateLeave') { spectateSelf('leave'); return; }
      if (cfg.action === 'dissolve') { openDissolveDialog(); return; }
      openExitDialog();
    };
    $('btn-dissolve-race').onclick = openDissolveDialog;
    $('race-dissolve-cancel').onclick = function () { closeDissolveDialog(true); };
    $('race-dissolve-confirm').onclick = confirmDissolve;
    $('race-dissolve-overlay').addEventListener('click', function (e) {
      if (e.target === $('race-dissolve-overlay')) closeDissolveDialog(true);
    });
    $('race-exit-cancel').onclick = function () { closeExitDialog(true); };
    $('race-exit-confirm').onclick = confirmExitRace;
    $('race-exit-overlay').addEventListener('click', function (e) {
      if (e.target === $('race-exit-overlay')) closeExitDialog(true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('race-exit-overlay').style.display !== 'none') {
        e.preventDefault();
        closeExitDialog(true);
      } else if (e.key === 'Escape' && $('race-dissolve-overlay').style.display !== 'none') {
        e.preventDefault();
        closeDissolveDialog(true);
      }
    });
    $('spec-enabled').onchange = function () {
      updateSpectatorSetting({ enabled: $('spec-enabled').checked });
    };
    $('spec-mode-free').onchange = function () {
      if ($('spec-mode-free').checked) updateSpectatorSetting({ mode: 'free' });
    };
    $('spec-mode-host').onchange = function () {
      if ($('spec-mode-host').checked) updateSpectatorSetting({ mode: 'host' });
    };
    $('spec-seats-input').onchange = function () {
      var input = $('spec-seats-input');
      var cap = input.max ? parseInt(input.max, 10) : 1;
      var value = parseInt(input.value, 10);
      if (!Number.isInteger(value)) value = 1;
      var clamped = Math.max(1, Math.min(cap, value));
      if (clamped !== value) {
        toast('观战席位数必须在 1 到 ' + cap + ' 之间');
        input.value = String(clamped);
        return;
      }
      updateSpectatorSetting({ seats: clamped });
    };
  }

  state.token = localStorage.getItem('token');
  window.addEventListener('resize', updateRaceChrome);
  bind();
  updateQuickMatchVisibility();
  showView('lobby');
  loadArticles();
  restoreRace();
})();
