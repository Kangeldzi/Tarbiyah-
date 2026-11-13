
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    user: null,
    role: null,
    supabase: null,
    toastTimer: null,
    loading: false
  };

  const ROLE_LABELS = {
    super_admin: "Super Administrator",
    admin: "Administrator TARBIYAH",
    member: "Anggota TARBIYAH",
    registered_user: "Pengguna Terdaftar"
  };

  function log(...args) {
    console.info("[TARBIYAH ADMIN]", ...args);
  }

  function showToast(message) {
    const element = $("adminToast");
    if (!element) return;

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(state.toastTimer);

    state.toastTimer = setTimeout(() => {
      element.classList.remove("show");
    }, 3200);
  }

  function getClient() {
    if (
      window.TARBIYAH_BACKEND_READY &&
      window.tarbiyahSupabase
    ) {
      return window.tarbiyahSupabase;
    }

    throw new Error("Koneksi Supabase belum tersedia.");
  }

  async function getSession() {
    const auth = window.TARBIYAH_AUTH;

    if (typeof auth?.getSession !== "function") {
      throw new Error("Modul autentikasi tidak tersedia.");
    }

    const result = await auth.getSession();

    if (result?.configured === false) {
      throw new Error("Backend belum dikonfigurasi.");
    }

    if (result?.error) {
      throw result.error;
    }

    return result?.session ||
      result?.data?.session ||
      window.TARBIYAH_SESSION?.session ||
      null;
  }

  async function getUserRole(userId) {
    const { data, error } = await state.supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", userId);

    if (error) throw error;

    const roles = (data || [])
      .map(row => {
        const relation = Array.isArray(row.roles)
          ? row.roles[0]
          : row.roles;

        return String(relation?.name || "")
          .trim()
          .toLowerCase();
      })
      .filter(Boolean);

    if (roles.includes("super_admin")) {
      return "super_admin";
    }

    if (roles.includes("admin")) {
      return "admin";
    }

    return null;
  }

  function setIdentity(user, role) {
    const metadata = user.user_metadata || {};

    const name =
      metadata.full_name ||
      metadata.display_name ||
      metadata.name ||
      user.email?.split("@")[0] ||
      "Administrator";

    const initials = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase();

    ["adminName", "topName"].forEach(id => {
      if ($(id)) $(id).textContent = name;
    });

    ["adminAvatar", "topAvatar"].forEach(id => {
      if ($(id)) $(id).textContent = initials;
    });

    if ($("adminRole")) {
      $("adminRole").textContent =
        ROLE_LABELS[role] || "Administrator";
    }

    if ($("welcomeName")) {
      $("welcomeName").textContent = name;
    }

    if ($("roleStatus")) {
      $("roleStatus").textContent =
        ROLE_LABELS[role] || "Tidak dikenali";
    }
  }

  function setStatus(id, message, success = true) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = success
      ? "var(--admin-green)"
      : "#d98a50";
  }

  async function countTable(table, valueId, noteId) {
    const value = $(valueId);
    const note = $(noteId);

    if (value) value.textContent = "…";
    if (note) note.textContent = "Mengambil data...";

    try {
      const { count, error } = await state.supabase
        .from(table)
        .select("*", {
          count: "exact",
          head: true
        });

      if (error) throw error;

      if (value) {
        value.textContent = Number(count || 0).toLocaleString("id-ID");
      }

      if (note) {
        note.textContent = "Data berhasil dibaca";
      }

      return count || 0;

    } catch (error) {
      console.warn(
        `[TARBIYAH ADMIN] Gagal menghitung tabel ${table}:`,
        error
      );

      if (value) value.textContent = "—";
      if (note) note.textContent = "Data tidak dapat diakses";

      return null;
    }
  }

  async function loadStatistics() {
    if (state.loading) return;

    state.loading = true;

    try {
      await Promise.all([
        countTable("profiles", "profilesCount", "profilesNote"),
        countTable("members", "membersCount", "membersNote"),
        countTable("user_roles", "userRolesCount", "userRolesNote"),
        countTable("roles", "rolesCount", "rolesNote")
      ]);

      log("Pembaruan statistik selesai.");

    } finally {
      state.loading = false;
    }
  }

  function setupSidebar() {
    const sidebar = $("adminSidebar");
    const scrim = $("adminScrim");

    const close = () => {
      sidebar?.classList.remove("open");
      scrim?.classList.remove("show");
    };

    $("menuToggle")?.addEventListener("click", () => {
      sidebar?.classList.add("open");
      scrim?.classList.add("show");
    });

    $("sidebarClose")?.addEventListener("click", close);
    scrim?.addEventListener("click", close);

    document.querySelectorAll(".admin-nav-link").forEach(link => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".admin-nav-link")
          .forEach(item => item.classList.remove("active"));

        link.classList.add("active");
        close();
      });
    });
  }

  function setupTheme() {
    $("adminThemeToggle")?.addEventListener("click", () => {
      const html = document.documentElement;

      const current =
        html.getAttribute("data-theme") || "dark";

      const next = current === "dark" ? "light" : "dark";

      html.setAttribute("data-theme", next);

      try {
        localStorage.setItem("tarbiyah-theme", next);
      } catch (error) {
        console.warn("Preferensi tema tidak dapat disimpan.", error);
      }
    });
  }

  function setupNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener("click", event => {
        const target = document.querySelector(link.getAttribute("href"));

        if (!target) {
          event.preventDefault();
          showToast("Bagian ini sedang dipersiapkan.");
        }
      });
    });
  }

  function setupLogout() {
    $("adminLogout")?.addEventListener("click", async () => {
      const button = $("adminLogout");

      if (button) {
        button.disabled = true;
        button.textContent = "Memproses keluar...";
      }

      try {
        const auth = window.TARBIYAH_AUTH;

        if (typeof auth?.signOut !== "function") {
          throw new Error("Fungsi logout tidak tersedia.");
        }

        await auth.signOut();

        window.location.replace("./login-register.html");

      } catch (error) {
        console.error("[TARBIYAH ADMIN] Logout gagal:", error);
        showToast("Gagal keluar. Silakan coba kembali.");

        if (button) {
          button.disabled = false;
          button.innerHTML = "<span>↪</span> Keluar dari akun";
        }
      }
    });
  }

  async function initialize() {
    if ($("currentYear")) {
      $("currentYear").textContent =
        new Date().getFullYear();
    }

    setupSidebar();
    setupTheme();
    setupNavigation();
    setupLogout();

    $("refreshStats")?.addEventListener(
      "click",
      loadStatistics
    );

    try {
      state.supabase = getClient();

      setStatus("supabaseStatus", "Terhubung");
      setStatus("authStatus", "Memeriksa sesi...");

      const session = await getSession();

      if (!session?.user) {
        window.location.replace("./login-register.html");
        return;
      }

      state.user = session.user;

      setStatus("authStatus", "Terautentikasi");

      const role = await getUserRole(session.user.id);

      if (!role) {
        setStatus("roleStatus", "Akses ditolak", false);
        showToast("Halaman ini hanya untuk Admin dan Super Admin.");

        setTimeout(() => {
          window.location.replace("./dashboard.html");
        }, 1600);

        return;
      }

      state.role = role;

      setIdentity(session.user, role);

      setStatus(
        "roleStatus",
        ROLE_LABELS[role]
      );

      setStatus(
        "systemStatus",
        "Sistem terhubung dan akses administrator terverifikasi."
      );

      const workerActive =
        "serviceWorker" in navigator;

      setStatus(
        "workerStatus",
        workerActive ? "Didukung browser" : "Tidak didukung",
        workerActive
      );

      log("Akses administrasi berhasil:", role);

      await loadStatistics();

    } catch (error) {
      console.error(
        "[TARBIYAH ADMIN] Inisialisasi gagal:",
        error
      );

      setStatus("supabaseStatus", "Tidak tersedia", false);
      setStatus("authStatus", "Tidak terverifikasi", false);
      setStatus("roleStatus", "Tidak terverifikasi", false);
      setStatus("systemStatus", "Terjadi masalah saat memuat sistem.", false);

      showToast(
        "Dashboard administrasi gagal dimuat. Periksa koneksi dan sesi akun."
      );
    }
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

})();
