/* 全站公告条：在页面顶部渲染并加载当前公告（单点实现）
 * 用法：页面引入本脚本即可，无需自带 HTML。
 * 已读/关闭状态按公告 id 存 localStorage；每 60 秒刷新一次。
 * 管理页不引入（管理页有自己的「公告管理」区块）。
 */
(function () {
  'use strict';
  var LEVEL_LABELS = { notification: '通知', 'site-wide': '全站', warning: '警告' };
  var currentId = null;

  function ensureMarkup() {
    if (document.getElementById('announcement-bar')) return document.getElementById('announcement-bar');
    var bar = document.createElement('div');
    bar.className = 'announcement-bar';
    bar.id = 'announcement-bar';
    bar.style.display = 'none';
    bar.setAttribute('role', 'banner');
    bar.setAttribute('aria-label', '站点公告');
    bar.innerHTML =
      '<span class="announcement-level-badge" id="announcement-badge"></span>' +
      '<span class="announcement-title" id="announcement-title"></span>' +
      '<span class="announcement-text" id="announcement-text"></span>' +
      '<button class="announcement-close" id="announcement-close" aria-label="关闭公告">&times;</button>';
    var subNav = document.querySelector('.sub-nav');
    if (subNav && subNav.parentNode) {
      subNav.parentNode.insertBefore(bar, subNav.nextSibling);
    } else {
      var mount = document.getElementById('site-nav');
      if (mount && mount.parentNode) {
        mount.parentNode.insertBefore(bar, mount.nextSibling);
      } else {
        document.body.insertBefore(bar, document.body.firstChild);
      }
    }
    return bar;
  }

  function bindClose(bar) {
    var btn = document.getElementById('announcement-close');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      if (currentId !== null) {
        bar.style.display = 'none';
        try { localStorage.setItem('announcement_closed_' + currentId, '1'); } catch (e) {}
      }
    });
  }

  function loadAnnouncement() {
    var bar = ensureMarkup();
    if (!bar) return;
    bindClose(bar);
    fetch('/api/announcement', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.id) { bar.style.display = 'none'; return; }
        currentId = data.id;
        var closedKey = 'announcement_closed_' + data.id;
        try { if (localStorage.getItem(closedKey) === '1') { bar.style.display = 'none'; return; } } catch (e) {}
        bar.className = 'announcement-bar level-' + (data.level || 'notification');
        var badge = document.getElementById('announcement-badge');
        var title = document.getElementById('announcement-title');
        var text = document.getElementById('announcement-text');
        var close = document.getElementById('announcement-close');
        if (badge) badge.textContent = LEVEL_LABELS[data.level] || '通知';
        if (title) { title.textContent = data.title || ''; title.style.display = data.title ? '' : 'none'; }
        if (text) {
          if (window.AnnounceText) window.AnnounceText.render(text, data.content || '');
          else text.textContent = data.content || '';
        }
        if (close) close.style.display = data.allow_close === 0 || data.allow_close === false ? 'none' : '';
        bar.style.display = 'flex';
      })
      .catch(function () {});
  }

  loadAnnouncement();
  setInterval(loadAnnouncement, 60000);
})();
