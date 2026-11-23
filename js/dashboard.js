
/* ============================================================
   TARBIYAH — DASHBOARD CONTROLLER
   File    : js/dashboard.js
   Versi   : 2.1.0

   Fitur:
   - Carousel dashboard
   - Pencarian menu dan navigasi
   - Session Supabase
   - Pembacaan role dari user_roles -> roles(name)
   - Identitas pengguna
   - Penyaringan menu berdasarkan role
   - Tombol logout
   - Tanggal dan tahun WIB
   - Informasi dashboard berdasarkan role

   Role:
   - super_admin
   - admin
   - mentor
   - member
   - registered_user

   Supabase client:
   window.tarbiyahSupabase

   Tidak mengubah:
   - Database
   - RLS
   - Role assignment
   - Mentor assignment
   - Sistem foto profil
============================================================ */

(() => {
  "use strict";

  /* ==========================================================
     00. PENCEGAHAN INISIALISASI GANDA
  ========================================================== */

  if (window.__TARBIYAH_DASHBOARD_V21__) {
    console.info("[TARBIYAH DASHBOARD] Sudah aktif.");
    return;
  }

  window.__TARBIYAH_DASHBOARD_V21__ = true;

  const VERSION = "2.1.0";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const byId = id => document.getElementById(id);

  /* ==========================================================
     01. KONFIGURASI
  ========================================================== */

  const CONFIG = {
    loginPage:
      window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
      "./login-register.html",

    dashboardPage:
      window.TARBIYAH_CONFIG?.DASHBOARD_PAGE ||
      "./dashboard.html",

    roleTable: "user_roles",
    roleUserColumn: "user_id",

    timezone: "Asia/Jakarta",

    carouselInterval: 6500
  };

  const state = {
    initialized: false,

    session: null,
    user: null,

    roles: [],
    primaryRole: null,
    roleReady: false,

    carouselIndex: 0,
    carouselTimer: null,

    isLoggingOut: false
  };

  /* ==========================================================
     02. NOTIFIKASI
  ========================================================== */

  function toast(message, type = "info") {
    const region =
      byId("toastRegion") ||
      byId("toastContainer") ||
      $("[data-toast-region]");

    if (region) {
      const item = document.createElement("div");

      item.className = "toast";
      item.dataset.type = type;
      item.setAttribute("role", "status");
      item.textContent = String(message);

      region.appendChild(item);

      window.setTimeout(() => {
        item.remove();
      }, 4000);

      return;
    }

    if (typeof window.TARBIYAH_NOTIFY === "function") {
      window.TARBIYAH_NOTIFY(message, type);
      return;
    }

    console.info("[TARBIYAH]", message);
  }

  /* ==========================================================
     03. TANGGAL DAN TAHUN
  ========================================================== */

  function updateDateInformation() {
    const now = new Date();

    const dateText = new Intl.DateTimeFormat("id-ID", {
      timeZone: CONFIG.timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);

    const todayLabel =
      byId("todayLabel") ||
      $("[data-dashboard-date]") ||
      $("[data-today-label]");

    if (todayLabel) {
      todayLabel.textContent = dateText.toUpperCase();
    }

    const year = new Intl.DateTimeFormat("id-ID", {
      timeZone: CONFIG.timezone,
      year: "numeric"
    }).format(now);

    ["currentYear", "footerYear"].forEach(id => {
      const element = byId(id);

      if (element) {
        element.textContent = year;
      }
    });

    $$("[data-dashboard-year]").forEach(element => {
      element.textContent = year;
    });
  }

  /* ==========================================================
     04. CAROUSEL DASHBOARD
  ========================================================== */

  function getCarouselElements() {
    const container =
      $(".hero-carousel") ||
      $("[data-dashboard-carousel]") ||
      $(".dashboard-carousel");

    if (!container) {
      return {
        container: null,
        slides: [],
        previousButton: null,
        nextButton: null,
        dots: []
      };
    }

    const slides = Array.from(
      container.querySelectorAll(
        ".hero-slide, .dashboard-slide, [data-carousel-slide]"
      )
    );

    return {
      container,

      slides,

      previousButton:
        $("[data-carousel-prev]", container),

      nextButton:
        $("[data-carousel-next]", container),

      dots: $$(".carousel-dot, [data-carousel-dot]", container)
    };
  }

  function showCarouselSlide(index) {
    const carousel = getCarouselElements();

    if (!carousel.container || !carousel.slides.length) {
      return;
    }

    const total = carousel.slides.length;

    state.carouselIndex =
      (index + total) % total;

    carousel.slides.forEach((slide, slideIndex) => {
      const active = slideIndex === state.carouselIndex;

      slide.classList.toggle("active", active);

      slide.setAttribute(
        "aria-hidden",
        String(!active)
      );
    });

    carousel.dots.forEach((dot, dotIndex) => {
      const active = dotIndex === state.carouselIndex;

      dot.classList.toggle("active", active);

      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });

    const counter =
      byId("slideCounter") ||
      $("[data-carousel-counter]", carousel.container);

    if (counter) {
      counter.textContent =
        `${String(state.carouselIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    }
  }

  function stopCarousel() {
    if (state.carouselTimer !== null) {
      window.clearInterval(state.carouselTimer);
      state.carouselTimer = null;
    }
  }

  function startCarousel() {
    const carousel = getCarouselElements();

    stopCarousel();

    if (carousel.slides.length <= 1) {
      return;
    }

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    state.carouselTimer = window.setInterval(() => {
      showCarouselSlide(state.carouselIndex + 1);
    }, CONFIG.carouselInterval);
  }

  function initializeCarousel() {
    const carousel = getCarouselElements();

    if (!carousel.container || !carousel.slides.length) {
      console.info(
        "[TARBIYAH CAROUSEL] Tidak ada carousel pada halaman ini."
      );
      return;
    }

    if (
      carousel.container.dataset.carouselInitialized === "true"
    ) {
      return;
    }

    carousel.container.dataset.carouselInitialized = "true";

    carousel.previousButton?.addEventListener("click", () => {
      showCarouselSlide(state.carouselIndex - 1);
      startCarousel();
    });

    carousel.nextButton?.addEventListener("click", () => {
      showCarouselSlide(state.carouselIndex + 1);
      startCarousel();
    });

    carousel.dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        showCarouselSlide(index);
        startCarousel();
      });
    });

    carousel.container.addEventListener(
      "mouseenter",
      stopCarousel
    );

    carousel.container.addEventListener(
      "mouseleave",
      startCarousel
    );

    carousel.container.addEventListener(
      "focusin",
      stopCarousel
    );

    carousel.container.addEventListener(
      "focusout",
      startCarousel
    );

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCarousel();
      } else {
        startCarousel();
      }
    });

    showCarouselSlide(0);
    startCarousel();

    console.info(
      `[TARBIYAH CAROUSEL] ${carousel.slides.length} slide aktif.`
    );
  }

  /* ==========================================================
     05. KONFIGURASI ROLE
  ========================================================== */

  const ROLE_INFO = {
    super_admin: {
      label: "SUPER ADMIN",
      description: "Super Administrator",
      isAdmin: true,
      isSuperAdmin: true
    },

    admin: {
      label: "ADMIN",
      description: "Administrator TARBIYAH",
      isAdmin: true,
      isSuperAdmin: false
    },

    mentor: {
      label: "MENTOR",
      description: "Pembina Anggota TARBIYAH",
      isAdmin: false,
      isSuperAdmin: false
    },

    member: {
      label: "ANGGOTA",
      description: "Anggota TARBIYAH",
      isAdmin: false,
      isSuperAdmin: false
    },

    registered_user: {
      label: "PENGGUNA TERDAFTAR",
      description: "Pengguna Terdaftar",
      isAdmin: false,
      isSuperAdmin: false
    }
  };

  const ROLE_PRIORITY = [
    "super_admin",
    "admin",
    "mentor",
    "member",
    "registered_user"
  ];

  /*
    Pengaturan ini mengendalikan tampilan menu.

    Ini bukan pengganti keamanan backend.
    Halaman tujuan dan Supabase RLS tetap wajib
    melakukan pemeriksaan kewenangan.
  */

  const ROLE_MENU_ACCESS = {
    super_admin: [
      "dashboard",
      "profil",
      "anggota",
      "anggota-binaan",
      "pembinaan",
      "catatan",
      "presensi",
      "presensi-mentor",
      "kehadiran",
      "riwayat",
      "kajian",
      "agenda-kajian-manage",
      "pembelajaran",
      "materi",
      "agenda",
      "berita",
      "galeri",
      "diskusi",
      "donasi",
      "notifikasi",
      "administrasi",
      "pengaturan",
      "logout"
    ],

    admin: [
      "dashboard",
      "profil",
      "anggota",
      "anggota-binaan",
      "pembinaan",
      "catatan",
      "presensi",
      "presensi-mentor",
      "kehadiran",
      "riwayat",
      "kajian",
      "agenda-kajian-manage",
      "pembelajaran",
      "materi",
      "agenda",
      "berita",
      "galeri",
      "diskusi",
      "donasi",
      "notifikasi",
      "administrasi",
      "pengaturan",
      "logout"
    ],

    mentor: [
      "dashboard",
      "profil",
      "anggota-binaan",
      "pembinaan",
      "catatan",
      "presensi",
      "presensi-mentor",
      "kehadiran",
      "riwayat",
      "kajian",
      "agenda-kajian-manage",
      "pembelajaran",
      "materi",
      "agenda",
      "berita",
      "galeri",
      "notifikasi",
      "pengaturan",
      "logout"
    ],

    member: [
      "dashboard",
      "profil",
      "pembelajaran",
      "materi",
      "kajian",
      "agenda",
      "berita",
      "galeri",
      "diskusi",
      "donasi",
      "presensi",
      "kehadiran",
      "riwayat",
      "notifikasi",
      "pengaturan",
      "logout"
    ],

    registered_user: [
      "dashboard",
      "profil",
      "pengaturan",
      "logout"
    ]
  };

  function normalizeRole(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function selectPrimaryRole(roles) {
    return ROLE_PRIORITY.find(role =>
      roles.includes(role)
    ) || null;
  }

  /* ==========================================================
     06. SUPABASE CLIENT
  ========================================================== */

  function getSupabaseClient() {
    const client = window.tarbiyahSupabase;

    if (!client) {
      throw new Error(
        "Supabase client belum tersedia. Periksa js/config.js dan js/supabase-client.js."
      );
    }

    if (window.TARBIYAH_BACKEND_READY === false) {
      throw new Error(
        "Backend TARBIYAH belum siap. Periksa konfigurasi Supabase."
      );
    }

    if (
      typeof client.from !== "function" ||
      !client.auth
    ) {
      throw new Error(
        "Supabase client belum siap digunakan."
      );
    }

    return client;
  }

  /* ==========================================================
     07. SESSION AUTHENTICATION
  ========================================================== */

  function extractSession(result) {
    if (!result) return null;

    if (result.session) {
      return result.session;
    }

    if (result.data?.session) {
      return result.data.session;
    }

    if (result.data?.user) {
      return result.data;
    }

    if (result.user) {
      return result;
    }

    return null;
  }

  async function resolveSession() {
    const guarded = window.TARBIYAH_SESSION;

    if (guarded?.ready === true) {
      return (
        guarded.session ||
        (guarded.user
          ? { user: guarded.user }
          : null)
      );
    }

    const authAPI = window.TARBIYAH_AUTH;

    if (typeof authAPI?.getSession === "function") {
      const result = await authAPI.getSession();

      if (result?.configured === false) {
        throw new Error(
          "Backend Supabase belum dikonfigurasi."
        );
      }

      if (result?.error) {
        throw result.error;
      }

      return extractSession(result);
    }

    const client = getSupabaseClient();

    const { data, error } =
      await client.auth.getSession();

    if (error) throw error;

    return data?.session || null;
  }

  /* ==========================================================
     08. MEMBACA ROLE DARI DATABASE
  ========================================================== */

  async function fetchUserRoles(userId) {
    if (!userId) {
      throw new Error(
        "ID pengguna tidak tersedia."
      );
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", userId);

    if (error) throw error;

    if (!Array.isArray(data)) {
      return [];
    }

    const roles = data
      .map(row => {
        const relation = row.roles;

        const roleRecord = Array.isArray(relation)
          ? relation[0]
          : relation;

        return normalizeRole(roleRecord?.name);
      })
      .filter(role =>
        Object.prototype.hasOwnProperty.call(
          ROLE_INFO,
          role
        )
      );

    return [...new Set(roles)];
  }

  /* ==========================================================
     09. IDENTITAS PENGGUNA
  ========================================================== */

  function getUserDisplayName(user) {
    const metadata = user?.user_metadata || {};

    return (
      metadata.full_name ||
      metadata.display_name ||
      metadata.name ||
      user?.email?.split("@")[0] ||
      "Pengguna TARBIYAH"
    );
  }

  function setTextForSelectors(selectors, value) {
    selectors.forEach(selector => {
      $$(selector).forEach(element => {
        element.textContent = value;
      });
    });
  }

  function renderUserIdentity(user) {
    const name = getUserDisplayName(user);

    setTextForSelectors(
      [
        "#userName",
        "#sidebarName",
        "[data-user-name]",
        "[data-sidebar-user-name]"
      ],
      name
    );

    const welcome = byId("welcomeTitle");

    if (welcome) {
      welcome.textContent =
        `Assalamu’alaikum, ${name}`;
    }

    const greeting = $("[data-greeting-name]");

    if (greeting) {
      greeting.textContent = name;
    }

    $$("[data-user-email], #userEmail").forEach(element => {
      element.textContent = user.email || "";
    });

    /*
      Foto profil tidak disentuh oleh file ini.
      Pengelola avatar tetap dashboard-profile-avatar.js.
    */

    document.body.classList.remove("auth-pending");

    return name;
  }

  /* ==========================================================
     10. PEMETAAN NAVIGASI
  ========================================================== */

  function getNavigationKey(element) {
    const directKey =
      element.dataset.navKey ||
      element.dataset.navLink ||
      element.dataset.module ||
      element.dataset.menu;

    if (directKey) {
      return normalizeRole(directKey);
    }

    const href = element.getAttribute("href") || "";

    const file = href
      .split("?")[0]
      .split("#")[0]
      .split("/")
      .pop()
      .toLowerCase();

    const routeMap = {
      "dashboard.html": "dashboard",
      "tarbiyah.html": "dashboard",

      "profil-anggota.html": "profil",

      "anggota.html": "anggota",
      "anggota-binaan.html": "anggota-binaan",

      "agenda-kajian.html": "agenda-kajian-manage",
      "agenda-tarbiyah.html": "agenda",

      "pembelajaran.html": "pembelajaran",
      "materi-pembelajaran.html": "materi",

      "berita-pengumuman.html": "berita",
      "galeri-foto-video.html": "galeri",
      "diskusi-tarbiyah.html": "diskusi",
      "donasi-infaq.html": "donasi",

      "presensi-tarbiyah.html": "presensi",
      "presensi-mentor.html": "presensi-mentor",
      "kehadiran.html": "kehadiran",

      "catatan-refleksi.html": "catatan",
      "riwayat-aktivitas.html": "riwayat",

      "notifikasi.html": "notifikasi",
      "dashboard-admin.html": "administrasi",
      "administrasi-pengaturan.html": "pengaturan"
    };

    return routeMap[file] || "";
  }

  function canShowMenu(role, menuKey) {
    const allowed = ROLE_MENU_ACCESS[role] || [];

    return allowed.includes(menuKey);
  }

  /* ==========================================================
     11. FILTER MENU BERDASARKAN ROLE
  ========================================================== */

  function applyRoleMenuAccess(role) {
    const menuElements = $$(
      "[data-nav-link], [data-module], [data-nav-key], [data-menu]"
    );

    menuElements.forEach(element => {
      const key = getNavigationKey(element);

      if (!key) return;

      const visible = canShowMenu(role, key);

      element.hidden = !visible;

      element.setAttribute(
        "aria-hidden",
        String(!visible)
      );

      if (visible) {
        element.removeAttribute("inert");
      } else {
        element.setAttribute("inert", "");
      }
    });

    const isAdmin =
      role === "admin" ||
      role === "super_admin";

    [
      byId("adminLink"),
      byId("adminBanner")
    ]
      .filter(Boolean)
      .forEach(element => {
        element.hidden = !isAdmin;
      });

    $$("[data-admin-only]").forEach(element => {
      element.hidden = !isAdmin;
    });

    $$("[data-super-admin-only]").forEach(element => {
      element.hidden = role !== "super_admin";
    });
  }

  /* ==========================================================
     12. RENDER ROLE PENGGUNA
  ========================================================== */

  function renderUserRole(role) {
    const info = ROLE_INFO[role] || null;

    state.primaryRole = info ? role : null;
    state.roleReady = Boolean(info);

    const roleLabel =
      info?.label || "ROLE BELUM DITETAPKAN";

    const roleDescription =
      info?.description || "Role belum ditetapkan";

    const rolePill = byId("rolePill");

    if (rolePill) {
      rolePill.textContent = roleLabel;
    }

    const sidebarRole =
      byId("sidebarRole") ||
      $("[data-sidebar-user-role]");

    if (sidebarRole) {
      sidebarRole.textContent = roleDescription;
    }

    $$("[data-role-label]").forEach(element => {
      element.textContent = roleLabel;
    });

    applyRoleMenuAccess(state.primaryRole);

    const roleState = {
      ready: state.roleReady,
      name: state.primaryRole,

      label: roleLabel,
      description: roleDescription,

      isAdmin: Boolean(info?.isAdmin),
      isSuperAdmin: Boolean(info?.isSuperAdmin),

      isMentor: role === "mentor",
      isMember: role === "member"
    };

    window.TARBIYAH_USER_ROLE = roleState;

    const event = new CustomEvent(
      "tarbiyah:role-ready",
      { detail: roleState }
    );

    document.dispatchEvent(event);

    window.dispatchEvent(
      new CustomEvent("tarbiyah:role-ready", {
        detail: roleState
      })
    );

    return roleState;
  }

  /* ==========================================================
     13. MEMUAT IDENTITAS DAN ROLE
  ========================================================== */

  async function hydrateUser() {
    renderUserRole(null);

    const session = await resolveSession();

    if (!session?.user?.id) {
      throw new Error(
        "Sesi pengguna tidak ditemukan. Silakan masuk kembali."
      );
    }

    state.session = session;
    state.user = session.user;

    renderUserIdentity(session.user);

    const roles = await fetchUserRoles(
      session.user.id
    );

    state.roles = roles;

    const primaryRole = selectPrimaryRole(roles);

    if (!primaryRole) {
      renderUserRole(null);

      console.warn(
        "[TARBIYAH] Role pengguna belum ditetapkan atau tidak dikenali."
      );

      toast(
        "Role akun belum ditetapkan. Hubungi administrator TARBIYAH.",
        "warning"
      );

      return;
    }

    renderUserRole(primaryRole);

    console.info(
      "[TARBIYAH] Identitas pengguna berhasil dimuat.",
      {
        userId: session.user.id,
        role: primaryRole
      }
    );
  }

  /* ==========================================================
     14. PENCARIAN MENU
  ========================================================== */

  /*
    Urutan pencarian dibuat spesifik terlebih dahulu.

    Contoh:
    "Agenda Kajian" harus membuka agenda-kajian.html,
    bukan agenda-tarbiyah.html.

    Setiap route wajib memiliki daftar role.
  */

  const SEARCH_ROUTES = [
    {
      keywords: [
        "kelola agenda kajian",
        "buat agenda kajian",
        "agenda kajian",
        "kelola kajian",
        "arsip kajian"
      ],
      url: "./agenda-kajian.html",
      roles: ["super_admin", "admin", "mentor"]
    },

    {
      keywords: [
        "anggota binaan",
        "data binaan"
      ],
      url: "./anggota-binaan.html",
      roles: ["super_admin", "admin", "mentor"]
    },

    {
      keywords: [
        "dashboard admin",
        "panel administrasi",
        "administrasi"
      ],
      url: "./dashboard-admin.html",
      roles: ["super_admin", "admin"]
    },

    {
      keywords: [
        "agenda tarbiyah",
        "jadwal kegiatan",
        "agenda kegiatan",
        "agenda",
        "jadwal"
      ],
      url: "./agenda-tarbiyah.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "dashboard",
        "beranda",
        "home"
      ],
      url: "./dashboard.html",
      roles: [
        "super_admin",
        "admin",
        "mentor",
        "member",
        "registered_user"
      ]
    },

    {
      keywords: [
        "profil anggota",
        "profil",
        "biodata",
        "akun saya"
      ],
      url: "./profil-anggota.html",
      roles: [
        "super_admin",
        "admin",
        "mentor",
        "member",
        "registered_user"
      ]
    },

    {
      keywords: [
        "pembinaan",
        "catatan pembinaan"
      ],
      module: "pembinaan",
      roles: ["super_admin", "admin", "mentor"]
    },

    {
      keywords: [
        "pembelajaran",
        "belajar"
      ],
      url: "./pembelajaran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "materi pembelajaran",
        "materi kajian",
        "materi"
      ],
      url: "./materi-pembelajaran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "riwayat kajian",
        "kajian"
      ],
      url: "./pembelajaran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "presensi",
        "absensi"
      ],
      url: "./presensi-tarbiyah.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "riwayat kehadiran",
        "kehadiran"
      ],
      url: "./kehadiran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "berita",
        "pengumuman"
      ],
      url: "./berita-pengumuman.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "galeri",
        "dokumentasi",
        "foto",
        "video"
      ],
      url: "./galeri-foto-video.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "diskusi",
        "forum"
      ],
      url: "./diskusi-tarbiyah.html",
      roles: ["super_admin", "admin", "member"]
    },

    {
      keywords: [
        "donasi",
        "infaq"
      ],
      url: "./donasi-infaq.html",
      roles: ["super_admin", "admin", "member"]
    },

    {
      keywords: [
        "notifikasi",
        "pemberitahuan"
      ],
      url: "./notifikasi.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },

    {
      keywords: [
        "pengaturan akun",
        "pengaturan"
      ],
      url: "./administrasi-pengaturan.html",
      roles: [
        "super_admin",
        "admin",
        "mentor",
        "member",
        "registered_user"
      ]
    }
  ];

  function findSearchRoute(query) {
    const normalizedQuery = String(query || "")
      .trim()
      .toLowerCase();

    /*
      Kata kunci yang lebih panjang diperiksa terlebih dahulu.
      Ini mencegah "agenda" mengambil alih "agenda kajian".
    */

    const sortedRoutes = SEARCH_ROUTES
      .map(route => ({
        ...route,
        keywords: [...route.keywords].sort(
          (a, b) => b.length - a.length
        )
      }))
      .sort((a, b) => {
        const longestA = Math.max(
          ...a.keywords.map(keyword => keyword.length)
        );

        const longestB = Math.max(
          ...b.keywords.map(keyword => keyword.length)
        );

        return longestB - longestA;
      });

    return sortedRoutes.find(route =>
      route.keywords.some(keyword =>
        normalizedQuery.includes(keyword)
      )
    ) || null;
  }

  function initializeSearch() {
    const form =
      byId("searchForm") ||
      $("[data-dashboard-search-form]");

    const input =
      byId("globalSearch") ||
      $("[data-dashboard-search]");

    if (!form || !input) {
      console.info(
        "[TARBIYAH SEARCH] Form pencarian tidak ditemukan."
      );
      return;
    }

    if (form.dataset.searchInitialized === "true") {
      return;
    }

    form.dataset.searchInitialized = "true";

    form.addEventListener("submit", event => {
      event.preventDefault();

      const query = String(input.value || "").trim();

      if (!query) return;

      if (!state.roleReady || !state.primaryRole) {
        toast(
          "Role akun belum berhasil diverifikasi. Silakan tunggu atau muat ulang halaman.",
          "warning"
        );
        return;
      }

      const found = findSearchRoute(query);

      if (!found) {
        toast(
          "Menu belum ditemukan. Coba kata kunci lain.",
          "info"
        );
        return;
      }

      if (!found.roles.includes(state.primaryRole)) {
        toast(
          "Akun Anda belum memiliki izin untuk membuka menu tersebut.",
          "error"
        );
        return;
      }

      if (found.url) {
        window.location.href = found.url;
        return;
      }

      if (found.module) {
        const moduleAPI = window.TARBIYAH_MODULE;

        if (
          moduleAPI &&
          typeof moduleAPI.navigate === "function"
        ) {
          moduleAPI.navigate(found.module);
        } else {
          toast(
            "Halaman modul tersebut belum terhubung.",
            "warning"
          );
        }
      }
    });

    document.addEventListener("keydown", event => {
      const activeTag =
        document.activeElement?.tagName;

      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag) ||
        document.activeElement?.isContentEditable;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.focus();
      }
    });

    console.info("[TARBIYAH SEARCH] Siap digunakan.");
  }

  /* ==========================================================
     15. LOGOUT
  ========================================================== */

  async function logout(button) {
    if (state.isLoggingOut) return;

    state.isLoggingOut = true;

    const logoutButtons = $$(
      "[data-logout], #logoutMini, #logoutBtn, #btnLogout"
    );

    logoutButtons.forEach(element => {
      element.disabled = true;
      element.setAttribute("aria-busy", "true");
    });

    if (button) {
      button.dataset.originalText = button.textContent;
      button.textContent = "Memproses...";
    }

    try {
      const authAPI = window.TARBIYAH_AUTH;

      if (typeof authAPI?.signOut === "function") {
        const result = await authAPI.signOut();

        if (result?.error) {
          throw result.error;
        }
      } else {
        const supabase = getSupabaseClient();

        const { error } =
          await supabase.auth.signOut();

        if (error) throw error;
      }

      window.location.replace(CONFIG.loginPage);

    } catch (error) {
      console.error(
        "[TARBIYAH] Logout gagal:",
        error
      );

      toast(
        error?.message ||
        "Logout gagal. Silakan coba kembali.",
        "error"
      );

      state.isLoggingOut = false;

      logoutButtons.forEach(element => {
        element.disabled = false;
        element.removeAttribute("aria-busy");
      });

      if (button?.dataset.originalText) {
        button.textContent =
          button.dataset.originalText;
      }
    }
  }

  function initializeLogout() {
    const buttons = $$(
      "[data-logout], #logoutMini, #logoutBtn, #btnLogout"
    );

    buttons.forEach(button => {
      if (button.dataset.logoutInitialized === "true") {
        return;
      }

      button.dataset.logoutInitialized = "true";

      button.addEventListener("click", event => {
        event.preventDefault();
        logout(button);
      });
    });
  }

  /* ==========================================================
     16. DASHBOARD BERDASARKAN ROLE
  ========================================================== */

  function initializeRoleDashboard() {
    document.addEventListener(
      "tarbiyah:role-ready",
      event => {
        const role = event.detail?.name;

        if (role === "mentor") {
          document.body.dataset.dashboardRole = "mentor";

          const heading = $("[data-dashboard-heading]");

          if (heading) {
            heading.textContent =
              "Dashboard Pembinaan dan Pendampingan Anggota";
          }

          const description =
            $("[data-dashboard-description]");

          if (description) {
            description.textContent =
              "Pantau anggota binaan, kehadiran, riwayat kajian, dan catatan pembinaan.";
          }

        } else if (role) {
          document.body.dataset.dashboardRole = role;

        } else {
          delete document.body.dataset.dashboardRole;
        }
      }
    );
  }

  /* ==========================================================
     17. INITIALIZATION
  ========================================================== */

  async function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    updateDateInformation();

    initializeCarousel();
    initializeSearch();
    initializeLogout();
    initializeRoleDashboard();

    try {
      await hydrateUser();

    } catch (error) {
      renderUserRole(null);

      console.error(
        "[TARBIYAH DASHBOARD] Gagal memuat sesi atau role:",
        error
      );

      toast(
        error?.message ||
        "Identitas pengguna belum dapat dimuat.",
        "error"
      );
    }

    console.info(
      `[TARBIYAH DASHBOARD] Versi ${VERSION} aktif.`
    );
  }

  /* ==========================================================
     18. PUBLIC API
  ========================================================== */

  window.TARBIYAH_DASHBOARD = Object.freeze({
    version: VERSION,

    initialize,

    getState() {
      return {
        user: state.user,
        roles: [...state.roles],
        primaryRole: state.primaryRole,
        roleReady: state.roleReady
      };
    },

    refreshRole: async function () {
      if (!state.user?.id) {
        throw new Error(
          "Pengguna belum tersedia."
        );
      }

      const roles = await fetchUserRoles(
        state.user.id
      );

      state.roles = roles;

      renderUserRole(
        selectPrimaryRole(roles)
      );

      return state.primaryRole;
    },

    logout
  });

  /* ==========================================================
     19. JALANKAN DASHBOARD
  ========================================================== */

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
