
/* =========================================================
   TARBIYAH — SHARED THEME CONTROLLER
   Acuan tampilan: profil-anggota.js
   Versi: 1.0.0
   Fungsi: Pengendali Dark Mode dan Light Mode bersama
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
      console.warn("[TARBIYAH THEME] Tidak dapat membaca tema:", error);
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

  function updateThemeButton() {
    const button = document.getElementById(CONFIG.BUTTON_ID);
    if (!button) return;

    // Sama seperti perilaku tombol pada profil-anggota.js
    button.textContent = currentTheme === "dark" ? "☀" : "☾";

    button.setAttribute(
      "aria-label",
      currentTheme === "dark"
        ? "Aktifkan Light Mode"
        : "Aktifkan Dark Mode"
    );

    button.setAttribute(
      "title",
      currentTheme === "dark"
        ? "Ganti ke Light Mode"
        : "Ganti ke Dark Mode"
    );
  }

  function applyTheme(theme, shouldSave = false) {
    currentTheme = normalizeTheme(theme);

    document.documentElement.setAttribute(
      CONFIG.ATTRIBUTE,
      currentTheme
    );

    if (document.body) {
      document.body.setAttribute(
        CONFIG.ATTRIBUTE,
        currentTheme
      );
    }

    const themeColor = document.querySelector(
      'meta[name="theme-color"]'
    );

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
    const nextTheme =
      currentTheme === "dark" ? "light" : "dark";

    return applyTheme(nextTheme, true);
  }

  function setTheme(theme) {
    return applyTheme(theme, true);
  }

  function handleStorageChange(event) {
    if (event.key !== CONFIG.STORAGE_KEY) return;

    applyTheme(
      event.newValue || CONFIG.DEFAULT_THEME,
      false
    );
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
      window.addEventListener("storage", handleStorageChange);
      initialized = true;
    }

    // Tombol diikat setelah elemen HTML tersedia.
    bindButton();

    return currentTheme;
  }

  const API = {
    init,
    applyTheme,
    toggleTheme,
    setTheme,
    getTheme: function () {
      return currentTheme;
    },
    getState: function () {
      return {
        theme: currentTheme,
        initialized
      };
    }
  };

  window.TARBIYAH_THEME_CONTROLLER = API;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }

})();
