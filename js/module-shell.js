
/* ============================================================
   TARBIYAH — MODULE SHELL
   File    : js/module-shell.js
   Versi   : 2.2.0

   Tanggung jawab:
   - Sidebar desktop dan mobile
   - Overlay sidebar
   - Navigasi aktif
   - Tombol kembali ke Dashboard
   - Menu pengguna
   - Keyboard Escape
   - Responsive layout
   - Sinkronisasi navigasi

   PENGELOLAAN TEMA:
   Sepenuhnya dikelola oleh:
   js/tarbiyah-theme.js

   File ini TIDAK mengelola:
   - Dark / Light Mode
   - Penyimpanan tema
   - MutationObserver tema
   - Autentikasi Supabase
   - Pembacaan role
   - Data anggota
   - Carousel dashboard
   - Logika Agenda Kajian

   KOMPATIBILITAS:
   - agenda-kajian.js versi 3.1
   - TARBIYAH_THEME_CONTROLLER
============================================================ */

(() => {
  "use strict";

  /* ==========================================================
     00. PROTECTION
  ========================================================== */

  const VERSION = "2.2.0";

  if (window.__TARBIYAH_MODULE_SHELL_V22__) {
    console.info(
      "[TARBIYAH SHELL] Versi 2.2.0 sudah aktif."
    );
    return;
  }

  window.__TARBIYAH_MODULE_SHELL_V22__ = true;

  /* ==========================================================
     01. SELECTOR HELPERS
  ========================================================== */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const CONFIG = {
    mobileBreakpoint: 900,

    dashboardURL: "dashboard.html",

    selectors: {
      sidebar: [
        "#appSidebar",
        "#sidebar",
        "[data-sidebar]",
        ".app-sidebar"
      ],

      overlay: [
        "#sidebarScrim",
        "#sidebarOverlay",
        "[data-sidebar-overlay]",
        ".sidebar-scrim",
        ".sidebar-overlay"
      ],

      openButton: [
        "#menuOpen",
        "#menuToggle",
        "[data-sidebar-toggle]",
        ".sidebar-toggle"
      ],

      closeButton: [
        "#menuClose",
        "#sidebarClose",
        "[data-sidebar-close]",
        ".sidebar-close"
      ],

      backButton: [
        "#backButton",
        "#btnBack",
        "#moduleBack",
        "[data-shell-back]",
        "[data-back-to-dashboard]"
      ],

      userMenuButton: [
        "#userMenuToggle",
        "[data-user-menu-toggle]"
      ],

      userMenuPanel: [
        "#userMenu",
        "[data-user-menu-panel]"
      ],

      shell: [
        ".app-layout",
        ".app-shell",
        ".dashboard-layout",
        "[data-app-shell]"
      ]
    }
  };

  const state = {
    initialized: false,
    sidebarOpen: false,
    userMenuOpen: false,
    desktopCollapsed: false,
    previousMobileState: null
  };

  /* ==========================================================
     02. GENERAL HELPERS
  ========================================================== */

  function first(selectors) {
    for (const selector of selectors) {
      const element = $(selector);

      if (element) return element;
    }

    return null;
  }

  function all(selectors) {
    const found = [];

    selectors.forEach(selector => {
      $$(selector).forEach(element => {
        if (!found.includes(element)) {
          found.push(element);
        }
      });
    });

    return found;
  }

  function isMobile() {
    return window.matchMedia
      ? window.matchMedia(
          `(max-width: ${CONFIG.mobileBreakpoint}px)`
        ).matches
      : window.innerWidth <= CONFIG.mobileBreakpoint;
  }

  function getSidebar() {
    return first(CONFIG.selectors.sidebar);
  }

  function getOverlay() {
    return first(CONFIG.selectors.overlay);
  }

  function getShell() {
    return first(CONFIG.selectors.shell);
  }

  function getUserMenuButton() {
    return first(CONFIG.selectors.userMenuButton);
  }

  function getUserMenuPanel() {
    return first(CONFIG.selectors.userMenuPanel);
  }

  function setExpanded(buttons, expanded) {
    buttons.forEach(button => {
      button.setAttribute(
        "aria-expanded",
        String(Boolean(expanded))
      );
    });
  }

  function isBound(element, property) {
    return element.dataset[property] === "true";
  }

  function setBound(element, property) {
    element.dataset[property] = "true";
  }

  /* ==========================================================
     03. SIDEBAR MOBILE
  ========================================================== */

  function openSidebar() {
    const sidebar = getSidebar();
    const overlay = getOverlay();

    if (!sidebar) {
      console.warn(
        "[TARBIYAH SHELL] Sidebar tidak ditemukan."
      );

      return;
    }

    if (!isMobile()) return;

    state.sidebarOpen = true;

    sidebar.classList.add(
      "open",
      "is-open"
    );

    sidebar.setAttribute(
      "aria-hidden",
      "false"
    );

    if (overlay) {
      overlay.hidden = false;

      overlay.classList.add(
        "show",
        "active",
        "is-visible"
      );

      overlay.setAttribute(
        "aria-hidden",
        "false"
      );
    }

    setExpanded(
      all(CONFIG.selectors.openButton),
      true
    );

    document.body.classList.add("menu-open");

    document.documentElement.classList.add(
      "sidebar-open"
    );
  }

  function closeSidebar() {
    const sidebar = getSidebar();
    const overlay = getOverlay();

    state.sidebarOpen = false;

    if (sidebar) {
      sidebar.classList.remove(
        "open",
        "is-open"
      );

      sidebar.setAttribute(
        "aria-hidden",
        isMobile() ? "true" : "false"
      );
    }

    if (overlay) {
      overlay.classList.remove(
        "show",
        "active",
        "is-visible"
      );

      overlay.setAttribute(
        "aria-hidden",
        "true"
      );

      overlay.hidden = true;
    }

    setExpanded(
      all(CONFIG.selectors.openButton),
      false
    );

    document.body.classList.remove("menu-open");

    document.documentElement.classList.remove(
      "sidebar-open"
    );
  }

  function toggleSidebar() {
    if (state.sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function bindSidebar() {
    all(CONFIG.selectors.openButton).forEach(button => {
      if (isBound(button, "shellSidebarBound")) {
        return;
      }

      setBound(button, "shellSidebarBound");

      button.addEventListener("click", event => {
        event.preventDefault();
        toggleSidebar();
      });
    });

    all(CONFIG.selectors.closeButton).forEach(button => {
      if (isBound(button, "shellSidebarBound")) {
        return;
      }

      setBound(button, "shellSidebarBound");

      button.addEventListener("click", event => {
        event.preventDefault();
        closeSidebar();
      });
    });

    const overlay = getOverlay();

    if (
      overlay &&
      !isBound(overlay, "shellSidebarBound")
    ) {
      setBound(overlay, "shellSidebarBound");

      overlay.addEventListener(
        "click",
        closeSidebar
      );
    }

    const sidebar = getSidebar();

    if (
      sidebar &&
      !isBound(sidebar, "shellSidebarBound")
    ) {
      setBound(sidebar, "shellSidebarBound");

      sidebar.addEventListener("click", event => {
        const link = event.target.closest("a");

        if (link && isMobile()) {
          closeSidebar();
        }
      });
    }
  }

  /* ==========================================================
     04. SIDEBAR DESKTOP COLLAPSE
  ========================================================== */

  function toggleDesktopSidebar() {
    if (isMobile()) {
      toggleSidebar();
      return;
    }

    const shell = getShell();

    if (!shell) {
      console.warn(
        "[TARBIYAH SHELL] App shell tidak ditemukan."
      );

      return;
    }

    state.desktopCollapsed =
      !state.desktopCollapsed;

    shell.classList.toggle(
      "sidebar-collapsed",
      state.desktopCollapsed
    );

    document.body.classList.toggle(
      "sidebar-collapsed",
      state.desktopCollapsed
    );
  }

  function bindDesktopCollapse() {
    const buttons = $$(
      "#sidebarCollapse, [data-sidebar-collapse]"
    );

    buttons.forEach(button => {
      if (isBound(button, "shellCollapseBound")) {
        return;
      }

      setBound(button, "shellCollapseBound");

      button.addEventListener("click", event => {
        event.preventDefault();

        toggleDesktopSidebar();
      });
    });
  }

  /* ==========================================================
     05. USER MENU
  ========================================================== */

  function closeUserMenu() {
    const button = getUserMenuButton();
    const panel = getUserMenuPanel();

    state.userMenuOpen = false;

    if (button) {
      button.setAttribute(
        "aria-expanded",
        "false"
      );
    }

    if (panel) {
      panel.hidden = true;

      panel.classList.remove(
        "show",
        "open"
      );
    }
  }

  function toggleUserMenu() {
    const button = getUserMenuButton();
    const panel = getUserMenuPanel();

    if (!button || !panel) return;

    state.userMenuOpen = !state.userMenuOpen;

    panel.hidden = !state.userMenuOpen;

    panel.classList.toggle(
      "show",
      state.userMenuOpen
    );

    panel.classList.toggle(
      "open",
      state.userMenuOpen
    );

    button.setAttribute(
      "aria-expanded",
      String(state.userMenuOpen)
    );
  }

  function bindUserMenu() {
    const button = getUserMenuButton();

    if (
      button &&
      !isBound(button, "shellUserMenuBound")
    ) {
      setBound(button, "shellUserMenuBound");

      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        toggleUserMenu();
      });
    }

    if (
      !document.body.dataset.shellUserMenuDocumentBound
    ) {
      document.body.dataset.shellUserMenuDocumentBound =
        "true";

      document.addEventListener("click", event => {
        if (!state.userMenuOpen) return;

        const panel = getUserMenuPanel();
        const trigger = getUserMenuButton();

        if (
          panel?.contains(event.target) ||
          trigger?.contains(event.target)
        ) {
          return;
        }

        closeUserMenu();
      });
    }

    const panel = getUserMenuPanel();

    panel?.querySelectorAll("a").forEach(link => {
      if (isBound(link, "shellUserMenuLinkBound")) {
        return;
      }

      setBound(link, "shellUserMenuLinkBound");

      link.addEventListener(
        "click",
        closeUserMenu
      );
    });
  }

  /* ==========================================================
     06. NAVIGASI KEMBALI KE DASHBOARD
  ========================================================== */

  function navigateToDashboard() {
    closeSidebar();
    closeUserMenu();

    const destination = new URL(
      CONFIG.dashboardURL,
      window.location.href
    );

    if (
      destination.origin !== window.location.origin
    ) {
      console.error(
        "[TARBIYAH SHELL] Tujuan navigasi tidak valid."
      );

      return;
    }

    window.location.assign(destination.href);
  }

  function bindBackNavigation() {
    all(CONFIG.selectors.backButton).forEach(button => {
      if (isBound(button, "shellBackBound")) {
        return;
      }

      setBound(button, "shellBackBound");

      button.addEventListener("click", event => {
        event.preventDefault();

        navigateToDashboard();
      });
    });
  }

  /* ==========================================================
     07. NAVIGASI AKTIF
  ========================================================== */

  function getCurrentFileName() {
    const path = window.location.pathname || "";

    const parts = path
      .split("/")
      .filter(Boolean);

    return (
      parts[parts.length - 1] ||
      "dashboard.html"
    ).toLowerCase();
  }

  function normalizeFileName(value) {
    if (!value) return "";

    try {
      const url = new URL(
        value,
        window.location.href
      );

      const parts = url.pathname
        .split("/")
        .filter(Boolean);

      return (
        parts[parts.length - 1] || ""
      ).toLowerCase();

    } catch {
      return String(value)
        .split("?")[0]
        .split("#")[0]
        .split("/")
        .pop()
        .toLowerCase();
    }
  }

  function isDashboardFile(fileName) {
    return [
      "dashboard.html",
      "tarbiyah.html",
      ""
    ].includes(fileName);
  }

  function markActiveNavigation() {
    const currentFile = getCurrentFileName();

    const links = $$(
      [
        "[data-nav-link]",
        "[data-module]",
        ".sidebar-link",
        ".bottom-nav a",
        ".mobile-bottom-nav a"
      ].join(",")
    );

    links.forEach(link => {
      const href = link.getAttribute("href") || "";

      const linkFile = normalizeFileName(href);

      let active = false;

      const isDashboardLink =
        link.dataset.module === "dashboard" ||
        link.dataset.navLink === "dashboard" ||
        linkFile === "dashboard.html";

      if (isDashboardFile(currentFile)) {
        active = isDashboardLink ||
          (
            currentFile === "tarbiyah.html" &&
            linkFile === "tarbiyah.html"
          );

      } else if (
        linkFile &&
        linkFile === currentFile
      ) {
        active = true;

      } else if (
        link.dataset.module &&
        link.dataset.module === currentFile.replace(
          ".html",
          ""
        )
      ) {
        active = true;
      }

      link.classList.toggle(
        "active",
        active
      );

      if (active) {
        link.setAttribute(
          "aria-current",
          "page"
        );
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  /* ==========================================================
     08. NAVIGASI MODUL
  ========================================================== */

  function bindModuleNavigation() {
    if (
      document.body.dataset.shellModuleNavigationBound
    ) {
      return;
    }

    document.body.dataset.shellModuleNavigationBound =
      "true";

    document.addEventListener("click", event => {
      const target = event.target;

      if (!target || typeof target.closest !== "function") {
        return;
      }

      const link = target.closest(
        "[data-module], [data-nav-link]"
      );

      if (!link) return;

      const href = link.getAttribute("href") || "";

      // Biarkan browser menangani alamat halaman nyata.
      if (
        href &&
        href !== "#" &&
        !href.startsWith("javascript:")
      ) {
        return;
      }

      const moduleName =
        link.dataset.module ||
        link.dataset.navLink ||
        "";

      if (!moduleName) return;

      const moduleAPI = window.TARBIYAH_MODULE;

      if (
        moduleAPI &&
        typeof moduleAPI.navigate === "function"
      ) {
        event.preventDefault();

        moduleAPI.navigate(moduleName);

        closeSidebar();

      } else {
        console.error(
          "[TARBIYAH SHELL] API navigasi modul tidak tersedia."
        );
      }
    });
  }

  /* ==========================================================
     09. KEYBOARD
  ========================================================== */

  function bindKeyboard() {
    if (document.body.dataset.shellKeyboardBound) {
      return;
    }

    document.body.dataset.shellKeyboardBound =
      "true";

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      closeSidebar();
      closeUserMenu();
    });
  }

  /* ==========================================================
     10. RESPONSIVE
  ========================================================== */

  function bindResponsive() {
    if (
      window.__TARBIYAH_SHELL_RESPONSIVE_V22__
    ) {
      return;
    }

    window.__TARBIYAH_SHELL_RESPONSIVE_V22__ =
      true;

    state.previousMobileState = isMobile();

    function handleBreakpointChange() {
      const currentMobileState = isMobile();

      if (
        currentMobileState !==
        state.previousMobileState
      ) {
        closeSidebar();

        state.previousMobileState =
          currentMobileState;
      }

      const sidebar = getSidebar();

      if (sidebar && !state.sidebarOpen) {
        sidebar.setAttribute(
          "aria-hidden",
          currentMobileState ? "true" : "false"
        );
      }
    }

    if (window.matchMedia) {
      const media = window.matchMedia(
        `(max-width: ${CONFIG.mobileBreakpoint}px)`
      );

      if (media.addEventListener) {
        media.addEventListener(
          "change",
          handleBreakpointChange
        );
      } else {
        media.addListener(
          handleBreakpointChange
        );
      }
    }

    window.addEventListener(
      "resize",
      handleBreakpointChange,
      { passive: true }
    );
  }

  /* ==========================================================
     11. THEME INTEGRATION
  ========================================================== */

  function checkThemeController() {
    if (window.TARBIYAH_THEME_CONTROLLER) {
      console.info(
        "[TARBIYAH SHELL] Theme controller terdeteksi."
      );
    } else {
      console.info(
        "[TARBIYAH SHELL] Menunggu pengelola tema eksternal."
      );
    }

    // PENTING:
    // Tidak mengubah tema.
    // Tidak membuat event tema.
    // Tidak mengakses localStorage tema.
    // Tidak membuat MutationObserver.
    // Seluruh pengelolaan tema tetap menjadi
    // tanggung jawab tarbiyah-theme.js.
  }

  /* ==========================================================
     12. REFRESH COMPONENTS
  ========================================================== */

  function refresh() {
    bindSidebar();
    bindDesktopCollapse();
    bindBackNavigation();
    bindUserMenu();

    markActiveNavigation();

    console.info(
      "[TARBIYAH SHELL] Komponen berhasil disinkronkan."
    );
  }

  /* ==========================================================
     13. INITIALIZATION
  ========================================================== */

  function initialize() {
    if (state.initialized) {
      refresh();
      return;
    }

    if (!document.body) return;

    state.initialized = true;

    bindSidebar();
    bindDesktopCollapse();
    bindBackNavigation();
    bindUserMenu();
    bindModuleNavigation();
    bindKeyboard();
    bindResponsive();

    markActiveNavigation();

    checkThemeController();

    console.info(
      `[TARBIYAH SHELL] Versi ${VERSION} aktif.`
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

  /* ==========================================================
     14. PUBLIC API
  ========================================================== */

  window.TARBIYAH_SHELL = Object.freeze({
    version: VERSION,

    initialize,

    refresh,

    openSidebar,

    closeSidebar,

    toggleSidebar,

    closeUserMenu,

    markActiveNavigation,

    navigateToDashboard,

    isMobile
  });

})();
