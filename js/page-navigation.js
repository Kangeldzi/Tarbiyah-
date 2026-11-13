
/* =========================================================
   TARBIYAH — PAGE NAVIGATION
   File: js/page-navigation.js
   Fungsi:
   - Tombol Kembali
   - Tombol Beranda
   - Memuat CSS navigasi secara otomatis
   - Mencegah navigasi terpasang dua kali
   ========================================================= */

(() => {
  "use strict";

  const CONFIG = {
    styleId: "tarbiyah-page-navigation-style",
    navId: "tarbiyah-page-navigation",
    stylePath: "./css/page-navigation.css",
    dashboardUrl: "./dashboard.html",

    excludedPages: [
      "",
      "index.html",
      "login-register.html",
      "dashboard.html",
      "dashboard-admin.html"
    ]
  };

  // Nama halaman yang sedang dibuka
  function getCurrentPage() {
    return window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();
  }

  // Halaman khusus yang tidak membutuhkan navigasi ini
  function isExcludedPage() {
    return CONFIG.excludedPages.includes(getCurrentPage());
  }

  // Memuat CSS navigasi
  function loadNavigationCSS() {
    if (document.getElementById(CONFIG.styleId)) return;

    const css = document.createElement("link");

    css.id = CONFIG.styleId;
    css.rel = "stylesheet";
    css.href = CONFIG.stylePath;

    document.head.appendChild(css);
  }

  // Mencari area konten utama
  function findMainContent() {
    const selectors = [
      "main",
      '[role="main"]',
      ".main-content",
      ".app-main",
      ".content"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) return element;
    }

    return null;
  }

  // Memastikan halaman sebelumnya berasal dari situs yang sama
  function hasSafePreviousPage() {
    if (!document.referrer) return false;

    try {
      const previous = new URL(document.referrer);

      if (previous.origin !== window.location.origin) {
        return false;
      }

      const previousPage = previous.pathname
        .split("/")
        .pop()
        .toLowerCase();

      return ![
        "index.html",
        "login-register.html"
      ].includes(previousPage);

    } catch (error) {
      return false;
    }
  }

  // Membuat tombol navigasi
  function createButton(label, icon, className, action) {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      "tarbiyah-page-nav__button " + className;

    button.setAttribute("aria-label", label);

    const iconElement = document.createElement("span");
    iconElement.className = "tarbiyah-page-nav__icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = icon;

    const labelElement = document.createElement("span");
    labelElement.className = "tarbiyah-page-nav__label";
    labelElement.textContent = label;

    button.append(iconElement, labelElement);

    button.addEventListener("click", action);

    return button;
  }

  // Membuat navigasi halaman
  function createPageNavigation() {
    if (isExcludedPage()) return;

    // Mencegah tombol dibuat berulang
    if (document.getElementById(CONFIG.navId)) return;

    const mainContent = findMainContent();

    if (!mainContent) {
      console.warn(
        "[TARBIYAH] Area konten utama tidak ditemukan."
      );
      return;
    }

    loadNavigationCSS();

    const navigation = document.createElement("nav");

    navigation.id = CONFIG.navId;
    navigation.className = "tarbiyah-page-nav";

    navigation.setAttribute(
      "aria-label",
      "Navigasi halaman TARBIYAH"
    );

    // Tombol Kembali
    const backButton = createButton(
      "Kembali",
      "←",
      "tarbiyah-page-nav__button--back",
      () => {
        if (
          hasSafePreviousPage() &&
          window.history.length > 1
        ) {
          window.history.back();
        } else {
          window.location.assign(CONFIG.dashboardUrl);
        }
      }
    );

    // Tombol Beranda
    const homeButton = createButton(
      "Beranda",
      "⌂",
      "tarbiyah-page-nav__button--home",
      () => {
        window.location.assign(CONFIG.dashboardUrl);
      }
    );

    navigation.append(backButton, homeButton);

    // Navigasi diletakkan di awal area konten
    mainContent.prepend(navigation);
  }

  // Inisialisasi
  function initPageNavigation() {
    if (!document.head || !document.body) return;

    createPageNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initPageNavigation,
      { once: true }
    );
  } else {
    initPageNavigation();
  }

})();
