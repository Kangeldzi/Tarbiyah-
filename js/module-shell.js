/* ============================================================
   TARBIYAH — MODULE SHELL
   File    : js/module-shell.js
   Versi   : 2.0.0

   Tanggung jawab:
   - Sidebar desktop dan mobile
   - Overlay sidebar
   - Navigasi aktif
   - Menu pengguna
   - Pengaturan tema
   - Keyboard Escape
   - Kompatibilitas beberapa selector versi sebelumnya

   Tidak mengelola:
   - Autentikasi Supabase
   - Pembacaan role
   - Data anggota
   - Carousel dashboard
============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_MODULE_SHELL_V2__) {
    console.info("[TARBIYAH SHELL] Sudah diinisialisasi.");
    return;
  }

  window.__TARBIYAH_MODULE_SHELL_V2__ = true;

  const VERSION = "2.0.0";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const CONFIG = {
    mobileBreakpoint: 900,

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

      themeButton: [
        "#btnTheme",
        "#themeToggle",
        "[data-theme-toggle]"
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
    desktopCollapsed: false
  };

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

  function setExpanded(buttons, expanded) {
    buttons.forEach(button => {
      button.setAttribute(
        "aria-expanded",
        String(Boolean(expanded))
      );
    });
  }

  /* ==========================================================
     01. SIDEBAR MOBILE
  ========================================================== */

  function openSidebar() {
    const sidebar = getSidebar();
    const overlay = getOverlay();

    if (!sidebar) {
      console.warn(
        "[TARBIYAH SHELL] Elemen sidebar tidak ditemukan."
      );
      return;
    }

    state.sidebarOpen = true;

    sidebar.classList.add("open", "is-open");
    sidebar.setAttribute("aria-hidden", "false");

    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add("show", "active", "is-visible");
      overlay.setAttribute("aria-hidden", "false");
    }

    setExpanded(
      all(CONFIG.selectors.openButton),
      true
    );

    document.body.classList.add("menu-open");
    document.documentElement.classList.add("sidebar-open");
  }

  function closeSidebar() {
    const sidebar = getSidebar();
    const overlay = getOverlay();

    state.sidebarOpen = false;

    if (sidebar) {
      sidebar.classList.remove("open", "is-open");
      sidebar.setAttribute("aria-hidden", "true");
    }

    if (overlay) {
      overlay.classList.remove(
        "show",
        "active",
        "is-visible"
      );

      overlay.setAttribute("aria-hidden", "true");
      overlay.hidden = true;
    }

    setExpanded(
      all(CONFIG.selectors.openButton),
      false
    );

    document.body.classList.remove("menu-open");
    document.documentElement.classList.remove("sidebar-open");
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
      button.addEventListener("click", event => {
        event.preventDefault();
        toggleSidebar();
      });
    });

    all(CONFIG.selectors.closeButton).forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        closeSidebar();
      });
    });

    const overlay = getOverlay();

    overlay?.addEventListener("click", closeSidebar);

    const sidebar = getSidebar();

    sidebar?.addEventListener("click", event => {
      const link = event.target.closest("a");

      if (link && isMobile()) {
        closeSidebar();
      }
    });
  }

  /* ==========================================================
     02. SIDEBAR DESKTOP COLLAPSE
  ========================================================== */

  function toggleDesktopSidebar() {
    if (isMobile()) {
      toggleSidebar();
      return;
    }

    const shell = getShell();

    if (!shell) return;

    state.desktopCollapsed = !state.desktopCollapsed;

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
      button.addEventListener("click", event => {
        event.preventDefault();
        toggleDesktopSidebar();
      });
    });
  }

  /* ==========================================================
     03. THEME MANAGER
  ========================================================== */

  function getThemeManager() {
    return (
      window.TARBIYAH_THEME_MANAGER ||
      window.TARBIYAH_THEME ||
      window.ThemeManager ||
      null
    );
  }

  function getCurrentTheme() {
    const manager = getThemeManager();

    try {
      if (typeof manager?.getTheme === "function") {
        return manager.getTheme();
      }

      if (typeof manager?.get === "function") {
        return manager.get();
      }
    } catch (error) {
      console.warn(
        "[TARBIYAH SHELL] Gagal membaca tema:",
        error
      );
    }

    return (
      document.documentElement.dataset.theme ||
      "dark"
    );
  }

  function applyFallbackTheme(nextTheme) {
    const theme =
      nextTheme === "light" ? "light" : "dark";

    document.documentElement.dataset.theme = theme;

    document.body?.setAttribute(
      "data-theme",
      theme
    );

    const metaTheme = $(
      'meta[name="theme-color"]'
    );

    if (metaTheme) {
      metaTheme.content =
        theme === "dark" ? "#102a22" : "#f4faf7";
    }
  }

  function changeTheme() {
    const manager = getThemeManager();

    try {
      if (typeof manager?.toggleTheme === "function") {
        manager.toggleTheme();
        return;
      }

      if (typeof manager?.changeTheme === "function") {
        manager.changeTheme();
        return;
      }

      const current = getCurrentTheme();
      const next = current === "dark" ? "light" : "dark";

      if (typeof manager?.setTheme === "function") {
        manager.setTheme(next);
        return;
      }

      if (typeof manager?.set === "function") {
        manager.set(next);
        return;
      }

      applyFallbackTheme(next);

    } catch (error) {
      console.error(
        "[TARBIYAH SHELL] Gagal mengganti tema:",
        error
      );
    }
  }

  function updateThemeButtons() {
    const theme = getCurrentTheme();

    all(CONFIG.selectors.themeButton).forEach(button => {
      button.setAttribute(
        "aria-label",
        theme === "dark"
          ? "Aktifkan tema terang"
          : "Aktifkan tema gelap"
      );

      button.setAttribute(
        "title",
        theme === "dark"
          ? "Tema terang"
          : "Tema gelap"
      );

      button.dataset.currentTheme = theme;
    });
  }

  function bindTheme() {
    all(CONFIG.selectors.themeButton).forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        changeTheme();

        window.setTimeout(
          updateThemeButtons,
          50
        );
      });
    });

    const observer = new MutationObserver(() => {
      updateThemeButtons();
    });

    observer.observe(
      document.documentElement,
      {
        attributes: true,
        attributeFilter: ["data-theme"]
      }
    );

    updateThemeButtons();
  }

  /* ==========================================================
     04. USER MENU
  ========================================================== */

  function getUserMenuButton() {
    return first(CONFIG.selectors.userMenuButton);
  }

  function getUserMenuPanel() {
    return first(CONFIG.selectors.userMenuPanel);
  }

  function closeUserMenu() {
    const button = getUserMenuButton();
    const panel = getUserMenuPanel();

    state.userMenuOpen = false;

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }

    if (panel) {
      panel.hidden = true;
      panel.classList.remove("show", "open");
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

    button?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleUserMenu();
    });

    document.addEventListener("click", event => {
      const panel = getUserMenuPanel();
      const trigger = getUserMenuButton();

      if (!state.userMenuOpen) return;

      if (
        panel?.contains(event.target) ||
        trigger?.contains(event.target)
      ) {
        return;
      }

      closeUserMenu();
    });

    getUserMenuPanel()?.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", closeUserMenu);
    });
  }

  /* ==========================================================
     05. NAVIGASI AKTIF
  ========================================================== */

  function getCurrentFileName() {
    const path = window.location.pathname || "";
    const parts = path.split("/").filter(Boolean);

    return (
      parts[parts.length - 1] ||
      "dashboard.html"
    ).toLowerCase();
  }

  function normalizeFileName(value) {
    if (!value) return "";

    try {
      const url = new URL(value, window.location.href);
      const parts = url.pathname.split("/").filter(Boolean);

      return (
        parts[parts.length - 1] || ""
      ).toLowerCase();
    } catch {
      return String(value)
        .split("?")[0]
        .split("/")
        .pop()
        .toLowerCase();
    }
  }

  function isDashboardFile(fileName) {
    return [
      "dashboard.html",
      "tarbiyah.html",
      "",
      "index.html"
    ].includes(fileName);
  }

  function markActiveNavigation() {
    const currentFile = getCurrentFileName();

    const links = $$(
      "[data-nav-link], [data-module], .sidebar-link, .bottom-nav a, .mobile-bottom-nav a"
    );

    links.forEach(link => {
      const href = link.getAttribute("href") || "";
      const linkFile = normalizeFileName(href);

      let active = false;

      if (
        isDashboardFile(currentFile) &&
        (
          link.dataset.module === "dashboard" ||
          link.dataset.navLink === "dashboard" ||
          isDashboardFile(linkFile)
        )
      ) {
        active = true;
      } else if (
        linkFile &&
        linkFile === currentFile
      ) {
        active = true;
      }

      link.classList.toggle("active", active);

      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  /* ==========================================================
     06. NAVIGASI MODUL
  ========================================================== */

  function bindModuleNavigation() {
    document.addEventListener("click", event => {
      const link = event.target.closest(
        "[data-module], [data-nav-link]"
      );

      if (!link) return;

      const href = link.getAttribute("href") || "";

      // Link dengan alamat nyata dibiarkan ditangani browser.
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
      } else {
        console.error(
          "[TARBIYAH SHELL] API navigasi modul tidak tersedia."
        );
      }
    });
  }

  /* ==========================================================
     07. KEYBOARD
  ========================================================== */

  function bindKeyboard() {
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      closeSidebar();
      closeUserMenu();
    });
  }

  /* ==========================================================
     08. RESPONSIVE
  ========================================================== */

  function bindResponsive() {
    let previousMobileState = isMobile();

    window.addEventListener("resize", () => {
      const currentMobileState = isMobile();

      if (currentMobileState !== previousMobileState) {
        closeSidebar();
        previousMobileState = currentMobileState;
      }
    });
  }

  /* ==========================================================
     09. INITIALIZATION
  ========================================================== */

  function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    bindSidebar();
    bindDesktopCollapse();
    bindTheme();
    bindUserMenu();
    bindModuleNavigation();
    bindKeyboard();
    bindResponsive();

    markActiveNavigation();

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
     10. PUBLIC API
  ========================================================== */

  window.TARBIYAH_SHELL = Object.freeze({
    version: VERSION,
    initialize,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    closeUserMenu,
    markActiveNavigation,
    updateThemeButtons,
    isMobile
  });

})();
