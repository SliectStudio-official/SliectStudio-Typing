/* 引导页：独立于练习页，数据与匹配逻辑集中在这里。 */
(function () {
  'use strict';

  var state = {
    token: null,
    user: null,
    continueId: null,
    matchActive: false,
    matchTimer: null,
    fitTimer: null,
    notifyOpen: false,
    countRaf: null,
    countTasks: []
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getToken() { return localStorage.getItem('token'); }
  function readJson(res) {
    var ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') < 0) {
      return Promise.reject(new Error('接口返回异常（HTTP ' + res.status + '），请刷新重试'));
    }
    return res.json().catch(function () { throw new Error('接口返回异常（HTTP ' + res.status + '），请刷新重试'); });
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (res) {
      return readJson(res).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }
  function toast(text) {
    var box = $('toast-container');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'dash-toast';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }
  function compactNumber(value) {
    var n = Number(value) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + ' M';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' K';
    return String(n);
  }
  function formatTimer(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduceMotion() { return !!(motionQuery && motionQuery.matches); }

  /* ---------- 数字滚动：全部任务共用一条 rAF ---------- */
  function animateStat(el, finalText) {
    if (!el) return;
    if (finalText == null || finalText === '—' || reduceMotion()) {
      el.textContent = finalText == null ? '—' : finalText;
      return;
    }
    var text = String(finalText);
    var m = text.match(/-?\d+(?:\.\d+)?/);
    if (!m) { el.textContent = text; return; }
    var target = Number(m[0]);
    var decimals = (m[0].split('.')[1] || '').length;
    var prefix = text.slice(0, m.index);
    var suffix = text.slice(m.index + m[0].length);
    el.textContent = prefix + (decimals ? (0).toFixed(decimals) : '0') + suffix;
    state.countTasks.push({
      el: el, target: target, decimals: decimals,
      prefix: prefix, suffix: suffix, start: 0, done: false
    });
    startCountLoop();
  }
  function startCountLoop() {
    if (state.countRaf || document.hidden || !state.countTasks.length) return;
    state.countRaf = requestAnimationFrame(stepCountUps);
  }
  function stepCountUps(now) {
    state.countRaf = null;
    if (document.hidden) return;
    var remaining = 0;
    state.countTasks.forEach(function (task) {
      if (task.done) return;
      if (!task.start) task.start = now;
      var p = Math.min(1, (now - task.start) / 600);
      var eased = 1 - Math.pow(1 - p, 3);
      var value = task.target * eased;
      task.el.textContent = task.prefix + (task.decimals ? value.toFixed(task.decimals) : String(Math.round(value))) + task.suffix;
      if (p >= 1) {
        task.done = true;
        task.el.textContent = task.prefix + (task.decimals ? task.target.toFixed(task.decimals) : String(task.target)) + task.suffix;
      } else {
        remaining++;
      }
    });
    state.countTasks = state.countTasks.filter(function (task) { return !task.done; });
    if (remaining) state.countRaf = requestAnimationFrame(stepCountUps);
  }

  /* ---------- 铺满画布与窄屏列表 ---------- */
  function fit() {
    var view = $('view-dashboard');
    if (!view) return;
    var list = window.innerWidth < 900 || window.innerHeight > window.innerWidth;
    view.classList.toggle('is-list', list);
    document.body.classList.toggle('dash-list-mode', list);
  }
  function scheduleFit() {
    if (state.fitTimer) clearTimeout(state.fitTimer);
    state.fitTimer = setTimeout(fit, 100);
  }

  /* ---------- 用户与统计 ---------- */
  function setGuest() {
    state.user = null;
    if ($('dash-username')) $('dash-username').textContent = '游客';
    if ($('dash-profile-name')) $('dash-profile-name').textContent = '游客';
    if ($('dash-avatar')) $('dash-avatar').textContent = '游';
    if ($('home-login')) $('home-login').style.display = '';
  }
  function applyProfile(p) {
    if (!p) return;
    state.user = p;
    var name = p.nickname || p.username || '游客';
    if ($('dash-username')) $('dash-username').textContent = name;
    if ($('dash-profile-name')) $('dash-profile-name').textContent = name;
    if ($('dash-avatar')) {
      if (p.avatar) $('dash-avatar').innerHTML = '<img src="' + esc(p.avatar) + '" alt="">';
      else $('dash-avatar').textContent = name.slice(0, 1);
    }
    if ($('home-login')) $('home-login').style.display = 'none';
    if ($('dash-admin-link')) $('dash-admin-link').style.display = p.role === 'admin' ? '' : 'none';
  }
  function loadProfile() {
    if (!state.token) { setGuest(); return; }
    api('/api/user/profile').then(applyProfile).catch(function (e) {
      if (e.status === 401) {
        localStorage.removeItem('token');
        state.token = null;
        setGuest();
      } else {
        setGuest();
      }
    });
  }
  function loadStats() {
    if (!state.token) return;
    Promise.all([
      api('/api/user/stats').catch(function () { return null; }),
      api('/api/user/race-stats').catch(function () { return null; })
    ]).then(function (rows) {
      var st = rows[0], rs = rows[1];
      if (st) {
        animateStat($('dash-stat-practices'), String(st.totalPractices || 0));
        animateStat($('dash-stat-chars'), compactNumber(st.totalKeystrokes || 0));
        var speed = st.totalTimeSeconds > 0 ? Math.round((st.totalKeystrokes || 0) / st.totalTimeSeconds * 60) : 0;
        animateStat($('dash-stat-speed'), speed ? String(speed) : '—');
      }
      if (rs) {
        animateStat($('dash-stat-winrate'), rs.finishedCount > 0 ? Math.round(rs.winRate) + '%' : '—');
      }
    });
  }
  function loadVersion() {
    fetch('/api/version').then(readJson).then(function (v) {
      if (v && v.version && $('dash-version')) $('dash-version').textContent = 'Typing-' + v.version;
    }).catch(function () {});
  }
  function setContinue(id) {
    state.continueId = id == null ? null : id;
    var desc = $('dash-continue-desc');
    if (desc) desc.textContent = state.continueId == null ? '先去选一篇文章' : '退出前的练习';
  }
  function loadContinue() {
    try {
      var saved = JSON.parse(localStorage.getItem('lastPractice') || 'null');
      if (saved && saved.articleId != null) { setContinue(saved.articleId); return; }
    } catch (e) {}
    if (!state.token) { setContinue(null); return; }
    api('/api/user/history?limit=1').then(function (data) {
      var row = data && data.scores && data.scores[0];
      setContinue(row && row.article_id != null ? row.article_id : null);
    }).catch(function () { setContinue(null); });
  }

  /* ---------- 快速匹配（卡内 / 底部条共用同一计时） ---------- */
  function setMatching(active, startedAt) {
    state.matchActive = active;
    var card = $('dash-quick');
    var title = $('dash-quick-title');
    var desc = $('dash-quick-desc');
    var bar = $('home-match-bar');
    if (!card || !title || !desc) return;
    card.classList.toggle('is-matching', active);
    document.body.classList.toggle('is-matching', active);
    if (active) {
      card.classList.add('fx-was-matching');
      try {
        var since = startedAt || Number(localStorage.getItem('raceMatchPendingSince')) || Date.now();
        if (!localStorage.getItem('raceMatchPendingSince')) localStorage.setItem('raceMatchPendingSince', String(since));
      } catch (e) {}
      title.textContent = '00:00';
      desc.textContent = '正在寻找对手';
      if (bar) bar.classList.add('is-visible');
      if (!state.matchTimer) state.matchTimer = setInterval(updateMatchTimer, 250);
      updateMatchTimer();
    } else {
      title.textContent = '快速开始';
      desc.textContent = '进行 SOLO 匹配';
      if (bar) bar.classList.remove('is-visible');
      if (state.matchTimer) { clearInterval(state.matchTimer); state.matchTimer = null; }
    }
  }
  function updateMatchTimer() {
    if (!state.matchActive) return;
    var since = Number(localStorage.getItem('raceMatchPendingSince')) || Date.now();
    var text = formatTimer((Date.now() - since) / 1000);
    var title = $('dash-quick-title');
    var timer = $('home-match-timer');
    if (title) title.textContent = text;
    if (timer) timer.textContent = text;
    if (!localStorage.getItem('raceMatchPending')) setMatching(false);
  }
  function startMatch() {
    if (state.matchActive) { cancelMatch(); return; }
    if (!state.token) { window.location.href = 'index.html?login=1'; return; }
    api('/api/race/match/join', { method: 'POST', body: {} }).then(function (data) {
      if (data && data.status === 'matched' && data.code) {
        window.location.href = 'race.html?code=' + encodeURIComponent(data.code);
        return;
      }
      try {
        localStorage.setItem('raceMatchPending', '1');
        if (!localStorage.getItem('raceMatchPendingSince')) localStorage.setItem('raceMatchPendingSince', String(Date.now()));
      } catch (e) {}
      setMatching(true);
    }).catch(function (e) { toast(e.message || '匹配失败，请稍后再试'); });
  }
  function cancelMatch() {
    setMatching(false);
    try {
      localStorage.removeItem('raceMatchPending');
      localStorage.removeItem('raceMatchPendingSince');
    } catch (e) {}
    if (state.token) api('/api/race/match/cancel', { method: 'POST', body: {} }).catch(function () {});
  }
  function initMatch() {
    if (!state.token || localStorage.getItem('raceMatchPending') !== '1') return;
    api('/api/race/match/status').then(function (data) {
      if (data && data.status === 'matched' && data.code) {
        window.location.href = 'race.html?code=' + encodeURIComponent(data.code);
        return;
      }
      if (data && data.status === 'waiting') {
        var since = Date.now() - (Number(data.elapsed) || 0);
        try { localStorage.setItem('raceMatchPendingSince', String(since)); } catch (e) {}
        setMatching(true, since);
      } else {
        cancelMatch();
      }
    }).catch(function () {});
  }

  /* ---------- 通知条与通知面板 ---------- */
  function mountAnnouncement() {
    var bar = $('announcement-bar');
    var slot = $('home-announce-slot');
    if (bar && slot && bar.parentNode !== slot) slot.appendChild(bar);
  }
  function renderNotify(items, error) {
    var list = $('home-notify-list');
    if (!list) return;
    if (error) { list.innerHTML = '<div class="home-notify-empty home-notify-error">' + esc(error) + '</div>'; return; }
    if (!items || !items.length) { list.innerHTML = '<div class="home-notify-empty">暂时没有通知</div>'; return; }
    list.innerHTML = '';
    items.forEach(function (item) {
      var el = document.createElement(item.link ? 'a' : 'div');
      el.className = 'home-notify-item';
      if (item.link) el.href = item.link;
      el.innerHTML = '<div class="home-notify-item-title">' + esc(item.title || '通知') + '</div>' +
        '<div class="home-notify-item-body">' + esc(item.body || '') + '</div>' +
        '<div class="home-notify-item-time">' + esc(item.time || '') + '</div>';
      list.appendChild(el);
    });
  }
  function openNotify() {
    var panel = $('home-notify-panel');
    var bell = $('home-bell');
    if (!panel) return;
    panel.style.display = 'block';
    state.notifyOpen = true;
    if (bell) bell.setAttribute('aria-expanded', 'true');
    renderNotify([], '');
    if (state.token) {
      api('/api/notifications?limit=20').then(function (data) {
        renderNotify((data && data.items) || []);
      }).catch(function (e) {
        renderNotify([], e.message || '获取通知失败');
      });
    } else {
      fetch('/api/announcement', { cache: 'no-store' }).then(function (res) {
        return res.ok ? readJson(res) : null;
      }).then(function (data) {
        renderNotify(data && data.id ? [{
          title: data.title || '站点公告',
          body: data.content || '',
          time: data.created_at || ''
        }] : []);
      }).catch(function (e) { renderNotify([], e.message || '获取公告失败'); });
    }
  }
  function closeNotify() {
    var panel = $('home-notify-panel');
    var bell = $('home-bell');
    if (panel) panel.style.display = 'none';
    state.notifyOpen = false;
    if (bell) bell.setAttribute('aria-expanded', 'false');
  }

  /* ---------- 指针视差与页面隐藏暂停 ---------- */
  function resetCard(card) {
    ['--fx-tx', '--fx-ty', '--fx-rx', '--fx-ry', '--fx-mx', '--fx-my'].forEach(function (name) {
      card.style.removeProperty(name);
    });
  }
  function bindCardEffects() {
    if (!window.matchMedia || window.matchMedia('(pointer: coarse)').matches) return;
    Array.prototype.forEach.call(document.querySelectorAll('#view-dashboard .dash-action'), function (card) {
      card.addEventListener('mousemove', function (e) {
        if (reduceMotion()) return;
        var r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        var ny = ((e.clientY - r.top) / r.height) * 2 - 1;
        card.style.setProperty('--fx-tx', (nx * 4).toFixed(2) + 'px');
        card.style.setProperty('--fx-ty', (ny * 2).toFixed(2) + 'px');
        card.style.setProperty('--fx-rx', (-ny * 2).toFixed(2) + 'deg');
        card.style.setProperty('--fx-ry', (nx * 2).toFixed(2) + 'deg');
        card.style.setProperty('--fx-mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        card.style.setProperty('--fx-my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      });
      card.addEventListener('mouseleave', function () { resetCard(card); });
    });
  }
  function bindVisibilityPause() {
    var apply = function () {
      document.body.classList.toggle('fx-paused', !!document.hidden);
      if (!document.hidden) startCountLoop();
    };
    document.addEventListener('visibilitychange', apply);
    apply();
  }

  /* ---------- 事件 ---------- */
  function goPractice() {
    window.location.href = state.continueId != null
      ? 'index.html?article=' + encodeURIComponent(state.continueId)
      : 'index.html';
  }
  function bind() {
    mountAnnouncement();
    setTimeout(mountAnnouncement, 200);
    var cont = $('dash-continue');
    if (cont) cont.addEventListener('click', goPractice);
    var quick = $('dash-quick');
    if (quick) quick.addEventListener('click', startMatch);
    var barClose = $('home-match-close');
    if (barClose) barClose.addEventListener('click', function (e) { e.stopPropagation(); cancelMatch(); });
    var bell = $('home-bell');
    if (bell) bell.addEventListener('click', function () {
      if (state.notifyOpen) closeNotify(); else openNotify();
    });
    var notifyClose = $('home-notify-close');
    if (notifyClose) notifyClose.addEventListener('click', closeNotify);
    var lb = $('dash-lb');
    if (lb) lb.addEventListener('click', function () { window.location.href = 'index.html#leaderboard'; });
    var submit = $('dash-submit');
    if (submit) submit.addEventListener('click', function () {
      window.location.href = state.token ? 'index.html?submit=1' : 'index.html?login=1';
    });
    var profile = $('dash-profile-link');
    if (profile) profile.addEventListener('click', function (e) {
      if (!state.token) { e.preventDefault(); window.location.href = 'index.html?login=1'; }
    });
    document.addEventListener('click', function (e) {
      if (!state.notifyOpen) return;
      var panel = $('home-notify-panel');
      var bellEl = $('home-bell');
      if (panel && !panel.contains(e.target) && bellEl && !bellEl.contains(e.target)) closeNotify();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.notifyOpen) closeNotify();
    });
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', scheduleFit);
    bindCardEffects();
    bindVisibilityPause();
  }

  function init() {
    state.token = getToken();
    fit();
    bind();
    loadVersion();
    loadProfile();
    loadStats();
    loadContinue();
    initMatch();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(function () {});
  }

  init();
})();
