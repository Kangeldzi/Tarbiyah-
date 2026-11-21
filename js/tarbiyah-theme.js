
/* =========================================================
   TARBIYAH — LEGACY THEME COMPATIBILITY BRIDGE
   Versi: 2.0.1
   Pengendali utama: js/theme-manager.js
========================================================= */

(function (window, document) {
  "use strict";

  function getManager() {
    return window.TARBIYAH_THEME_MANAGER ||
      window.TARBIYAH_THEME ||
      window.ThemeManager ||
      null;
  }

  function apply(theme, persist = true) {
    const manager = getManager();

    if (!manager) {
      console.warn(
        "[TARBIYAH THEME] theme-manager.js belum dimuat."
      );
      return false;
    }

    return manager.applyTheme(theme, {
      persist
    });
  }

  function init() {
    const manager = getManager();

    if (!manager) {
      console.warn(
        "[TARBIYAH THEME] Menunggu Universal Theme Manager."
      );
      return null;
    }

    if (!manager.getState().initialized) {
      manager.initialize();
    }

    return manager.getTheme();
  }

  const API = {
    init,

    applyTheme(theme, shouldSave = false) {
      return apply(theme, shouldSave);
    },

    setTheme(theme) {
      return getManager()?.setTheme(theme) ?? false;
    },

    toggleTheme() {
      return getManager()?.toggleTheme() ?? false;
    },

    getTheme() {
      return getManager()?.getTheme() || "dark";
    },

    getState() {
      const manager = getManager();

      return manager
        ? manager.getState()
        : {
            theme: "dark",
            initialized: false
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

})(window, document);
