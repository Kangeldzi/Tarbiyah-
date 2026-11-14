
/* ============================================================
   TARBIYAH — PROFIL ANGGOTA
   File       : js/profil-anggota.js
   Version    : 3.1 FULL REWRITE
   Backend    : Supabase
   Language   : Bahasa Indonesia

   PERBAIKAN:
   - Loading tidak berputar tanpa batas.
   - Timeout koneksi dan pengambilan data.
   - Loading selalu dihentikan pada akhir inisialisasi.
   - Kegagalan data tertentu tidak mengunci seluruh halaman.
   - Navigasi tab sesuai struktur HTML profil.
   - Edit dan simpan profil.
   - Upload foto profil.
   - Tema terang/gelap.
   - Logout dan pemeriksaan sesi.
   ============================================================ */

(() => {
  "use strict";

  /* ==========================================================
     1. KONFIGURASI
     ========================================================== */

  const CONFIG = {
    LOGIN_PAGE:
      window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
      "./login-register.html",

    DASHBOARD_PAGE:
      window.TARBIYAH_CONFIG?.DASHBOARD_PAGE ||
      "./dashboard.html",

    DEFAULT_LOGO:
      window.TARBIYAH_CONFIG?.DEFAULT_LOGO ||
      "./assets/icons/tarbiyah-mark.svg",

    AVATAR_BUCKET: "avatar",

    AVATAR_MAX_SIZE: 2 * 1024 * 1024,

    SIGNED_URL_DURATION: 3600,

    REQUEST_TIMEOUT: 12000,

    THEME_KEY: "tarbiyah-theme"
  };

  const supabase = window.tarbiyahSupabase;

  /* ==========================================================
     2. STATE
     ========================================================== */

  let currentUser = null;
  let profileData = null;
  let memberData = null;
  let roleData = [];

  let originalFormData = {};

  let isEditing = false;
  let eventsInitialized = false;
  let initializationStarted = false;

  let authSubscription = null;

  /* ==========================================================
     3. DOM HELPER
     ========================================================== */

  const $ = id => document.getElementById(id);

  function setText(id, value) {
    const element = $(id);

    if (!element) return;

    element.textContent =
      value === null ||
      value === undefined ||
      value === ""
        ? "—"
        : String(value);
  }

  function setValue(id, value) {
    const element = $(id);

    if (element) {
      element.value = value ?? "";
    }
  }

  function getValue(id) {
    const element = $(id);

    return element
      ? element.value.trim()
      : null;
  }

  /* ==========================================================
     4. TIMEOUT PROTECTION
     ========================================================== */

  function withTimeout(promise, label, timeout = CONFIG.REQUEST_TIMEOUT) {
    let timeoutId;

    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            label + " melebihi batas waktu " +
            Math.round(timeout / 1000) +
            " detik."
          )
        );
      }, timeout);
    });

    return Promise.race([
      promise,
      timeoutPromise
    ]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  /* ==========================================================
     5. NOTIFICATION
     ========================================================== */

  function notify(message, type = "info") {
    const toast = $("profileToast");
    const messageElement = $("toastMessage");

    if (!toast || !messageElement) {
      console.log("[TARBIYAH]", message);
      return;
    }

    messageElement.textContent = message;

    toast.dataset.type = type;
    toast.hidden = false;

    toast.style.setProperty(
      "display",
      "block",
      "important"
    );

    toast.classList.add("show");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
      toast.hidden = true;

      toast.style.removeProperty("display");
    }, 3500);
  }

  /* ==========================================================
     6. LOADING SCREEN

     Mencari elemen loading berdasarkan:
     - ID atau class yang umum digunakan.
     - Atribut data-loading.
     - Tulisan "Menyiapkan profil anggota..."

     Tidak bergantung pada satu nama ID tertentu.
     ========================================================== */

  function findLoadingElements() {
    const selectors = [
      "#profileLoading",
      "#loadingScreen",
      "#pageLoading",
      "#loadingOverlay",
      "#profileLoader",
      ".profile-loading",
      ".profile-loader",
      ".loading-screen",
      ".loading-overlay",
      ".page-loading",
      "[data-loading='profile']",
      "[data-profile-loading]"
    ];

    const found = new Set();

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        found.add(element);
      });
    });

    const allElements = document.body
      ? document.body.querySelectorAll("*")
      : [];

    allElements.forEach(element => {
      if (element.children.length > 2) return;

      const text = (element.textContent || "")
        .trim()
        .toLowerCase();

      if (
        text.includes("menyiapkan profil anggota") ||
        text.includes("memuat profil anggota")
      ) {
        let target = element;

        for (let i = 0; i < 4; i++) {
          if (!target.parentElement) break;

          const parent = target.parentElement;

          if (
            parent === document.body ||
            parent === document.documentElement
          ) {
            break;
          }

          const style = window.getComputedStyle(parent);

          const classText =
            typeof parent.className === "string"
              ? parent.className.toLowerCase()
              : "";

          if (
            style.position === "fixed" ||
            style.position === "absolute" ||
            /loading|loader|overlay|splash/.test(classText)
          ) {
            target = parent;
            break;
          }

          target = parent;
        }

        found.add(target);
      }
    });

    return Array.from(found);
  }

  function hideLoadingScreen() {
    const elements = findLoadingElements();

    elements.forEach(element => {
      element.hidden = true;

      element.setAttribute(
        "aria-hidden",
        "true"
      );

      element.classList.add("loaded");

      element.style.setProperty(
        "display",
        "none",
        "important"
      );

      element.style.setProperty(
        "visibility",
        "hidden",
        "important"
      );

      element.style.setProperty(
        "pointer-events",
        "none",
        "important"
      );
    });

    document.documentElement.classList.remove(
      "profile-loading",
      "loading"
    );

    document.body?.classList.remove(
      "profile-loading",
      "loading"
    );

    console.log(
      "[TARBIYAH] Loading screen dihentikan.",
      "Elemen ditemukan:",
      elements.length
    );
  }

  /* ==========================================================
     7. LOGO
     ========================================================== */

  function applyLogo() {
    const images = document.querySelectorAll(
      ".header-brand img, " +
      ".digital-card-header img, " +
      ".profile-footer img"
    );

    images.forEach(image => {
      image.src = CONFIG.DEFAULT_LOGO;

      image.onerror = () => {
        console.warn(
          "[TARBIYAH] Logo tidak ditemukan:",
          CONFIG.DEFAULT_LOGO
        );
      };
    });

    const favicon = document.querySelector(
      'link[rel="icon"]'
    );

    if (favicon) {
      favicon.href = CONFIG.DEFAULT_LOGO;
    }
  }

  /* ==========================================================
     8. THEME
     ========================================================== */

  function applyTheme() {
    try {
      const savedTheme = localStorage.getItem(
        CONFIG.THEME_KEY
      );

      if (
        savedTheme === "dark" ||
        savedTheme === "light"
      ) {
        document.documentElement.setAttribute(
          "data-theme",
          savedTheme
        );
      }
    } catch (error) {
      console.warn(
        "[TARBIYAH] Preferensi tema tidak dapat dibaca.",
        error
      );
    }

    updateThemeButton();
  }

  function updateThemeButton() {
    const button = $("btnTheme");

    if (!button) return;

    const theme =
      document.documentElement.getAttribute("data-theme") ||
      "dark";

    button.textContent =
      theme === "dark" ? "☀" : "☾";

    button.setAttribute(
      "aria-label",
      theme === "dark"
        ? "Aktifkan tema terang"
        : "Aktifkan tema gelap"
    );
  }

  function toggleTheme() {
    const root = document.documentElement;

    const current =
      root.getAttribute("data-theme") || "dark";

    const next =
      current === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", next);

    try {
      localStorage.setItem(
        CONFIG.THEME_KEY,
        next
      );
    } catch (error) {
      console.warn(
        "[TARBIYAH] Tema tidak dapat disimpan.",
        error
      );
    }

    updateThemeButton();
  }

  /* ==========================================================
     9. DATE FORMAT
     ========================================================== */

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getInitials(name) {
    if (!name) return "TA";

    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0].toUpperCase())
      .join("");
  }

  /* ==========================================================
     10. AUTHENTICATION
     ========================================================== */

  async function getCurrentUser() {
    if (!supabase) {
      throw new Error(
        "Supabase client tidak ditemukan. Periksa supabase-client.js."
      );
    }

    const result = await withTimeout(
      supabase.auth.getSession(),
      "Pemeriksaan sesi login"
    );

    if (result.error) {
      throw result.error;
    }

    const session = result.data?.session;

    if (!session?.user) {
      window.location.replace(CONFIG.LOGIN_PAGE);
      return null;
    }

    return session.user;
  }

  async function logout() {
    const button = $("btnLogout");

    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Keluar...";
      }

      const result = await withTimeout(
        supabase.auth.signOut(),
        "Proses logout"
      );

      if (result.error) {
        throw result.error;
      }

      window.location.replace(CONFIG.LOGIN_PAGE);

    } catch (error) {
      console.error("[TARBIYAH] Logout:", error);

      notify(
        error.message || "Gagal keluar dari akun.",
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Keluar";
      }
    }
  }

  /* ==========================================================
     11. LOAD PROFILE
     ========================================================== */

  async function loadProfile() {
    const result = await withTimeout(
      supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          username,
          phone,
          avatar_path,
          bio,
          created_at,
          updated_at
        `)
        .eq("id", currentUser.id)
        .maybeSingle(),
      "Pengambilan data profil"
    );

    if (result.error) {
      throw result.error;
    }

    profileData = result.data;

    if (!profileData) {
      throw new Error(
        "Data profil belum ditemukan di tabel profiles."
      );
    }

    return profileData;
  }

  /* ==========================================================
     12. LOAD MEMBERSHIP
     ========================================================== */

  async function loadMembership() {
    const result = await withTimeout(
      supabase
        .from("members")
        .select(`
          id,
          user_id,
          member_number,
          membership_status,
          submitted_at,
          reviewed_at,
          reviewed_by,
          review_note,
          created_at,
          updated_at
        `)
        .eq("user_id", currentUser.id)
        .maybeSingle(),
      "Pengambilan data keanggotaan"
    );

    if (result.error) {
      throw result.error;
    }

    memberData = result.data;

    return memberData;
  }

  /* ==========================================================
     13. LOAD ROLE
     ========================================================== */

  async function loadRole() {
    const result = await withTimeout(
      supabase
        .from("user_roles")
        .select("role_id, roles(name)")
        .eq("user_id", currentUser.id),
      "Pengambilan data peran"
    );

    if (result.error) {
      throw result.error;
    }

    roleData = result.data || [];

    return roleData;
  }

  function getRoleName() {
    if (!roleData.length) {
      return "Anggota";
    }

    const labels = {
      super_admin: "Super Admin",
      admin: "Administrator",
      registered_user: "Anggota Terdaftar",
      mentor: "Mentor",
      member: "Anggota"
    };

    const names = roleData
      .map(item => item.roles?.name)
      .filter(Boolean)
      .map(name => labels[name] || name);

    return names.length
      ? names.join(", ")
      : "Anggota";
  }

  /* ==========================================================
     14. AVATAR
     ========================================================== */

  async function getAvatarUrl(path) {
    if (!path) return null;

    const result = await withTimeout(
      supabase.storage
        .from(CONFIG.AVATAR_BUCKET)
        .createSignedUrl(
          path,
          CONFIG.SIGNED_URL_DURATION
        ),
      "Pengambilan foto profil"
    );

    if (result.error) {
      throw result.error;
    }

    return result.data?.signedUrl || null;
  }

  async function renderAvatar() {
    const ids = [
      "profileAvatar",
      "qrMemberAvatar"
    ];

    let avatarUrl = null;

    if (profileData?.avatar_path) {
      try {
        avatarUrl = await getAvatarUrl(
          profileData.avatar_path
        );
      } catch (error) {
        console.warn(
          "[TARBIYAH] Foto profil tidak dapat dimuat:",
          error
        );
      }
    }

    ids.forEach(id => {
      const image = $(id);

      if (!image) return;

      if (avatarUrl) {
        image.src = avatarUrl;
        image.hidden = false;
      } else {
        image.removeAttribute("src");
        image.hidden = true;
      }
    });

    document.querySelectorAll(
      "[data-profile-initials]"
    ).forEach(element => {
      element.textContent = getInitials(
        profileData?.full_name
      );
    });
  }

  /* ==========================================================
     15. RENDER PROFILE
     ========================================================== */

  async function renderProfile() {
    const name =
      profileData?.full_name ||
      currentUser?.user_metadata?.full_name ||
      "Pengguna TARBIYAH";

    setText("profileName", name);
    setText("profileEmail", currentUser?.email);

    setText("qrMemberName", name);

    setValue(
      "inputFullName",
      profileData?.full_name || name
    );

    setValue(
      "inputEmail",
      currentUser?.email
    );

    setValue(
      "inputPhone",
      profileData?.phone
    );

    if ($("inputUsername")) {
      setValue(
        "inputUsername",
        profileData?.username
      );
    }

    if ($("inputBio")) {
      setValue(
        "inputBio",
        profileData?.bio
      );
    }

    await renderAvatar();
  }

  /* ==========================================================
     16. RENDER MEMBERSHIP
     ========================================================== */

  function membershipStatusLabel(status) {
    const labels = {
      pending: "Menunggu Verifikasi",
      approved: "Anggota Aktif",
      active: "Anggota Aktif",
      rejected: "Ditolak",
      suspended: "Ditangguhkan",
      inactive: "Tidak Aktif"
    };

    return labels[status] || status || "Belum Terdaftar";
  }

  function renderMembership() {
    const status = memberData
      ? membershipStatusLabel(
          memberData.membership_status
        )
      : "Belum Terdaftar";

    const number =
      memberData?.member_number ||
      "Belum tersedia";

    const date =
      memberData?.submitted_at ||
      memberData?.created_at;

    setText("memberStatus", status);
    setText("memberNumber", number);
    setText("memberSince", formatDate(date));

    setText("membershipNumber", number);
    setText("membershipStatus", status);
    setText("membershipDate", formatDate(date));

    setText(
      "membershipGroup",
      "Belum ditentukan"
    );

    setText(
      "membershipRole",
      getRoleName()
    );

    setText(
      "membershipUpdated",
      formatDate(memberData?.updated_at)
    );

    setText("qrMemberNumber", number);
    setText("qrMemberStatus", status);
  }

  /* ==========================================================
     17. ACCOUNT STATUS
     ========================================================== */

  function renderAccountStatus() {
    setText(
      "accountStatus",
      currentUser ? "Akun Terhubung" : "Tidak Terhubung"
    );

    const verified =
      currentUser?.email_confirmed_at ||
      currentUser?.confirmed_at;

    setText(
      "emailVerificationStatus",
      verified
        ? "Email Terverifikasi"
        : "Email Belum Terverifikasi"
    );
  }

  /* ==========================================================
     18. EDIT PROFILE
     ========================================================== */

  function getEditableFields() {
    return [
      "inputFullName",
      "inputPhone",
      "inputUsername",
      "inputBio"
    ]
      .map(id => $(id))
      .filter(Boolean);
  }

  function captureFormData() {
    const data = {};

    getEditableFields().forEach(field => {
      data[field.id] = field.value;
    });

    return data;
  }

  function restoreFormData() {
    Object.entries(originalFormData).forEach(
      ([id, value]) => {
        setValue(id, value);
      }
    );
  }

  function setEditMode(enabled) {
    isEditing = Boolean(enabled);

    if (isEditing) {
      originalFormData = captureFormData();
    } else {
      restoreFormData();
    }

    getEditableFields().forEach(field => {
      field.disabled = !isEditing;
    });

    if ($("btnEditProfile")) {
      $("btnEditProfile").hidden = isEditing;
    }

    if ($("profileEditActions")) {
      $("profileEditActions").hidden = !isEditing;
    }

    if ($("btnSaveProfile")) {
      $("btnSaveProfile").disabled = false;
    }
  }

  /* ==========================================================
     19. SAVE PROFILE
     ========================================================== */

  async function saveProfile(event) {
    event?.preventDefault();

    if (!currentUser || !isEditing) return;

    const button = $("btnSaveProfile");

    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Menyimpan...";
      }

      const fullName = getValue("inputFullName");

      if (!fullName) {
        throw new Error(
          "Nama lengkap wajib diisi."
        );
      }

      const payload = {
        full_name: fullName,
        phone: getValue("inputPhone") || null,
        updated_at: new Date().toISOString()
      };

      if ($("inputUsername")) {
        payload.username =
          getValue("inputUsername") || null;
      }

      if ($("inputBio")) {
        payload.bio =
          getValue("inputBio") || null;
      }

      const result = await withTimeout(
        supabase
          .from("profiles")
          .update(payload)
          .eq("id", currentUser.id)
          .select(`
            id,
            full_name,
            username,
            phone,
            avatar_path,
            bio,
            created_at,
            updated_at
          `)
          .maybeSingle(),
        "Penyimpanan profil"
      );

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error(
          "Profil tidak berhasil diperbarui. Periksa kebijakan RLS."
        );
      }

      profileData = result.data;

      await renderProfile();

      originalFormData = captureFormData();

      setEditMode(false);

      notify(
        "Profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Save profile:",
        error
      );

      notify(
        error.message || "Gagal menyimpan profil.",
        "error"
      );

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Simpan Perubahan";
      }
    }
  }

  /* ==========================================================
     20. UPLOAD AVATAR
     ========================================================== */

  async function uploadAvatar(file) {
    if (!file || !currentUser) return;

    try {
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error(
          "Format foto harus JPG, PNG, atau WEBP."
        );
      }

      if (file.size > CONFIG.AVATAR_MAX_SIZE) {
        throw new Error(
          "Ukuran foto maksimal 2 MB."
        );
      }

      notify(
        "Sedang mengunggah foto profil...",
        "info"
      );

      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      }[file.type];

      const filePath =
        `${currentUser.id}/${Date.now()}.${extension}`;

      const oldPath =
        profileData?.avatar_path || null;

      const uploadResult = await withTimeout(
        supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          }),
        "Upload foto profil"
      );

      if (uploadResult.error) {
        throw uploadResult.error;
      }

      const updateResult = await withTimeout(
        supabase
          .from("profiles")
          .update({
            avatar_path: filePath,
            updated_at: new Date().toISOString()
          })
          .eq("id", currentUser.id)
          .select(`
            id,
            full_name,
            username,
            phone,
            avatar_path,
            bio,
            created_at,
            updated_at
          `)
          .maybeSingle(),
        "Pembaruan data foto profil"
      );

      if (updateResult.error || !updateResult.data) {
        await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .remove([filePath]);

        if (updateResult.error) {
          throw updateResult.error;
        }

        throw new Error(
          "Foto belum berhasil disimpan ke profil."
        );
      }

      profileData = updateResult.data;

      await renderAvatar();

      if (oldPath && oldPath !== filePath) {
        const removeResult = await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .remove([oldPath]);

        if (removeResult.error) {
          console.warn(
            "[TARBIYAH] Foto lama belum terhapus:",
            removeResult.error
          );
        }
      }

      notify(
        "Foto profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Upload avatar:",
        error
      );

      notify(
        error.message || "Gagal mengunggah foto.",
        "error"
      );

    } finally {
      if ($("avatarInput")) {
        $("avatarInput").value = "";
      }
    }
  }

  /* ==========================================================
     21. NAVIGATION TABS
     ========================================================== */

  function setupTabs() {
    const buttons = document.querySelectorAll(
      ".profile-tabs [data-tab]"
    );

    const panels = document.querySelectorAll(
      ".profile-tab-content"
    );

    if (!buttons.length || !panels.length) {
      console.warn(
        "[TARBIYAH] Navigasi tab atau panel tidak ditemukan."
      );
      return;
    }

    function activateTab(name) {
      const target = $("tab-" + name);

      if (!target) return;

      buttons.forEach(button => {
        const active =
          button.dataset.tab === name;

        button.classList.toggle("active", active);

        button.setAttribute(
          "aria-selected",
          String(active)
        );
      });

      panels.forEach(panel => {
        const active =
          panel.id === "tab-" + name;

        panel.hidden = !active;

        panel.classList.toggle(
          "active",
          active
        );

        panel.style.display =
          active ? "" : "none";
      });
    }

    buttons.forEach(button => {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tab);
      });
    });

    const activeButton = document.querySelector(
      ".profile-tabs [data-tab].active"
    );

    activateTab(
      activeButton?.dataset.tab || "personal"
    );
  }

  /* ==========================================================
     22. ACTIVITY PLACEHOLDER
     ========================================================== */

  function renderAttendanceNotice() {
    setText("totalKajian", "—");
    setText("totalAttendance", "—");
    setText("attendancePercentage", "—");

    const history = $("attendanceHistory");

    if (history) {
      history.textContent =
        "Riwayat kajian dan kehadiran belum tersedia. " +
        "Fitur ini menunggu integrasi tabel kajian dan kehadiran.";
    }
  }

  /* ==========================================================
     23. QR MEMBER
     ========================================================== */

  function setupQR() {
    $("btnGenerateQR")?.addEventListener(
      "click",
      () => {
        notify(
          "Penerbitan QR anggota belum diaktifkan. " +
          "Integrasi layanan penerbit token perlu diverifikasi.",
          "info"
        );
      }
    );

    $("btnDownloadQR")?.addEventListener(
      "click",
      () => {
        notify(
          "QR anggota belum tersedia untuk diunduh.",
          "info"
        );
      }
    );
  }

  /* ==========================================================
     24. EVENT LISTENERS
     ========================================================== */

  function setupEvents() {
    if (eventsInitialized) return;

    eventsInitialized = true;

    $("btnBack")?.addEventListener(
      "click",
      () => {
        window.location.href = CONFIG.DASHBOARD_PAGE;
      }
    );

    $("btnEditProfile")?.addEventListener(
      "click",
      () => setEditMode(true)
    );

    $("btnCancelEdit")?.addEventListener(
      "click",
      () => setEditMode(false)
    );

    $("personalProfileForm")?.addEventListener(
      "submit",
      saveProfile
    );

    $("btnChangeAvatar")?.addEventListener(
      "click",
      () => $("avatarInput")?.click()
    );

    $("avatarInput")?.addEventListener(
      "change",
      event => {
        const file = event.target.files?.[0];

        if (file) {
          uploadAvatar(file);
        }
      }
    );

    $("btnTheme")?.addEventListener(
      "click",
      toggleTheme
    );

    $("btnNotifications")?.addEventListener(
      "click",
      () => {
        notify(
          "Belum ada notifikasi baru untuk akun Anda.",
          "info"
        );
      }
    );

    $("btnLogout")?.addEventListener(
      "click",
      logout
    );

    [
      "inputGender",
      "inputBirthDate",
      "inputCity",
      "inputAddress"
    ].forEach(id => {
      const field = $(id);

      if (field) {
        field.disabled = true;

        field.title =
          "Kolom ini belum tersedia pada database TARBIYAH.";
      }
    });

    setupTabs();
    setupQR();
  }

  /* ==========================================================
     25. LOAD DATA SECARA BERTAHAP

     Profil merupakan data utama.
     Keanggotaan dan role dimuat secara terpisah
     agar kegagalan salah satunya tidak mengunci halaman.
     ========================================================== */

  async function loadAllData() {
    await loadProfile();

    await renderProfile();

    const results = await Promise.allSettled([
      loadMembership(),
      loadRole()
    ]);

    if (results[0].status === "rejected") {
      console.error(
        "[TARBIYAH] Data membership gagal:",
        results[0].reason
      );

      memberData = null;
    }

    if (results[1].status === "rejected") {
      console.error(
        "[TARBIYAH] Data role gagal:",
        results[1].reason
      );

      roleData = [];
    }

    renderMembership();
    renderAccountStatus();
    renderAttendanceNotice();
  }

  /* ==========================================================
     26. AUTH STATE LISTENER
     ========================================================== */

  function setupAuthListener() {
    if (!supabase || authSubscription) return;

    const result = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          !session?.user
        ) {
          window.location.replace(
            CONFIG.LOGIN_PAGE
          );
        }
      }
    );

    authSubscription =
      result.data?.subscription || null;
  }

  /* ==========================================================
     27. MAIN INITIALIZATION

     PENTING:
     hideLoadingScreen() dijalankan pada finally.
     Dengan demikian, layar loading tidak dibiarkan
     berputar tanpa batas akibat kegagalan proses.
     ========================================================== */

  async function initialize() {
    if (initializationStarted) return;

    initializationStarted = true;

    console.log(
      "[TARBIYAH] Memulai Profil Anggota v3.1..."
    );

    try {
      applyLogo();
      applyTheme();

      /*
       * Pasang tombol dan tab sebelum
       * mengambil data dari backend.
       */

      setupEvents();

      if (!supabase) {
        throw new Error(
          "Supabase client tidak ditemukan. " +
          "Periksa urutan script HTML."
        );
      }

      /*
       * Pemeriksaan sesi login.
       */

      currentUser = await getCurrentUser();

      if (!currentUser) return;

      /*
       * Siapkan data awal agar halaman
       * tetap dapat menampilkan identitas akun.
       */

      setText(
        "profileName",
        currentUser.user_metadata?.full_name ||
        currentUser.email ||
        "Pengguna TARBIYAH"
      );

      setText(
        "profileEmail",
        currentUser.email
      );

      /*
       * Muat data utama dan data pendukung.
       */

      await loadAllData();

      /*
       * Siapkan mode edit setelah data dimuat.
       */

      originalFormData = captureFormData();

      setEditMode(false);

      console.log(
        "[TARBIYAH] Profil selesai dimuat.",
        {
          userId: currentUser.id,
          profileLoaded: Boolean(profileData),
          membershipLoaded: Boolean(memberData),
          roleLoaded: roleData.length > 0
        }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal memuat profil:",
        error
      );

      notify(
        error.message ||
        "Terjadi kesalahan ketika memuat profil.",
        "error"
      );

      /*
       * Tampilkan identitas dasar dari sesi
       * meskipun pengambilan profil gagal.
       */

      if (currentUser) {
        setText(
          "profileName",
          currentUser.user_metadata?.full_name ||
          currentUser.email
        );

        setText(
          "profileEmail",
          currentUser.email
        );

        renderAccountStatus();
      }

    } finally {
      /*
       * WAJIB: hentikan layar loading
       * baik proses berhasil maupun gagal.
       */

      hideLoadingScreen();

      console.log(
        "[TARBIYAH] Proses inisialisasi berakhir."
      );
    }

    setupAuthListener();
  }

  /* ==========================================================
     28. START APPLICATION
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
