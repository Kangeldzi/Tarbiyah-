
/* ==========================================================
   TARBIYAH — DASHBOARD CONTROLLER
   Versi integrasi:
   - Supabase Authentication
   - User Roles dari database
   - User Identity
   - Dashboard Search
   - Responsive Carousel
   - Logout
   - Tanggal dan tahun WIB

   Sidebar dikelola oleh module-shell.js.
   Tema dikelola oleh theme-manager.js.
   ========================================================== */

(() => {
  "use strict";

  // ========================================================
  // 01. HELPER
  // ========================================================

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

  const normalize = (value) =>
    String(value || "").trim().toLowerCase();

  // ========================================================
  // 02. TOAST NOTIFICATION
  // ========================================================

  function toast(message, type = "info") {
    let region = $("#toastRegion");

    if (!region) {
      region = document.createElement("div");
      region.id = "toastRegion";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");

      Object.assign(region.style, {
        position: "fixed",
        top: "18px",
        right: "18px",
        zIndex: "99999",
        maxWidth: "min(360px, calc(100vw - 36px))"
      });

      document.body.appendChild(region);
    }

    const item = document.createElement("div");

    item.className = `toast toast-${type}`;
    item.textContent = message;

    Object.assign(item.style, {
      padding: "13px 17px",
      marginBottom: "8px",
      borderRadius: "12px",
      background: "#102a22",
      color: "#ecfdf5",
      border: "1px solid rgba(110,231,183,.35)",
      boxShadow: "0 8px 25px rgba(0,0,0,.2)",
      fontSize: "13px",
      lineHeight: "1.5"
    });

    region.appendChild(item);

    window.setTimeout(() => {
      item.remove();
    }, 3500);
  }

  // ========================================================
  // 03. TANGGAL DAN TAHUN
  // ========================================================

  function initializeDate() {
    const now = new Date();

    const dateElement = $("[data-dashboard-date]");

    if (dateElement) {
      dateElement.textContent =
        new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }).format(now);
    }

    const yearElement = $("[data-dashboard-year]");

    if (yearElement) {
      yearElement.textContent =
        new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          year: "numeric"
        }).format(now);
    }
  }

  // ========================================================
  // 04. SUPABASE CLIENT
  // ========================================================

  function getSupabaseClient() {
    const client = window.tarbiyahSupabase;

    if (!client) {
      throw new Error(
        "Supabase client TARBIYAH belum tersedia."
      );
    }

    if (
      !client.auth ||
      typeof client.from !== "function"
    ) {
      throw new Error(
        "Supabase client belum siap digunakan."
      );
    }

    if (window.TARBIYAH_BACKEND_READY === false) {
      throw new Error(
        "Backend TARBIYAH belum siap. Periksa konfigurasi Supabase."
      );
    }

    return client;
  }

  // ========================================================
  // 05. RESOLVE AUTHENTICATION SESSION
  // ========================================================

  async function resolveSession() {
    const guardedSession = window.TARBIYAH_SESSION;

    // Prioritaskan session dari Auth Guard.
    if (guardedSession?.ready === true) {
      return (
        guardedSession.session ||
        guardedSession.data?.session ||
        (guardedSession.user ? guardedSession : null) ||
        null
      );
    }

    const auth = window.TARBIYAH_AUTH;

    if (typeof auth?.getSession !== "function") {
      throw new Error(
        "Modul TARBIYAH_AUTH belum tersedia."
      );
    }

    const result = await auth.getSession();

    if (result?.configured === false) {
      throw new Error(
        "Supabase belum dikonfigurasi."
      );
    }

    if (result?.error) {
      throw result.error;
    }

    return (
      result?.session ||
      result?.data?.session ||
      result?.data?.data?.session ||
      null
    );
  }

  // ========================================================
  // 06. USER IDENTITY
  // ========================================================

  function getInitials(name) {
    return String(name || "Pengguna")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  function setAvatar(element, name, avatarUrl) {
    if (!element) return;

    if (
      element.tagName === "IMG" &&
      avatarUrl
    ) {
      element.src = avatarUrl;
      element.alt = `Foto profil ${name}`;
      return;
    }

    element.textContent = getInitials(name);
  }

  function renderUserIdentity(user) {
    const metadata = user.user_metadata || {};

    const name =
      metadata.full_name ||
      metadata.display_name ||
      metadata.name ||
      user.email?.split("@")[0] ||
      "Pengguna";

    const avatarUrl =
      metadata.avatar_url ||
      metadata.picture ||
      null;

    $$("[data-user-name]").forEach(element => {
      element.textContent = name;
    });

    $$("[data-sidebar-user-name]").forEach(element => {
      element.textContent = name;
    });

    $$("[data-greeting-name]").forEach(element => {
      element.textContent = name;
    });

    $$("[data-user-avatar]").forEach(element => {
      setAvatar(element, name, avatarUrl);
    });

    $$("[data-sidebar-avatar]").forEach(element => {
      setAvatar(element, name, avatarUrl);
    });

    const welcomeTitle = $("#welcomeTitle");

    if (welcomeTitle) {
      welcomeTitle.textContent =
        `Assalamu'alaikum, ${name}`;
    }

    return name;
  }

  // ========================================================
  // 07. USER ROLE — SUPABASE DATABASE
  // ========================================================

  const ROLE_CONFIG = {
    table: "user_roles",
    relation: "roles",
    userIdColumn: "user_id",
    roleNameColumn: "name"
  };

  const ROLE_INFO = {
    super_admin: {
      label: "SUPER ADMIN",
      description: "Super Administrator",
      admin: true
    },

    admin: {
      label: "ADMIN",
      description: "Administrator TARBIYAH",
      admin: true
    },

    member: {
      label: "ANGGOTA",
      description: "Anggota TARBIYAH",
      admin: false
    },

    registered_user: {
      label: "PENGGUNA TERDAFTAR",
      description: "Pengguna Terdaftar",
      admin: false
    }
  };

  let currentUserRole = null;

  async function fetchUserRoles(userId) {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(ROLE_CONFIG.table)
      .select("role_id, roles(name)")
      .eq(ROLE_CONFIG.userIdColumn, userId);

    if (error) {
      throw error;
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map(row => {
        const relation = row.roles;

        const roleRecord = Array.isArray(relation)
          ? relation[0]
          : relation;

        return normalize(
          roleRecord?.[ROLE_CONFIG.roleNameColumn]
        );
      })
      .filter(Boolean);
  }

  function selectPrimaryRole(roles) {
    const priority = [
      "super_admin",
      "admin",
      "member",
      "registered_user"
    ];

    return (
      priority.find(role => roles.includes(role)) ||
      null
    );
  }

  function renderUserRole(role) {
    const info = ROLE_INFO[role] || null;

    const isAdmin = Boolean(info?.admin);

    // Sembunyikan menu administrasi terlebih dahulu.
    const adminElements = [
      "#adminLink",
      "#adminBanner",
      "[data-admin-only]"
    ];

    adminElements.forEach(selector => {
      $$(selector).forEach(element => {
        element.hidden = !isAdmin;
      });
    });

    $$("[data-user-role]").forEach(element => {
      element.textContent =
        info?.label || "ROLE BELUM DITETAPKAN";
    });

    $$("[data-sidebar-user-role]").forEach(element => {
      element.textContent =
        info?.description || "Role belum ditetapkan";
    });

    const rolePill = $("#rolePill");

    if (rolePill) {
      rolePill.textContent =
        info?.label || "ROLE BELUM DITETAPKAN";
    }

    currentUserRole = role;

    window.TARBIYAH_USER_ROLE = {
      ready: Boolean(role),
      name: role,
      isAdmin,
      isSuperAdmin: role === "super_admin"
    };
  }

  // ========================================================
  // 08. LOAD USER PROFILE AND ROLE
  // ========================================================

  async function hydrateUser() {
    const session = await resolveSession();

    if (!session?.user) {
      throw new Error(
        "Sesi pengguna tidak ditemukan."
      );
    }

    const user = session.user;

    renderUserIdentity(user);

    // Jangan menggunakan metadata sebagai otorisasi.
    renderUserRole(null);

    try {
      const roles = await fetchUserRoles(user.id);

      const primaryRole = selectPrimaryRole(roles);

      renderUserRole(primaryRole);

      if (!primaryRole) {
        console.warn(
          "[TARBIYAH] Role pengguna belum ditetapkan."
        );

        toast(
          "Role akun belum ditetapkan. Hubungi administrator.",
          "warning"
        );
      } else {
        console.info(
          "[TARBIYAH] Role pengguna berhasil dimuat:",
          primaryRole
        );
      }

    } catch (error) {
      renderUserRole(null);

      console.error(
        "[TARBIYAH] Gagal membaca role:",
        error
      );

      toast(
        "Identitas akun berhasil dimuat, tetapi role belum dapat dibaca.",
        "warning"
      );
    }

    return user;
  }

  // ========================================================
  // 09. DASHBOARD SEARCH
  // ========================================================

  const searchRoutes = [
    ["agenda", "./agenda-tarbiyah.html"],
    ["jadwal", "./agenda-tarbiyah.html"],
    ["materi", "./materi-pembelajaran.html"],
    ["belajar", "./pembelajaran.html"],
    ["pembelajaran", "./pembelajaran.html"],
    ["berita", "./berita-pengumuman.html"],
    ["pengumuman", "./berita-pengumuman.html"],
    ["presensi", "./presensi-tarbiyah.html"],
    ["absen", "./presensi-tarbiyah.html"],
    ["galeri", "./galeri-foto-video.html"],
    ["foto", "./galeri-foto-video.html"],
    ["video", "./galeri-foto-video.html"],
    ["diskusi", "./diskusi-tarbiyah.html"],
    ["anggota", "./profil-anggota.html"],
    ["profil", "./profil-anggota.html"],
    ["kehadiran", "./kehadiran.html"],
    ["catatan", "./catatan-refleksi.html"],
    ["riwayat", "./riwayat-aktivitas.html"],
    ["administrasi", "./dashboard-admin.html"],
    ["pengaturan", "./administrasi-pengaturan.html"],
    ["notifikasi", "./notifikasi.html"]
  ];

  function initializeSearch() {
    const form = $("[data-dashboard-search-form]");
    const input = $("[data-dashboard-search]");

    if (!form || !input) return;

    form.addEventListener("submit", event => {
      event.preventDefault();

      const query = normalize(input.value);

      if (!query) {
        input.focus();
        return;
      }

      const found = searchRoutes.find(([keyword]) =>
        query.includes(keyword)
      );

      if (!found) {
        toast(
          "Menu belum ditemukan. Coba kata kunci lain.",
          "warning"
        );
        return;
      }

      const destination = found[1];

      // Dashboard administrasi hanya untuk Admin.
      if (
        destination === "./dashboard-admin.html" &&
        !["admin", "super_admin"].includes(currentUserRole)
      ) {
        toast(
          "Anda tidak memiliki akses administrasi.",
          "error"
        );
        return;
      }

      window.location.href = destination;
    });

    // Shortcut "/" untuk membuka pencarian.
    document.addEventListener("keydown", event => {
      const activeTag =
        document.activeElement?.tagName;

      const isTyping = [
        "INPUT",
        "TEXTAREA",
        "SELECT"
      ].includes(activeTag);

      if (
        event.key === "/" &&
        !isTyping &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  // ========================================================
  // 10. DASHBOARD CAROUSEL
  // ========================================================

  function initializeCarousel() {
    const carousel = $("[data-dashboard-carousel]");

    if (!carousel) return;

    const track = $("[data-carousel-track]", carousel);

    if (!track) return;

    const slides = $$(".dashboard-slide", track);

    const dots = $$("[data-carousel-dot]", carousel);

    const previousButton =
      $("[data-carousel-prev]", carousel);

    const nextButton =
      $("[data-carousel-next]", carousel);

    if (!slides.length) return;

    let currentIndex = 0;
    let timer = null;

    const duration = 6500;

    function showSlide(index) {
      currentIndex =
        (index + slides.length) % slides.length;

      track.style.transform =
        `translateX(-${currentIndex * 100}%)`;

      slides.forEach((slide, i) => {
        slide.setAttribute(
          "aria-hidden",
          String(i !== currentIndex)
        );
      });

      dots.forEach((dot, i) => {
        const active = i === currentIndex;

        dot.classList.toggle("active", active);

        dot.setAttribute(
          "aria-current",
          active ? "true" : "false"
        );
      });
    }

    function stopAutoplay() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();

      if (
        document.hidden ||
        slides.length < 2 ||
        window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches
      ) {
        return;
      }

      timer = window.setInterval(() => {
        showSlide(currentIndex + 1);
      }, duration);
    }

    function moveTo(index) {
      showSlide(index);
      startAutoplay();
    }

    previousButton?.addEventListener("click", () => {
      moveTo(currentIndex - 1);
    });

    nextButton?.addEventListener("click", () => {
      moveTo(currentIndex + 1);
    });

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        moveTo(index);
      });
    });

    carousel.addEventListener("mouseenter", stopAutoplay);
    carousel.addEventListener("mouseleave", startAutoplay);

    carousel.addEventListener("focusin", stopAutoplay);
    carousel.addEventListener("focusout", startAutoplay);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });

    showSlide(0);
    startAutoplay();
  }

  // ========================================================
  // 11. LOGOUT
  // ========================================================

  async function logout(button) {
    if (button) {
      button.disabled = true;
    }

    try {
      const auth = window.TARBIYAH_AUTH;

      if (typeof auth?.signOut === "function") {
        const result = await auth.signOut();

        if (result?.error) {
          throw result.error;
        }

      } else {
        const supabase = getSupabaseClient();

        const { error } = await supabase.auth.signOut();

        if (error) {
          throw error;
        }
      }

      window.location.replace(
        "./login-register.html"
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Logout gagal:",
        error
      );

      if (button) {
        button.disabled = false;
      }

      toast(
        error?.message ||
        "Logout gagal. Silakan coba kembali.",
        "error"
      );
    }
  }

  function initializeLogout() {
    $$("[data-logout], #logoutMini").forEach(button => {
      button.addEventListener("click", () => {
        logout(button);
      });
    });
  }

  // ========================================================
  // 12. DASHBOARD INITIALIZATION
  // ========================================================

  async function initializeDashboard() {
    initializeDate();
    initializeSearch();
    initializeCarousel();
    initializeLogout();

    try {
      await hydrateUser();

      console.info(
        "[TARBIYAH] Dashboard berhasil diinisialisasi."
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal menginisialisasi identitas Dashboard:",
        error
      );
    }
  }

  // ========================================================
  // 13. PUBLIC DASHBOARD API
  // ========================================================

  window.TARBIYAH_DASHBOARD = {
    initialize: initializeDashboard,

    refreshUser: hydrateUser,

    getCurrentRole() {
      return currentUserRole;
    },

    logout
  };

  // ========================================================
  // 14. START
  // ========================================================

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeDashboard,
      { once: true }
    );
  } else {
    initializeDashboard();
  }

})();
