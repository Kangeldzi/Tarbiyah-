
/**
 * ============================================================
 * TARBIYAH — DASHBOARD MANAGER
 * File   : js/dashboard.js
 * Versi  : 1.0.0
 *
 * Fungsi:
 * - Mengelola Dashboard Utama
 * - Menampilkan identitas anggota
 * - Mengelola ringkasan statistik
 * - Mengelola carousel
 * - Mengelola pencarian dashboard
 * - Mengelola notifikasi
 * - Menyediakan sistem refresh
 * - Menghubungkan dashboard dengan data provider
 *
 * PENTING:
 * File ini tidak membuat data dummy.
 * Struktur tabel Supabase harus disesuaikan dengan database
 * TARBIYAH yang benar-benar digunakan.
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_DASHBOARD) {
    console.info("[TARBIYAH DASHBOARD] Sudah aktif.");
    return;
  }

  const VERSION = "1.0.0";

  /* ==========================================================
     1. KONFIGURASI
  ========================================================== */

  const CONFIG = {
    carouselInterval: 5000,
    carouselAutoplay: true,
    carouselPauseOnHover: true,

    selectors: {
      welcomeName: "[data-dashboard-name]",
      welcomeMessage: "[data-dashboard-welcome]",
      avatar: "[data-dashboard-avatar]",
      date: "[data-dashboard-date]",

      stats: "[data-dashboard-stat]",

      carousel: "[data-dashboard-carousel]",
      carouselTrack: "[data-carousel-track]",
      carouselItem: "[data-carousel-item]",
      carouselPrev: "[data-carousel-prev]",
      carouselNext: "[data-carousel-next]",
      carouselDots: "[data-carousel-dots]",

      search: "[data-dashboard-search]",
      searchResults: "[data-dashboard-search-results]",

      notificationButton: "[data-notification-toggle]",
      notificationCount: "[data-notification-count]",

      refreshButton: "[data-dashboard-refresh]",
      status: "[data-dashboard-status]"
    }
  };

  /* ==========================================================
     2. STATE
  ========================================================== */

  const state = {
    initialized: false,
    loading: false,
    session: null,
    user: null,
    profile: null,

    carouselIndex: 0,
    carouselTimer: null,
    carouselPaused: false,

    providers: new Map(),
    refreshHandlers: new Map(),

    lastRefresh: null
  };

  /* ==========================================================
     3. UTILITAS
  ========================================================== */

  function query(selector, root) {
    return (root || document).querySelector(selector);
  }

  function queryAll(selector, root) {
    return Array.from(
      (root || document).querySelectorAll(selector)
    );
  }

  function text(element, value) {
    if (!element) return;

    element.textContent =
      value === undefined || value === null
        ? ""
        : String(value);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: detail || {}
      })
    );
  }

  function getInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return "A";

    return parts
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }

  function getGreeting() {
    const hour = new Date().getHours();

    if (hour >= 4 && hour < 11) {
      return "Selamat pagi";
    }

    if (hour >= 11 && hour < 15) {
      return "Selamat siang";
    }

    if (hour >= 15 && hour < 18) {
      return "Selamat sore";
    }

    return "Selamat malam";
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function setStatus(status, message) {
    const element = query(CONFIG.selectors.status);

    if (!element) return;

    element.dataset.status = status;
    element.hidden = false;
    text(element, message || "");
  }

  function clearStatus() {
    const element = query(CONFIG.selectors.status);

    if (!element) return;

    element.hidden = true;
    element.textContent = "";
    delete element.dataset.status;
  }

  /* ==========================================================
     4. MENGAMBIL SESSION AUTH
  ========================================================== */

  async function getAuthSession() {
    const auth = window.TARBIYAH_AUTH;

    if (auth && typeof auth.getSession === "function") {
      const result = await auth.getSession();

      if (result?.data?.session) {
        return result.data.session;
      }

      if (result?.session) {
        return result.session;
      }

      if (result?.user) {
        return result;
      }
    }

    const client =
      window.supabaseClient ||
      window.TARBIYAH_SUPABASE ||
      window.TARBIYAH?.supabase;

    if (client?.auth?.getSession) {
      const { data, error } = await client.auth.getSession();

      if (error) throw error;

      return data?.session || null;
    }

    return null;
  }

  /* ==========================================================
     5. IDENTITAS ANGGOTA
  ========================================================== */

  function resolveDisplayName(user, profile) {
    const metadata = user?.user_metadata || {};

    return (
      profile?.full_name ||
      profile?.nama_lengkap ||
      profile?.name ||
      metadata.full_name ||
      metadata.nama_lengkap ||
      metadata.name ||
      user?.email?.split("@")[0] ||
      "Anggota TARBIYAH"
    );
  }

  function renderIdentity(user, profile) {
    const name = resolveDisplayName(user, profile);

    text(
      query(CONFIG.selectors.welcomeName),
      name
    );

    text(
      query(CONFIG.selectors.welcomeMessage),
      `${getGreeting()}, ${name}`
    );

    text(
      query(CONFIG.selectors.date),
      formatDate(new Date())
    );

    const avatar = query(CONFIG.selectors.avatar);

    if (avatar) {
      const avatarURL =
        profile?.avatar_url ||
        profile?.avatar ||
        profile?.photo_url ||
        profile?.photo;

      if (avatarURL) {
        avatar.src = avatarURL;
        avatar.alt = `Foto profil ${name}`;
        avatar.hidden = false;
      } else {
        avatar.removeAttribute("src");
        avatar.alt = getInitials(name);
        avatar.dataset.initials = getInitials(name);
      }
    }

    dispatch("tarbiyah:dashboard-identity", {
      user,
      profile,
      name
    });
  }

  /* ==========================================================
     6. PROVIDER DATA
     Provider dapat didaftarkan oleh modul lain.
  ========================================================== */

  function registerProvider(name, provider) {
    if (
      !name ||
      !provider ||
      typeof provider !== "function"
    ) {
      return false;
    }

    state.providers.set(name, provider);

    return true;
  }

  async function loadProvider(name, options) {
    const provider = state.providers.get(name);

    if (!provider) {
      return {
        success: false,
        available: false,
        message: `Provider ${name} belum tersedia.`
      };
    }

    try {
      const data = await provider(options || {});

      return {
        success: true,
        available: true,
        data
      };
    } catch (error) {
      console.error(
        `[TARBIYAH DASHBOARD] Provider ${name} gagal:`,
        error
      );

      return {
        success: false,
        available: true,
        error
      };
    }
  }

  /* ==========================================================
     7. RINGKASAN STATISTIK
  ========================================================== */

  function renderStats(data) {
    if (!data || typeof data !== "object") return;

    queryAll(CONFIG.selectors.stats).forEach(element => {
      const key = element.dataset.dashboardStat;

      if (!key || !Object.prototype.hasOwnProperty.call(data, key)) {
        return;
      }

      const value = data[key];

      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        text(element, new Intl.NumberFormat("id-ID").format(value));
      } else {
        text(element, value);
      }
    });

    dispatch("tarbiyah:dashboard-stats", {
      data
    });
  }

  /* ==========================================================
     8. CAROUSEL / SLIDESHOW
  ========================================================== */

  function getCarouselItems() {
    const container = query(CONFIG.selectors.carousel);

    if (!container) return [];

    return queryAll(
      CONFIG.selectors.carouselItem,
      container
    );
  }

  function updateCarousel() {
    const container = query(CONFIG.selectors.carousel);

    if (!container) return;

    const items = getCarouselItems();

    if (!items.length) return;

    const total = items.length;

    state.carouselIndex =
      ((state.carouselIndex % total) + total) % total;

    const track = query(
      CONFIG.selectors.carouselTrack,
      container
    );

    if (track) {
      track.style.transform =
        `translateX(-${state.carouselIndex * 100}%)`;
    }

    items.forEach((item, index) => {
      const active = index === state.carouselIndex;

      item.classList.toggle("is-active", active);
      item.setAttribute(
        "aria-hidden",
        active ? "false" : "true"
      );
    });

    queryAll(
      CONFIG.selectors.carouselDots,
      container
    ).forEach((dot, index) => {
      const active = index === state.carouselIndex;

      dot.classList.toggle("is-active", active);
      dot.setAttribute(
        "aria-current",
        active ? "true" : "false"
      );
    });

    dispatch("tarbiyah:carousel-change", {
      index: state.carouselIndex,
      total
    });
  }

  function goToSlide(index) {
    const items = getCarouselItems();

    if (!items.length) return;

    state.carouselIndex = index;
    updateCarousel();
    restartCarousel();
  }

  function nextSlide() {
    const items = getCarouselItems();

    if (!items.length) return;

    state.carouselIndex =
      (state.carouselIndex + 1) % items.length;

    updateCarousel();
  }

  function previousSlide() {
    const items = getCarouselItems();

    if (!items.length) return;

    state.carouselIndex =
      (state.carouselIndex - 1 + items.length) %
      items.length;

    updateCarousel();
  }

  function stopCarousel() {
    if (state.carouselTimer) {
      window.clearInterval(state.carouselTimer);
      state.carouselTimer = null;
    }
  }

  function startCarousel() {
    stopCarousel();

    if (!CONFIG.carouselAutoplay) return;

    const items = getCarouselItems();

    if (items.length < 2) return;

    state.carouselTimer = window.setInterval(() => {
      if (!state.carouselPaused) {
        nextSlide();
      }
    }, CONFIG.carouselInterval);
  }

  function restartCarousel() {
    stopCarousel();
    startCarousel();
  }

  function bindCarousel() {
    const container = query(CONFIG.selectors.carousel);

    if (!container || container.dataset.bound === "true") {
      return;
    }

    container.dataset.bound = "true";

    const previous = query(
      CONFIG.selectors.carouselPrev,
      container
    );

    const next = query(
      CONFIG.selectors.carouselNext,
      container
    );

    previous?.addEventListener("click", previousSlide);
    next?.addEventListener("click", nextSlide);

    queryAll(
      CONFIG.selectors.carouselDots,
      container
    ).forEach((dot, index) => {
      dot.addEventListener("click", () => {
        goToSlide(index);
      });
    });

    if (CONFIG.carouselPauseOnHover) {
      container.addEventListener("mouseenter", () => {
        state.carouselPaused = true;
      });

      container.addEventListener("mouseleave", () => {
        state.carouselPaused = false;
      });
    }

    container.addEventListener("focusin", () => {
      state.carouselPaused = true;
    });

    container.addEventListener("focusout", () => {
      state.carouselPaused = false;
    });

    updateCarousel();
    startCarousel();
  }

  /* ==========================================================
     9. PENCARIAN DASHBOARD
  ========================================================== */

  function bindSearch() {
    const input = query(CONFIG.selectors.search);

    if (!input || input.dataset.bound === "true") {
      return;
    }

    input.dataset.bound = "true";

    const results = query(CONFIG.selectors.searchResults);

    input.addEventListener("input", () => {
      const keyword = input.value.trim().toLowerCase();

      const searchable = queryAll("[data-searchable]");

      let visibleCount = 0;

      searchable.forEach(element => {
        const content = (
          element.dataset.searchable ||
          element.textContent ||
          ""
        ).toLowerCase();

        const matches =
          !keyword || content.includes(keyword);

        element.hidden = !matches;

        if (matches) visibleCount++;
      });

      if (results) {
        results.hidden = !keyword;

        if (keyword) {
          text(
            results,
            visibleCount
              ? `${visibleCount} bagian ditemukan.`
              : "Tidak ada hasil yang sesuai."
          );
        }
      }

      dispatch("tarbiyah:dashboard-search", {
        keyword,
        visibleCount
      });
    });

    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        input.value = "";
        input.dispatchEvent(new Event("input"));
        input.blur();
      }
    });
  }

  /* ==========================================================
     10. NOTIFIKASI
  ========================================================== */

  function renderNotificationCount(count) {
    const element = query(CONFIG.selectors.notificationCount);

    if (!element) return;

    const value = Math.max(
      0,
      Number(count) || 0
    );

    text(
      element,
      value > 99 ? "99+" : value
    );

    element.hidden = value === 0;
    element.setAttribute(
      "aria-label",
      `${value} notifikasi belum dibaca`
    );
  }

  function bindNotifications() {
    const button = query(
      CONFIG.selectors.notificationButton
    );

    if (!button || button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const moduleAPI = window.TARBIYAH_MODULE;

      if (moduleAPI?.navigate) {
        moduleAPI.navigate("notifikasi");
      } else {
        window.location.href = "./notifikasi.html";
      }
    });
  }

  /* ==========================================================
     11. REFRESH HANDLER
  ========================================================== */

  function registerRefreshHandler(name, handler) {
    if (
      !name ||
      typeof handler !== "function"
    ) {
      return false;
    }

    state.refreshHandlers.set(name, handler);

    return true;
  }

  async function refresh(options) {
    if (state.loading) {
      return {
        success: false,
        message: "Dashboard sedang memuat data."
      };
    }

    state.loading = true;

    const settings = options || {};

    setStatus(
      "loading",
      "Memperbarui informasi dashboard..."
    );

    try {
      const results = {};

      for (const [name, handler] of state.refreshHandlers) {
        try {
          results[name] = await handler(settings);
        } catch (error) {
          console.error(
            `[TARBIYAH DASHBOARD] Refresh ${name} gagal:`,
            error
          );

          results[name] = {
            success: false,
            error
          };
        }
      }

      const statsResult = await loadProvider(
        "stats",
        settings
      );

      if (statsResult.success) {
        renderStats(statsResult.data);
        results.stats = statsResult.data;
      }

      const notificationResult = await loadProvider(
        "notifications",
        settings
      );

      if (notificationResult.success) {
        const count =
          notificationResult.data?.unread_count ??
          notificationResult.data?.count ??
          0;

        renderNotificationCount(count);
        results.notifications = notificationResult.data;
      }

      state.lastRefresh = new Date();

      clearStatus();

      dispatch("tarbiyah:dashboard-refreshed", {
        results,
        timestamp: state.lastRefresh
      });

      return {
        success: true,
        results
      };

    } catch (error) {
      console.error(
        "[TARBIYAH DASHBOARD] Refresh gagal:",
        error
      );

      setStatus(
        "error",
        "Dashboard belum berhasil diperbarui. Silakan coba kembali."
      );

      return {
        success: false,
        error
      };

    } finally {
      state.loading = false;
    }
  }

  /* ==========================================================
     12. EVENT DASHBOARD
  ========================================================== */

  function bindEvents() {
    if (
      document.documentElement.dataset.dashboardEventsBound
    ) {
      return;
    }

    document.documentElement.dataset.dashboardEventsBound =
      "true";

    bindCarousel();
    bindSearch();
    bindNotifications();

    const refreshButton = query(
      CONFIG.selectors.refreshButton
    );

    refreshButton?.addEventListener("click", () => {
      refresh();
    });

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          stopCarousel();
        } else {
          startCarousel();
        }
      }
    );

    document.addEventListener(
      "tarbiyah:dashboard-refresh-request",
      () => refresh()
    );
  }

  /* ==========================================================
     13. INISIALISASI DASHBOARD
  ========================================================== */

  async function initialize(options) {
    if (state.initialized && !(options?.force)) {
      return {
        success: true,
        message: "Dashboard sudah diinisialisasi."
      };
    }

    try {
      setStatus(
        "loading",
        "Menyiapkan Dashboard TARBIYAH..."
      );

      const session = await getAuthSession();

      state.session = session;
      state.user = session?.user || null;

      if (state.user) {
        renderIdentity(state.user, null);
      }

      bindEvents();

      state.initialized = true;

      clearStatus();

      dispatch("tarbiyah:dashboard-ready", {
        user: state.user
      });

      return {
        success: true,
        user: state.user
      };

    } catch (error) {
      console.error(
        "[TARBIYAH DASHBOARD] Inisialisasi gagal:",
        error
      );

      setStatus(
        "error",
        "Dashboard belum dapat disiapkan. Silakan muat ulang halaman."
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ==========================================================
     14. MEMBERSIHKAN TIMER
  ========================================================== */

  function destroy() {
    stopCarousel();

    state.carouselPaused = false;
    state.initialized = false;

    dispatch("tarbiyah:dashboard-destroy", {});
  }

  /* ==========================================================
     15. API PUBLIK
  ========================================================== */

  const API = {
    version: VERSION,

    state,

    initialize,
    refresh,
    destroy,

    registerProvider,
    loadProvider,

    registerRefreshHandler,

    renderIdentity,
    renderStats,
    renderNotificationCount,

    setStatus,
    clearStatus,

    nextSlide,
    previousSlide,
    goToSlide,
    startCarousel,
    stopCarousel,

    getGreeting,
    formatDate
  };

  window.TARBIYAH_DASHBOARD = API;

  /* ==========================================================
     16. AUTO START
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
    `[TARBIYAH DASHBOARD] Aktif — v${VERSION}`
  );

})(window, document);
