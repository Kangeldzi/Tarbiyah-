
/* =========================================================
   TARBIYAH — MODULE SHELL
   File: js/module-shell.js

   Pengelola:
   - Sidebar desktop dan mobile
   - Overlay sidebar
   - Navigasi modul
   - Navigasi bawah mobile
   - Dropdown pengguna
   - Pencarian navigasi
   - Mode terang / gelap
   - Penanda halaman aktif
   - Integrasi dengan theme-manager.js

   ========================================================= */

(function () {
  "use strict";

  if (window.__TARBIYAH_MODULE_SHELL_INITIALIZED__) return;
  window.__TARBIYAH_MODULE_SHELL_INITIALIZED__ = true;

  /* =======================================================
     1. KONFIGURASI
     ======================================================= */

  const CONFIG = {
    mobileBreakpoint: 900,

    /*
     * theme-manager.js menjadi pengelola tema utama.
     * module-shell.js hanya meminta perubahan tema melalui
     * API yang tersedia dan tidak membuat penyimpanan kedua.
     */
    themeAttribute: "data-theme",

    routes: {
      dashboard: "./tarbiyah.html",
      profil: "./profil-anggota.html",
      agenda: "./agenda-tarbiyah.html",
      pembelajaran: "./pembelajaran.html",
      materi: "./materi-pembelajaran.html",
      berita: "./berita-pengumuman.html",
      presensi: "./presensi-tarbiyah.html",
      galeri: "./galeri-foto-video.html",
      diskusi: "./diskusi-tarbiyah.html",
      donasi: "./donasi-infaq.html",
      kehadiran: "./kehadiran.html",
      catatan: "./catatan-refleksi.html",
      notifikasi: "./notifikasi.html",
      riwayat: "./riwayat-aktivitas.html",
      administrasi: "./administrasi-pengaturan.html"
    },

    selectors: {
      sidebar: [
        "#appSidebar",
        "#sidebar",
        ".app-sidebar"
      ],

      overlay: [
        "#sidebarOverlay",
        ".sidebar-overlay"
      ],

      menuToggle: [
        "#menuToggle",
        "#sidebarToggle",
        "[data-sidebar-toggle]"
      ],

      sidebarClose: [
        "#sidebarClose",
        "[data-sidebar-close]"
      ],

      userMenu: [
        "#userDropdown",
        "#userMenu",
        ".user-dropdown"
      ],

      userMenuToggle: [
        "#userMenuToggle",
        "[data-user-menu-toggle]"
      ],

      search: [
        "#sidebarSearch",
        "[data-sidebar-search]"
      ],

      themeToggle: [
        "#themeToggle",
        "[data-theme-toggle]"
      ]
    }
  };

  const state = {
    sidebarOpen: false,
    userMenuOpen: false,
    searchValue: "",
    currentPage: null,
    resizeTimer: null
  };

  /* =======================================================
     2. UTILITAS DOM
     ======================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  function firstElement(selectors) {
    for (const selector of selectors) {
      const element = $(selector);

      if (element) return element;
    }

    return null;
  }

  function allElements(selectors) {
    return selectors.flatMap(selector => $$(selector));
  }

  function log(...args) {
    console.log("[TARBIYAH SHELL]", ...args);
  }

  function isMobile() {
    return window.matchMedia(
      `(max-width: ${CONFIG.mobileBreakpoint}px)`
    ).matches;
  }

  function normalizePath(path) {
    if (!path) return "";

    try {
      const url = new URL(path, window.location.href);

      return url.pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.toLowerCase() || "";
    } catch {
      return String(path)
        .split("?")[0]
        .split("/")
        .pop()
        .toLowerCase();
    }
  }

  function getCurrentFilename() {
    return normalizePath(window.location.pathname);
  }

  function setAriaExpanded(element, expanded) {
    if (!element) return;

    element.setAttribute(
      "aria-expanded",
      expanded ? "true" : "false"
    );
  }

  /* =======================================================
     3. SIDEBAR
     ======================================================= */

  function getSidebar() {
    return firstElement(CONFIG.selectors.sidebar);
  }

  function getOverlay() {
    return firstElement(CONFIG.selectors.overlay);
  }

  function getMenuToggle() {
    return firstElement(CONFIG.selectors.menuToggle);
  }

  function openSidebar() {
    const sidebar = getSidebar();
    const overlay = getOverlay();
    const toggle = getMenuToggle();

    if (!sidebar) {
      warnMissingSidebar();
      return;
    }

    state.sidebarOpen = true;

    sidebar.classList.add("is-open", "open", "active");

    sidebar.setAttribute("aria-hidden", "false");

    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add("is-visible", "active", "show");
      overlay.setAttribute("aria-hidden", "false");
    }

    document.body.classList.add("sidebar-open");

    setAriaExpanded(toggle, true);

    if (isMobile()) {
      document.body.style.overflow = "hidden";
    }
  }

  function closeSidebar() {
    const sidebar = getSidebar();
    const overlay = getOverlay();
    const toggle = getMenuToggle();

    state.sidebarOpen = false;

    if (sidebar) {
      sidebar.classList.remove(
        "is-open",
        "open",
        "active"
      );

      sidebar.setAttribute("aria-hidden", "true");
    }

    if (overlay) {
      overlay.classList.remove(
        "is-visible",
        "active",
        "show"
      );

      overlay.setAttribute("aria-hidden", "true");
      overlay.hidden = true;
    }

    document.body.classList.remove("sidebar-open");

    document.body.style.removeProperty("overflow");

    setAriaExpanded(toggle, false);
  }

  function toggleSidebar() {
    if (state.sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function warnMissingSidebar() {
    log(
      "Sidebar tidak ditemukan. Pastikan HTML menggunakan",
      ".app-sidebar atau #appSidebar."
    );
  }

  /* =======================================================
     4. SIDEBAR DESKTOP COLLAPSE
     ======================================================= */

  function toggleSidebarCollapse() {
    if (isMobile()) {
      toggleSidebar();
      return;
    }

    const shell =
      $(".app-shell") ||
      $(".dashboard-layout") ||
      document.body;

    const collapsed =
      shell.classList.toggle("sidebar-collapsed");

    document.body.classList.toggle(
      "sidebar-collapsed",
      collapsed
    );

    const buttons = allElements([
      "[data-sidebar-collapse]",
      "#sidebarCollapse"
    ]);

    buttons.forEach(button => {
      setAriaExpanded(button, !collapsed);
      button.setAttribute(
        "aria-label",
        collapsed
          ? "Perluas sidebar"
          : "Ciutkan sidebar"
      );
    });
  }

  /* =======================================================
     5. USER DROPDOWN
     ======================================================= */

  function getUserMenu() {
    return firstElement(CONFIG.selectors.userMenu);
  }

  function getUserMenuToggle() {
    return firstElement(CONFIG.selectors.userMenuToggle);
  }

  function openUserMenu() {
    const menu = getUserMenu();
    const toggle = getUserMenuToggle();

    if (!menu) return;

    state.userMenuOpen = true;

    menu.classList.add("is-open", "open", "show");
    menu.setAttribute("aria-hidden", "false");

    setAriaExpanded(toggle, true);
  }

  function closeUserMenu() {
    const menu = getUserMenu();
    const toggle = getUserMenuToggle();

    state.userMenuOpen = false;

    if (menu) {
      menu.classList.remove(
        "is-open",
        "open",
        "show"
      );

      menu.setAttribute("aria-hidden", "true");
    }

    setAriaExpanded(toggle, false);
  }

  function toggleUserMenu() {
    if (state.userMenuOpen) {
      closeUserMenu();
    } else {
      openUserMenu();
    }
  }

  /* =======================================================
     6. NAVIGASI HALAMAN
     ======================================================= */

  const ROUTE_ALIASES = {
    "dashboard.html": "dashboard",
    "tarbiyah.html": "dashboard",

    "profil-anggota.html": "profil",

    "agenda-tarbiyah.html": "agenda",

    "pembelajaran.html": "pembelajaran",

    "materi-pembelajaran.html": "materi",

    "berita-pengumuman.html": "berita",

    "presensi-tarbiyah.html": "presensi",

    "galeri-foto-video.html": "galeri",

    "diskusi-tarbiyah.html": "diskusi",

    "donasi-infaq.html": "donasi",

    "kehadiran.html": "kehadiran",

    "catatan-refleksi.html": "catatan",

    "notifikasi.html": "notifikasi",

    "riwayat-aktivitas.html": "riwayat",

    "administrasi-pengaturan.html": "administrasi"
  };

  function getPageKeyFromFilename(filename) {
    return ROUTE_ALIASES[filename] || null;
  }

  function getPageKeyFromElement(element) {
    if (!element) return null;

    const directKey =
      element.dataset.module ||
      element.dataset.page ||
      element.dataset.route;

    if (directKey && CONFIG.routes[directKey]) {
      return directKey;
    }

    const href =
      element.getAttribute("href") ||
      element.dataset.href;

    if (!href || href === "#") return null;

    const filename = normalizePath(href);

    return getPageKeyFromFilename(filename);
  }

  function navigateTo(pageKey) {
    if (!pageKey || !CONFIG.routes[pageKey]) {
      warnInvalidRoute(pageKey);
      return;
    }

    const target = CONFIG.routes[pageKey];

    if (
      normalizePath(target) === getCurrentFilename()
    ) {
      closeSidebar();
      closeUserMenu();
      return;
    }

    window.location.assign(target);
  }

  function warnInvalidRoute(pageKey) {
    console.warn(
      "[TARBIYAH SHELL] Rute tidak dikenal:",
      pageKey
    );
  }

  function handleNavigationClick(event) {
    const link = event.target.closest(
      "[data-module], [data-page], [data-route], [data-nav-link]"
    );

    if (!link) return;

    const pageKey = getPageKeyFromElement(link);

    if (!pageKey) return;

    /*
     * Jika elemen memiliki href eksternal atau target
     * khusus, jangan mengambil alih navigasinya.
     */
    const href = link.getAttribute("href");

    if (
      href &&
      (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
    ) {
      return;
    }

    event.preventDefault();

    closeSidebar();
    closeUserMenu();

    navigateTo(pageKey);
  }

  /* =======================================================
     7. PENANDA MENU AKTIF
     ======================================================= */

  function markActiveNavigation() {
    const filename = getCurrentFilename();

    const pageKey =
      getPageKeyFromFilename(filename);

    state.currentPage = pageKey;

    const navigationItems = $$(
      [
        "[data-module]",
        "[data-page]",
        "[data-route]",
        "[data-nav-link]"
      ].join(",")
    );

    navigationItems.forEach(item => {
      const itemKey = getPageKeyFromElement(item);

      const active = Boolean(
        pageKey && itemKey === pageKey
      );

      item.classList.toggle("active", active);
      item.classList.toggle("is-active", active);

      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  /* =======================================================
     8. PENCARIAN MENU SIDEBAR
     ======================================================= */

  function getSearchInput() {
    return firstElement(CONFIG.selectors.search);
  }

  function getNavigationGroups() {
    const sidebar = getSidebar();

    if (!sidebar) return [];

    return [
      ...$$("[data-nav-item]", sidebar),
      ...$$(".sidebar-nav-item", sidebar),
      ...$$(".nav-item", sidebar)
    ];
  }

  function searchNavigation(query) {
    const normalized = String(query || "")
      .trim()
      .toLowerCase();

    state.searchValue = normalized;

    const items = getNavigationGroups();

    items.forEach(item => {
      const text = (
        item.textContent ||
        item.dataset.search ||
        ""
      ).toLowerCase();

      const matches =
        !normalized || text.includes(normalized);

      item.hidden = !matches;
      item.classList.toggle(
        "search-hidden",
        !matches
      );
    });

    const emptyState = $(
      "[data-sidebar-search-empty]"
    );

    if (emptyState) {
      const visibleItems = items.filter(
        item => !item.hidden
      );

      emptyState.hidden =
        !normalized || visibleItems.length > 0;
    }
  }

  function clearNavigationSearch() {
    const input = getSearchInput();

    if (input) input.value = "";

    searchNavigation("");
  }

  /* =======================================================
     9. MODE TEMA
     ======================================================= */

  function getThemeManager() {
    return window.TARBIYAH_THEME ||
      window.TARBIYAH_THEME_MANAGER ||
      window.ThemeManager ||
      null;
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute(
      CONFIG.themeAttribute
    ) || "dark";
  }

  function applyThemeThroughManager(theme) {
    const manager = getThemeManager();

    if (!manager) {
      /*
       * Fallback visual saja.
       * Penyimpanan preferensi tetap menjadi tanggung
       * jawab theme-manager.js.
       */
      document.documentElement.setAttribute(
        CONFIG.themeAttribute,
        theme
      );

      return;
    }

    const methods = [
      "setTheme",
      "changeTheme",
      "applyTheme"
    ];

    for (const method of methods) {
      if (typeof manager[method] === "function") {
        manager[method](theme);
        return;
      }
    }

    warnThemeManagerMethod();
  }

  function warnThemeManagerMethod() {
    log(
      "Theme manager tersedia tetapi tidak memiliki",
      "API setTheme/changeTheme/applyTheme."
    );
  }

  function toggleTheme() {
    const current = getCurrentTheme();

    const next =
      current === "light"
        ? "dark"
        : "light";

    applyThemeThroughManager(next);

    updateThemeButtons(next);
  }

  function updateThemeButtons(theme = getCurrentTheme()) {
    const buttons = allElements(
      CONFIG.selectors.themeToggle
    );

    buttons.forEach(button => {
      const isLight = theme === "light";

      button.setAttribute(
        "aria-label",
        isLight
          ? "Aktifkan mode gelap"
          : "Aktifkan mode terang"
      );

      button.setAttribute(
        "aria-pressed",
        isLight ? "true" : "false"
      );

      const icon = $(
        "[data-theme-icon]",
        button
      );

      if (icon) {
        icon.textContent = isLight ? "☀️" : "🌙";
      }

      const label = $(
        "[data-theme-label]",
        button
      );

      if (label) {
        label.textContent = isLight
          ? "Mode Terang"
          : "Mode Gelap";
      }
    });
  }

  /* =======================================================
     10. RESPONSIVE STATE
     ======================================================= */

  function handleResize() {
    if (state.resizeTimer) {
      clearTimeout(state.resizeTimer);
    }

    state.resizeTimer = setTimeout(() => {
      if (!isMobile()) {
        closeSidebar();
      }

      state.resizeTimer = null;
    }, 120);
  }

  /* =======================================================
     11. EVENT BINDING
     ======================================================= */

  function bindSidebarEvents() {
    allElements(CONFIG.selectors.menuToggle)
      .forEach(button => {
        button.addEventListener("click", event => {
          event.preventDefault();
          toggleSidebar();
        });
      });

    allElements(CONFIG.selectors.sidebarClose)
      .forEach(button => {
        button.addEventListener("click", event => {
          event.preventDefault();
          closeSidebar();
        });
      });

    const overlay = getOverlay();

    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    const collapseButtons = allElements([
      "[data-sidebar-collapse]",
      "#sidebarCollapse"
    ]);

    collapseButtons.forEach(button => {
      button.addEventListener(
        "click",
        toggleSidebarCollapse
      );
    });
  }

  function bindUserMenuEvents() {
    allElements(CONFIG.selectors.userMenuToggle)
      .forEach(button => {
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();

          toggleUserMenu();
        });
      });

    document.addEventListener("click", event => {
      if (!state.userMenuOpen) return;

      const menu = getUserMenu();
      const toggle = getUserMenuToggle();

      if (
        menu &&
        !menu.contains(event.target) &&
        !toggle?.contains(event.target)
      ) {
        closeUserMenu();
      }
    });
  }

  function bindNavigationEvents() {
    document.addEventListener(
      "click",
      handleNavigationClick
    );
  }

  function bindSearchEvents() {
    const input = getSearchInput();

    if (!input) return;

    input.addEventListener("input", event => {
      searchNavigation(event.target.value);
    });

    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        clearNavigationSearch();
        input.blur();
      }
    });

    const clearButton = $(
      "[data-sidebar-search-clear]"
    );

    if (clearButton) {
      clearButton.addEventListener(
        "click",
        clearNavigationSearch
      );
    }
  }

  function bindThemeEvents() {
    allElements(CONFIG.selectors.themeToggle)
      .forEach(button => {
        button.addEventListener("click", event => {
          event.preventDefault();
          toggleTheme();
        });
      });

    /*
     * Sinkronisasi tampilan jika theme-manager.js
     * mengubah atribut tema dari tempat lain.
     */
    const observer = new MutationObserver(() => {
      updateThemeButtons();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [CONFIG.themeAttribute]
    });
  }

  function bindKeyboardEvents() {
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeSidebar();
        closeUserMenu();
      }
    });
  }

  /* =======================================================
     12. INISIALISASI
     ======================================================= */

  function initialize() {
    bindSidebarEvents();
    bindUserMenuEvents();
    bindNavigationEvents();
    bindSearchEvents();
    bindThemeEvents();
    bindKeyboardEvents();

    markActiveNavigation();
    updateThemeButtons();

    window.addEventListener(
      "resize",
      handleResize,
      { passive: true }
    );

    log("Module shell berhasil diinisialisasi.");
  }

  /* =======================================================
     13. API PUBLIK
     ======================================================= */

  window.TARBIYAH_SHELL = {
    initialize,

    openSidebar,
    closeSidebar,
    toggleSidebar,

    toggleSidebarCollapse,

    openUserMenu,
    closeUserMenu,
    toggleUserMenu,

    navigateTo,

    markActiveNavigation,

    searchNavigation,
    clearNavigationSearch,

    toggleTheme,
    updateThemeButtons,

    getState() {
      return {
        sidebarOpen: state.sidebarOpen,
        userMenuOpen: state.userMenuOpen,
        searchValue: state.searchValue,
        currentPage: state.currentPage,
        mobile: isMobile()
      };
    },

    getRoutes() {
      return { ...CONFIG.routes };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

})();
