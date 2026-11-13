
/**
 * ============================================================
 * TARBIYAH — PWA MANAGER
 * File   : js/pwa.js
 * Versi  : 1.0.0
 *
 * Fungsi:
 * - Registrasi Service Worker
 * - Instalasi PWA
 * - Deteksi mode standalone
 * - Update Service Worker
 * - Panduan instalasi manual
 * - Status koneksi online/offline
 * - Event komunikasi PWA
 *
 * Keamanan:
 * - Tidak menyimpan data pribadi ke Cache API.
 * - Tidak melakukan caching halaman autentikasi secara paksa.
 * - Kebijakan cache tetap diatur melalui service-worker.js.
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_PWA) {
    console.info("[TARBIYAH PWA] Manager sudah aktif.");
    return;
  }

  const VERSION = "1.0.0";

  /* ==========================================================
     1. KONFIGURASI
  ========================================================== */

  const CONFIG = {
    serviceWorkerPath: "./service-worker.js",

    selectors: {
      installButton: "[data-pwa-install]",
      installMessage: "[data-pwa-install-message]",
      updateButton: "[data-pwa-update]",
      offlineIndicator: "[data-pwa-offline]",
      onlineIndicator: "[data-pwa-online]",
      appStatus: "[data-pwa-status]"
    }
  };

  /* ==========================================================
     2. STATE
  ========================================================== */

  const state = {
    initialized: false,
    supported: "serviceWorker" in navigator,
    installed: false,
    standalone: false,
    online: navigator.onLine,

    installPrompt: null,
    registration: null,

    updating: false
  };

  /* ==========================================================
     3. UTILITAS
  ========================================================== */

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: detail || {}
      })
    );
  }

  function query(selector) {
    return document.querySelector(selector);
  }

  function setVisible(element, visible) {
    if (!element) return;

    element.hidden = !visible;
  }

  function setMessage(message, type) {
    const element = query(
      CONFIG.selectors.installMessage
    );

    if (!element) return;

    element.textContent = message || "";
    element.dataset.status = type || "info";
    element.hidden = !message;
  }

  function isStandalone() {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(
      window.navigator.userAgent || ""
    );
  }

  function isAndroid() {
    return /android/i.test(
      window.navigator.userAgent || ""
    );
  }

  function isSecureContextSupported() {
    return (
      window.isSecureContext ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    );
  }

  /* ==========================================================
     4. STATUS APLIKASI
  ========================================================== */

  function updateAppStatus() {
    state.standalone = isStandalone();

    const status = query(CONFIG.selectors.appStatus);

    if (status) {
      status.dataset.installed =
        state.standalone ? "true" : "false";

      status.dataset.online =
        state.online ? "true" : "false";

      status.textContent = state.standalone
        ? "Aplikasi TARBIYAH terpasang"
        : "TARBIYAH berjalan melalui browser";
    }

    updateInstallButton();

    dispatch("tarbiyah:pwa-status", {
      standalone: state.standalone,
      installed: state.installed,
      online: state.online
    });
  }

  /* ==========================================================
     5. STATUS ONLINE / OFFLINE
  ========================================================== */

  function updateConnectionStatus(online) {
    state.online = Boolean(online);

    setVisible(
      query(CONFIG.selectors.offlineIndicator),
      !state.online
    );

    setVisible(
      query(CONFIG.selectors.onlineIndicator),
      state.online
    );

    updateAppStatus();

    dispatch(
      state.online
        ? "tarbiyah:pwa-online"
        : "tarbiyah:pwa-offline",
      {
        online: state.online
      }
    );
  }

  function bindConnectionEvents() {
    window.addEventListener("online", () => {
      updateConnectionStatus(true);
    });

    window.addEventListener("offline", () => {
      updateConnectionStatus(false);
    });
  }

  /* ==========================================================
     6. DETEKSI INSTALASI
  ========================================================== */

  function bindInstallDetection() {
    state.standalone = isStandalone();

    window.addEventListener("appinstalled", () => {
      state.installed = true;
      state.installPrompt = null;

      setMessage(
        "Alhamdulillah! TARBIYAH berhasil dipasang.",
        "success"
      );

      updateInstallButton();

      dispatch("tarbiyah:pwa-installed", {});
    });

    window.addEventListener(
      "beforeinstallprompt",
      event => {
        event.preventDefault();

        state.installPrompt = event;

        updateInstallButton();

        dispatch("tarbiyah:pwa-install-available", {});
      }
    );
  }

  /* ==========================================================
     7. TOMBOL INSTALASI
  ========================================================== */

  function updateInstallButton() {
    const button = query(
      CONFIG.selectors.installButton
    );

    if (!button) return;

    const canInstall = Boolean(
      state.installPrompt &&
      !state.standalone
    );

    button.hidden = !canInstall;
    button.disabled = !canInstall;

    button.setAttribute(
      "aria-label",
      "Instal aplikasi TARBIYAH"
    );
  }

  async function installApp() {
    if (state.standalone) {
      setMessage(
        "TARBIYAH sudah berjalan sebagai aplikasi.",
        "success"
      );

      return {
        success: true,
        installed: true
      };
    }

    if (!state.installPrompt) {
      const message = isIOS()
        ? "Untuk memasang TARBIYAH di iPhone atau iPad, buka menu Bagikan lalu pilih Tambahkan ke Layar Utama."
        : isAndroid()
          ? "Jika tombol instalasi belum tersedia, buka menu browser lalu pilih Instal aplikasi atau Tambahkan ke layar utama."
          : "Instalasi otomatis belum tersedia pada browser ini.";

      setMessage(message, "info");

      dispatch("tarbiyah:pwa-install-unavailable", {
        platform: isIOS()
          ? "ios"
          : isAndroid()
            ? "android"
            : "other"
      });

      return {
        success: false,
        reason: "install-prompt-unavailable"
      };
    }

    const promptEvent = state.installPrompt;

    state.installPrompt = null;
    updateInstallButton();

    try {
      await promptEvent.prompt();

      const choice = await promptEvent.userChoice;

      if (choice?.outcome === "accepted") {
        setMessage(
          "Permintaan instalasi TARBIYAH diterima.",
          "success"
        );

        dispatch("tarbiyah:pwa-install-accepted", {});
      } else {
        setMessage(
          "Instalasi belum dilakukan. Anda dapat mencobanya kembali nanti.",
          "info"
        );

        dispatch("tarbiyah:pwa-install-dismissed", {});
      }

      return {
        success: true,
        outcome: choice?.outcome || "unknown"
      };

    } catch (error) {
      console.error(
        "[TARBIYAH PWA] Instalasi gagal:",
        error
      );

      setMessage(
        "Instalasi belum berhasil. Silakan coba kembali melalui menu browser.",
        "error"
      );

      return {
        success: false,
        error
      };

    } finally {
      updateInstallButton();
    }
  }

  /* ==========================================================
     8. EVENT TOMBOL INSTALASI
  ========================================================== */

  function bindInstallButton() {
    document.addEventListener("click", event => {
      const button = event.target.closest(
        CONFIG.selectors.installButton
      );

      if (!button) return;

      event.preventDefault();
      installApp();
    });
  }

  /* ==========================================================
     9. REGISTRASI SERVICE WORKER
  ========================================================== */

  async function registerServiceWorker() {
    if (!state.supported) {
      console.info(
        "[TARBIYAH PWA] Browser tidak mendukung Service Worker."
      );

      return {
        success: false,
        reason: "unsupported"
      };
    }

    if (!isSecureContextSupported()) {
      console.warn(
        "[TARBIYAH PWA] Service Worker memerlukan HTTPS atau localhost."
      );

      return {
        success: false,
        reason: "insecure-context"
      };
    }

    try {
      const registration =
        await navigator.serviceWorker.register(
          CONFIG.serviceWorkerPath,
          {
            scope: "./"
          }
        );

      state.registration = registration;

      bindServiceWorkerUpdate(registration);

      dispatch("tarbiyah:pwa-service-worker-ready", {
        registration
      });

      console.info(
        "[TARBIYAH PWA] Service Worker berhasil diregistrasi."
      );

      return {
        success: true,
        registration
      };

    } catch (error) {
      console.error(
        "[TARBIYAH PWA] Registrasi Service Worker gagal:",
        error
      );

      dispatch("tarbiyah:pwa-service-worker-error", {
        error
      });

      return {
        success: false,
        error
      };
    }
  }

  /* ==========================================================
     10. PEMBARUAN SERVICE WORKER
  ========================================================== */

  function bindServiceWorkerUpdate(registration) {
    if (!registration) return;

    registration.addEventListener(
      "updatefound",
      () => {
        const worker = registration.installing;

        if (!worker) return;

        worker.addEventListener(
          "statechange",
          () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              dispatch(
                "tarbiyah:pwa-update-available",
                { registration }
              );

              showUpdateButton();
            }
          }
        );
      }
    );

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (state.updating) {
          window.location.reload();
        }
      }
    );
  }

  function showUpdateButton() {
    const button = query(
      CONFIG.selectors.updateButton
    );

    if (!button) return;

    button.hidden = false;
    button.disabled = false;
  }

  async function updateApp() {
    const registration = state.registration;

    if (!registration) {
      return {
        success: false,
        reason: "registration-unavailable"
      };
    }

    try {
      state.updating = true;

      await registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({
          type: "SKIP_WAITING"
        });

        return {
          success: true,
          waiting: true
        };
      }

      state.updating = false;

      return {
        success: true,
        waiting: false,
        message: "Pemeriksaan pembaruan selesai."
      };

    } catch (error) {
      state.updating = false;

      console.error(
        "[TARBIYAH PWA] Pembaruan gagal:",
        error
      );

      return {
        success: false,
        error
      };
    }
  }

  function bindUpdateButton() {
    document.addEventListener("click", event => {
      const button = event.target.closest(
        CONFIG.selectors.updateButton
      );

      if (!button) return;

      event.preventDefault();
      updateApp();
    });
  }

  /* ==========================================================
     11. INISIALISASI PWA
  ========================================================== */

  async function initialize(options) {
    if (state.initialized && !(options?.force)) {
      return {
        success: true,
        registration: state.registration
      };
    }

    bindInstallDetection();
    bindInstallButton();
    bindUpdateButton();
    bindConnectionEvents();

    updateConnectionStatus(navigator.onLine);

    const registrationResult =
      await registerServiceWorker();

    state.initialized = true;

    dispatch("tarbiyah:pwa-ready", {
      registration: state.registration,
      supported: state.supported,
      online: state.online,
      standalone: state.standalone
    });

    return {
      success: true,
      registration: registrationResult
    };
  }

  /* ==========================================================
     12. API PUBLIK
  ========================================================== */

  const API = {
    version: VERSION,

    state,

    initialize,
    installApp,
    updateApp,

    registerServiceWorker,

    isStandalone,
    isIOS,
    isAndroid,

    updateAppStatus,
    updateConnectionStatus,

    getRegistration() {
      return state.registration;
    },

    getState() {
      return {
        initialized: state.initialized,
        supported: state.supported,
        installed: state.installed,
        standalone: state.standalone,
        online: state.online,
        updating: state.updating
      };
    }
  };

  window.TARBIYAH_PWA = API;

  /* ==========================================================
     13. AUTO START
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
    `[TARBIYAH PWA] Manager aktif — v${VERSION}`
  );

})(window, document);
