
/**
 * ============================================================
 * TARBIYAH — MODULE MANAGER
 * File    : js/module.js
 * Version : 1.1.0
 *
 * Fungsi:
 * - Registrasi dan pengelolaan modul
 * - Normalisasi nama dan alias modul
 * - Deteksi modul berdasarkan URL, metadata, dan nama file
 * - Pengaturan judul, deskripsi, dan breadcrumb
 * - Pemeriksaan hak akses dasar
 * - Pengelolaan status modul
 * - API refresh modul
 * - Event pencarian dan tombol aksi modul
 *
 * Catatan:
 * File ini tidak membuat data dummy dan tidak mengasumsikan
 * struktur tabel Supabase tertentu.
 *
 * Pemeriksaan hak akses di sini adalah pemeriksaan sisi UI.
 * Keamanan data tetap wajib ditegakkan melalui Supabase RLS.
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_MODULE) {
    console.info("[TARBIYAH MODULE] Manager sudah tersedia.");
    return;
  }

  const VERSION = "1.1.0";

  /* ==========================================================
     1. KONFIGURASI MODUL
  ========================================================== */

  const MODULES = {
    module: {
      id: "module",
      title: "Modul TARBIYAH",
      description:
        "Ruang untuk belajar, bertumbuh, berbagi ilmu, dan mempererat ukhuwah Islamiyah.",
      icon: "layout-grid",
      url: "./module.html",
      access: "member"
    },

    dashboard: {
      id: "dashboard",
      title: "Dashboard",
      description: "Ringkasan aktivitas dan informasi TARBIYAH.",
      icon: "layout-dashboard",
      url: "./tarbiyah.html",
      access: "member"
    },

    profil: {
      id: "profil",
      title: "Profil Anggota",
      description: "Informasi dan identitas anggota TARBIYAH.",
      icon: "user-round",
      url: "./profil-anggota.html",
      access: "member"
    },

    agenda: {
      id: "agenda",
      title: "Agenda TARBIYAH",
      description: "Jadwal kegiatan, kajian, dan pertemuan.",
      icon: "calendar-days",
      url: "./agenda-tarbiyah.html",
      access: "member"
    },

    "agenda-kajian": {
      id: "agenda-kajian",
      title: "Agenda Kajian",
      description: "Informasi dan jadwal kegiatan kajian TARBIYAH.",
      icon: "calendar-check",
      url: "./agenda-kajian.html",
      access: "member"
    },

    "agenda-kajian-manage": {
      id: "agenda-kajian-manage",
      title: "Kelola Agenda Kajian",
      description:
        "Membuat, mengubah, mengarsipkan, dan memulihkan agenda kajian.",
      icon: "calendar-cog",
      url: "./agenda-kajian.html",
      access: "admin"
    },

    pembelajaran: {
      id: "pembelajaran",
      title: "Pembelajaran",
      description: "Ruang pembelajaran dan pengembangan ilmu.",
      icon: "book-open",
      url: "./pembelajaran.html",
      access: "member"
    },

    materi: {
      id: "materi",
      title: "Materi Pembelajaran",
      description: "Kumpulan materi pembelajaran TARBIYAH.",
      icon: "book-text",
      url: "./materi-pembelajaran.html",
      access: "member"
    },

    kajian: {
      id: "kajian",
      title: "Kajian Islam",
      description: "Informasi dan dokumentasi kegiatan kajian.",
      icon: "book-open-check",
      url: "./pembelajaran.html",
      access: "member"
    },

    berita: {
      id: "berita",
      title: "Berita dan Pengumuman",
      description: "Informasi dan pengumuman komunitas.",
      icon: "newspaper",
      url: "./berita-pengumuman.html",
      access: "member"
    },

    galeri: {
      id: "galeri",
      title: "Galeri Foto dan Video",
      description: "Dokumentasi kegiatan TARBIYAH.",
      icon: "images",
      url: "./galeri-foto-video.html",
      access: "member"
    },

    diskusi: {
      id: "diskusi",
      title: "Diskusi TARBIYAH",
      description: "Ruang diskusi dan interaksi anggota.",
      icon: "messages-square",
      url: "./diskusi-tarbiyah.html",
      access: "member"
    },

    donasi: {
      id: "donasi",
      title: "Donasi dan Infaq",
      description: "Informasi donasi dan infaq komunitas.",
      icon: "hand-heart",
      url: "./donasi-infaq.html",
      access: "member"
    },

    presensi: {
      id: "presensi",
      title: "Presensi TARBIYAH",
      description: "Pencatatan kehadiran kegiatan.",
      icon: "clipboard-check",
      url: "./presensi-tarbiyah.html",
      access: "member"
    },

    kehadiran: {
      id: "kehadiran",
      title: "Riwayat Kehadiran",
      description: "Rekap kehadiran dan riwayat kajian anggota.",
      icon: "calendar-check",
      url: "./kehadiran.html",
      access: "member"
    },

    catatan: {
      id: "catatan",
      title: "Catatan dan Refleksi",
      description: "Catatan pribadi dan refleksi pembelajaran.",
      icon: "notebook-pen",
      url: "./catatan-refleksi.html",
      access: "member"
    },

    notifikasi: {
      id: "notifikasi",
      title: "Notifikasi",
      description: "Pemberitahuan aktivitas TARBIYAH.",
      icon: "bell",
      url: "./notifikasi.html",
      access: "member"
    },

    riwayat: {
      id: "riwayat",
      title: "Riwayat Aktivitas",
      description: "Riwayat aktivitas akun dan aplikasi.",
      icon: "history",
      url: "./riwayat-aktivitas.html",
      access: "member"
    },

    administrasi: {
      id: "administrasi",
      title: "Administrasi dan Pengaturan",
      description: "Pengaturan dan pengelolaan aplikasi.",
      icon: "settings",
      url: "./administrasi-pengaturan.html",
      access: "admin"
    },

    "anggota-binaan": {
      id: "anggota-binaan",
      title: "Anggota Binaan",
      description: "Daftar anggota yang berada dalam pembinaan mentor.",
      icon: "users",
      url: "./anggota-binaan.html",
      access: "mentor"
    },

    pembinaan: {
      id: "pembinaan",
      title: "Pembinaan",
      description: "Pengelolaan kegiatan pembinaan anggota.",
      icon: "graduation-cap",
      url: "./pembinaan.html",
      access: "mentor"
    },

    "presensi-mentor": {
      id: "presensi-mentor",
      title: "Presensi Binaan",
      description: "Pemantauan kehadiran anggota binaan.",
      icon: "clipboard-check",
      url: "./presensi-mentor.html",
      access: "mentor"
    }
  };

  /* ==========================================================
     2. ALIAS MODUL
  ========================================================== */

  const ALIASES = {
    module: "module",
    modul: "module",

    tarbiyah: "dashboard",
    home: "dashboard",
    beranda: "dashboard",
    dashboard: "dashboard",

    "profil-anggota": "profil",
    anggota: "profil",

    "agenda-tarbiyah": "agenda",
    jadwal: "agenda",

    "kelola-agenda-kajian": "agenda-kajian-manage",
    "kelola-kajian": "agenda-kajian-manage",
    "agenda-kajian-admin": "agenda-kajian-manage",

    "materi-pembelajaran": "materi",
    "materi-tarbiyah": "materi",

    "berita-pengumuman": "berita",
    pengumuman: "berita",

    "galeri-foto-video": "galeri",
    dokumentasi: "galeri",

    "diskusi-tarbiyah": "diskusi",

    "donasi-infaq": "donasi",
    infaq: "donasi",

    "presensi-tarbiyah": "presensi",
    presensi_tarbiyah: "presensi",

    "riwayat-kehadiran": "kehadiran",
    "catatan-refleksi": "catatan",
    "notifikasi-tarbiyah": "notifikasi",
    "riwayat-aktivitas": "riwayat",

    "administrasi-pengaturan": "administrasi",
    pengaturan: "administrasi",

    "presensi-binaan": "presensi-mentor"
  };

  /* ==========================================================
     3. STATUS INTERNAL
  ========================================================== */

  const state = {
    initialized: false,
    currentModule: null,
    modules: { ...MODULES },
    refreshHandlers: new Map(),
    accessHandlers: new Map()
  };

  /* ==========================================================
     4. UTILITAS
  ========================================================== */

  function normalizeName(value) {
    if (!value || typeof value !== "string") {
      return "";
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/\.html$/i, "")
      .replace(/[_\s]+/g, "-")
      .replace(/-+/g, "-");
  }

  function resolveModuleId(value) {
    const normalized = normalizeName(value);

    if (!normalized) return null;

    if (state.modules[normalized]) {
      return normalized;
    }

    return ALIASES[normalized] || null;
  }

  function getElement(selector, root) {
    return (root || document).querySelector(selector);
  }

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: detail || {}
      })
    );
  }

  function safeText(element, value) {
    if (!element) return;

    element.textContent =
      value === undefined || value === null
        ? ""
        : String(value);
  }

  function getUrlModule() {
    try {
      const params = new URLSearchParams(window.location.search);

      const candidates = [
        params.get("module"),
        params.get("modul"),
        params.get("page")
      ];

      for (const candidate of candidates) {
        const id = resolveModuleId(candidate);
        if (id) return id;
      }
    } catch (error) {
      console.warn(
        "[TARBIYAH MODULE] Parameter URL tidak dapat dibaca:",
        error
      );
    }

    return null;
  }

  function getStatusElement() {
    let element = getElement("[data-module-status]");

    if (element) return element;

    const content = getElement("[data-module-content]");

    if (!content) return null;

    element = document.createElement("div");
    element.className = "module-status";
    element.dataset.moduleStatus = "";
    element.hidden = true;
    element.setAttribute("role", "status");

    content.insertBefore(element, content.firstChild);

    return element;
  }

  /* ==========================================================
     5. REGISTRASI MODUL
  ========================================================== */

  function registerModule(config) {
    if (!config || typeof config !== "object") {
      return {
        success: false,
        message: "Konfigurasi modul tidak valid."
      };
    }

    const id = normalizeName(config.id);

    if (!id) {
      return {
        success: false,
        message: "ID modul wajib diisi."
      };
    }

    const previous = state.modules[id] || {};

    state.modules[id] = {
      ...previous,
      ...config,
      id,
      title: config.title || previous.title || id,
      description:
        config.description ||
        previous.description ||
        "",
      access: config.access || previous.access || "member"
    };

    dispatch("tarbiyah:module-registered", {
      module: { ...state.modules[id] }
    });

    return {
      success: true,
      module: { ...state.modules[id] }
    };
  }

  function getModule(value) {
    const id = resolveModuleId(value);

    if (!id || !state.modules[id]) return null;

    return { ...state.modules[id] };
  }

  function getAllModules() {
    return Object.values(state.modules).map(module => ({
      ...module
    }));
  }

  /* ==========================================================
     6. DETEKSI IDENTITAS HALAMAN
  ========================================================== */

  function detectCurrentModule() {
    // Parameter URL memiliki prioritas untuk module.html.
    const fromUrl = getUrlModule();

    if (fromUrl) return fromUrl;

    const body = document.body;

    const candidates = [
      body?.dataset?.module,
      document.documentElement?.dataset?.module,
      getElement("[data-module-page]")?.dataset?.modulePage,
      getElement('meta[name="tarbiyah-module"]')?.content,
      getElement('meta[name="module"]')?.content
    ];

    for (const candidate of candidates) {
      const id = resolveModuleId(candidate);
      if (id) return id;
    }

    const pathname = window.location.pathname;
    const filename = pathname.split("/").pop();

    return resolveModuleId(filename);
  }

  function getCurrentModule() {
    if (!state.currentModule) return null;

    return getModule(state.currentModule);
  }

  /* ==========================================================
     7. METADATA HALAMAN
  ========================================================== */

  function updatePageMetadata(module) {
    if (!module) return false;

    if (module.title) {
      document.title = `${module.title} | TARBIYAH`;

      safeText(
        getElement("[data-module-title]"),
        module.title
      );

      safeText(
        getElement("[data-page-title]"),
        module.title
      );

      safeText(
        getElement("[data-module-breadcrumb]"),
        module.title
      );
    }

    if (module.description) {
      safeText(
        getElement("[data-module-description]"),
        module.description
      );

      safeText(
        getElement("[data-page-description]"),
        module.description
      );
    }

    const icon = getElement("[data-module-icon]");

    if (icon && module.icon) {
      icon.dataset.icon = module.icon;
      icon.setAttribute("aria-label", module.title || "");
    }

    document.documentElement.dataset.currentModule = module.id;

    if (document.body) {
      document.body.dataset.currentModule = module.id;
    }

    return true;
  }

  /* ==========================================================
     8. STATUS TAMPILAN MODUL
  ========================================================== */

  function setModuleStatus(status, message, target) {
    const container =
      typeof target === "string"
        ? getElement(target)
        : target || getStatusElement();

    if (!container) return false;

    const allowed = [
      "loading",
      "success",
      "error",
      "empty",
      "info"
    ];

    const normalizedStatus = allowed.includes(status)
      ? status
      : "info";

    container.dataset.status = normalizedStatus;
    container.hidden = false;
    container.setAttribute("role", "status");

    safeText(container, message || "");

    return true;
  }

  function clearModuleStatus(target) {
    const container =
      typeof target === "string"
        ? getElement(target)
        : target || getElement("[data-module-status]");

    if (!container) return false;

    container.hidden = true;
    container.textContent = "";
    delete container.dataset.status;

    return true;
  }

  /* ==========================================================
     9. PEMERIKSAAN HAK AKSES
  ========================================================== */

  function registerAccessHandler(name, handler) {
    if (!name || typeof handler !== "function") {
      return false;
    }

    state.accessHandlers.set(
      normalizeName(name),
      handler
    );

    return true;
  }

  function getVerifiedRoles(user) {
    const metadata = user?.app_metadata || {};
    const roles = [];

    if (typeof metadata.role === "string") {
      roles.push(metadata.role);
    }

    if (Array.isArray(metadata.roles)) {
      roles.push(...metadata.roles);
    }

    return roles.map(role => normalizeName(role));
  }

  async function checkAccess(moduleValue, user) {
    const module = getModule(moduleValue);

    if (!module) {
      return {
        allowed: false,
        reason: "Modul tidak ditemukan."
      };
    }

    const access = normalizeName(module.access || "member");

    if (access === "public") {
      return { allowed: true, reason: null };
    }

    const handler = state.accessHandlers.get(access);

    if (handler) {
      try {
        const result = await handler(user, module);

        return {
          allowed: Boolean(result),
          reason: result ? null : "Akses tidak diizinkan."
        };
      } catch (error) {
        console.error(
          "[TARBIYAH MODULE] Pemeriksaan akses gagal:",
          error
        );

        return {
          allowed: false,
          reason: "Gagal memeriksa hak akses."
        };
      }
    }

    if (!user) {
      return {
        allowed: false,
        reason: "Silakan login terlebih dahulu."
      };
    }

    if (access === "member") {
      return { allowed: true, reason: null };
    }

    const roles = getVerifiedRoles(user);

    if (access === "admin") {
      const allowed = roles.some(role =>
        ["admin", "super-admin", "superadmin"].includes(role)
      );

      return {
        allowed,
        reason: allowed ? null : "Khusus administrator."
      };
    }

    if (access === "mentor") {
      const allowed = roles.some(role =>
        ["mentor", "murabbi", "admin", "super-admin", "superadmin"].includes(role)
      );

      return {
        allowed,
        reason: allowed ? null : "Khusus mentor atau administrator."
      };
    }

    return {
      allowed: false,
      reason: "Jenis akses belum dikenali."
    };
  }

  /* ==========================================================
     10. REFRESH MODUL
  ========================================================== */

  function registerRefreshHandler(moduleValue, handler) {
    const id = resolveModuleId(moduleValue);

    if (!id || typeof handler !== "function") {
      return false;
    }

    state.refreshHandlers.set(id, handler);

    return true;
  }

  async function refresh(moduleValue, options) {
    const id = resolveModuleId(
      moduleValue || state.currentModule
    );

    if (!id) {
      return {
        success: false,
        message: "Modul tidak ditemukan."
      };
    }

    const handler = state.refreshHandlers.get(id);

    if (!handler) {
      dispatch("tarbiyah:module-refresh", {
        moduleId: id,
        handled: false
      });

      return {
        success: true,
        handled: false,
        message: "Belum ada fungsi refresh untuk modul ini."
      };
    }

    try {
      setModuleStatus("loading", "Memuat informasi...");

      const result = await handler(options || {});

      clearModuleStatus();

      dispatch("tarbiyah:module-refresh", {
        moduleId: id,
        handled: true,
        result
      });

      return {
        success: true,
        handled: true,
        result
      };
    } catch (error) {
      console.error(
        `[TARBIYAH MODULE] Refresh ${id} gagal:`,
        error
      );

      setModuleStatus(
        "error",
        "Informasi belum berhasil dimuat. Silakan coba kembali."
      );

      return {
        success: false,
        error
      };
    }
  }

  /* ==========================================================
     11. INISIALISASI
  ========================================================== */

  function initialize(options) {
    if (state.initialized && !(options && options.force)) {
      return getCurrentModule();
    }

    const detected = resolveModuleId(
      options?.module || detectCurrentModule()
    );

    if (!detected) {
      console.info(
        "[TARBIYAH MODULE] Halaman ini bukan halaman modul terdaftar."
      );

      return null;
    }

    state.currentModule = detected;

    const module = getModule(detected);

    updatePageMetadata(module);

    state.initialized = true;

    dispatch("tarbiyah:module-ready", {
      module
    });

    return module;
  }

  /* ==========================================================
     12. NAVIGASI
  ========================================================== */

  function navigate(moduleValue) {
    const module = getModule(moduleValue);

    if (!module || !module.url) {
      console.warn(
        "[TARBIYAH MODULE] Tujuan navigasi tidak ditemukan:",
        moduleValue
      );

      return false;
    }

    window.location.href = module.url;

    return true;
  }

  /* ==========================================================
     13. EVENT DELEGATION
  ========================================================== */

  function bindEvents() {
    if (document.documentElement.dataset.moduleEventsBound) {
      return;
    }

    document.documentElement.dataset.moduleEventsBound = "true";

    document.addEventListener("click", function (event) {
      const target = event.target;

      if (!target || typeof target.closest !== "function") {
        return;
      }

      const refreshButton = target.closest("[data-module-refresh]");

      if (refreshButton) {
        event.preventDefault();

        const moduleId =
          refreshButton.dataset.moduleRefresh ||
          state.currentModule;

        refresh(moduleId);
        return;
      }

      const navigateButton = target.closest("[data-module-navigate]");

      if (navigateButton) {
        event.preventDefault();
        navigate(navigateButton.dataset.moduleNavigate);
        return;
      }

      const actionButton = target.closest(
        "[data-module-primary-action]"
      );

      if (actionButton && !actionButton.hidden) {
        dispatch("tarbiyah:module-action", {
          module: getCurrentModule(),
          button: actionButton
        });
      }
    });

    document.addEventListener("submit", function (event) {
      const form = event.target;

      if (!form.matches("[data-module-search-form]")) {
        return;
      }

      event.preventDefault();

      const input = form.querySelector("[data-module-search]");
      const query = input ? input.value.trim() : "";

      dispatch("tarbiyah:module-search", {
        module: getCurrentModule(),
        query
      });
    });
  }

  /* ==========================================================
     14. API PUBLIK
  ========================================================== */

  const API = {
    version: VERSION,

    initialize,
    registerModule,

    getModule,
    getAllModules,
    getCurrentModule,

    resolveModuleId,
    detectCurrentModule,

    updatePageMetadata,

    setModuleStatus,
    clearModuleStatus,

    registerAccessHandler,
    checkAccess,

    registerRefreshHandler,
    refresh,

    navigate
  };

  window.TARBIYAH_MODULE = API;

  /* ==========================================================
     15. AUTO INITIALIZATION
  ========================================================== */

  function start() {
    bindEvents();
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
    `[TARBIYAH MODULE] Manager aktif — v${VERSION}`
  );

})(window, document);
