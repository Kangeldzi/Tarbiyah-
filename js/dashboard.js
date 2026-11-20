/* ============================================================
   TARBIYAH — DASHBOARD CONTROLLER
   File    : js/dashboard.js
   Versi   : 2.0.0

   Tanggung jawab:
   - Carousel dashboard
   - Pencarian menu
   - Session Supabase
   - Pembacaan role dari user_roles -> roles(name)
   - Identitas pengguna
   - Penyaringan menu berdasarkan role
   - Tombol logout
   - Tanggal dan tahun

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
============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_DASHBOARD_V2__) {
    console.info(
      "[TARBIYAH DASHBOARD] Sudah diinisialisasi."
    );
    return;
  }

  window.__TARBIYAH_DASHBOARD_V2__ = true;

  const VERSION = "2.0.0";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const byId = id =>
    document.getElementById(id);

  const CONFIG = {
    loginPage:
      window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
      "./login-register.html",

    dashboardPage:
      window.TARBIYAH_CONFIG?.DASHBOARD_PAGE ||
      "./dashboard.html",

    roleTable: "user_roles",
    roleRelation: "roles",
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
     01. NOTIFICATION / TOAST
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
     02. DATE AND TIME
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

    [
      "currentYear",
      "footerYear"
    ].forEach(id => {
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
     03. CAROUSEL
  ========================================================== */

  function getCarouselElements() {
    const container =
      $("[data-dashboard-carousel]") ||
      $(".dashboard-carousel");

    const track =
      $("[data-carousel-track]", container || document) ||
      $(".dashboard-carousel-track", container || document);

    const slides = track
      ? Array.from(track.children).filter(element =>
          element.classList.contains("dashboard-slide") ||
          element.matches("[data-carousel-slide]")
        )
      : [];

    const previousButton =
      $("[data-carousel-prev]", container || document);

    const nextButton =
      $("[data-carousel-next]", container || document);

    const dots = $$(
      "[data-carousel-dot], .dashboard-carousel-dots button",
      container || document
    );

    return {
      container,
      track,
      slides,
      previousButton,
      nextButton,
      dots
    };
  }

  function showCarouselSlide(index) {
    const carousel = getCarouselElements();

    if (
      !carousel.track ||
      carousel.slides.length === 0
    ) {
      return;
    }

    const total = carousel.slides.length;

    state.carouselIndex =
      (index + total) % total;

    carousel.track.style.transform =
      `translateX(-${state.carouselIndex * 100}%)`;

    carousel.slides.forEach((slide, slideIndex) => {
      const active =
        slideIndex === state.carouselIndex;

      slide.setAttribute(
        "aria-hidden",
        String(!active)
      );
    });

    carousel.dots.forEach((dot, dotIndex) => {
      const active =
        dotIndex === state.carouselIndex;

      dot.classList.toggle("active", active);

      dot.setAttribute(
        "aria-current",
        active ? "true" : "false"
      );
    });

    const counter =
      byId("slideCounter") ||
      $("[data-carousel-counter]");

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

    if (carousel.slides.length <= 1) return;

    stopCarousel();

    state.carouselTimer = window.setInterval(() => {
      showCarouselSlide(state.carouselIndex + 1);
    }, CONFIG.carouselInterval);
  }

  function initializeCarousel() {
    const carousel = getCarouselElements();

    if (
      !carousel.track ||
      carousel.slides.length === 0
    ) {
      return;
    }

    carousel.previousButton?.addEventListener(
      "click",
      () => {
        showCarouselSlide(state.carouselIndex - 1);
        startCarousel();
      }
    );

    carousel.nextButton?.addEventListener(
      "click",
      () => {
        showCarouselSlide(state.carouselIndex + 1);
        startCarousel();
      }
    );

    carousel.dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        showCarouselSlide(index);
        startCarousel();
      });
    });

    carousel.container?.addEventListener(
      "mouseenter",
      stopCarousel
    );

    carousel.container?.addEventListener(
      "mouseleave",
      startCarousel
    );

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

    showCarouselSlide(0);
    startCarousel();
  }

  /* ==========================================================
     04. SEARCH ROUTES
  ========================================================== */

  const SEARCH_ROUTES = [
    {
      keywords: ["dashboard", "beranda", "home"],
      url: "./dashboard.html",
      roles: ["super_admin", "admin", "mentor", "member", "registered_user"]
    },
    {
      keywords: ["profil", "biodata", "akun saya"],
      url: "./profil-anggota.html",
      roles: ["super_admin", "admin", "mentor", "member", "registered_user"]
    },
    {
  keywords: ["anggota binaan", "binaan"],
  url: "./anggota-binaan.html",
  roles: ["super_admin", "admin", "mentor"]
},
    {
      keywords: ["pembinaan", "catatan pembinaan"],
      module: "pembinaan",
      roles: ["super_admin", "admin", "mentor"]
    },
    {
      keywords: ["agenda", "jadwal", "kegiatan"],
      url: "./agenda-tarbiyah.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["pembelajaran", "belajar"],
      url: "./pembelajaran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["materi", "materi kajian"],
      url: "./materi-pembelajaran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["kajian", "riwayat kajian"],
      url: "./pembelajaran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["presensi", "absensi"],
      url: "./presensi-tarbiyah.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["kehadiran", "riwayat kehadiran"],
      url: "./kehadiran.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["berita", "pengumuman"],
      url: "./berita-pengumuman.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["galeri", "dokumentasi", "foto", "video"],
      url: "./galeri-foto-video.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["diskusi"],
      url: "./diskusi-tarbiyah.html",
      roles: ["super_admin", "admin", "member"]
    },
    {
      keywords: ["donasi", "infaq"],
      url: "./donasi-infaq.html",
      roles: ["super_admin", "admin", "member"]
    },
    {
      keywords: ["notifikasi"],
      url: "./notifikasi.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    },
    {
      keywords: ["administrasi", "dashboard admin"],
      url: "./dashboard-admin.html",
      roles: ["super_admin", "admin"]
    },
    {
      keywords: ["pengaturan akun", "pengaturan"],
      url: "./administrasi-pengaturan.html",
      roles: ["super_admin", "admin", "mentor", "member"]
    }
  ];

  function initializeSearch() {
    const form =
      byId("searchForm") ||
      $("[data-dashboard-search-form]");

    const input =
      byId("globalSearch") ||
      $("[data-dashboard-search]");

    if (!form || !input) return;

    form.addEventListener("submit", event => {
      event.preventDefault();

      const query = String(input.value || "")
        .trim()
        .toLowerCase();

      if (!query) return;

      if (!state.roleReady || !state.primaryRole) {
        toast(
          "Role akun belum berhasil diverifikasi. Silakan tunggu atau muat ulang halaman.",
          "warning"
        );
        return;
      }

      const found = SEARCH_ROUTES.find(route =>
        route.keywords.some(keyword =>
          query.includes(keyword)
        )
      );

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
  }

  /* ==========================================================
     05. SUPABASE CLIENT
  ========================================================== */

  function getSupabaseClient() {
    const client = window.tarbiyahSupabase;

    if (!client) {
      throw new Error(
        "Supabase client belum tersedia. Periksa js/config.js dan js/supabase-client.js."
      );
    }

    if (
      window.TARBIYAH_BACKEND_READY === false
    ) {
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
     06. AUTH SESSION
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
      const guardedSession =
        guarded.session ||
        (guarded.user ? { user: guarded.user } : null);

      return guardedSession;
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
     07. ROLE CONFIGURATION
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
    Daftar menu ini digunakan untuk mengatur tampilan navigasi.
    Pemeriksaan keamanan sebenarnya tetap dilakukan di halaman
    tujuan dan oleh Supabase RLS.
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
      "kehadiran",
      "riwayat",
      "kajian",
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
      "kehadiran",
      "riwayat",
      "kajian",
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
      "kehadiran",
      "riwayat",
      "kajian",
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
     08. FETCH ROLE DARI SUPABASE
  ========================================================== */

  async function fetchUserRoles(userId) {
    if (!userId) {
      throw new Error(
        "ID pengguna tidak tersedia."
      );
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(CONFIG.roleTable)
      .select("role_id, roles(name)")
      .eq(CONFIG.roleUserColumn, userId);

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

        return normalizeRole(
          roleRecord?.name
        );
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
     09. USER IDENTITY
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

  function getInitials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase() || "T";
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

  // Nama pengguna pada Header dan Sidebar.
  setTextForSelectors(
    [
      "#userName",
      "#sidebarName",
      "[data-user-name]",
      "[data-sidebar-user-name]"
    ],
    name
  );

  // Nama pada sapaan Dashboard.
  const welcome = byId("welcomeTitle");

  if (welcome) {
    welcome.textContent = `Assalamu’alaikum, ${name}`;
  }

  const greeting = $("[data-greeting-name]");

  if (greeting) {
    greeting.textContent = name;
  }

  // Email pengguna.
  const emailElements = $$(
    "[data-user-email], #userEmail"
  );

  emailElements.forEach(element => {
    element.textContent = user.email || "";
  });

  // PENTING:
  // Jangan mengubah isi elemen avatar di sini.
  // Foto profil sepenuhnya ditangani oleh
  // dashboard-profile-avatar.js.

  document.body.classList.remove("auth-pending");

  return name;
}

  /* ==========================================================
     10. MENU ACCESS
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
      .split("/")
      .pop()
      .toLowerCase();

    const routeMap = {
      "dashboard.html": "dashboard",
      "tarbiyah.html": "dashboard",
      "profil-anggota.html": "profil",
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
    const allowed =
      ROLE_MENU_ACCESS[role] || [];

    return allowed.includes(menuKey);
  }

  function applyRoleMenuAccess(role) {
    const menuElements = $$(
      "[data-nav-link], [data-module], [data-nav-key], [data-menu]"
    );

    menuElements.forEach(element => {
      const key = getNavigationKey(element);

      // Elemen yang tidak dapat dikenali tidak diubah.
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

    // Tautan dan banner administrasi.
    const isAdmin =
      role === "admin" ||
      role === "super_admin";

    const adminElements = [
      byId("adminLink"),
      byId("adminBanner")
    ].filter(Boolean);

    adminElements.forEach(element => {
      element.hidden = !isAdmin;
    });

    // Elemen yang secara eksplisit ditandai admin-only.
    $$("[data-admin-only]").forEach(element => {
      element.hidden = !isAdmin;
    });

    // Elemen khusus Super Admin.
    $$("[data-super-admin-only]").forEach(element => {
      element.hidden = role !== "super_admin";
    });
  }

  /* ==========================================================
     11. RENDER ROLE
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

    const roleBadges = $$("[data-role-label]");

    roleBadges.forEach(element => {
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

    document.dispatchEvent(
      new CustomEvent("tarbiyah:role-ready", {
        detail: roleState
      })
    );

    window.dispatchEvent(
      new CustomEvent("tarbiyah:role-ready", {
        detail: roleState
      })
    );

    return roleState;
  }

  /* ==========================================================
     12. LOAD USER AND ROLE
  ========================================================== */

  async function hydrateUser() {
    // Status aman sebelum role selesai dibaca.
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

    const primaryRole =
      selectPrimaryRole(roles);

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
     13. LOGOUT
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
      button.dataset.originalText =
        button.textContent;

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
      button.addEventListener("click", event => {
        event.preventDefault();
        logout(button);
      });
    });
  }

  /* ==========================================================
     14. DASHBOARD ROLE INFORMATION
  ========================================================== */

  function initializeRoleDashboard() {
    document.addEventListener(
      "tarbiyah:role-ready",
      event => {
        const role = event.detail?.name;

        if (role === "mentor") {
          document.body.dataset.dashboardRole = "mentor";

          const heading = $(
            "[data-dashboard-heading]"
          );

          if (heading) {
            heading.textContent =
              "Dashboard Pembinaan dan Pendampingan Anggota";
          }

          const welcomeDescription = $(
            "[data-dashboard-description]"
          );

          if (welcomeDescription) {
            welcomeDescription.textContent =
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
     15. INITIALIZATION
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
     16. PUBLIC API
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
