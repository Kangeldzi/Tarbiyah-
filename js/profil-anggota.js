
/* ============================================================
   TARBIYAH — PROFIL ANGGOTA
   File       : js/profil-anggota.js
   Version    : 4.0 COMPLETE QR MEMBER CARD
   Backend    : Supabase
   Language   : Bahasa Indonesia

   FITUR:
   - Autentikasi dan pemuatan profil.
   - Edit dan simpan data pribadi.
   - Upload foto profil.
   - Theme dark/light.
   - Membership dan role.
   - Navigasi tab.
   - Integrasi Edge Function member-qr-mint.
   - QR Code resmi dari backend.
   - Memperbarui QR.
   - Mengunduh KARTU ANGGOTA LENGKAP dalam PNG.
   - Masa berlaku QR dari server.
   - Tombol download otomatis aktif setelah QR berhasil.
   - Token QR tidak disimpan di localStorage.
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
    AVATAR_UPLOAD_TIMEOUT: 45000,
    AVATAR_UPDATE_TIMEOUT: 20000,
    THEME_KEY: "tarbiyah-theme",

    QR_FUNCTION: "member-qr-mint",

    QR_LIBRARY:
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",

    HTML2CANVAS_LIBRARY:
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",

    QR_SIZE: 320,
    QR_COLOR_DARK: "#102a22",
    QR_COLOR_LIGHT: "#ffffff",

    CARD_DOWNLOAD_SCALE: 3
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

  let activeQrToken = null;
  let activeQrImage = null;
  let activeQrExpiry = null;
  let activeQrTokenId = null;

  let qrLibraryPromise = null;
  let html2canvasPromise = null;

  let qrIssuing = false;
  let cardDownloading = false;

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

  function withTimeout(
    promise,
    label,
    timeout = CONFIG.REQUEST_TIMEOUT
  ) {
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
     ========================================================== */

  function hideLoadingScreen() {
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
      ".page-loading"
    ];

    const elements = new Set();

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        elements.add(element);
      });
    });

    elements.forEach(element => {
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");

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
      "[TARBIYAH] Loading screen dihentikan."
    );
  }

  /* ==========================================================
     7. LOGO
     ========================================================== */

  function applyLogo() {
    document.querySelectorAll(
      ".header-brand img, " +
      ".digital-card-header img, " +
      ".profile-footer img"
    ).forEach(image => {
      image.src = CONFIG.DEFAULT_LOGO;
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
  const themeController = window.TARBIYAH_THEME_CONTROLLER;

  if (!themeController) {
    console.error(
      "[TARBIYAH] tarbiyah-theme.js belum dimuat."
    );
    return;
  }

  themeController.init();
}


  
function updateThemeButton() {
  const themeController = window.TARBIYAH_THEME_CONTROLLER;

  if (!themeController) return;

  const button = document.getElementById("btnTheme");
  if (!button) return;

  const theme = themeController.getTheme();

  button.textContent = theme === "dark" ? "☀" : "☾";

  button.setAttribute(
    "aria-label",
    theme === "dark"
      ? "Aktifkan Light Mode"
      : "Aktifkan Dark Mode"
  );

  button.setAttribute(
    "title",
    theme === "dark"
      ? "Ganti ke Light Mode"
      : "Ganti ke Dark Mode"
  );
}



function toggleTheme() {
  const themeController = window.TARBIYAH_THEME_CONTROLLER;

  if (!themeController) {
    console.error(
      "[TARBIYAH] Pengendali tema pusat tidak ditemukan."
    );
    return;
  }

  return themeController.toggleTheme();
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

  function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
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

      clearQrMemory();

      window.location.replace(CONFIG.LOGIN_PAGE);

    } catch (error) {
      console.error("[TARBIYAH] Logout:", error);

      notify(
        error.message || "Gagal keluar dari akun.",
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Keluar dari Akun";
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
          gender,
          birth_date,
          city,
          address,
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
        image.crossOrigin = "anonymous";
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
      setValue("inputUsername", profileData?.username);
    }

    if ($("inputBio")) {
      setValue("inputBio", profileData?.bio);
    }

    setValue("inputGender", profileData?.gender);
    setValue("inputBirthDate", profileData?.birth_date);
    setValue("inputCity", profileData?.city);
    setValue("inputAddress", profileData?.address);

    document.querySelectorAll(
      "[data-profile-qr-member-name]"
    ).forEach(element => {
      element.textContent = name;
    });

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

    setText("membershipGroup", "Belum ditentukan");
    setText("membershipRole", getRoleName());

    setText(
      "membershipUpdated",
      formatDate(memberData?.updated_at)
    );

    setText("qrMemberNumber", number);
    setText("qrMemberStatus", status);

    document.querySelectorAll(
      "[data-profile-qr-member-id]"
    ).forEach(element => {
      element.textContent = number;
    });

    document.querySelectorAll(
      "[data-profile-card-status]"
    ).forEach(element => {
      element.textContent = status;
    });
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
    const editableIds = [
      "inputFullName",
      "inputPhone",
      "inputUsername",
      "inputBio",
      "inputGender",
      "inputBirthDate",
      "inputCity",
      "inputAddress"
    ];

    return editableIds
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
      ([id, value]) => setValue(id, value)
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
      field.removeAttribute("readonly");
    });

    const emailField = $("inputEmail");

    if (emailField) {
      emailField.disabled = true;
      emailField.setAttribute("aria-readonly", "true");
    }

    if ($("btnEditProfile")) {
      $("btnEditProfile").hidden = isEditing;
    }

    if ($("profileEditActions")) {
      $("profileEditActions").hidden = !isEditing;
    }

    if ($("btnSaveProfile")) {
      $("btnSaveProfile").disabled = false;
      $("btnSaveProfile").textContent = "Simpan Perubahan";
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

      if (!fullName || fullName.length < 2) {
        throw new Error(
          "Nama lengkap minimal 2 karakter."
        );
      }

      const payload = {
        full_name: fullName,
        phone: getValue("inputPhone") || null,
        gender: getValue("inputGender") || null,
        birth_date: getValue("inputBirthDate") || null,
        city: getValue("inputCity") || null,
        address: getValue("inputAddress") || null,
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
            gender,
            birth_date,
            city,
            address,
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
      isEditing = false;

      getEditableFields().forEach(field => {
        field.disabled = true;
      });

      if ($("inputEmail")) {
        $("inputEmail").disabled = true;
      }

      if ($("btnEditProfile")) {
        $("btnEditProfile").hidden = false;
      }

      if ($("profileEditActions")) {
        $("profileEditActions").hidden = true;
      }

      notify(
        "Profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      console.error("[TARBIYAH] Save profile:", error);

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

  let uploadedPath = null;

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

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    }[file.type];

    const filePath =
      `${currentUser.id}/${Date.now()}.${extension}`;

    const oldPath = profileData?.avatar_path || null;

    notify(
      "Sedang mengunggah foto profil...",
      "info"
    );

    console.info("[TARBIYAH] Upload avatar dimulai", {
      size: file.size,
      type: file.type
    });

    // TAHAP 1 — UPLOAD KE STORAGE
    const uploadResult = await withTimeout(
      supabase.storage
        .from(CONFIG.AVATAR_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        }),
      "Upload foto profil",
      CONFIG.AVATAR_UPLOAD_TIMEOUT
    );

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    uploadedPath = filePath;

    console.info(
      "[TARBIYAH] Upload Storage berhasil."
    );

    // TAHAP 2 — SIMPAN PATH KE DATABASE
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
          gender,
          birth_date,
          city,
          address,
          avatar_path,
          bio,
          created_at,
          updated_at
        `)
        .maybeSingle(),
      "Pembaruan data foto profil",
      CONFIG.AVATAR_UPDATE_TIMEOUT
    );

    if (updateResult.error) {
      throw updateResult.error;
    }

    if (!updateResult.data) {
      throw new Error(
        "Foto berhasil diunggah, tetapi data profil tidak berhasil diperbarui."
      );
    }

    // TAHAP 3 — PERBARUI DATA PROFIL
    profileData = updateResult.data;

    await renderAvatar();

    // TAHAP 4 — HAPUS FOTO LAMA SETELAH FOTO BARU TERSIMPAN
    if (oldPath && oldPath !== filePath) {
      const removeResult = await supabase.storage
        .from(CONFIG.AVATAR_BUCKET)
        .remove([oldPath]);

      if (removeResult.error) {
        console.warn(
          "[TARBIYAH] Foto lama belum berhasil dihapus:",
          removeResult.error
        );
      }
    }

    uploadedPath = null;

    notify(
      "Foto profil berhasil diperbarui.",
      "success"
    );

    console.info(
      "[TARBIYAH] Foto profil berhasil diperbarui."
    );

  } catch (error) {
    console.error(
      "[TARBIYAH] Upload avatar gagal:",
      {
        name: error?.name || "Unknown",
        message: error?.message || String(error),
        status: error?.status,
        statusCode: error?.statusCode,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error
      }
    );

    // Bersihkan file baru jika proses penyimpanan database gagal.
    if (uploadedPath) {
      try {
        const cleanup = await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .remove([uploadedPath]);

        if (cleanup.error) {
          console.warn(
            "[TARBIYAH] Pembersihan file gagal:",
            cleanup.error
          );
        }
      } catch (cleanupError) {
        console.warn(
          "[TARBIYAH] Pembersihan file mengalami kendala:",
          cleanupError
        );
      }
    }

    notify(
      error?.message ||
      "Gagal mengunggah foto profil. Silakan coba kembali.",
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

    if (!buttons.length || !panels.length) return;

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
        panel.classList.toggle("active", active);
        panel.style.display = active ? "" : "none";
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
     22. RIWAYAT PRESENSI ANGGOTA — SUPABASE
     ========================================================== */
    
async function loadAttendanceHistory() {
  const container = $("attendanceHistory");

  const totalKajianEl = $("totalKajian");
  const totalAttendanceEl = $("totalAttendance");
  const percentageEl = $("attendancePercentage");

  // ==========================================
  // 1. FUNGSI STATISTIK PROFIL
  // ==========================================

  const setStats = (total, present) => {
    const percentage = total
      ? Math.round((present / total) * 100)
      : 0;

    if (totalKajianEl) {
      totalKajianEl.textContent =
        total.toLocaleString("id-ID");
    }

    if (totalAttendanceEl) {
      totalAttendanceEl.textContent =
        present.toLocaleString("id-ID");
    }

    if (percentageEl) {
      percentageEl.textContent =
        percentage + "%";
    }
  };

  // ==========================================
  // 2. PESAN KOSONG / ERROR
  // ==========================================

  const showMessage = (title, description) => {
    if (!container) return;

    container.replaceChildren();

    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";

    const heading = document.createElement("strong");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    wrapper.append(heading, paragraph);
    container.appendChild(wrapper);
  };

  if (!container) {
    console.warn(
      "[TARBIYAH] Elemen #attendanceHistory tidak ditemukan."
    );
    return;
  }

  container.replaceChildren();

  // ==========================================
  // 3. VALIDASI DATA ANGGOTA
  // ==========================================

  if (!memberData?.id) {
    setStats(0, 0);

    showMessage(
      "Data keanggotaan belum tersedia",
      "Riwayat kehadiran akan tampil setelah akun terhubung dengan data anggota TARBIYAH."
    );

    return;
  }

  // ==========================================
  // 4. NORMALISASI STATUS
  // ==========================================

  const normalizeStatus = value => {
    const status = String(value || "")
      .toLowerCase()
      .trim();

    if (
      ["hadir", "present", "attended"].includes(status)
    ) return "hadir";

    if (
      ["izin", "permission"].includes(status)
    ) return "izin";

    if (
      ["sakit", "sick"].includes(status)
    ) return "sakit";

    if (
      ["alpa", "absent"].includes(status)
    ) return "alpa";

    return "unknown";
  };

  const uniqueIds = values =>
    [...new Set((values || []).filter(Boolean))];

  try {

    // ==========================================
    // 5. AMBIL ARSIP PERTEMUAN HISTORIS
    // ==========================================

    const meetingsResult = await withTimeout(
      supabase
        .from("historical_meetings")
        .select(`
          id,
          meeting_number,
          meeting_date,
          title,
          location_name,
          description
        `)
        .order("meeting_number", {
          ascending: true
        }),
      "Pengambilan arsip pertemuan"
    );

    if (meetingsResult.error) {
      throw meetingsResult.error;
    }

    const meetings = meetingsResult.data || [];

    const meetingIds = uniqueIds(
      meetings.map(row => row.id)
    );

    // ==========================================
    // 6. AMBIL PRESENSI HISTORIS ANGGOTA
    // ==========================================

    let historicalAttendance = [];

    if (meetingIds.length) {
      const attendanceResult = await withTimeout(
        supabase
          .from("historical_meeting_attendance")
          .select(`
            id,
            meeting_id,
            attendance_status,
            attendance_note,
            created_at
          `)
          .eq("member_id", memberData.id)
          .in("meeting_id", meetingIds),
        "Pengambilan presensi historis"
      );

      if (attendanceResult.error) {
        throw attendanceResult.error;
      }

      historicalAttendance =
        attendanceResult.data || [];
    }

    const historicalMap = new Map();

    historicalAttendance.forEach(row => {
      historicalMap.set(row.meeting_id, row);
    });

    const historicalRecords = meetings.map(meeting => {
      const attendance =
        historicalMap.get(meeting.id);

      return {
        source: "historical",

        title:
          meeting.title || "Pertemuan Historis",

        date:
          meeting.meeting_date || null,

        location:
          meeting.location_name || "",

        status: attendance
          ? normalizeStatus(
              attendance.attendance_status
            )
          : "unknown",

        note:
          attendance?.attendance_note || "",

        meetingNumber:
          meeting.meeting_number
      };
    });

    // ==========================================
    // 7. AMBIL AGENDA KAJIAN TERBARU
    // ==========================================

    const agendasResult = await withTimeout(
      supabase
        .from("kajian_agenda")
        .select(`
          id,
          title,
          starts_at,
          location_name,
          location_address
        `)
        .order("starts_at", {
          ascending: false
        })
        .limit(500),
      "Pengambilan agenda kajian"
    );

    if (agendasResult.error) {
      throw agendasResult.error;
    }

    const agendas = agendasResult.data || [];

    const agendaIds = uniqueIds(
      agendas.map(row => row.id)
    );

    // ==========================================
    // 8. AMBIL PRESENSI KAJIAN TERBARU
    // ==========================================

    let latestAttendance = [];

    if (agendaIds.length) {
      const attendanceResult = await withTimeout(
        supabase
          .from("kajian_attendance")
          .select(`
            id,
            agenda_id,
            attended_at,
            attendance_method,
            attendance_status,
            manual_reason,
            created_at
          `)
          .eq("member_id", memberData.id)
          .in("agenda_id", agendaIds)
          .order("attended_at", {
            ascending: false
          }),
        "Pengambilan presensi kajian terbaru"
      );

      if (attendanceResult.error) {
        throw attendanceResult.error;
      }

      latestAttendance =
        attendanceResult.data || [];
    }

    const latestMap = new Map();

    latestAttendance.forEach(row => {
      if (!latestMap.has(row.agenda_id)) {
        latestMap.set(row.agenda_id, row);
      }
    });

    const latestRecords = agendas.map(agenda => {
      const attendance =
        latestMap.get(agenda.id);

      return {
        source: "latest",

        title:
          agenda.title || "Kajian TARBIYAH",

        date:
          agenda.starts_at ||
          attendance?.attended_at ||
          null,

        location:
          agenda.location_name ||
          agenda.location_address ||
          "",

        status: attendance
          ? normalizeStatus(
              attendance.attendance_status
            )
          : "unknown",

        method:
          attendance?.attendance_method || ""
      };
    });

    // ==========================================
    // 9. HITUNG STATISTIK KEHADIRAN
    // ==========================================

    // Statistik mengikuti halaman kehadiran.html.
    // Hanya arsip historis yang menjadi dasar
    // perhitungan persentase.

    const historicalTotal =
      historicalRecords.length;

    const historicalPresent =
      historicalRecords.filter(
        row => row.status === "hadir"
      ).length;

    setStats(
      historicalTotal,
      historicalPresent
    );

    // ==========================================
    // 10. GABUNGKAN DAN URUTKAN RIWAYAT
    // ==========================================

    const records = [
      ...historicalRecords,
      ...latestRecords
    ].sort((a, b) => {
      const aTime = a.date
        ? new Date(a.date).getTime()
        : 0;

      const bTime = b.date
        ? new Date(b.date).getTime()
        : 0;

      return bTime - aTime;
    });

    if (!records.length) {
      showMessage(
        "Belum ada riwayat kajian",
        "Catatan akan muncul setelah agenda kajian atau arsip pertemuan tersedia."
      );

      return;
    }

    // ==========================================
    // 11. LABEL STATUS KEHADIRAN
    // ==========================================

    const labels = {
      hadir: "Hadir",
      izin: "Izin",
      sakit: "Sakit",
      alpa: "Alpa",
      unknown: "Belum ada catatan"
    };

    // ==========================================
    // 12. TAMPILKAN RIWAYAT TERBARU
    // ==========================================

    records.slice(0, 10).forEach(item => {

      const article =
        document.createElement("article");

      article.className =
        "profile-history-item";

      const marker =
        document.createElement("span");

      marker.className =
        "profile-history-marker";

      marker.setAttribute(
        "aria-hidden",
        "true"
      );

      marker.textContent =
        item.status === "hadir" ? "✓" : "•";

      const content =
        document.createElement("div");

      content.className =
        "profile-history-content";

      const heading =
        document.createElement("h3");

      heading.className =
        "profile-history-title";

      heading.textContent =
        item.title;

      const meta =
        document.createElement("div");

      meta.className =
        "profile-history-meta";

      const date =
        document.createElement("span");

      const dateValue = item.date
        ? new Date(item.date)
        : null;

      date.textContent =
        dateValue &&
        !Number.isNaN(dateValue.getTime())
          ? new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "Asia/Jakarta"
            }).format(dateValue)
          : "Tanggal belum tersedia";

      meta.appendChild(date);

      content.append(
        heading,
        meta
      );

      if (item.location) {
        const location =
          document.createElement("small");

        location.textContent =
          item.location;

        content.appendChild(location);
      }

      const status =
        document.createElement("span");

      status.className =
        "profile-history-status";

      status.textContent =
        labels[item.status] || labels.unknown;

      if (item.source === "historical") {
        status.textContent +=
          " · Arsip Historis";

      } else if (item.method === "qr") {
        status.textContent +=
          " · QR Code";

      } else if (item.method === "manual") {
        status.textContent +=
          " · Manual Admin";
      }

      article.append(
        marker,
        content,
        status
      );

      container.appendChild(article);
    });

    console.info(
      "[TARBIYAH] Riwayat profil berhasil dimuat.",
      {
        historicalTotal,
        historicalPresent,
        latestAgendaTotal: latestRecords.length,
        displayed: Math.min(records.length, 10)
      }
    );

  } catch (error) {

    console.error(
      "[TARBIYAH] Gagal memuat riwayat profil:",
      error
    );

    setStats(0, 0);

    showMessage(
      "Riwayat belum dapat dimuat",
      error?.message ||
        "Periksa koneksi dan akses data Supabase."
    );
  }
}


  /* ==========================================================
     23. QR — ELEMENT HELPERS
     ========================================================== */

  function getQrImage() {
    return (
      $("memberQrImage") ||
      $("qrMemberImage") ||
      $("qrCodeImage")
    );
  }

  function getQrPlaceholder() {
    return document.querySelector(
      "[data-profile-qr-placeholder]"
    );
  }

  function getQrContainer() {
    return (
      $("memberQRCode") ||
      document.querySelector(".qr-container") ||
      document.querySelector(".profile-qr-image-wrap") ||
      document.querySelector(".profile-qr-content")
    );
  }

  function getQrExpiryElement() {
    return (
      $("memberQrExpiry") ||
      document.querySelector("[data-qr-expiry]")
    );
  }

  function getMemberCardElement() {
    return document.querySelector(".digital-member-card");
  }

  /* ==========================================================
     24. QR — DOWNLOAD BUTTON STATE
     ========================================================== */

  function setDownloadButtonState(enabled, label) {
    const button = $("btnDownloadQR");

    if (!button) return;

    button.disabled = !enabled;
    button.setAttribute(
      "aria-disabled",
      String(!enabled)
    );

    if (label) {
      button.innerHTML = label;
    } else if (enabled) {
      button.innerHTML = "<span>↓</span> Unduh Kartu";
    } else {
      button.innerHTML = "<span>↓</span> Unduh Kartu";
    }

    button.title = enabled
      ? "Unduh kartu anggota TARBIYAH dalam format PNG"
      : "Terbitkan QR anggota terlebih dahulu";
  }

  /* ==========================================================
     25. QR — LOAD QRCode.js
     ========================================================== */

  function isQRCodeJsReady() {
    return (
      typeof window.QRCode === "function" &&
      window.QRCode.CorrectLevel !== undefined
    );
  }

  function loadQrLibrary() {
    if (isQRCodeJsReady()) {
      return Promise.resolve(window.QRCode);
    }

    if (qrLibraryPromise) {
      return qrLibraryPromise;
    }

    qrLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = CONFIG.QR_LIBRARY;
      script.async = true;
      script.dataset.tarbiyahQrLibrary = "true";

      script.onload = () => {
        if (isQRCodeJsReady()) {
          resolve(window.QRCode);
        } else {
          reject(
            new Error(
              "QRCode.js dimuat tetapi constructor tidak ditemukan."
            )
          );
        }
      };

      script.onerror = () => {
        reject(
          new Error(
            "Gagal memuat QRCode.js. Periksa koneksi internet."
          )
        );
      };

      document.head.appendChild(script);
    }).catch(error => {
      qrLibraryPromise = null;
      console.error(
        "[TARBIYAH] QRCode.js:",
        error.message
      );
      throw error;
    });

    return qrLibraryPromise;
  }

  /* ==========================================================
     26. QR — CREATE PNG DATA URL
     ========================================================== */

  async function createQrDataUrl(token) {
    if (!token || typeof token !== "string") {
      throw new Error(
        "Token QR dari server tidak valid."
      );
    }

    const QRCodeLibrary = await loadQrLibrary();

    const temporaryContainer = document.createElement("div");

    temporaryContainer.setAttribute(
      "aria-hidden",
      "true"
    );

    temporaryContainer.style.position = "fixed";
    temporaryContainer.style.left = "-10000px";
    temporaryContainer.style.top = "-10000px";
    temporaryContainer.style.width = CONFIG.QR_SIZE + "px";
    temporaryContainer.style.height = CONFIG.QR_SIZE + "px";
    temporaryContainer.style.overflow = "hidden";
    temporaryContainer.style.background = "#ffffff";

    document.body.appendChild(temporaryContainer);

    try {
      const correctionLevel =
        QRCodeLibrary.CorrectLevel.H ??
        QRCodeLibrary.CorrectLevel.M;

      new QRCodeLibrary(temporaryContainer, {
        text: token,
        width: CONFIG.QR_SIZE,
        height: CONFIG.QR_SIZE,
        colorDark: CONFIG.QR_COLOR_DARK,
        colorLight: CONFIG.QR_COLOR_LIGHT,
        correctLevel: correctionLevel
      });

      const canvas =
        temporaryContainer.querySelector("canvas");

      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");

        if (dataUrl.startsWith("data:image/png")) {
          return dataUrl;
        }
      }

      const image =
        temporaryContainer.querySelector("img");

      if (image?.src) {
        if (!image.complete) {
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
          });
        }

        if (image.src.startsWith("data:image/")) {
          return image.src;
        }
      }

      throw new Error(
        "QRCode.js tidak menghasilkan gambar QR."
      );

    } catch (error) {
      throw new Error(
        "Gagal membuat gambar QR: " +
        (error?.message || String(error))
      );

    } finally {
      temporaryContainer.remove();
    }
  }

  /* ==========================================================
     27. QR — ENSURE IMAGE ELEMENT
     ========================================================== */

  function ensureQrImage() {
    let image = getQrImage();

    if (image) {
      return image;
    }

    const container = getQrContainer();

    if (!container) {
      throw new Error(
        "Tempat menampilkan QR tidak ditemukan."
      );
    }

    image = document.createElement("img");

    image.id = "memberQrImage";
    image.className = "profile-qr-image";
    image.alt = "QR Code Anggota TARBIYAH";
    image.hidden = true;

    image.style.maxWidth = "100%";
    image.style.width = "240px";
    image.style.height = "auto";
    image.style.display = "block";
    image.style.margin = "auto";
    image.style.background = "#ffffff";
    image.style.padding = "12px";
    image.style.borderRadius = "12px";

    container.appendChild(image);

    return image;
  }

  /* ==========================================================
     28. QR — DISPLAY IMAGE
     ========================================================== */

  function displayQrImage(dataUrl) {
    const image = ensureQrImage();

    image.src = dataUrl;
    image.alt = "QR Code Anggota TARBIYAH";
    image.hidden = false;
    image.style.display = "block";

    const placeholder = getQrPlaceholder();

    if (placeholder) {
      placeholder.hidden = true;
      placeholder.style.display = "none";
    }

    const container = getQrContainer();

    if (container) {
      container.classList.add("has-qr");
    }

    activeQrImage = dataUrl;

    // PENTING:
    // Tombol Unduh Kartu baru aktif setelah QR tersedia.
    setDownloadButtonState(true);
  }

  /* ==========================================================
     29. QR — UPDATE INFORMATION
     ========================================================== */

  function renderQrInformation(qrData) {
    const name =
      profileData?.full_name ||
      currentUser?.user_metadata?.full_name ||
      "Pengguna TARBIYAH";

    const number =
      memberData?.member_number ||
      "Belum tersedia";

    const status = membershipStatusLabel(
      memberData?.membership_status
    );

    document.querySelectorAll(
      "#qrMemberName, [data-profile-qr-member-name]"
    ).forEach(element => {
      element.textContent = name;
    });

    document.querySelectorAll(
      "#qrMemberNumber, [data-profile-qr-member-id]"
    ).forEach(element => {
      element.textContent = number;
    });

    document.querySelectorAll(
      "#qrMemberStatus, [data-profile-card-status]"
    ).forEach(element => {
      element.textContent = status;
    });

    const expiryElement = getQrExpiryElement();

    if (expiryElement) {
      expiryElement.textContent =
        "Berlaku sampai: " +
        formatDateTime(qrData.expires_at);
    }

    document.querySelectorAll(
      "[data-profile-card-status]"
    ).forEach(element => {
      element.dataset.qrState = "active";
    });
  }

  /* ==========================================================
     30. QR — RESET DISPLAY
     ========================================================== */

  function clearQrMemory() {
    activeQrToken = null;
    activeQrImage = null;
    activeQrExpiry = null;
    activeQrTokenId = null;
  }

  function resetQrDisplay() {
    clearQrMemory();

    const image = getQrImage();

    if (image) {
      image.removeAttribute("src");
      image.hidden = true;
      image.style.display = "none";
    }

    const placeholder = getQrPlaceholder();

    if (placeholder) {
      placeholder.hidden = false;
      placeholder.style.removeProperty("display");
    }

    const expiryElement = getQrExpiryElement();

    if (expiryElement) {
      expiryElement.textContent = "Belum diterbitkan";
    }

    document.querySelectorAll(
      "[data-profile-card-status]"
    ).forEach(element => {
      element.dataset.qrState = "not-issued";
    });

    // Tombol selalu terkunci ketika QR belum tersedia.
    setDownloadButtonState(false);
  }

  /* ==========================================================
     31. QR — ERROR MESSAGE
     ========================================================== */

  async function getFunctionErrorMessage(error) {
    if (!error) {
      return "Terjadi kesalahan pada layanan QR.";
    }

    let detail = null;

    try {
      if (error.context) {
        const response = error.context.clone
          ? error.context.clone()
          : error.context;

        detail = await response.json();
      }
    } catch (_) {
      // Respons mungkin bukan JSON.
    }

    if (detail?.message) return detail.message;
    if (detail?.error) return detail.error;

    return error.message ||
      "Gagal menghubungi layanan penerbit QR.";
  }

  /* ==========================================================
     32. QR — MINT TOKEN
     ========================================================== */

  async function mintMemberQR() {
    if (qrIssuing) return;

    if (!currentUser || !supabase) {
      notify(
        "Sesi login tidak tersedia. Silakan login kembali.",
        "error"
      );
      return;
    }

    const button = $("btnGenerateQR") ||
      document.querySelector("[data-profile-qr-refresh]");

    try {
      qrIssuing = true;

      if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = "Menerbitkan QR...";
      }

      // Pastikan library tersedia sebelum meminta token.
      await loadQrLibrary();

      notify(
        "Memeriksa keanggotaan dan menerbitkan QR...",
        "info"
      );

      const result = await withTimeout(
        supabase.functions.invoke(
          CONFIG.QR_FUNCTION,
          { body: {} }
        ),
        "Penerbitan QR anggota",
        30000
      );

      if (result.error) {
        throw new Error(
          await getFunctionErrorMessage(result.error)
        );
      }

      const data = result.data;

      if (!data?.success || !data?.qr) {
        throw new Error(
          data?.message ||
          "Server tidak mengembalikan data QR yang valid."
        );
      }

      const qrData = data.qr;

      const token =
        qrData.token ||
        qrData.payload;

      if (!token || typeof token !== "string") {
        throw new Error(
          "Token QR tidak ditemukan pada respons server."
        );
      }

      if (!qrData.expires_at) {
        throw new Error(
          "Masa berlaku QR tidak diterima dari server."
        );
      }

      const expiryDate = new Date(qrData.expires_at);

      if (
        Number.isNaN(expiryDate.getTime()) ||
        expiryDate.getTime() <= Date.now()
      ) {
        throw new Error(
          "Masa berlaku QR yang diterima tidak valid."
        );
      }

      // Token diproses menjadi gambar QR.
      const imageDataUrl =
        await createQrDataUrl(token);

      // Token hanya disimpan sementara di memori halaman.
      activeQrToken = token;
      activeQrExpiry = qrData.expires_at;
      activeQrTokenId = qrData.token_id || null;

      displayQrImage(imageDataUrl);
      renderQrInformation(qrData);

      notify(
        "Alhamdulillah! QR anggota berhasil diterbitkan. Kartu siap diunduh.",
        "success"
      );

      // Tidak mencetak token ke Console.
      console.info(
        "[TARBIYAH] QR berhasil diterbitkan.",
        {
          token_id: activeQrTokenId,
          expires_at: activeQrExpiry,
          token_received: Boolean(activeQrToken),
          image_created: Boolean(activeQrImage),
          download_button_enabled:
            $("btnDownloadQR")?.disabled === false
        }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Penerbitan QR gagal:",
        error?.message || String(error)
      );

      notify(
        error?.message ||
        "Gagal menerbitkan QR anggota. Periksa Console.",
        "error"
      );

    } finally {
      qrIssuing = false;

      if (button) {
        button.disabled = false;

        button.textContent =
          button.dataset.originalText ||
          "Terbitkan / Perbarui QR";
      }
    }
  }

  /* ==========================================================
     33. DOWNLOAD — LOAD HTML2CANVAS
     ========================================================== */

  function loadHtml2Canvas() {
    if (typeof window.html2canvas === "function") {
      return Promise.resolve(window.html2canvas);
    }

    if (html2canvasPromise) {
      return html2canvasPromise;
    }

    html2canvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = CONFIG.HTML2CANVAS_LIBRARY;
      script.async = true;
      script.dataset.tarbiyahHtml2canvas = "true";

      script.onload = () => {
        if (typeof window.html2canvas === "function") {
          resolve(window.html2canvas);
        } else {
          reject(
            new Error(
              "Library html2canvas dimuat tetapi tidak tersedia."
            )
          );
        }
      };

      script.onerror = () => {
        reject(
          new Error(
            "Gagal memuat library pengunduh kartu. Periksa koneksi internet."
          )
        );
      };

      document.head.appendChild(script);
    }).catch(error => {
      html2canvasPromise = null;
      throw error;
    });

    return html2canvasPromise;
  }

   
/* ==========================================================
   TARBIYAH — PREPARE AVATAR FOR PNG EXPORT
   Membuat foto persegi tanpa merusak proporsi asli.
   ========================================================== */

async function createSquareAvatarForExport(image, size = 512) {
  if (!image || !image.src) {
    throw new Error("Foto anggota belum tersedia.");
  }

  await waitForImage(image);

  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Ukuran asli foto anggota tidak valid.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Browser tidak dapat memproses foto anggota.");
  }

  // Crop bagian tengah dengan rasio 1:1.
  const cropSize = Math.min(sourceWidth, sourceHeight);

  const sourceX = (sourceWidth - cropSize) / 2;
  const sourceY = (sourceHeight - cropSize) / 2;

  context.clearRect(0, 0, size, size);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    size,
    size
  );

  return canvas.toDataURL("image/png");
}

  /* ==========================================================
     34. DOWNLOAD — WAIT FOR CARD IMAGES
     ========================================================== */

  async function waitForImage(image) {
    if (!image) return;

    if (image.complete && image.naturalWidth > 0) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            "Waktu pemuatan gambar kartu habis."
          )
        );
      }, 10000);

      image.addEventListener(
        "load",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );

      image.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(
            new Error(
              "Salah satu gambar kartu gagal dimuat."
            )
          );
        },
        { once: true }
      );
    });
  }

  async function waitForCardImages(card) {
    const images = Array.from(
      card.querySelectorAll("img")
    );

    for (const image of images) {
      if (image.hidden) continue;

      await waitForImage(image);
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  }

  /* ==========================================================
     35. DOWNLOAD — SAVE PNG
     ========================================================== */

  function saveCanvasAsPng(canvas, filename) {
    return new Promise((resolve, reject) => {
      if (!canvas || !canvas.toBlob) {
        try {
          const dataUrl = canvas.toDataURL("image/png");

          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = filename;

          document.body.appendChild(link);
          link.click();
          link.remove();

          resolve();
        } catch (error) {
          reject(error);
        }

        return;
      }

      canvas.toBlob(blob => {
        if (!blob) {
          reject(
            new Error(
              "Browser gagal membuat file PNG kartu."
            )
          );
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 2000);

        resolve();
      }, "image/png");
    });
  }

  /* ==========================================================
     36. DOWNLOAD — FULL MEMBER CARD
     ========================================================== */

async function downloadMemberCard() {
  if (cardDownloading) return;

  const button = $("btnDownloadQR");
  const card = getMemberCardElement();

  if (!activeQrImage) {
    notify(
      "QR belum tersedia. Terbitkan QR terlebih dahulu.",
      "info"
    );
    setDownloadButtonState(false);
    return;
  }

  if (!card) {
    notify(
      "Elemen kartu anggota tidak ditemukan.",
      "error"
    );
    return;
  }

  let avatarImage = null;
  let originalAvatarSrc = null;
  let avatarWasPrepared = false;

  try {
    cardDownloading = true;

    if (button) {
      button.disabled = true;
      button.innerHTML =
        "<span>◌</span> Menyiapkan Kartu...";
    }

    notify(
      "Sedang menyiapkan gambar kartu anggota...",
      "info"
    );

    // Pastikan QR tersedia.
    const qrImage = getQrImage();

    if (!qrImage || !qrImage.src) {
      throw new Error(
        "Gambar QR belum tampil pada kartu anggota."
      );
    }

    // Tunggu seluruh gambar kartu selesai dimuat.
    await waitForCardImages(card);

    // Siapkan foto anggota secara khusus.
    avatarImage = $("qrMemberAvatar");

    if (avatarImage && !avatarImage.hidden && avatarImage.src) {
      originalAvatarSrc = avatarImage.src;

      const squareAvatar =
        await createSquareAvatarForExport(
          avatarImage,
          512
        );

      // Ganti sementara dengan foto persegi hasil crop.
      avatarImage.src = squareAvatar;
      avatarImage.style.width = "78px";
      avatarImage.style.height = "78px";
      avatarImage.style.aspectRatio = "1 / 1";
      avatarImage.style.objectFit = "cover";
      avatarImage.style.objectPosition = "center";
      avatarImage.style.flex = "0 0 78px";
      avatarImage.style.maxWidth = "78px";
      avatarImage.style.maxHeight = "78px";

      await waitForImage(avatarImage);

      avatarWasPrepared = true;
    }

    const html2canvas = await loadHtml2Canvas();

    const canvas = await html2canvas(card, {
      scale: CONFIG.CARD_DOWNLOAD_SCALE,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#102a22",
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
      scrollX: 0,
      scrollY: 0
    });

    if (!canvas || !canvas.width || !canvas.height) {
      throw new Error(
        "Gagal menghasilkan gambar kartu."
      );
    }

    const memberNumber =
      memberData?.member_number ||
      currentUser?.id?.slice(0, 8) ||
      "anggota";

    const filename =
      `TARBIYAH-KARTU-ANGGOTA-${memberNumber}.png`;

    await saveCanvasAsPng(canvas, filename);

    notify(
      "Kartu anggota TARBIYAH berhasil diunduh.",
      "success"
    );

    console.info(
      "[TARBIYAH] Unduh kartu selesai.",
      {
        filename,
        width: canvas.width,
        height: canvas.height,
        avatarPrepared: avatarWasPrepared,
        format: "PNG"
      }
    );

  } catch (error) {
    console.error(
      "[TARBIYAH] Unduh kartu gagal:",
      error
    );

    notify(
      error?.message ||
      "Gagal mengunduh kartu anggota.",
      "error"
    );

  } finally {
    // Kembalikan foto asli pada halaman profil.
    if (
      avatarImage &&
      avatarWasPrepared &&
      originalAvatarSrc
    ) {
      avatarImage.src = originalAvatarSrc;
    }

    cardDownloading = false;

    if (button) {
      button.disabled = !activeQrImage;
      button.innerHTML =
        "<span>↓</span> Unduh Kartu";
    }
  }
}

  /* ==========================================================
     37. QR — EVENT LISTENERS
     ========================================================== */

  function setupQR() {
    const generateButtons = new Set();

    if ($("btnGenerateQR")) {
      generateButtons.add($("btnGenerateQR"));
    }

    document.querySelectorAll(
      "[data-profile-qr-refresh]"
    ).forEach(button => {
      generateButtons.add(button);
    });

    generateButtons.forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        mintMemberQR();
      });
    });

    const downloadButtons = new Set();

    if ($("btnDownloadQR")) {
      downloadButtons.add($("btnDownloadQR"));
    }

    document.querySelectorAll(
      "[data-profile-qr-download]"
    ).forEach(button => {
      downloadButtons.add(button);
    });

    downloadButtons.forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        downloadMemberCard();
      });
    });

    resetQrDisplay();

    console.log(
      "[TARBIYAH] QR integration siap.",
      {
        generateButtons: generateButtons.size,
        downloadButtons: downloadButtons.size,
        cardElement: Boolean(getMemberCardElement()),
        qrContainer: Boolean(getQrContainer()),
        downloadInitiallyDisabled:
          $("btnDownloadQR")?.disabled
      }
    );
  }

  /* ==========================================================
     38. GENERAL EVENTS
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

  // Event btnTheme dihapus.
  // Sekarang ditangani oleh tarbiyah-theme.js.

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

 
  // Navigasi menu Riwayat Aktivitas.
  document.querySelectorAll(
    '[data-action="attendance-history"]'
  ).forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();

      const panel = $("memberAttendancePanel");

      if (!panel) {
        notify(
          "Panel Riwayat Aktivitas tidak ditemukan.",
          "error"
        );
        return;
      }

      panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      panel.classList.add("attendance-panel-highlight");

      setTimeout(() => {
        panel.classList.remove(
          "attendance-panel-highlight"
        );
      }, 1400);
    });
  });

  setupTabs();
  setupQR();
}


  /* ==========================================================
     39. LOAD ALL DATA
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
    await loadAttendanceHistory();
  }

  /* ==========================================================
     40. AUTH STATE LISTENER
     ========================================================== */

  function setupAuthListener() {
    if (!supabase || authSubscription) return;

    const result = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          !session?.user
        ) {
          clearQrMemory();

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
     41. MAIN INITIALIZATION
     ========================================================== */

  async function initialize() {
    if (initializationStarted) return;

    initializationStarted = true;

    console.log(
      "[TARBIYAH] Memulai Profil Anggota v4.0..."
    );

    try {
      applyLogo();
      applyTheme();

      // Tombol unduh langsung dibuat terkunci.
      setDownloadButtonState(false);

      setupEvents();

      if (!supabase) {
        throw new Error(
          "Supabase client tidak ditemukan. " +
          "Periksa urutan script HTML."
        );
      }

      currentUser = await getCurrentUser();

      if (!currentUser) return;

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

      await loadAllData();

      originalFormData = captureFormData();

      setEditMode(false);

      console.log(
        "[TARBIYAH] Profil selesai dimuat.",
        {
          version: "4.0",
          profileLoaded: Boolean(profileData),
          membershipLoaded: Boolean(memberData),
          membershipStatus: memberData?.membership_status,
          roleLoaded: roleData.length > 0,
          qrFunction: CONFIG.QR_FUNCTION,
          qrLibrary: CONFIG.QR_LIBRARY,
          cardDownload: "PNG"
        }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal memuat profil:",
        error?.message || String(error)
      );

      notify(
        error.message ||
        "Terjadi kesalahan ketika memuat profil.",
        "error"
      );

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
      hideLoadingScreen();

      console.log(
        "[TARBIYAH] Proses inisialisasi berakhir."
      );
    }

    setupAuthListener();
  }

  /* ==========================================================
     42. START APPLICATION
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
