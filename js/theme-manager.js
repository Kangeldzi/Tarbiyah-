
/**
 * ============================================================
 * TARBIYAH — THEME MANAGER
 * File   : js/theme-manager.js
 * Versi  : 1.0.0
 *
 * Fitur:
 * - Tema Gelap (Dark)
 * - Tema Terang (Light)
 * - Tema Sistem (System)
 * - Penyimpanan preferensi tema
 * - Deteksi preferensi perangkat
 * - Sinkronisasi antar-tab
 * - Integrasi module-shell.js
 * - Dukungan aksesibilitas
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_THEME_MANAGER) {
    console.info("[TARBIYAH THEME] Manager sudah aktif.");
    return;
  }

  const VERSION = "1.0.0";

  /* ==========================================================
     1. KONFIGURASI
  ========================================================== */

  const CONFIG = {
    storageKey: "tarbiyah_theme_preference",

    defaultTheme: "dark",

    themes: ["dark", "light", "system"],

    root: document.documentElement,

    selectors: {
      toggle: "[data-theme-toggle]",
      icon: "[data-theme-icon]",
      label: "[data-theme-label]",
      option: "[data-theme-option]"
    }
  };

  /* ==========================================================
     2. STATE
  ========================================================== */

  const state = {
    preference: CONFIG.defaultTheme,
    activeTheme: "dark",
    initialized: false,
    systemMedia: null,
    storageAvailable: true
  };

  /* ==========================================================
     3. UTILITAS
  ========================================================== */

  function normalizeTheme(theme) {
    if (typeof theme !== "string") {
      return null;
    }

    const normalized = theme
      .trim()
      .toLowerCase();

    if (CONFIG.themes.includes(normalized)) {
      return normalized;
    }

    return null;
  }

  function getSystemTheme() {
    if (window.matchMedia) {
      return window.matchMedia(
        "(prefers-color-scheme: light)"
      ).matches
        ? "light"
        : "dark";
    }

    return "dark";
  }

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: detail || {}
      })
    );
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      state.storageAvailable = false;

      console.warn(
        "[TARBIYAH THEME] Tidak dapat membaca localStorage:",
        error
      );

      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      state.storageAvailable = true;
      return true;
    } catch (error) {
      state.storageAvailable = false;

      console.warn(
        "[TARBIYAH THEME] Tidak dapat menyimpan tema:",
        error
      );

      return false;
    }
  }

  /* ==========================================================
     4. MEMBACA PREFERENSI
  ========================================================== */

  function readPreference() {
    const saved = normalizeTheme(
      safeStorageGet(CONFIG.storageKey)
    );

    return saved || CONFIG.defaultTheme;
  }

  /* ==========================================================
     5. MENENTUKAN TEMA AKTIF
  ========================================================== */

  function resolveTheme(preference) {
    if (preference === "system") {
      return getSystemTheme();
    }

    return preference;
  }

  /* ==========================================================
     6. MENERAPKAN TEMA
  ========================================================== */

  function applyTheme(theme, options) {
    const preference = normalizeTheme(theme);

    if (!preference) {
      console.warn(
        "[TARBIYAH THEME] Tema tidak dikenal:",
        theme
      );

      return false;
    }

    const settings = options || {};

    const previousPreference = state.preference;
    const previousActiveTheme = state.activeTheme;

    const activeTheme = resolveTheme(preference);

    state.preference = preference;
    state.activeTheme = activeTheme;

    CONFIG.root.setAttribute(
      "data-theme",
      activeTheme
    );

    CONFIG.root.dataset.themePreference = preference;

    if (document.body) {
      document.body.setAttribute(
        "data-theme",
        activeTheme
      );
    }

    updateThemeColor(activeTheme);
    updateThemeControls();

    if (settings.persist !== false) {
      safeStorageSet(
        CONFIG.storageKey,
        preference
      );
    }

    if (
      previousPreference !== preference ||
      previousActiveTheme !== activeTheme
    ) {
      dispatch("tarbiyah:theme-changed", {
        preference,
        activeTheme,
        previousPreference,
        previousActiveTheme
      });
    }

    return true;
  }

  /* ==========================================================
     7. WARNA BROWSER / PWA
  ========================================================== */

  function updateThemeColor(theme) {
    const meta = document.querySelector(
      'meta[name="theme-color"]'
    );

    if (!meta) return;

    const color = theme === "light"
      ? "#f4faf7"
      : "#102a22";

    meta.setAttribute("content", color);
  }

  /* ==========================================================
     8. MEMPERBARUI KONTROL TEMA
  ========================================================== */

  function updateThemeControls() {
    const buttons = document.querySelectorAll(
      CONFIG.selectors.toggle
    );

    buttons.forEach(button => {
      const icon = button.querySelector(
        CONFIG.selectors.icon
      );

      const label = button.querySelector(
        CONFIG.selectors.label
      );

      const iconName =
        state.activeTheme === "light"
          ? "sun"
          : "moon";

      const labelText = {
        dark: "Tema gelap",
        light: "Tema terang",
        system: `Tema sistem (${state.activeTheme})`
      }[state.preference];

      if (icon) {
        icon.dataset.icon = iconName;
        icon.setAttribute("aria-hidden", "true");
      }

      if (label) {
        label.textContent = labelText;
      }

      button.setAttribute(
        "aria-label",
        `Tema saat ini: ${labelText}. Klik untuk mengganti tema.`
      );

      button.setAttribute(
        "aria-pressed",
        state.preference !== "system" ? "true" : "false"
      );
    });

    document.querySelectorAll(
      CONFIG.selectors.option
    ).forEach(option => {
      const value = normalizeTheme(
        option.dataset.themeOption
      );

      const active = value === state.preference;

      option.classList.toggle("is-active", active);

      if (active) {
        option.setAttribute("aria-current", "true");
      } else {
        option.removeAttribute("aria-current");
      }
    });

    dispatch("tarbiyah:theme-controls-updated", {
      preference: state.preference,
      activeTheme: state.activeTheme
    });
  }

  /* ==========================================================
     9. MENGGANTI TEMA
  ========================================================== */

  function setTheme(theme) {
    return applyTheme(theme);
  }

  function changeTheme() {
    const nextTheme = state.activeTheme === "dark"
      ? "light"
      : "dark";

    return setTheme(nextTheme);
  }

  function toggleTheme() {
    return changeTheme();
  }

  function setSystemTheme() {
    return setTheme("system");
  }

  function getTheme() {
    return state.activeTheme;
  }

  function getPreference() {
    return state.preference;
  }

  /* ==========================================================
     10. DETEKSI PERUBAHAN TEMA PERANGKAT
  ========================================================== */

  function bindSystemTheme() {
    if (!window.matchMedia) return;

    state.systemMedia = window.matchMedia(
      "(prefers-color-scheme: light)"
    );

    const handleChange = () => {
      if (state.preference === "system") {
        applyTheme("system", {
          persist: false
        });
      }
    };

    if (typeof state.systemMedia.addEventListener === "function") {
      state.systemMedia.addEventListener(
        "change",
        handleChange
      );
    } else if (typeof state.systemMedia.addListener === "function") {
      state.systemMedia.addListener(handleChange);
    }
  }

  /* ==========================================================
     11. EVENT KONTROL TEMA
  ========================================================== */

  function bindThemeControls() {
    document.addEventListener("click", event => {
      const toggle = event.target.closest(
        CONFIG.selectors.toggle
      );

      if (toggle) {
        event.preventDefault();
        changeTheme();
        return;
      }

      const option = event.target.closest(
        CONFIG.selectors.option
      );

      if (option) {
        event.preventDefault();

        const theme = option.dataset.themeOption;

        if (normalizeTheme(theme)) {
          setTheme(theme);
        }
      }
    });
  }

  /* ==========================================================
     12. SINKRONISASI ANTAR-TAB
  ========================================================== */

  function bindStorageSync() {
    window.addEventListener("storage", event => {
      if (event.key !== CONFIG.storageKey) {
        return;
      }

      const theme = normalizeTheme(event.newValue);

      if (theme) {
        applyTheme(theme, {
          persist: false
        });
      }
    });
  }

  /* ==========================================================
     13. INISIALISASI
  ========================================================== */

  function initialize(options) {
    if (state.initialized && !(options?.force)) {
      return getTheme();
    }

    const preference = readPreference();

    applyTheme(preference, {
      persist: false
    });

    bindSystemTheme();
    bindThemeControls();
    bindStorageSync();

    state.initialized = true;

    dispatch("tarbiyah:theme-ready", {
      preference: state.preference,
      activeTheme: state.activeTheme
    });

    return getTheme();
  }

  /* ==========================================================
     14. API PUBLIK
  ========================================================== */

  const API = {
    version: VERSION,

    initialize,

    setTheme,
    changeTheme,
    toggleTheme,
    applyTheme,
    setSystemTheme,

    getTheme,
    getPreference,

    updateThemeControls,

    getState() {
      return {
        preference: state.preference,
        activeTheme: state.activeTheme,
        initialized: state.initialized,
        storageAvailable: state.storageAvailable
      };
    }
  };

  /* ==========================================================
     15. ALIAS GLOBAL
     Mendukung integrasi dengan module-shell.js.
  ========================================================== */

  window.TARBIYAH_THEME_MANAGER = API;
  window.TARBIYAH_THEME = API;
  window.ThemeManager = API;

  /* ==========================================================
     16. AUTO INITIALIZATION
  ========================================================== */

  function start() {
    initialize();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

  console.info(
    `[TARBIYAH THEME] Aktif — v${VERSION}`
  );

})(window, document);
