(function () {
  var STORAGE_KEY = 'theme';
  var DARK = 'dark';
  var html = document.documentElement;

  function getPreferredTheme() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : 'light';
  }

  function applyTheme(theme) {
    if (theme === DARK) {
      html.setAttribute('data-theme', DARK);
    } else {
      html.removeAttribute('data-theme');
    }
  }

  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('theme-toggle');
    if (button) {
      button.addEventListener('click', function () {
        var current = html.getAttribute('data-theme') === DARK ? DARK : 'light';
        var next = current === DARK ? 'light' : DARK;
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? DARK : 'light');
    }
  });
})();
