/* P29 全站首屏加载遮罩：同步注入，各页初始化后调用 done()。
 * style.css 是规范样式；本文件额外注入一份等价 critical 样式，
 * 因为 index/profile/admin 的 style.css 是非阻塞加载，首帧不能先闪出裸页面。 */
(function () {
  'use strict';

  var state = {
    overlay: null,
    doneTimer: null,
    failTimer: null,
    loadTimer: null,
    finished: false,
    failed: false
  };

  var CRITICAL_CSS = [
    '.page-loading-overlay{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--canvas,#f5f4ed);transition:opacity .3s ease,visibility .3s ease}',
    '.page-loading-overlay.hidden{opacity:0;visibility:hidden;pointer-events:none}',
    '.page-loading-spinner{width:40px;height:40px;border:3px solid var(--hairline,#e8e6dc);border-top-color:var(--primary,#c96442);border-radius:50%;animation:page-loading-spin .8s linear infinite}',
    '@keyframes page-loading-spin{to{transform:rotate(360deg)}}',
    '.page-loading-text{font-family:var(--font-body,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif);font-size:14px;color:var(--muted,#87867f)}',
    '.page-loading-overlay.is-error .page-loading-text{color:var(--semantic-error,#b53333)}',
    'body.loading .container,body.loading nav,body.loading .sub-nav{filter:blur(4px);pointer-events:none}',
    'body.loading{overflow:hidden}',
    'body.home-page .page-loading-overlay{background:#05070d}',
    'body.home-page .page-loading-text{color:rgba(255,255,255,.55)}',
    'body.home-page .page-loading-spinner{border-color:rgba(255,255,255,.16);border-top-color:var(--primary,#c96442)}'
  ].join('');

  function injectCriticalStyle() {
    if (document.getElementById('page-loading-critical')) return;
    var style = document.createElement('style');
    style.id = 'page-loading-critical';
    style.textContent = CRITICAL_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function addBodyLoading() {
    if (document.body) document.body.classList.add('loading');
  }

  function ensureOverlay() {
    if (state.overlay) return state.overlay;
    var overlay = document.createElement('div');
    overlay.id = 'page-loading-overlay';
    overlay.className = 'page-loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-busy', 'true');
    overlay.innerHTML = '<div class="page-loading-spinner"></div><div class="page-loading-text">正在加载</div>';
    document.documentElement.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function removeLoadingClass() {
    if (document.body) document.body.classList.remove('loading');
  }

  function done() {
    if (state.finished) return;
    state.finished = true;
    state.failed = false;
    if (state.failTimer) { clearTimeout(state.failTimer); state.failTimer = null; }
    if (state.loadTimer) { clearTimeout(state.loadTimer); state.loadTimer = null; }
    removeLoadingClass();
    var overlay = state.overlay || document.getElementById('page-loading-overlay');
    if (!overlay) return;
    overlay.style.pointerEvents = 'none';
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-busy', 'false');
    state.doneTimer = setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (state.overlay === overlay) state.overlay = null;
    }, 300);
  }

  function fail(msg) {
    if (state.finished) return;
    state.failed = true;
    if (state.loadTimer) { clearTimeout(state.loadTimer); state.loadTimer = null; }
    var overlay = ensureOverlay();
    var text = overlay.querySelector('.page-loading-text');
    if (text) text.textContent = msg || '加载失败，请刷新重试';
    overlay.classList.add('is-error');
    if (state.failTimer) clearTimeout(state.failTimer);
    state.failTimer = setTimeout(done, 5000);
  }

  injectCriticalStyle();
  ensureOverlay();
  if (document.body) addBodyLoading();
  else document.addEventListener('DOMContentLoaded', addBodyLoading);

  function armLoadFallback() {
    if (state.finished || state.failed) return;
    // 留 20ms 给浏览器定时器抖动，保证观测值不超过 1200ms
    state.loadTimer = setTimeout(done, 1180);
  }
  if (document.readyState === 'complete') armLoadFallback();
  else window.addEventListener('load', armLoadFallback, { once: true });

  window.PageLoading = { done: done, fail: fail };
})();
