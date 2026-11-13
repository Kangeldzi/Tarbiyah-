
/**
 * ============================================================
 * TARBIYAH — SPLASH SCREEN MANAGER
 * File   : js/splash.js
 * Versi  : 1.0.0
 *
 * Fitur:
 * - Animasi pembuka TARBIYAH
 * - Efek transisi dan loading
 * - Tombol Masuk Sekarang
 * - Navigasi menuju halaman login
 * - Pengaturan durasi splash
 * - Dukungan reduced motion
 * - Pencegahan klik tombol berulang
 * - Penanganan kesalahan navigasi
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_SPLASH) {
    console.info("[TARBIYAH SPLASH] Manager sudah aktif.");
    return;
  }

  const VERSION = "1.0.0";

  /* ==========================================================
     1. KONFIGURASI
  ========================================================== */

  const CONFIG = {
    loginURL: "./login-register.html",

    minimumDisplayTime: 1200,

    selectors: {
      container: "[data-splash]",
      logo: "[data-splash-logo]",
      title: "[data-splash-title]",
      tagline: "[data-splash-tagline]",
      loading: "[data-splash-loading]",
      progress: "[data-splash-progress]",
      button: "[data-splash-enter]",
      overlay: "[data-splash-overlay]"
    },

    classes: {
      visible: "is-visible",
      leaving: "is-leaving",
      hidden: "is-hidden",
      loading: "is-loading"
    }
  };

  /* ==========================================================
     2. STATE
  ========================================================== */

  const state = {
    initialized: false,
    entering: false,
    startedAt: 0,
    ready: false
  };

  /* ==========================================================
     3. UTILITAS
  ========================================================== */

  function query(selector) {
    return document.querySelector(selector);
  }

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: detail || {}
      })
    );
  }

  function prefersReducedMotion() {
    return window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches || false;
  }

  function setText(element, value) {
    if (!element) return;

    element.textContent = value || "";
  }

  function wait(duration) {
    return new Promise(resolve => {
      window.setTimeout(resolve, duration);
    });
  }

  /* ==========================================================
     4. MENGAMBIL ELEMEN
  ========================================================== */

  function getElements() {
    return {
      container: query(CONFIG.selectors.container),
      logo: query(CONFIG.selectors.logo),
      title: query(CONFIG.selectors.title),
      tagline: query(CONFIG.selectors.tagline),
      loading: query(CONFIG.selectors.loading),
      progress: query(CONFIG.selectors.progress),
      button: query(CONFIG.selectors.button),
      overlay: query(CONFIG.selectors.overlay)
    };
  }

  /* ==========================================================
     5. STATUS PEMUATAN
  ========================================================== */

  function setLoading(message) {
    const elements = getElements();

    if (elements.loading) {
      setText(
        elements.loading,
        message || "Menyiapkan ruang kebaikan..."
      );

      elements.loading.classList.add(
        CONFIG.classes.loading
      );
    }

    if (elements.button) {
      elements.button.disabled = true;
      elements.button.setAttribute(
        "aria-disabled",
        "true"
      );
    }

    dispatch("tarbiyah:splash-loading", {
      message: message || ""
    });
  }

  
function setReady(message) {
  const elements = getElements();

  state.ready = true;

  if (elements.loading) {
    setText(
      elements.loading,
      message || "Alhamdulillah, ruang belajar siap."
    );

    elements.loading.classList.remove(
      CONFIG.classes.loading
    );
  }

  /*
   * PATCH:
   * Jika tombol tidak ditemukan di HTML,
   * buat tombol secara otomatis.
   */
  let button = elements.button;

  if (!button && elements.container) {
    button = document.createElement("button");

    button.type = "button";
    button.className = "splash-enter";
    button.setAttribute("data-splash-enter", "");
    button.textContent = "Masuk Sekarang →";
    button.setAttribute(
      "aria-label",
      "Masuk ke halaman login TARBIYAH"
    );

    if (elements.loading) {
      elements.loading.insertAdjacentElement(
        "afterend",
        button
      );
    } else {
      elements.container.appendChild(button);
    }

    console.info(
      "[TARBIYAH SPLASH] Tombol masuk dibuat otomatis."
    );
  }

  /*
   * Pastikan tombol benar-benar terlihat.
   */
  if (button) {
    button.hidden = false;
    button.disabled = false;

    button.removeAttribute("aria-disabled");
    button.classList.remove("is-loading");

    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.gap = "8px";
    button.style.visibility = "visible";
    button.style.opacity = "1";
    button.style.margin = "28px auto 0";
    button.style.padding = "15px 28px";
    button.style.minHeight = "50px";
    button.style.border = "1px solid #6ee7b7";
    button.style.borderRadius = "14px";
    button.style.background = "#10b981";
    button.style.color = "#06251a";
    button.style.fontWeight = "800";
    button.style.fontSize = "15px";
    button.style.cursor = "pointer";
    button.style.position = "relative";
    button.style.zIndex = "20";
  }

  dispatch("tarbiyah:splash-ready", {
    buttonAvailable: Boolean(button)
  });
}


  /* ==========================================================
     6. ANIMASI PROGRESS
  ========================================================== */

  function animateProgress() {
    const progress = query(CONFIG.selectors.progress);

    if (!progress) return;

    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", "100");

    progress.classList.add("is-complete");
  }

  /* ==========================================================
     7. ANIMASI MASUK
  ========================================================== */

  function showSplash() {
    const elements = getElements();

    if (!elements.container) {
      return false;
    }

    elements.container.hidden = false;

    elements.container.classList.remove(
      CONFIG.classes.hidden,
      CONFIG.classes.leaving
    );

    elements.container.classList.add(
      CONFIG.classes.visible
    );

    if (elements.overlay) {
      elements.overlay.classList.add(
        CONFIG.classes.visible
      );
    }

    if (prefersReducedMotion()) {
      elements.container.style.transition = "none";
    }

    return true;
  }

  /* ==========================================================
     8. TRANSISI KELUAR
  ========================================================== */

  async function hideSplash() {
    const elements = getElements();

    if (!elements.container) return;

    elements.container.classList.remove(
      CONFIG.classes.visible
    );

    elements.container.classList.add(
      CONFIG.classes.leaving
    );

    if (elements.overlay) {
      elements.overlay.classList.remove(
        CONFIG.classes.visible
      );
    }

    if (!prefersReducedMotion()) {
      await wait(500);
    }

    elements.container.classList.add(
      CONFIG.classes.hidden
    );

    elements.container.hidden = true;

    dispatch("tarbiyah:splash-hidden", {});
  }

  /* ==========================================================
     9. PERSIAPAN HALAMAN
  ========================================================== */

  async function prepare() {
    if (state.initialized) {
      return {
        success: true,
        alreadyInitialized: true
      };
    }

    state.startedAt = Date.now();

    showSplash();

    setLoading("Menyiapkan ruang kebaikan...");

    const elements = getElements();

    if (elements.logo) {
      elements.logo.classList.add("is-animated");
    }

    if (elements.title) {
      elements.title.classList.add("is-animated");
    }

    if (elements.tagline) {
      elements.tagline.classList.add("is-animated");
    }

    await wait(
      prefersReducedMotion() ? 0 : 350
    );

    animateProgress();

    const elapsed = Date.now() - state.startedAt;
    const remaining = Math.max(
      0,
      CONFIG.minimumDisplayTime - elapsed
    );

    if (remaining > 0) {
      await wait(remaining);
    }

    setReady();

    state.initialized = true;

    dispatch("tarbiyah:splash-initialized", {
      duration: Date.now() - state.startedAt
    });

    return {
      success: true
    };
  }


  /* ==========================================================
     10. NAVIGASI KE LOGIN — PATCH PERBAIKAN
  ========================================================== */

  async function enterApp() {
    if (state.entering) {
      return {
        success: false,
        reason: "navigation-in-progress"
      };
    }

    state.entering = true;

    const elements = getElements();

    try {
      if (elements.button) {
        elements.button.disabled = true;
        elements.button.setAttribute("aria-disabled", "true");
        elements.button.classList.add("is-loading");
      }

      dispatch("tarbiyah:splash-enter", {
        destination: CONFIG.loginURL
      });

      // Pastikan proses persiapan selesai.
      if (!state.ready) {
        await prepare();
      }

      // Pastikan durasi minimum splash terpenuhi.
      const elapsed = Date.now() - state.startedAt;
      const remaining = Math.max(
        0,
        CONFIG.minimumDisplayTime - elapsed
      );

      if (remaining > 0) {
        await wait(remaining);
      }

      // Sembunyikan splash sebelum pindah halaman.
      await hideSplash();

      // Redirect ke halaman autentikasi.
      window.location.replace(CONFIG.loginURL);

      return {
        success: true,
        destination: CONFIG.loginURL
      };

    } catch (error) {
      console.error(
        "[TARBIYAH SPLASH] Gagal membuka halaman login:",
        error
      );

      state.entering = false;

      if (elements.button) {
        elements.button.disabled = false;
        elements.button.removeAttribute("aria-disabled");
        elements.button.classList.remove("is-loading");
        elements.button.hidden = false;
      }

      setReady(
        "Terjadi kendala. Tekan tombol Masuk Sekarang untuk mencoba kembali."
      );

      return {
        success: false,
        error: error.message || String(error)
      };
    }
  }

  /* ==========================================================
     11. EVENT TOMBOL MASUK — PATCH PERBAIKAN
  ========================================================== */

  function bindEvents() {
    // Hindari pemasangan event listener berulang.
    if (document.documentElement.dataset.splashEventsBound === "true") {
      return;
    }

    document.documentElement.dataset.splashEventsBound = "true";

    document.addEventListener("click", function (event) {
      const target = event.target;

      if (!target || typeof target.closest !== "function") {
        return;
      }

      const button = target.closest(
        CONFIG.selectors.button
      );

      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      if (state.entering) return;

      enterApp();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const active = document.activeElement;

      if (
        active &&
        active.matches &&
        active.matches(CONFIG.selectors.button)
      ) {
        event.preventDefault();

        if (!state.entering) {
          enterApp();
        }
      }
    });
  }

  /* ==========================================================
     12. API PUBLIK
  ========================================================== */

  const API = {
    version: VERSION,

    state,

    initialize: prepare,
    show: showSplash,
    hide: hideSplash,

    setLoading,
    setReady,

    enterApp,

    getState() {
      return {
        initialized: state.initialized,
        entering: state.entering,
        ready: state.ready,
        startedAt: state.startedAt
      };
    }
  };

  window.TARBIYAH_SPLASH = API;

  /* ==========================================================
     13. AUTO START
  ========================================================== */

  function start() {
  bindEvents();

  prepare().catch(function (error) {
    console.error(
      "[TARBIYAH SPLASH] Persiapan splash gagal:",
      error
    );

    // Jangan biarkan tombol masuk tersembunyi
    // jika proses persiapan mengalami kegagalan.
    setReady(
      "Ruang belajar siap. Silakan tekan Masuk Sekarang."
    );
  });
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
    `[TARBIYAH SPLASH] Aktif — v${VERSION}`
  );

})(window, document);
