
/* TARBIYAH Dashboard controller
   Carousel SVG arrow consistency fix
   Supabase configuration is not modified.
*/
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const toast = (message) => {
    const region = $("toastRegion");
    if (!region) return;

    region.innerHTML = "";

    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;

    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  };

  // =====================================================
  // SIDEBAR MOBILE
  // =====================================================

  const sidebar = $("appSidebar");
  const scrim = $("sidebarScrim");

  const openMenu = () => {
    sidebar?.classList.add("open");
    scrim?.classList.add("show");
    $("menuOpen")?.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
  };

  const closeMenu = () => {
    sidebar?.classList.remove("open");
    scrim?.classList.remove("show");
    $("menuOpen")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };

  $("menuOpen")?.addEventListener("click", openMenu);
  $("menuClose")?.addEventListener("click", closeMenu);
  scrim?.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // =====================================================
  // THEME
  // =====================================================

  $("themeToggle")?.addEventListener("click", () => {
    const manager = window.TARBIYAH_THEME;

    if (manager?.get && manager?.set) {
      const current = manager.get();
      manager.set(current === "dark" ? "light" : "dark");
    } else {
      const root = document.documentElement;
      root.dataset.theme =
        root.dataset.theme === "dark" ? "light" : "dark";
    }
  });

  // =====================================================
  // CAROUSEL — CONSISTENT SVG ARROW
  // =====================================================

  const slides = [
    {
      kicker: "TARBIYAH • PEMBELAJARAN MUSLIM",
      title: "Menuntut ilmu,<br><i>menumbuhkan ukhuwah.</i>",
      desc: "Ruang bersama untuk belajar, berbagi, dan menguatkan langkah dalam kebaikan.",
      link: "./pembelajaran.html",
      action: "Jelajahi pembelajaran"
    },
    {
      kicker: "AGENDA & KEGIATAN",
      title: "Bersama dalam<br><i>majelis kebaikan.</i>",
      desc: "Temukan jadwal kajian, pertemuan, dan aktivitas komunitas berikutnya.",
      link: "./agenda-tarbiyah.html",
      action: "Jelajahi agenda"
    },
    {
      kicker: "KOMUNITAS TARBIYAH",
      title: "Tumbuh bersama,<br><i>berbagi manfaat.</i>",
      desc: "Kenali anggota, dokumentasikan perjalanan, dan kuatkan ukhuwah.",
      link: "./profil-anggota.html",
      action: "Kenali komunitas"
    }
  ];

  let slideIndex = 0;

  const slideHost = document.querySelector(".hero-slide");
  const dots = [...document.querySelectorAll(".carousel-dot")];

  // SVG panah yang sama untuk SEMUA slide.
  // Tidak lagi menggunakan karakter teks "→".
  const carouselArrow = `
    <svg
      class="arrow-icon hero-arrow"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h14M13 5l7 7-7 7"></path>
    </svg>
  `;

  function showSlide(index) {
    slideIndex = (index + slides.length) % slides.length;

    const s = slides[slideIndex];

    const heroCopy = slideHost?.querySelector(".hero-copy");

    if (heroCopy) {
      heroCopy.innerHTML = `
        <span class="hero-kicker">${s.kicker}</span>

        <h2>${s.title}</h2>

        <p>${s.desc}</p>

        <a class="primary-button hero-link" href="${s.link}">
          <span class="hero-link-label">${s.action}</span>
          ${carouselArrow}
        </a>
      `;
    }

    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === slideIndex);
    });

    if ($("slideCounter")) {
      $("slideCounter").textContent =
        `0${slideIndex + 1} / 0${slides.length}`;
    }
  }

  // Tombol indikator slide
  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => showSlide(i));
  });

  // Jalankan slide pertama melalui template yang sama.
  // Dengan demikian, SVG sudah konsisten sejak awal.
  showSlide(0);

  let carouselTimer = window.setInterval(
    () => showSlide(slideIndex + 1),
    6500
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearInterval(carouselTimer);
    } else {
      window.clearInterval(carouselTimer);

      carouselTimer = window.setInterval(
        () => showSlide(slideIndex + 1),
        6500
      );
    }
  });



  // =====================================================
  // SEARCH
  // =====================================================

  let currentUserRole = null;

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
    ["administrasi", "./dashboard-admin.html"],
    ["pengaturan", "./administrasi-pengaturan.html"],
    ["notifikasi", "./notifikasi.html"]
  ];

  $("searchForm")?.addEventListener("submit", (e) => {
    e.preventDefault();

    const query = ($("globalSearch")?.value || "")
      .trim()
      .toLowerCase();

    if (!query) return;

    const found = searchRoutes.find(([word]) =>
      query.includes(word)
    );

    if (found) {
      const adminRoles = ["admin", "super_admin"];

      if (
        found[1] === "./dashboard-admin.html" &&
        !adminRoles.includes(currentUserRole)
      ) {
        toast("Anda tidak memiliki akses administrasi.");
        return;
      }

      location.href = found[1];
    } else {
      toast("Belum ditemukan menu yang cocok. Coba kata kunci lain.");
    }
  });

  // Shortcut keyboard untuk membuka pencarian.
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA"].includes(
        document.activeElement?.tagName
      )
    ) {
      e.preventDefault();
      $("globalSearch")?.focus();
    }
  });

  
  // =====================================================
  // USER IDENTITY & ROLE — SUPABASE DATABASE
  // =====================================================

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

  function getSupabaseClient() {
    if (
      window.TARBIYAH_BACKEND_READY &&
      window.tarbiyahSupabase
    ) {
      return window.tarbiyahSupabase;
    }

    throw new Error(
      "Client Supabase TARBIYAH belum tersedia."
    );
  }

  async function resolveSession() {
    // Gunakan status Auth Guard apabila sudah tersedia.
    const guardedSession = window.TARBIYAH_SESSION;

    if (guardedSession?.ready) {
      return guardedSession.session || null;
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
        "Backend Supabase belum dikonfigurasi."
      );
    }

    if (result?.error) {
      throw result.error;
    }

    return result?.session ||
      result?.data?.session ||
      null;
  }

  function normalizeRoleName(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

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

        // Relasi Supabase dapat berbentuk objek
        // atau array, bergantung pada relasinya.
        const roleRecord = Array.isArray(relation)
          ? relation[0]
          : relation;

        return normalizeRoleName(
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

    return priority.find(role =>
      roles.includes(role)
    ) || null;
  }

  function renderUserRole(role) {
    const info = ROLE_INFO[role];

    const admin = Boolean(info?.admin);

    // Selalu sembunyikan terlebih dahulu.
    // Hak administrasi hanya diberikan jika role
    // berhasil dibaca dan dikenali.
    if ($("adminLink")) {
      $("adminLink").hidden = !admin;
    }

    if ($("adminBanner")) {
      $("adminBanner").hidden = !admin;
    }

    if ($("rolePill")) {
      $("rolePill").textContent =
        info?.label || "ROLE BELUM DITETAPKAN";
    }

    if ($("sidebarRole")) {
      $("sidebarRole").textContent =
        info?.description || "Role belum ditetapkan";
    }

    currentUserRole = role;

    window.TARBIYAH_USER_ROLE = {
      ready: Boolean(role),
      name: role,
      isAdmin: admin,
      isSuperAdmin: role === "super_admin"
    };
  }

  async function hydrateUser() {
    const session = await resolveSession();

    if (!session?.user) {
      throw new Error(
        "Sesi pengguna tidak ditemukan."
      );
    }

    const user = session.user;

    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.display_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Pengguna";

    const initials = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase();

    ["userName", "sidebarName"].forEach(id => {
      if ($(id)) {
        $(id).textContent = name;
      }
    });

    ["userAvatar", "sidebarAvatar"].forEach(id => {
      if ($(id)) {
        $(id).textContent = initials;
      }
    });

    if ($("welcomeTitle")) {
      $("welcomeTitle").textContent =
        `Assalamu’alaikum, ${name}`;
    }

    // Role hanya dibaca dari database.
    // Metadata akun tidak digunakan sebagai otorisasi.
    renderUserRole(null);

    try {
      const roles = await fetchUserRoles(user.id);
      const primaryRole = selectPrimaryRole(roles);

      renderUserRole(primaryRole);

      if (!primaryRole) {
        console.warn(
          "[TARBIYAH] Pengguna belum memiliki role yang dikenali."
        );

        toast(
          "Role akun belum ditetapkan. Hubungi administrator."
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
        "[TARBIYAH] Gagal membaca role pengguna:",
        error
      );

      toast(
        "Identitas akun berhasil dimuat, tetapi role belum dapat dibaca."
      );
    }
  }


  // =====================================================
  // LOGOUT
  // =====================================================

  async function logout() {
    const buttons = [$("logoutMini")].filter(Boolean);

    buttons.forEach((button) => {
      button.disabled = true;
      button.textContent = "…";
    });

    try {
      const authApi = window.TARBIYAH_AUTH;

      if (typeof authApi?.signOut === "function") {
        await authApi.signOut();
      } else {
        const client = [
          window.supabaseClient,
          window.TARBIYAH_SUPABASE,
          window.supabase
        ].find((c) => c?.auth?.signOut);

        if (!client) {
          throw new Error(
            "Fungsi logout Supabase tidak ditemukan."
          );
        }

        const { error } = await client.auth.signOut();

        if (error) throw error;
      }

      location.replace("./login-register.html");

    } catch (err) {
      console.error("[TARBIYAH] Logout gagal:", err);

      toast(
        err?.message ||
        "Logout gagal. Silakan coba kembali."
      );

      buttons.forEach((button) => {
        button.disabled = false;
        button.textContent = "↗";
      });
    }
  }

  $("logoutMini")?.addEventListener("click", logout);

  // =====================================================
  // DATE & INITIALIZATION
  // =====================================================

  if ($("currentYear")) {
    $("currentYear").textContent =
      new Date().getFullYear();
  }

  const today = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  if ($("todayLabel")) {
    $("todayLabel").textContent = today.toUpperCase();
  }

  hydrateUser().catch((err) => {
    console.warn(
      "[TARBIYAH] Gagal memuat profil:",
      err
    );
  });

})();
