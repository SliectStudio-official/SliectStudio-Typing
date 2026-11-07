/* 全站唯一定层导航：所有页面共用同一份结构与同一套显隐规则
 * 显隐规则（唯一真值）：
 *   未登录 → 练习 / 比赛 /（右侧）登录、注册、主题
 *   已登录 → 练习 / 比赛 / 个人中心 /（管理员额外）管理 /（右侧）昵称、退出、主题
 * 页面脚本仍按原有 id 绑定行为（index 用弹窗，其它页面跳转），本文件不覆盖它们。
 */
(function () {
  'use strict';

  var PAGE_MAP = {
    '/': 'index', '/index.html': 'index',
    '/race.html': 'race',
    '/profile.html': 'profile',
    '/admin.html': 'admin'
  };
  var page = document.body.getAttribute('data-page') || PAGE_MAP[location.pathname] || '';

  function link(href, label, active) {
    return '<li><a href="' + href + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' + label + '</a></li>';
  }

  function render(token) {
    var items =
      link('index.html', '练习', page === 'index') +
      link('race.html', '比赛', page === 'race') +
      '<li id="admin-nav-item" style="display:none"><a href="admin.html"' + (page === 'admin' ? ' class="active"' : '') + '>管理</a></li>' +
      '<li id="profile-nav-item" style="display:none"><a href="profile.html"' + (page === 'profile' ? ' class="active"' : '') + '>个人中心</a></li>';
    var right =
      '<button class="theme-toggle" id="theme-toggle" aria-label="切换主题" title="切换亮色/暗色模式">' +
        '<svg class="theme-icon sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' +
        '<svg class="theme-icon moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
      '</button>';
    // 首页的投稿按钮也由导航提供（script.js 按 id 控制显隐），其它页面保持隐藏
    right += '<button class="nav-btn" id="submit-article-btn" style="display:none;margin-right:10px">投稿</button>';
    // 游客没有头像菜单，用单独的通知入口看公告；登录后改用头像菜单里的「通知中心」
    right += '<button class="nav-notify-btn" id="nav-notify-btn" aria-label="通知中心" title="通知中心" style="display:' + (token ? 'none' : 'inline-flex') + '">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>' +
      '</button>';
    // 两个容器都渲染：首页 script.js 会直接读写 auth-area / user-area 的 style，
    // 少渲染一个就会在 updateAuthUI() 里抛空指针，导致加载遮罩永不消失（K-29）。
    right +=
      '<div id="auth-area" style="display:' + (token ? 'none' : 'flex') + '">' +
        '<button class="nav-btn" id="login-btn" style="margin-right:10px">登录</button>' +
        '<button class="nav-btn" id="register-btn">注册</button>' +
      '</div>' +
      '<div id="user-area" class="user-area" style="display:' + (token ? 'flex' : 'none') + '">' +
        '<button class="avatar-btn" id="avatar-btn" aria-haspopup="menu" aria-expanded="false" title="账号菜单">' +
          '<img class="avatar-img" id="avatar-img" alt="" style="display:none">' +
          '<span class="avatar-fallback" id="avatar-fallback"></span>' +
        '</button>' +
        '<div class="user-menu" id="user-menu" role="menu">' +
          '<div class="user-menu-head">' +
            '<span class="user-menu-name" id="display-username"></span>' +
            '<span class="user-menu-role" id="user-menu-role"></span>' +
            '<span id="nav-username" style="display:none"></span>' +
            '<span id="admin-username" style="display:none"></span>' +
          '</div>' +
          '<div class="user-menu-stats" id="user-menu-stats">' +
            '<div class="user-stat"><b id="stat-practices">—</b><span>练习次数</span></div>' +
            '<div class="user-stat"><b id="stat-chars">—</b><span>累计字数</span></div>' +
            '<div class="user-stat"><b id="stat-speed">—</b><span>平均速度</span></div>' +
          '</div>' +
          '<div class="user-menu-stats user-menu-race-stats" id="user-menu-race-stats">' +
            '<div class="user-stat"><b id="stat-raced">—</b><span>比赛场次</span></div>' +
            '<div class="user-stat"><b id="stat-winrate">—</b><span>胜率</span></div>' +
            '<div class="user-stat"><b id="stat-bestrank">—</b><span>最佳名次</span></div>' +
          '</div>' +
          '<button class="user-menu-item user-menu-notify" id="notify-entry" role="menuitem">' +
            '<span>通知中心</span><span class="notify-badge" id="notify-badge" style="display:none"></span>' +
          '</button>' +
          '<a class="user-menu-item" href="profile.html" role="menuitem">查看数据</a>' +
          '<a class="user-menu-item" href="race.html" role="menuitem">比赛大厅</a>' +
          '<button class="user-menu-item user-menu-danger" id="logout-btn" role="menuitem">退出登录</button>' +
        '</div>' +
      '</div>';

    var desktop = '<a class="logo" href="home.html" aria-label="回到引导页">Typing</a>' +
      '<ul class="nav-links">' + items + '</ul>' +
      '<div class="nav-right">' + right + '</div>';

    var mobileItems =
      link('index.html', '练习', page === 'index') +
      link('race.html', '比赛', page === 'race') +
      '<li id="mobile-admin-nav" style="display:none"><a href="admin.html">管理</a></li>' +
      '<li id="mobile-profile-nav" style="display:none"><a href="profile.html">个人中心</a></li>';
    var drawer =
      '<div class="mobile-menu-overlay" id="mobile-menu-overlay"></div>' +
      '<div class="mobile-menu-drawer" id="mobile-menu-drawer">' +
        '<div class="mobile-menu-drawer-header">' +
          '<a class="logo" href="home.html" aria-label="回到引导页">Typing</a>' +
          '<button class="mobile-menu-drawer-close" id="mobile-menu-close" aria-label="关闭菜单">&times;</button>' +
        '</div>' +
        '<ul class="nav-links-mobile" id="mobile-nav-items">' + mobileItems + '</ul>' +
      '</div>';

    var notifyDrawer =
      '<div class="notify-drawer" id="notify-drawer" role="dialog" aria-label="通知中心" style="display:none">' +
        '<div class="notify-drawer-head">' +
          '<span class="notify-drawer-title">通知中心</span>' +
          '<div class="notify-drawer-actions">' +
            '<button class="notify-read-all" id="notify-read-all">全部标为已读</button>' +
            '<button class="notify-close" id="notify-close" aria-label="关闭通知">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="notify-list" id="notify-list"></div>' +
        '<div class="notify-guest-hint" id="notify-guest-hint" style="display:none">注册后可保留比赛记录</div>' +
      '</div>';

    var matchBar =
      '<div class="race-match-bar" id="race-match-bar" style="display:none">' +
        '<span class="race-match-bar-text" id="race-match-bar-text"></span>' +
        '<button class="race-match-bar-enter" id="race-match-enter" style="display:none">进入比赛</button>' +
        '<button class="race-match-bar-close" id="race-match-bar-action" aria-label="取消匹配" title="取消匹配">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>' +
        '</button>' +
      '</div>';

    var mount = document.getElementById('site-nav');
    if (!mount) return;
    mount.innerHTML =
      '<nav>' +
        '<button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="打开菜单">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>' +
        '</button>' + desktop +
      '</nav>' + notifyDrawer + drawer + matchBar;
  }

  function addItem(html) {
    var ul = document.getElementById('mobile-nav-items');
    if (ul) ul.insertAdjacentHTML('beforeend', html);
  }

  // 失败要可见：任何页面脚本抛错都不许把加载遮罩留在屏幕上（K-29 的教训）
  window.addEventListener('error', function (e) {
    var ov = document.getElementById('page-loading-overlay');
    if (ov) ov.classList.add('hidden');
    console.error('[页面脚本出错]', e && e.message);
    var box = document.getElementById('script-error-banner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'script-error-banner';
      box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#8a2c1d;color:#fff;padding:10px 16px;border-radius:8px;font:14px/1.5 system-ui;max-width:80vw';
      box.textContent = '页面脚本出错，功能可能不完整（详见浏览器控制台）';
      document.body.appendChild(box);
    }
  });

  var token = localStorage.getItem('token');
  render(token);

  // 移动端抽屉（与账号菜单分开命名，避免顶层函数声明互相覆盖）
  var drawer = document.getElementById('mobile-menu-drawer');
  var overlay = document.getElementById('mobile-menu-overlay');
  var toggle = document.getElementById('mobile-menu-toggle');
  var close = document.getElementById('mobile-menu-close');
  function openDrawer() { if (drawer && overlay) { drawer.classList.add('open'); overlay.classList.add('show'); } }
  function closeDrawer() { if (drawer && overlay) { drawer.classList.remove('open'); overlay.classList.remove('show'); } }
  if (toggle) toggle.addEventListener('click', openDrawer);
  if (close) close.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  // 兜底行为：非首页的登录/注册跳首页；退出统一清 token（首页与个人中心有自己的处理，重复执行也无害）
  var isIndex = page === 'index';
  var lb = document.getElementById('login-btn');
  var rb = document.getElementById('register-btn');
  var ob = document.getElementById('logout-btn');
  if (lb && !isIndex) lb.addEventListener('click', function () { location.href = 'index.html'; });
  if (rb && !isIndex) rb.addEventListener('click', function () { location.href = 'index.html'; });
  if (ob) ob.addEventListener('click', function () {
    localStorage.removeItem('token');
    resetAccount();
    if (!isIndex) location.href = 'index.html';
  });

  /* ---------- 头像按钮 + 悬浮菜单 ---------- */
  var AVATAR_COLORS = ['#c96442', '#3f7d5a', '#4a6fa5', '#8a6bbf', '#b8823c', '#a34d6b', '#2f7f8f', '#7a6a4f'];
  function colorOf(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initialOf(name) {
    var s = String(name || '?').trim();
    if (!s) return '?';
    var ch = s[0];
    return /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var accountMenu = document.getElementById('user-menu');
  var avatarBtn = document.getElementById('avatar-btn');
  var menuLoaded = false;
  var appliedToken = null;

  /* ---------- 通知中心 ---------- */
  var NOTIFY_READ_KEY = 'notification_read_ids';
  var notifyItems = [];
  var notifyError = '';
  var notifyLoadedAt = 0;
  var notifyLoadedToken = null;
  var notifyFetching = false;

  function readNotifyIds() {
    try {
      var raw = JSON.parse(localStorage.getItem(NOTIFY_READ_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function saveNotifyIds(ids) {
    var uniq = [];
    for (var i = 0; i < ids.length; i++) if (uniq.indexOf(ids[i]) < 0) uniq.push(ids[i]);
    if (uniq.length > 200) uniq = uniq.slice(uniq.length - 200);
    try { localStorage.setItem(NOTIFY_READ_KEY, JSON.stringify(uniq)); } catch (e) {}
  }
  function markNotifyRead(ids) {
    if (!ids || !ids.length) return;
    saveNotifyIds(readNotifyIds().concat(ids));
    renderNotifyBadge();
  }
  function unreadNotifyCount() {
    var read = readNotifyIds();
    var count = 0;
    notifyItems.forEach(function (item) { if (read.indexOf(item.id) < 0) count++; });
    return count;
  }
  function renderNotifyBadge() {
    var badge = document.getElementById('notify-badge');
    if (!badge) return;
    if (!localStorage.getItem('token') || notifyError) { badge.style.display = 'none'; return; }
    var count = unreadNotifyCount();
    if (!count) { badge.style.display = 'none'; return; }
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'inline-flex';
  }
  function renderNotifyList() {
    var list = document.getElementById('notify-list');
    var hint = document.getElementById('notify-guest-hint');
    if (!list) return;
    if (hint) hint.style.display = localStorage.getItem('token') ? 'none' : 'block';
    if (notifyError) {
      list.innerHTML = '<div class="notify-empty notify-error">' + esc(notifyError) + '</div>';
      return;
    }
    if (!notifyItems.length) {
      list.innerHTML = '<div class="notify-empty">暂时没有通知</div>';
      return;
    }
    list.innerHTML = '';
    notifyItems.forEach(function (item) {
      var el = document.createElement(item.link ? 'a' : 'div');
      el.className = 'notify-item';
      if (item.link) el.href = item.link;
      el.innerHTML =
        '<div class="notify-item-title">' + esc(item.title) + '</div>' +
        '<div class="notify-item-body">' + esc(item.body) + '</div>' +
        '<div class="notify-item-time">' + esc(item.time) + '</div>';
      el.addEventListener('click', function () { markNotifyRead([item.id]); });
      list.appendChild(el);
    });
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
  function fetchNotifications(force) {
    var tk = localStorage.getItem('token');
    if (!tk) return Promise.resolve();
    if (!force && notifyLoadedAt && Date.now() - notifyLoadedAt < 60000) return Promise.resolve();
    if (notifyFetching) return Promise.resolve();
    notifyFetching = true;
    return fetch('/api/notifications?limit=20', { headers: { Authorization: 'Bearer ' + tk } })
      .then(function (r) {
        return readJson(r, '/api/notifications').then(function (data) {
          if (!r.ok) throw new Error((data && data.error) || ('HTTP ' + r.status));
          return data || {};
        });
      })
      .then(function (data) {
        if (localStorage.getItem('token') !== tk) return;
        notifyItems = Array.isArray(data.items) ? data.items : [];
        notifyError = '';
        notifyLoadedAt = Date.now();
        renderNotifyBadge();
        if (document.getElementById('notify-drawer').style.display !== 'none') {
          renderNotifyList();
          markNotifyRead(notifyItems.map(function (item) { return item.id; }));
        }
      })
      .catch(function (e) {
        notifyItems = [];
        notifyError = e.message || '获取通知失败';
        renderNotifyBadge();
        if (document.getElementById('notify-drawer').style.display !== 'none') renderNotifyList();
      })
      .then(function () { notifyFetching = false; });
  }
  function loadGuestNotifications() {
    return fetch('/api/announcement', { cache: 'no-store' })
      .then(function (r) { return r.ok ? readJson(r) : null; })
      .then(function (data) {
        notifyError = '';
        notifyItems = data && data.id ? [{
          id: 'announcement:' + data.id,
          type: 'announcement',
          title: data.title || '站点公告',
          body: data.content || '',
          time: data.created_at || '',
          link: null
        }] : [];
        renderNotifyList();
      })
      .catch(function (e) {
        notifyItems = [];
        notifyError = e.message || '获取公告失败';
        renderNotifyList();
      });
  }
  function openNotifyDrawer() {
    var drawer = document.getElementById('notify-drawer');
    if (!drawer) return;
    closeUserMenu();
    drawer.style.display = 'block';
    var tk = localStorage.getItem('token');
    if (!tk) { loadGuestNotifications(); return; }
    if (notifyLoadedToken !== tk) {
      notifyLoadedToken = tk;
      notifyItems = [];
      notifyError = '';
      notifyLoadedAt = 0;
    }
    renderNotifyList();
    fetchNotifications(false).then(function () {
      if (drawer.style.display === 'none') return;
      renderNotifyList();
      markNotifyRead(notifyItems.map(function (item) { return item.id; }));
    });
  }
  function closeNotifyDrawer() {
    var drawer = document.getElementById('notify-drawer');
    if (drawer) drawer.style.display = 'none';
  }

  function openUserMenu() {
    if (!accountMenu || !avatarBtn) return;
    accountMenu.classList.add('open');
    avatarBtn.setAttribute('aria-expanded', 'true');
    if (!menuLoaded) { menuLoaded = true; loadQuickStats(); loadRaceStats(); }
  }
  function closeUserMenu() {
    if (!accountMenu || !avatarBtn) return;
    accountMenu.classList.remove('open');
    avatarBtn.setAttribute('aria-expanded', 'false');
  }
  function loadQuickStats() {
    var tk = localStorage.getItem('token');
    if (!tk) return;
    fetch('/api/user/stats', { headers: { Authorization: 'Bearer ' + tk } })
      .then(function (r) { return r.ok ? readJson(r) : null; })
      .then(function (s) {
        if (!s) return;
        var practices = s.totalPractices || 0;
        var chars = s.totalKeystrokes || 0;
        var seconds = s.totalTimeSeconds || 0;
        var speed = seconds > 0 ? Math.round(chars / seconds * 60) : 0;
        var p = document.getElementById('stat-practices');
        var c = document.getElementById('stat-chars');
        var v = document.getElementById('stat-speed');
        if (p) p.textContent = practices;
        if (c) c.textContent = chars >= 10000 ? (chars / 10000).toFixed(1) + '万' : chars;
        if (v) v.textContent = speed ? speed + ' 字/分' : '—';
      })
      .catch(function () {});
  }

  function loadRaceStats() {
    var tk = localStorage.getItem('token');
    if (!tk) return;
    fetch('/api/user/race-stats', { headers: { Authorization: 'Bearer ' + tk } })
      .then(function (r) {
        if (!r.ok) { console.error('[接口] 比赛统计 HTTP', r.status); return null; }
        return readJson(r, '/api/user/race-stats');
      })
      .then(function (s) {
        if (!s) {
          setRaceStat('stat-raced', '—');
          setRaceStat('stat-winrate', '—');
          setRaceStat('stat-bestrank', '—');
          return;
        }
        setRaceStat('stat-raced', (Number(s.racedCount) || 0) + ' 场');
        setRaceStat('stat-winrate', s.finishedCount > 0 ? Number(s.winRate).toFixed(1) + '%' : '—');
        setRaceStat('stat-bestrank', s.bestRank ? '第 ' + s.bestRank + ' 名' : '—');
      })
      .catch(function (e) {
        console.error('[账号菜单] 比赛统计加载失败', e && e.message);
        setRaceStat('stat-raced', '—');
        setRaceStat('stat-winrate', '—');
        setRaceStat('stat-bestrank', '—');
      });
  }
  function setRaceStat(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setNavRoleLinks(isAdmin) {
    var pi = document.getElementById('profile-nav-item');
    var mpi = document.getElementById('mobile-profile-nav');
    if (pi) pi.style.display = '';
    if (mpi) mpi.style.display = '';
    var ai = document.getElementById('admin-nav-item');
    var mai = document.getElementById('mobile-admin-nav');
    if (ai) ai.style.display = isAdmin ? '' : 'none';
    if (mai) mai.style.display = isAdmin ? '' : 'none';
  }

  function resetAccount() {
    closeUserMenu();
    closeNotifyDrawer();
    menuLoaded = false;
    appliedToken = null;
    notifyLoadedToken = null;
    notifyItems = [];
    notifyError = '';
    notifyLoadedAt = 0;
    renderNotifyBadge();
    var guestNotify = document.getElementById('nav-notify-btn');
    if (guestNotify) guestNotify.style.display = 'inline-flex';
    var p = document.getElementById('stat-practices');
    var c = document.getElementById('stat-chars');
    var v = document.getElementById('stat-speed');
    if (p) p.textContent = '—';
    if (c) c.textContent = '—';
    if (v) v.textContent = '—';
    var roleEl = document.getElementById('user-menu-role');
    if (roleEl) roleEl.textContent = '';
    var nameEl = document.getElementById('display-username');
    if (nameEl) nameEl.textContent = '';
    var fb = document.getElementById('avatar-fallback');
    if (fb) { fb.textContent = ''; fb.style.background = ''; fb.style.display = 'flex'; }
    var img = document.getElementById('avatar-img');
    if (img) { img.style.display = 'none'; img.removeAttribute('src'); }
    var pi = document.getElementById('profile-nav-item');
    var mpi = document.getElementById('mobile-profile-nav');
    if (pi) pi.style.display = 'none';
    if (mpi) mpi.style.display = 'none';
    var ai = document.getElementById('admin-nav-item');
    var mai = document.getElementById('mobile-admin-nav');
    if (ai) ai.style.display = 'none';
    if (mai) mai.style.display = 'none';
  }

  function applyAccount(me) {
    var name = me.nickname || me.username || '';
    var el = document.getElementById('display-username');
    if (el) el.textContent = name;

    // 头像：有头像用图片，没有就用纯色圆 + 首字
    var img = document.getElementById('avatar-img');
    var fb = document.getElementById('avatar-fallback');
    if (me.avatar && img && fb) {
      img.src = me.avatar;
      img.style.display = 'block';
      fb.style.display = 'none';
    } else {
      if (img) { img.style.display = 'none'; img.removeAttribute('src'); }
      if (fb) {
        fb.style.display = 'flex';
        fb.textContent = initialOf(name || me.username);
        fb.style.background = colorOf(me.username || name || 'u');
      }
    }
    var roleEl = document.getElementById('user-menu-role');
    if (roleEl) roleEl.textContent = me.role === 'admin' ? '管理员' : '普通用户';
    if (avatarBtn) avatarBtn.title = name + (me.role === 'admin' ? '（管理员）' : '');
    setNavRoleLinks(me.role === 'admin');
    var guestNotify = document.getElementById('nav-notify-btn');
    if (guestNotify) guestNotify.style.display = 'none';
    if (notifyLoadedToken !== appliedToken) {
      notifyLoadedToken = appliedToken;
      notifyItems = [];
      notifyError = '';
      notifyLoadedAt = 0;
      fetchNotifications();
    }
  }

  // 首页登录/退出走弹窗与脚本内状态更新，不会重载页面；监听容器显隐变化补初始化头像菜单
  function refreshAccount() {
    var tk = localStorage.getItem('token');
    if (!tk) { resetAccount(); return; }
    if (tk === appliedToken) return;
    appliedToken = tk;
    menuLoaded = false;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + tk } })
      .then(function (r) { return r.ok ? readJson(r) : null; })
      .then(function (me) {
        if (localStorage.getItem('token') !== tk) return;
        if (!me) { appliedToken = null; return; }
        applyAccount(me);
      })
      .catch(function () { appliedToken = null; });
  }

  if (avatarBtn) {
    avatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (accountMenu && accountMenu.classList.contains('open')) closeUserMenu(); else openUserMenu();
    });
    var wrap = document.getElementById('user-area');
    if (wrap) {
      var closeTimer = null;
      wrap.addEventListener('mouseenter', function () { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } openUserMenu(); });
      wrap.addEventListener('mouseleave', function () {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(closeUserMenu, 160);
      });
    }
    document.addEventListener('click', function (e) {
      var w = document.getElementById('user-area');
      if (w && !w.contains(e.target)) closeUserMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeUserMenu(); closeNotifyDrawer(); }
    });
  }

  var notifyEntry = document.getElementById('notify-entry');
  var guestNotifyBtn = document.getElementById('nav-notify-btn');
  var notifyReadAll = document.getElementById('notify-read-all');
  var notifyCloseBtn = document.getElementById('notify-close');
  if (notifyEntry) notifyEntry.addEventListener('click', function (e) { e.stopPropagation(); openNotifyDrawer(); });
  if (guestNotifyBtn) guestNotifyBtn.addEventListener('click', function (e) { e.stopPropagation(); openNotifyDrawer(); });
  if (notifyReadAll) notifyReadAll.addEventListener('click', function () {
    markNotifyRead(notifyItems.map(function (item) { return item.id; }));
    renderNotifyList();
  });
  if (notifyCloseBtn) notifyCloseBtn.addEventListener('click', closeNotifyDrawer);
  document.addEventListener('click', function (e) {
    var drawer = document.getElementById('notify-drawer');
    if (!drawer || drawer.style.display === 'none') return;
    if (drawer.contains(e.target)) return;
    if ((notifyEntry && notifyEntry.contains(e.target)) || (guestNotifyBtn && guestNotifyBtn.contains(e.target))) return;
    closeNotifyDrawer();
  });

  /* ---------- 全局快速匹配底栏 ---------- */
  var MATCH_PENDING_KEY = 'raceMatchPending';
  var MATCH_SINCE_KEY = 'raceMatchPendingSince';
  var matchBarTimer = null;
  var matchBarEnterCode = null;

  function matchBarEls() {
    return {
      bar: document.getElementById('race-match-bar'),
      text: document.getElementById('race-match-bar-text'),
      close: document.getElementById('race-match-bar-action'),
      enter: document.getElementById('race-match-enter')
    };
  }
  function setMatchBarHeight() {
    var els = matchBarEls();
    if (els.bar && els.bar.style.display !== 'none') {
      document.body.style.setProperty('--race-match-bar-h', els.bar.offsetHeight + 'px');
    }
  }
  function matchElapsedText(ms) {
    var sec = Math.max(0, Math.floor((ms || 0) / 1000));
    var mm = String(Math.floor(sec / 60)).padStart(2, '0');
    var ss = String(sec % 60).padStart(2, '0');
    return '匹配中 ' + mm + ':' + ss;
  }
  function setMatchBar(text, mode) {
    var els = matchBarEls();
    if (!els.bar) return;
    if (els.text) els.text.textContent = text;
    if (els.close) {
      els.close.style.display = mode === 'auto' ? 'none' : 'inline-flex';
      els.close.setAttribute('aria-label', '取消匹配');
      els.close.title = '取消匹配';
    }
    if (els.enter) els.enter.style.display = mode === 'practice' ? 'inline-flex' : 'none';
    els.bar.style.display = 'flex';
    document.body.classList.add('race-match-open');
    setMatchBarHeight();
  }
  function stopMatchBarPolling() {
    if (matchBarTimer) { clearInterval(matchBarTimer); matchBarTimer = null; }
  }
  function clearMatchBar() {
    stopMatchBarPolling();
    matchBarEnterCode = null;
    try {
      localStorage.removeItem(MATCH_PENDING_KEY);
      localStorage.removeItem(MATCH_SINCE_KEY);
    } catch (e) {}
    var els = matchBarEls();
    if (els.bar) els.bar.style.display = 'none';
    document.body.classList.remove('race-match-open');
    document.body.style.removeProperty('--race-match-bar-h');
  }
  function clearMatchPendingFlags() {
    try {
      localStorage.removeItem(MATCH_PENDING_KEY);
      localStorage.removeItem(MATCH_SINCE_KEY);
    } catch (e) {}
  }
  function isPracticeActive() {
    var inputs = document.querySelectorAll('#typing-pages .typing-line-input');
    if (!inputs.length) return false;
    var result = document.getElementById('result-card');
    if (result && getComputedStyle(result).display !== 'none') return false;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value && inputs[i].value.trim().length > 0) return true;
    }
    return false;
  }
  function pollMatchBar() {
    var tk = localStorage.getItem('token');
    if (!tk) { clearMatchBar(); return; }
    fetch('/api/race/match/status', { headers: { Authorization: 'Bearer ' + tk } })
      .then(function (r) {
        return readJson(r, '/api/race/match/status').then(function (data) {
          if (!r.ok) throw new Error((data && data.error) || ('HTTP ' + r.status));
          return data;
        });
      })
      .then(function (data) {
        if (!data) return;
        if (data.status === 'matched' && data.code) {
          stopMatchBarPolling();
          if (page === 'race') {
            clearMatchPendingFlags();
            matchBarEnterCode = null;
            setMatchBar('匹配成功，正在进入比赛…', 'auto');
            setTimeout(clearMatchBar, 300);
          } else if (isPracticeActive()) {
            matchBarEnterCode = data.code;
            setMatchBar('匹配成功', 'practice');
          } else {
            clearMatchPendingFlags();
            matchBarEnterCode = null;
            setMatchBar('匹配成功，正在进入比赛…', 'auto');
            setTimeout(function () {
              location.href = 'race.html?code=' + encodeURIComponent(data.code);
            }, 300);
          }
          return;
        }
        if (data.status === 'waiting') {
          var text = matchElapsedText(data.elapsed);
          if (data.hint) text += ' · ' + data.hint;
          matchBarEnterCode = null;
          setMatchBar(text, 'waiting');
          if (!matchBarTimer) matchBarTimer = setInterval(pollMatchBar, 1000);
          return;
        }
        clearMatchBar();
      })
      .catch(function (e) {
        setMatchBar('匹配状态获取失败：' + (e.message || '网络错误'), 'waiting');
        if (!matchBarTimer) matchBarTimer = setInterval(pollMatchBar, 1000);
      });
  }
  function startMatchBarPolling() {
    if (localStorage.getItem(MATCH_PENDING_KEY) !== '1') return;
    if (!localStorage.getItem('token')) { clearMatchBar(); return; }
    matchBarEnterCode = null;
    setMatchBar('匹配中 00:00', 'waiting');
    if (!matchBarTimer) matchBarTimer = setInterval(pollMatchBar, 1000);
    pollMatchBar();
  }
  function matchBarEnter() {
    if (!matchBarEnterCode) return;
    var code = matchBarEnterCode;
    clearMatchBar();
    location.href = 'race.html?code=' + encodeURIComponent(code);
  }
  function matchBarAction() {
    var tk = localStorage.getItem('token') || '';
    fetch('/api/race/match/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
      body: '{}'
    }).catch(function () {}).then(function () {
      clearMatchBar();
      try { window.dispatchEvent(new Event('race-match-cancel-local')); } catch (e) {}
    });
  }
  window.addEventListener('resize', setMatchBarHeight);
  var matchBarActionBtn = document.getElementById('race-match-bar-action');
  if (matchBarActionBtn) {
    matchBarActionBtn.addEventListener('click', matchBarAction);
    matchBarActionBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        matchBarAction();
      }
    });
  }
  var matchBarEnterBtn = document.getElementById('race-match-enter');
  if (matchBarEnterBtn) matchBarEnterBtn.addEventListener('click', matchBarEnter);
  window.addEventListener('race-match-pending', startMatchBarPolling);
  window.addEventListener('race-match-cancel-local', clearMatchBar);
  window.addEventListener('race-room-entered', function () {
    if (localStorage.getItem(MATCH_PENDING_KEY) !== '1') return;
    fetch('/api/race/match/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
      body: '{}'
    }).catch(function () {});
    clearMatchBar();
  });

  var userAreaEl = document.getElementById('user-area');
  if (userAreaEl && window.MutationObserver) {
    new MutationObserver(refreshAccount).observe(userAreaEl, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  refreshAccount();
  startMatchBarPolling();
})();
