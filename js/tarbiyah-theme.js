/* =========================================================
   TARBIYAH — SHARED THEME CONTROLLER (FINAL)
========================================================= */

(function () {
  "use strict";

  if (window.TARBIYAH_THEME_CONTROLLER) {
    window.TARBIYAH_THEME_CONTROLLER.init();
    return;
  }

  const CONFIG = {
    STORAGE_KEY: "tarbiyah-theme",
    ATTRIBUTE: "data-theme",
    DEFAULT_THEME: "dark",
    BUTTON_ID: "btnTheme"
  };

  let currentTheme = CONFIG.DEFAULT_THEME;
  let initialized = false;

  function normalizeTheme(theme) {
    return theme === "light" ? "light" : "dark";
  }

  function readSavedTheme() {
    try {
      return normalizeTheme(
        localStorage.getItem(CONFIG.STORAGE_KEY) ||
        CONFIG.DEFAULT_THEME
      );
    } catch (error) {
      return CONFIG.DEFAULT_THEME;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, theme);
    } catch (error) {
      console.warn("[TARBIYAH THEME] Tidak dapat menyimpan tema:", error);
    }
  }

  // FUNGSI UTAMA MENGUBAH IKON TOMBOL
  function updateThemeButton() {
    const button = document.getElementById(CONFIG.BUTTON_ID);
    if (!button) return;

    // Ini persis seperti permintaan Anda
    button.textContent = currentTheme === "dark" ? "☀" : "☾";

    button.setAttribute(
      "aria-label",
      currentTheme === "dark" ? "Aktifkan Light Mode" : "Aktifkan Dark Mode"
    );
  }

  function applyTheme(theme, shouldSave = false) {
    currentTheme = normalizeTheme(theme);

    document.documentElement.setAttribute(CONFIG.ATTRIBUTE, currentTheme);

    if (document.body) {
      document.body.setAttribute(CONFIG.ATTRIBUTE, currentTheme);
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute(
        "content",
        currentTheme === "dark" ? "#102a22" : "#f2f7f4"
      );
    }

    if (shouldSave) {
      saveTheme(currentTheme);
    }

    updateThemeButton();

    document.dispatchEvent(
      new CustomEvent("tarbiyah:themechange", {
        detail: { theme: currentTheme }
      })
    );

    return currentTheme;
  }

  function toggleTheme() {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    return applyTheme(nextTheme, true);
  }

  function bindButton() {
    const button = document.getElementById(CONFIG.BUTTON_ID);
    if (!button || button.dataset.themeControllerBound === "true") {
      updateThemeButton();
      return;
    }

    button.dataset.themeControllerBound = "true";
    button.addEventListener("click", function (event) {
      event.preventDefault();
      toggleTheme();
    });

    updateThemeButton();
  }

  function init() {
    if (!initialized) {
      applyTheme(readSavedTheme(), false);
      initialized = true;
    }
    bindButton();
    return currentTheme;
  }

  const API = {
    init,
    applyTheme,
    toggleTheme,
    setTheme: (theme) => applyTheme(theme, true),
    getTheme: () => currentTheme
  };

  window.TARBIYAH_THEME_CONTROLLER = API;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

})();
