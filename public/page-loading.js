/* P29 全站首屏加载遮罩：同步注入，各页初始化后调用 done()。
 * 样式统一定义在 page-loading.css，五个页面在 head 中同步引入。 */
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
