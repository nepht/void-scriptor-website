/* Void Scriptor — Theme Management (Dark & Light Cosmic Modes)
   Handles user theme selection, persistence via localStorage, OS preference detection,
   and dynamic accessibility attributes for the theme toggle control. */

(function () {
  'use strict';

  var THEME_KEY = 'vs_theme';

  function getSavedTheme() {
    try {
      var saved = localStorage.getItem('vs_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function applyTheme(theme, persist) {
    var isDark = theme === 'dark';
    var body = document.body;
    var root = document.documentElement;

    if (body) {
      if (isDark) {
        body.classList.remove('theme-light');
        body.classList.add('theme-dark');
      } else {
        body.classList.add('theme-light');
        body.classList.remove('theme-dark');
      }
    }

    if (root) {
      if (isDark) {
        root.classList.add('theme-dark');
        root.classList.remove('theme-light');
      } else {
        root.classList.add('theme-light');
        root.classList.remove('theme-dark');
      }
    }

    if (persist) {
      try {
        localStorage.setItem('vs_theme', theme);
      } catch (e) {}
    }

    updateThemeButton(isDark);
  }

  function updateThemeButton(isDark) {
    var btn = document.getElementById('btnTheme');
    if (!btn) return;

    var isEn = document.documentElement.lang === 'en' || window.location.pathname.startsWith('/en');
    if (isDark) {
      btn.setAttribute('aria-label', isEn ? 'Switch to light theme' : 'Ganti ke tema terang');
      btn.setAttribute('title', isEn ? 'Light theme' : 'Tema terang');
    } else {
      btn.setAttribute('aria-label', isEn ? 'Switch to dark theme' : 'Ganti ke tema gelap');
      btn.setAttribute('title', isEn ? 'Dark theme' : 'Tema gelap');
    }
  }

  function init() {
    var initial = getSavedTheme();
    applyTheme(initial, false);

    var btn = document.getElementById('btnTheme');
    if (btn) {
      btn.addEventListener('click', function () {
        var isCurrentlyDark =
          document.body.classList.contains('theme-dark') ||
          !document.body.classList.contains('theme-light');
        applyTheme(isCurrentlyDark ? 'light' : 'dark', true);
      });
    }

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function (e) {
        try {
          if (!localStorage.getItem(THEME_KEY)) {
            applyTheme(e.matches ? 'dark' : 'light', false);
          }
        } catch (err) {}
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
