(function() {
  'use strict';

  const STYLE_ID = 'loading-indicator-styles';
  const INDICATOR_ID = 'global-loading-indicator';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#global-loading-indicator{',
        'position:fixed;',
        'left:16px;',
        'bottom:16px;',
        'z-index:9999;',
        'display:flex;',
        'align-items:center;',
        'gap:10px;',
        'padding:9px 14px;',
        'background:var(--glass-bg,rgba(250,249,245,0.96));',
        'backdrop-filter:blur(4px);',
        '-webkit-backdrop-filter:blur(4px);',
        'border:1px solid var(--glass-border,rgba(0,0,0,0.06));',
        'border-radius:10px;',
        'box-shadow:0 4px 16px rgba(0,0,0,0.08);',
        'color:var(--body,#5e5d59);',
        'font-family:var(--font-body,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif);',
        'font-size:13px;',
        'font-weight:500;',
        'pointer-events:none;',
        'visibility:hidden;',
        'opacity:0;',
        'transform:translateY(8px);',
        'transition:opacity 0.25s ease,visibility 0.25s ease,transform 0.25s ease;',
      '}',
      '#global-loading-indicator.visible{',
        'visibility:visible;',
        'opacity:1;',
        'transform:translateY(0);',
      '}',
      'body.loading #global-loading-indicator{',
        'visibility:hidden !important;',
        'opacity:0 !important;',
      '}',
      'body.offline .offline-hidden{',
        'display:none !important;',
      '}',
      '#global-loading-indicator .loading-spinner{',
        'width:16px;',
        'height:16px;',
        'border:2px solid var(--hairline-strong,#d1cfc5);',
        'border-top-color:var(--primary,#c96442);',
        'border-radius:50%;',
        'animation:loading-indicator-spin 0.8s linear infinite;',
      '}',
      '@keyframes loading-indicator-spin{to{transform:rotate(360deg)}}',
      '[data-theme="dark"] #global-loading-indicator{',
        'background:var(--glass-bg,rgba(30,30,28,0.96));',
        'border-color:var(--glass-border,rgba(255,255,255,0.08));',
        'color:var(--body,#a8a7a0);',
      '}'
    ].join('');
    const head = document.head || document.documentElement;
    head.appendChild(style);
  }

  function ensureElement() {
    let el = document.getElementById(INDICATOR_ID);
    if (!el) {
      injectStyles();
      el = document.createElement('div');
      el.id = INDICATOR_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-busy', 'false');
      el.innerHTML = '<span class="loading-spinner"></span><span class="loading-text">正在后台进行加载</span>';
      if (document.body) {
        document.body.appendChild(el);
      } else {
        window.addEventListener('DOMContentLoaded', function appendOnce() {
          if (document.body) document.body.appendChild(el);
        }, { once: true });
      }
    }
    return el;
  }

  let counter = 0;
  function update() {
    const el = ensureElement();
    if (counter > 0) {
      el.classList.add('visible');
      el.setAttribute('aria-busy', 'true');
    } else {
      el.classList.remove('visible');
      el.setAttribute('aria-busy', 'false');
    }
  }

  const LoadingIndicator = {
    start: function() {
      counter++;
      update();
    },
    end: function() {
      counter = Math.max(0, counter - 1);
      update();
    },
    wrap: async function(promise) {
      this.start();
      try {
        return await promise;
      } finally {
        this.end();
      }
    },
    hide: function() {
      counter = 0;
      update();
    }
  };

  // 自动拦截所有 fetch，任何后台请求都会触发加载提示
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    LoadingIndicator.start();
    const promise = originalFetch.apply(this, args);
    promise.then(function() {}, function() {}).finally(function() {
      LoadingIndicator.end();
    });
    return promise;
  };

  window.LoadingIndicator = LoadingIndicator;

  // 离线模式下隐藏非练习页面入口，避免误导用户
  function setOfflineNav(isOffline) {
    if (!document.body) return;
    document.body.classList.toggle('offline', isOffline);
  }

  async function checkAppOffline() {
    if (!navigator.onLine) {
      setOfflineNav(true);
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(function() { controller.abort(); }, 5000);
      const res = await fetch('/api/version?_t=' + Date.now(), { cache: 'no-cache', signal: controller.signal });
      clearTimeout(timer);
      setOfflineNav(!res.ok);
    } catch (e) {
      setOfflineNav(true);
    }
  }

  // 解析阶段已离线时先注入兜底样式，避免入口闪烁
  if (!navigator.onLine) {
    const offlineStyle = document.createElement('style');
    offlineStyle.textContent = '.offline-hidden{display:none !important}';
    const head = document.head || document.documentElement;
    head.appendChild(offlineStyle);
  }

  window.addEventListener('online', checkAppOffline);
  window.addEventListener('offline', function() { setOfflineNav(true); });
  document.addEventListener('DOMContentLoaded', checkAppOffline);
})();
