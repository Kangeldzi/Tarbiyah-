
/**
 * ============================================================
 * TARBIYAH — MODULE MANAGER
 * File   : js/module.js
 * Fungsi :
 * - Registrasi dan pengelolaan modul aplikasi
 * - Normalisasi nama/alias halaman modul
 * - Membaca metadata halaman
 * - Mengatur judul dan deskripsi modul
 * - Mengatur status akses dan status tampilan
 * - Menyediakan API refresh untuk setiap modul
 *
 * Catatan:
 * File ini tidak membuat data dummy dan tidak mengasumsikan
 * struktur tabel Supabase tertentu.
 * ============================================================
 */

(function (window, document) {
  "use strict";

  if (window.TARBIYAH_MODULE) {
    console.info("[TARBIYAH MODULE] Manager sudah tersedia.");
    return;
  }

  const VERSION = "1.0.0";

  /* ==========================================================
     1. KONFIGURASI DASAR MODUL
  ========================================================== */

  const MODULES = {
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
    }
  };

  /* ==========================================================
     2. ALIAS NAMA MODUL
     Menangani perbedaan metadata antarhalaman.
  ========================================================== */

  const ALIASES = {
    tarbiyah: "dashboard",
    home: "dashboard",
    beranda: "dashboard",

    "profil-anggota": "profil",
    anggota: "profil",

    "agenda-tarbiyah": "agenda",
    jadwal: "agenda",

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
    pengaturan: "administrasi"
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

    if (ALIASES[normalized]) {
      return ALIASES[normalized];
    }

    return null;
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

    const id = resolveModuleId(config.id) ||
      normalizeName(config.id);

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
      module: state.modules[id]
    });

    return {
      success: true,
      module: state.modules[id]
    };
  }

  function getModule(value) {
    const id = resolveModuleId(value);

    if (!id) return null;

    return { ...state.modules[id] };
  }

  function getAllModules() {
    return Object.values(state.modules).map(module => ({
      ...module
    }));
  }

  /* ==========================================================
     6. MEMBACA IDENTITAS HALAMAN
  ========================================================== */

  function detectCurrentModule() {
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

    const id = resolveModuleId(filename);

    if (id) return id;

    return null;
  }

  function getCurrentModule() {
    if (state.currentModule) {
      return getModule(state.currentModule);
    }

    return null;
  }

  /* ==========================================================
     7. MENGATUR INFORMASI HALAMAN
  ========================================================== */

  function updatePageMetadata(module) {
    if (!module) return;

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
      icon.setAttribute("aria-label", module.title);
    }
  }

  /* ==========================================================
     8. STATUS TAMPILAN MODUL
  ========================================================== */

  function setModuleStatus(status, message, target) {
    const container =
      typeof target === "string"
        ? getElement(target)
        : target || getElement("[data-module-status]");

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
     9. SISTEM AKSES MODUL
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
      return { allowed: true };
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

    if (access === "member") {
      return {
        allowed: Boolean(user),
        reason: user ? null : "Silakan login terlebih dahulu."
      };
    }

    if (access === "admin") {
      return {
        allowed: false,
        reason: "Hak akses admin belum diverifikasi."
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
      setModuleStatus(
        "loading",
        "Memuat informasi..."
      );

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
     11. INISIALISASI MODUL
  ========================================================== */

  function initialize(options) {
    if (state.initialized && !(options && options.force)) {
      return getCurrentModule();
    }

    const detected = resolveModuleId(
      options?.module ||
      detectCurrentModule()
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

    document.documentElement.dataset.currentModule = detected;

    if (document.body) {
      document.body.dataset.currentModule = detected;
    }

    dispatch("tarbiyah:module-ready", {
      module
    });

    return module;
  }

  /* ==========================================================
     12. NAVIGASI KE MODUL
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
      const refreshButton = event.target.closest(
        "[data-module-refresh]"
      );

      if (refreshButton) {
        event.preventDefault();

        const target =
          refreshButton.dataset.moduleRefresh ||
          state.currentModule;

        refresh(target);
        return;
      }

      const navigateButton = event.target.closest(
        "[data-module-navigate]"
      );

      if (navigateButton) {
        event.preventDefault();

        navigate(
          navigateButton.dataset.moduleNavigate
        );
      }
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
