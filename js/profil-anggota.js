
/* ============================================================
   TARBIYAH — PROFIL ANGGOTA
   File       : js/profil-anggota.js
   Version    : 3.5 QRCode.js FIX
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
   - Menampilkan QR Code asli menggunakan QRCode.js.
   - Memperbarui QR.
   - Mengunduh QR dalam format PNG.
   - Masa berlaku QR dari server.
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
    THEME_KEY: "tarbiyah-theme",

    QR_FUNCTION: "member-qr-mint",

    // QRCode.js yang sudah berhasil dibuka di Chrome.
    QR_LIBRARY:
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",

    QR_SIZE: 320,
    QR_COLOR_DARK: "#102a22",
    QR_COLOR_LIGHT: "#ffffff"
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

  // Token hanya disimpan sementara di memori halaman.
  let activeQrToken = null;
  let activeQrImage = null;
  let activeQrExpiry = null;
  let activeQrTokenId = null;

  let qrLibraryPromise = null;
  let qrIssuing = false;

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
      element.setAttribute("aria-hidden", "true");
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

      activeQrToken = null;
      activeQrImage = null;
      activeQrExpiry = null;
      activeQrTokenId = null;

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

    setValue(
      "inputGender",
      profileData?.gender
    );

    setValue(
      "inputBirthDate",
      profileData?.birth_date
    );

    setValue(
      "inputCity",
      profileData?.city
    );

    setValue(
      "inputAddress",
      profileData?.address
    );

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
      emailField.setAttribute(
        "aria-readonly",
        "true"
      );
    }

    if ($("btnEditProfile")) {
      $("btnEditProfile").hidden = isEditing;
    }

    if ($("profileEditActions")) {
      $("profileEditActions").hidden = !isEditing;
    }

    if ($("btnSaveProfile")) {
      $("btnSaveProfile").disabled = false;
      $("btnSaveProfile").textContent =
        "Simpan Perubahan";
    }

    console.log(
      "[TARBIYAH] Mode edit:",
      isEditing ? "AKTIF" : "NONAKTIF"
    );
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
     22. ATTENDANCE PLACEHOLDER
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
     23. QR — FIND ELEMENTS
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

  /* ==========================================================
     24. QR — LOAD QRCode.js
     ========================================================== */

  function isQRCodeJsReady() {
    return (
      typeof window.QRCode === "function" &&
      window.QRCode.CorrectLevel !== undefined
    );
  }

  function loadQrLibrary() {
    // QRCode.js menggunakan constructor new QRCode().
    if (isQRCodeJsReady()) {
      return Promise.resolve(window.QRCode);
    }

    if (qrLibraryPromise) {
      return qrLibraryPromise;
    }

    qrLibraryPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(
        'script[data-tarbiyah-qr-library="true"]'
      );

      if (existingScript) {
        existingScript.remove();
      }

      const script = document.createElement("script");

      script.src = CONFIG.QR_LIBRARY;
      script.async = true;
      script.dataset.tarbiyahQrLibrary = "true";

      script.onload = () => {
        if (isQRCodeJsReady()) {
          console.info(
            "[TARBIYAH] QRCode.js berhasil dimuat:",
            CONFIG.QR_LIBRARY
          );

          resolve(window.QRCode);
          return;
        }

        reject(
          new Error(
            "Script QRCode.js berhasil diunduh, " +
            "tetapi constructor QRCode tidak ditemukan."
          )
        );
      };

      script.onerror = () => {
        reject(
          new Error(
            "Gagal memuat QRCode.js dari cdnjs. " +
            "Periksa koneksi internet atau pemblokiran CDN."
          )
        );
      };

      document.head.appendChild(script);
    }).catch(error => {
      qrLibraryPromise = null;
      console.error(
        "[TARBIYAH] Pemuatan QRCode.js gagal:",
        error.message
      );
      throw error;
    });

    return qrLibraryPromise;
  }

  /* ==========================================================
     25. QR — CREATE PNG DATA URL
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

    // Tempat sementara di luar area tampilan.
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

      // API resmi QRCode.js: new QRCode(element, options).
      new QRCodeLibrary(temporaryContainer, {
        text: token,
        width: CONFIG.QR_SIZE,
        height: CONFIG.QR_SIZE,
        colorDark: CONFIG.QR_COLOR_DARK,
        colorLight: CONFIG.QR_COLOR_LIGHT,
        correctLevel: correctionLevel
      });

      // QRCode.js menggambar canvas secara sinkron.
      const canvas = temporaryContainer.querySelector("canvas");

      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");

        if (
          typeof dataUrl === "string" &&
          dataUrl.startsWith("data:image/png")
        ) {
          return dataUrl;
        }
      }

      // Cadangan jika browser menggunakan elemen img.
      const image = temporaryContainer.querySelector("img");

      if (image?.src) {
        if (image.src.startsWith("data:image/")) {
          return image.src;
        }

        if (!image.complete) {
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => {
              reject(
                new Error(
                  "Gambar QR tidak berhasil diselesaikan."
                )
              );
            };
          });
        }

        if (image.src.startsWith("data:image/")) {
          return image.src;
        }
      }

      throw new Error(
        "QRCode.js tidak menghasilkan canvas atau gambar QR."
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
     26. QR — ENSURE IMAGE ELEMENT
     ========================================================== */

  function ensureQrImage() {
    let image = getQrImage();

    if (image) {
      return image;
    }

    const container = getQrContainer();

    if (!container) {
      throw new Error(
        "Tempat menampilkan QR tidak ditemukan di HTML. " +
        "Periksa elemen memberQRCode."
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
     27. QR — DISPLAY IMAGE
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
  }

  /* ==========================================================
     28. QR — UPDATE INFORMATION
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

    const nameSelectors = [
      "#qrMemberName",
      "[data-profile-qr-member-name]"
    ];

    const numberSelectors = [
      "#qrMemberNumber",
      "[data-profile-qr-member-id]"
    ];

    const statusSelectors = [
      "#qrMemberStatus",
      "[data-profile-card-status]"
    ];

    nameSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        element.textContent = name;
      });
    });

    numberSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        element.textContent = number;
      });
    });

    statusSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        element.textContent = status;
      });
    });

    const expiryElement = getQrExpiryElement();

    if (expiryElement) {
      expiryElement.textContent =
        formatDateTime(qrData.expires_at);
    }

    document.querySelectorAll(
      "[data-profile-card-status]"
    ).forEach(element => {
      element.dataset.qrState = "active";
    });
  }

  /* ==========================================================
     29. QR — RESET DISPLAY
     ========================================================== */

  function resetQrDisplay() {
    activeQrToken = null;
    activeQrImage = null;
    activeQrExpiry = null;
    activeQrTokenId = null;

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
      expiryElement.textContent =
        "Belum diterbitkan";
    }

    document.querySelectorAll(
      "[data-profile-card-status]"
    ).forEach(element => {
      element.dataset.qrState = "not-issued";
    });
  }

  /* ==========================================================
     30. QR — ERROR MESSAGE
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

    if (detail?.message) {
      return detail.message;
    }

    if (detail?.error) {
      return detail.error;
    }

    if (error.message) {
      return error.message;
    }

    return "Gagal menghubungi layanan penerbit QR.";
  }

  /* ==========================================================
     31. QR — MINT TOKEN
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

    const button =
      $("btnGenerateQR") ||
      document.querySelector("[data-profile-qr-refresh]");

    try {
      qrIssuing = true;

      if (button) {
        button.disabled = true;
        button.dataset.originalText =
          button.textContent;

        button.textContent = "Menerbitkan QR...";
      }

      // Muat QRCode.js sebelum meminta token ke server.
      await loadQrLibrary();

      notify(
        "Memeriksa keanggotaan dan menerbitkan QR...",
        "info"
      );

      const result = await withTimeout(
        supabase.functions.invoke(
          CONFIG.QR_FUNCTION,
          {
            body: {}
          }
        ),
        "Penerbitan QR anggota",
        30000
      );

      if (result.error) {
        const message =
          await getFunctionErrorMessage(result.error);

        throw new Error(message);
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

      // Membuat PNG dari token menggunakan QRCode.js.
      const imageDataUrl =
        await createQrDataUrl(token);

      // Token hanya disimpan sementara di memori.
      activeQrToken = token;
      activeQrExpiry = qrData.expires_at;
      activeQrTokenId = qrData.token_id || null;

      displayQrImage(imageDataUrl);
      renderQrInformation(qrData);

      notify(
        "Alhamdulillah! QR anggota berhasil diterbitkan.",
        "success"
      );

      // Jangan pernah mencetak nilai token ke Console.
      console.info(
        "[TARBIYAH] QR berhasil diterbitkan.",
        {
          token_id: activeQrTokenId,
          expires_at: activeQrExpiry,
          token_received: Boolean(activeQrToken),
          image_created: Boolean(activeQrImage)
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
     32. QR — DOWNLOAD PNG
     ========================================================== */

  function downloadMemberQR() {
    if (!activeQrImage) {
      notify(
        "QR belum tersedia. Terbitkan QR terlebih dahulu.",
        "info"
      );
      return;
    }

    try {
      const link = document.createElement("a");

      const memberNumber =
        memberData?.member_number ||
        currentUser?.id?.slice(0, 8) ||
        "anggota";

      link.href = activeQrImage;

      link.download =
        `TARBIYAH-QR-${memberNumber}.png`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      notify(
        "Gambar QR berhasil disiapkan untuk diunduh.",
        "success"
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Download QR:",
        error?.message || String(error)
      );

      notify(
        "Gagal mengunduh gambar QR.",
        "error"
      );
    }
  }

  /* ==========================================================
     33. QR — EVENT LISTENERS
     ========================================================== */

  function setupQR() {
    const generateButtons = new Set();

    const primaryButton = $("btnGenerateQR");

    if (primaryButton) {
      generateButtons.add(primaryButton);
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

    const downloadButton = $("btnDownloadQR");

    if (downloadButton) {
      downloadButtons.add(downloadButton);
    }

    document.querySelectorAll(
      "[data-profile-qr-download]"
    ).forEach(button => {
      downloadButtons.add(button);
    });

    downloadButtons.forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        downloadMemberQR();
      });
    });

    resetQrDisplay();

    console.log(
      "[TARBIYAH] QR integration siap.",
      {
        generateButtons: generateButtons.size,
        downloadButtons: downloadButtons.size,
        qrImageElement: Boolean(getQrImage()),
        qrContainer: Boolean(getQrContainer())
      }
    );
  }

  /* ==========================================================
     34. GENERAL EVENTS
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

    setupTabs();
    setupQR();
  }

  /* ==========================================================
     35. LOAD ALL DATA
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
     36. AUTH STATE LISTENER
     ========================================================== */

  function setupAuthListener() {
    if (!supabase || authSubscription) return;

    const result = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          !session?.user
        ) {
          // Hapus token dari memori ketika logout.
          activeQrToken = null;
          activeQrImage = null;
          activeQrExpiry = null;
          activeQrTokenId = null;

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
     37. MAIN INITIALIZATION
     ========================================================== */

  async function initialize() {
    if (initializationStarted) return;

    initializationStarted = true;

    console.log(
      "[TARBIYAH] Memulai Profil Anggota v3.5..."
    );

    try {
      applyLogo();
      applyTheme();

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
          version: "3.5",
          userId: currentUser.id,
          profileLoaded: Boolean(profileData),
          membershipLoaded: Boolean(memberData),
          membershipStatus: memberData?.membership_status,
          roleLoaded: roleData.length > 0,
          qrFunction: CONFIG.QR_FUNCTION,
          qrLibrary: CONFIG.QR_LIBRARY
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
     38. START APPLICATION
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
