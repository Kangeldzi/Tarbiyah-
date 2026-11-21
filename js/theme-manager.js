
/**
 * ============================================================
 * TARBIYAH — UNIVERSAL THEME MANAGER
 * File    : js/theme-manager.js
 * Version : 2.0.0
 *
 * MASTER:
 * - Mengikuti tombol universal profil-anggota.html
 * - Mendukung #btnTheme dan [data-theme-toggle]
 * - Ikon tombol tidak diubah oleh JavaScript
 * - Hanya file ini yang menangani klik pergantian tema
 *
 * Tema:
 * - dark
 * - light
 * - system
 *
 * Storage:
 * - tarbiyah_theme_preference
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_THEME_MANAGER) {
    console.info("[TARBIYAH THEME] Manager sudah aktif.");
    return;
  }

  const VERSION = "2.0.0";
  const STORAGE_KEY = "tarbiyah_theme_preference";
  const ROOT = document.documentElement;

  const TOGGLE_SELECTOR = [
    "#btnTheme",
    "[data-theme-toggle]"
  ].join(",");

  const OPTION_SELECTOR = "[data-theme-option]";

  const VALID_THEMES = ["dark", "light", "system"];

  const state = {
    preference: "dark",
    activeTheme: "dark",
    initialized: false,
    storageAvailable: true,
    mediaQuery: null,
    controlsBound: false,
    storageBound: false,
    systemBound: false
  };

  /* ==========================================================
     UTILITAS
  ========================================================== */

  function normalizeTheme(value) {
    if (typeof value !== "string") return null;

    const theme = value.trim().toLowerCase();

    return VALID_THEMES.includes(theme) ? theme : null;
  }

  function getSystemTheme() {
    if (!window.matchMedia) return "dark";

    return window.matchMedia(
      "(prefers-color-scheme: light)"
    ).matches ? "light" : "dark";
  }

  function resolveTheme(preference) {
    return preference === "system"
      ? getSystemTheme()
      : preference;
  }

  function emit(name, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(name, { detail })
    );
  }

  function readStorage() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      state.storageAvailable = false;
      console.warn(
        "[TARBIYAH THEME] Gagal membaca preferensi:",
        error
      );
      return null;
    }
  }

  function writeStorage(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      state.storageAvailable = true;
      return true;
    } catch (error) {
      state.storageAvailable = false;
      console.warn(
        "[TARBIYAH THEME] Gagal menyimpan preferensi:",
        error
      );
      return false;
    }
  }

  /* ==========================================================
     WARNA BROWSER / PWA
  ========================================================== */

  function updateBrowserThemeColor(theme) {
    const meta = document.querySelector(
      'meta[name="theme-color"]'
    );

    if (!meta) return;

    meta.setAttribute(
      "content",
      theme === "light" ? "#f4faf7" : "#102a22"
    );
  }

  /* ==========================================================
     SINKRONISASI TOMBOL MASTER
     Jangan mengubah isi ikon ◐ atau struktur HTML tombol.
  ========================================================== */

  function updateThemeControls() {
    const buttons = document.querySelectorAll(
      TOGGLE_SELECTOR
    );

    buttons.forEach(button => {
      const label = state.preference === "system"
        ? `Tema sistem (${state.activeTheme})`
        : state.activeTheme === "light"
          ? "Tema terang"
          : "Tema gelap";

      button.setAttribute(
        "aria-label",
        `Mode tampilan: ${label}. Tekan untuk mengganti tema.`
      );

      button.setAttribute(
        "aria-pressed",
        state.activeTheme === "dark" ? "true" : "false"
      );

      button.setAttribute(
        "title",
        label
      );

      // PENTING:
      // Tidak mengubah textContent, innerHTML,
      // ikon, class, atau struktur tombol master.
    });

    document.querySelectorAll(OPTION_SELECTOR).forEach(option => {
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

    emit("tarbiyah:theme-controls-updated", {
      preference: state.preference,
      activeTheme: state.activeTheme
    });
  }

  /* ==========================================================
     MENERAPKAN TEMA
  ========================================================== */

  function applyTheme(theme, options = {}) {
    const preference = normalizeTheme(theme);

    if (!preference) {
      console.warn(
        "[TARBIYAH THEME] Preferensi tidak dikenal:",
        theme
      );
      return false;
    }

    const previousPreference = state.preference;
    const previousActiveTheme = state.activeTheme;

    const activeTheme = resolveTheme(preference);

    state.preference = preference;
    state.activeTheme = activeTheme;

    ROOT.setAttribute("data-theme", activeTheme);
    ROOT.dataset.themePreference = preference;

    if (document.body) {
      document.body.setAttribute("data-theme", activeTheme);
    }

    updateBrowserThemeColor(activeTheme);
    updateThemeControls();

    if (options.persist !== false) {
      writeStorage(preference);
    }

    if (
      previousPreference !== preference ||
      previousActiveTheme !== activeTheme
    ) {
      emit("tarbiyah:theme-changed", {
        preference,
        activeTheme,
        previousPreference,
        previousActiveTheme
      });
    }

    return true;
  }

  /* ==========================================================
     API PERGANTIAN TEMA
  ========================================================== */

  function setTheme(theme) {
    return applyTheme(theme);
  }

  function changeTheme() {
    const next = state.activeTheme === "dark"
      ? "light"
      : "dark";

    return applyTheme(next);
  }

  function toggleTheme() {
    return changeTheme();
  }

  function setSystemTheme() {
    return applyTheme("system");
  }

  function getTheme() {
    return state.activeTheme;
  }

  function getPreference() {
    return state.preference;
  }

  /* ==========================================================
     EVENT TOMBOL UNIVERSAL
     HANYA theme-manager.js yang memasang event ini.
  ========================================================== */

  function bindThemeControls() {
    if (state.controlsBound) return;

    document.addEventListener("click", function (event) {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const toggle = target.closest(TOGGLE_SELECTOR);

      if (toggle) {
        event.preventDefault();
        changeTheme();
        return;
      }

      const option = target.closest(OPTION_SELECTOR);

      if (option) {
        event.preventDefault();

        const selectedTheme = normalizeTheme(
          option.dataset.themeOption
        );

        if (selectedTheme) {
          applyTheme(selectedTheme);
        }
      }
    });

    state.controlsBound = true;

    console.info(
      "[TARBIYAH THEME] Kontrol universal berhasil dipasang."
    );
  }

  /* ==========================================================
     DETEKSI TEMA PERANGKAT
  ========================================================== */

  function bindSystemTheme() {
    if (state.systemBound || !window.matchMedia) return;

    state.mediaQuery = window.matchMedia(
      "(prefers-color-scheme: light)"
    );

    const handleSystemChange = function () {
      if (state.preference === "system") {
        applyTheme("system", { persist: false });
      }
    };

    if (
      typeof state.mediaQuery.addEventListener === "function"
    ) {
      state.mediaQuery.addEventListener(
        "change",
        handleSystemChange
      );
    } else if (
      typeof state.mediaQuery.addListener === "function"
    ) {
      state.mediaQuery.addListener(handleSystemChange);
    }

    state.systemBound = true;
  }

  /* ==========================================================
     SINKRONISASI ANTAR-TAB
  ========================================================== */

  function bindStorageSync() {
    if (state.storageBound) return;

    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) return;

      const preference = normalizeTheme(event.newValue);

      if (preference) {
        applyTheme(preference, { persist: false });
      }
    });

    state.storageBound = true;
  }

  /* ==========================================================
     INISIALISASI
  ========================================================== */

  function initialize(options = {}) {
    if (state.initialized && !options.force) {
      return state.activeTheme;
    }

    let saved = normalizeTheme(readStorage());

// Migrasi dari penyimpanan tema versi lama.
if (!saved) {
  try {
    const legacyTheme = localStorage.getItem("tarbiyah-theme");
    saved = normalizeTheme(legacyTheme);

    if (saved) {
      writeStorage(saved);
    }
  } catch (error) {
    console.warn(
      "[TARBIYAH THEME] Migrasi tema lama gagal:",
      error
    );
  }
}

const preference = saved || "dark";

    applyTheme(preference, { persist: false });

    bindThemeControls();
    bindSystemTheme();
    bindStorageSync();

    state.initialized = true;

    emit("tarbiyah:theme-ready", {
      preference: state.preference,
      activeTheme: state.activeTheme
    });

    console.info(
      `[TARBIYAH THEME] Universal Manager aktif — v${VERSION}`
    );

    return state.activeTheme;
  }

  /* ==========================================================
     API PUBLIK
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

  window.TARBIYAH_THEME_MANAGER = API;
  window.TARBIYAH_THEME = API;
  window.ThemeManager = API;
  window.TARBIYAH_THEME_CONTROLLER = {
  init: () => API.initialize(),
  applyTheme: (theme, shouldSave = false) =>
    API.applyTheme(theme, { persist: shouldSave }),
  setTheme: theme => API.setTheme(theme),
  toggleTheme: () => API.toggleTheme(),
  getTheme: () => API.getTheme(),
  getState: () => API.getState()
};
  
  /* ==========================================================
     AUTO START
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

})(window, document);
