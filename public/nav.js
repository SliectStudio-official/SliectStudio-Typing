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
          '<a class="user-menu-item" href="profile.html" role="menuitem">查看数据</a>' +
          '<a class="user-menu-item" href="race.html" role="menuitem">比赛大厅</a>' +
          '<button class="user-menu-item user-menu-danger" id="logout-btn" role="menuitem">退出登录</button>' +
        '</div>' +
      '</div>';

    var desktop = '<div class="logo">Typing</div>' +
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
          '<div class="logo">Typing</div>' +
          '<button class="mobile-menu-drawer-close" id="mobile-menu-close" aria-label="关闭菜单">&times;</button>' +
        '</div>' +
        '<ul class="nav-links-mobile" id="mobile-nav-items">' + mobileItems + '</ul>' +
      '</div>';

    var mount = document.getElementById('site-nav');
    if (!mount) return;
    mount.innerHTML =
      '<nav>' +
        '<button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="打开菜单">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>' +
        '</button>' + desktop +
      '</nav>' + drawer;
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

  var accountMenu = document.getElementById('user-menu');
  var avatarBtn = document.getElementById('avatar-btn');
  var menuLoaded = false;
  var appliedToken = null;

  function openUserMenu() {
    if (!accountMenu || !avatarBtn) return;
    accountMenu.classList.add('open');
    avatarBtn.setAttribute('aria-expanded', 'true');
    if (!menuLoaded) { menuLoaded = true; loadQuickStats(); }
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
      .then(function (r) { return r.ok ? r.json() : null; })
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
    menuLoaded = false;
    appliedToken = null;
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
  }

  // 首页登录/退出走弹窗与脚本内状态更新，不会重载页面；监听容器显隐变化补初始化头像菜单
  function refreshAccount() {
    var tk = localStorage.getItem('token');
    if (!tk) { resetAccount(); return; }
    if (tk === appliedToken) return;
    appliedToken = tk;
    menuLoaded = false;
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + tk } })
      .then(function (r) { return r.ok ? r.json() : null; })
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeUserMenu(); });
  }

  var userAreaEl = document.getElementById('user-area');
  if (userAreaEl && window.MutationObserver) {
    new MutationObserver(refreshAccount).observe(userAreaEl, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  refreshAccount();
})();
