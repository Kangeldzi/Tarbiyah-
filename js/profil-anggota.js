
/* ==========================================================
   TARBIYAH — PROFIL ANGGOTA
   File: js/profil-anggota.js
   Versi: 3.0 — Full Rewrite
   Backend: Supabase
   ========================================================== */

(() => {
  "use strict";

  /* ========================================================
     1. KONFIGURASI
     ======================================================== */

  const CONFIG = {
    LOGIN_PAGE:
      window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
      "./login-register.html",

    DASHBOARD_PAGE:
      window.TARBIYAH_CONFIG?.DASHBOARD_PAGE ||
      "./dashboard.html",

    AVATAR_BUCKET: "avatar",

    AVATAR_MAX_SIZE: 2 * 1024 * 1024,

    SIGNED_URL_DURATION: 3600,

    THEME_STORAGE_KEY: "tarbiyah-theme",

    DEFAULT_LOGO:
      window.TARBIYAH_CONFIG?.DEFAULT_LOGO ||
      "./assets/icons/tarbiyah-mark.svg"
  };

  const supabase = window.tarbiyahSupabase;

  /* ========================================================
     2. STATE
     ======================================================== */

  let currentUser = null;
  let profileData = null;
  let memberData = null;
  let roleData = null;

  let originalFormData = {};
  let isEditing = false;
  let eventsInitialized = false;
  let authSubscription = null;
  let avatarObjectUrl = null;

  /* ========================================================
     3. DOM HELPER
     ======================================================== */

  const $ = (id) => document.getElementById(id);

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent =
        value === null || value === undefined || value === ""
          ? "—"
          : String(value);
    }
  }

  function setValue(id, value) {
    const element = $(id);

    if (element) {
      element.value = value ?? "";
    }
  }

  function getValue(id) {
    const element = $(id);

    return element ? element.value.trim() : null;
  }

  function showElement(element) {
    if (element) {
      element.hidden = false;
    }
  }

  function hideElement(element) {
    if (element) {
      element.hidden = true;
    }
  }

  /* ========================================================
     4. NOTIFICATION / TOAST
     ======================================================== */

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
    toast.classList.add("show");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
      toast.hidden = true;
    }, 3500);
  }

  /* ========================================================
     5. FORMAT TANGGAL
     ======================================================== */

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
      .map(word => word.charAt(0).toUpperCase())
      .join("");
  }

  /* ========================================================
     6. LOADING
     ======================================================== */

  function setLoading(button, loading, loadingText = "Menyimpan...") {
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }

      button.disabled = true;
      button.textContent = loadingText;

    } else {
      button.disabled = false;

      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  /* ========================================================
     7. LOGO TARBIYAH
     ======================================================== */

  function applyTarbiyahLogo() {
    const logoElements = document.querySelectorAll(
      ".header-brand img, " +
      ".digital-card-header img, " +
      ".profile-footer img"
    );

    logoElements.forEach(img => {
      img.src = CONFIG.DEFAULT_LOGO;

      img.onerror = () => {
        console.error(
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

  /* ========================================================
     8. THEME
     ======================================================== */

  function applySavedTheme() {
    let savedTheme = null;

    try {
      savedTheme = localStorage.getItem(
        CONFIG.THEME_STORAGE_KEY
      );
    } catch (error) {
      console.warn(
        "[TARBIYAH] Tidak dapat membaca preferensi tema.",
        error
      );
    }

    if (savedTheme === "dark" || savedTheme === "light") {
      document.documentElement.setAttribute(
        "data-theme",
        savedTheme
      );
    }

    updateThemeButton();
  }

  function updateThemeButton() {
    const button = $("btnTheme");

    if (!button) return;

    const currentTheme =
      document.documentElement.getAttribute("data-theme") ||
      "dark";

    button.textContent =
      currentTheme === "dark" ? "☀" : "☾";

    button.setAttribute(
      "aria-label",
      currentTheme === "dark"
        ? "Aktifkan tema terang"
        : "Aktifkan tema gelap"
    );
  }

  function toggleProfileTheme() {
    const root = document.documentElement;

    const currentTheme =
      root.getAttribute("data-theme") || "dark";

    const nextTheme =
      currentTheme === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", nextTheme);

    try {
      localStorage.setItem(
        CONFIG.THEME_STORAGE_KEY,
        nextTheme
      );
    } catch (error) {
      console.warn(
        "[TARBIYAH] Preferensi tema tidak dapat disimpan.",
        error
      );
    }

    updateThemeButton();
  }

  /* ========================================================
     9. AUTHENTICATION
     ======================================================== */

  async function getAuthenticatedUser() {
    if (!supabase) {
      throw new Error(
        "Koneksi Supabase belum tersedia."
      );
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const session = data?.session;

    if (!session?.user) {
      window.location.replace(CONFIG.LOGIN_PAGE);
      return null;
    }

    return session.user;
  }

  async function logout() {
    const button = $("btnLogout");

    try {
      setLoading(button, true, "Keluar...");

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      window.location.replace(CONFIG.LOGIN_PAGE);

    } catch (error) {
      console.error("[TARBIYAH] Logout gagal:", error);

      notify(
        "Gagal keluar dari akun. Silakan coba kembali.",
        "error"
      );

      setLoading(button, false);
    }
  }

  /* ========================================================
     10. LOAD PROFILE
     ======================================================== */

  async function loadProfile() {
    const { data, error } = await supabase
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
      .maybeSingle();

    if (error) {
      throw error;
    }

    profileData = data;

    if (!profileData) {
      throw new Error(
        "Data profil belum ditemukan. Periksa trigger pendaftaran Supabase."
      );
    }

    return profileData;
  }

  /* ========================================================
     11. LOAD MEMBERSHIP
     ======================================================== */

  async function loadMembership() {
    const { data, error } = await supabase
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
      .maybeSingle();

    if (error) {
      throw error;
    }

    memberData = data;

    return memberData;
  }

  /* ========================================================
     12. LOAD ROLE
     ======================================================== */

  async function loadUserRole() {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", currentUser.id);

    if (error) {
      console.warn(
        "[TARBIYAH] Data role tidak dapat dimuat:",
        error
      );

      roleData = null;
      return null;
    }

    roleData = Array.isArray(data) ? data : [];

    return roleData;
  }

  function getRoleName() {
    if (!Array.isArray(roleData) || roleData.length === 0) {
      return "Anggota";
    }

    const roleNames = roleData
      .map(item => item.roles?.name)
      .filter(Boolean);

    if (!roleNames.length) return "Anggota";

    const labels = {
      super_admin: "Super Admin",
      admin: "Administrator",
      registered_user: "Anggota Terdaftar",
      mentor: "Mentor",
      member: "Anggota"
    };

    return roleNames
      .map(role => labels[role] || role)
      .join(", ");
  }

  /* ========================================================
     13. AVATAR SIGNED URL
     ======================================================== */

  async function getAvatarUrl(path) {
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from(CONFIG.AVATAR_BUCKET)
      .createSignedUrl(
        path,
        CONFIG.SIGNED_URL_DURATION
      );

    if (error) {
      console.warn(
        "[TARBIYAH] Gagal membuat URL foto profil:",
        error
      );

      return null;
    }

    return data?.signedUrl || null;
  }

  async function renderAvatar() {
    const avatarPath = profileData?.avatar_path;

    const imageIds = [
      "profileAvatar",
      "qrMemberAvatar"
    ];

    const avatarUrl = avatarPath
      ? await getAvatarUrl(avatarPath)
      : null;

    imageIds.forEach(id => {
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

    const fallback = getInitials(
      profileData?.full_name
    );

    document.querySelectorAll(
      "[data-profile-initials]"
    ).forEach(element => {
      element.textContent = fallback;
    });
  }

  /* ========================================================
     14. RENDER PROFILE
     ======================================================== */

  async function renderProfile() {
    const name =
      profileData?.full_name ||
      currentUser?.user_metadata?.full_name ||
      "Pengguna TARBIYAH";

    const email = currentUser?.email || "—";

    setText("profileName", name);
    setText("profileEmail", email);

    setText("qrMemberName", name);
    setText("qrMemberNumber", memberData?.member_number || "Belum tersedia");

    setValue("inputFullName", profileData?.full_name);
    setValue("inputEmail", email);
    setValue("inputPhone", profileData?.phone);

    if ($("inputUsername")) {
      setValue("inputUsername", profileData?.username);
    }

    if ($("inputBio")) {
      setValue("inputBio", profileData?.bio);
    }

    await renderAvatar();

    renderAccountStatus();
  }

  /* ========================================================
     15. RENDER MEMBERSHIP
     ======================================================== */

  function getMembershipStatus(status) {
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
    if (!memberData) {
      setText("memberStatus", "Belum terdaftar");
      setText("memberNumber", "—");
      setText("memberSince", "—");

      setText("membershipNumber", "—");
      setText("membershipStatus", "Belum terdaftar");
      setText("membershipDate", "—");
      setText("membershipGroup", "Belum ditentukan");
      setText("membershipRole", getRoleName());
      setText("membershipUpdated", "—");

      setText("qrMemberStatus", "Belum terdaftar");

      return;
    }

    const status = getMembershipStatus(
      memberData.membership_status
    );

    const memberNumber =
      memberData.member_number || "Belum tersedia";

    const memberDate =
      memberData.submitted_at ||
      memberData.created_at;

    setText("memberStatus", status);
    setText("memberNumber", memberNumber);
    setText("memberSince", formatDate(memberDate));

    setText("membershipNumber", memberNumber);
    setText("membershipStatus", status);
    setText("membershipDate", formatDate(memberDate));

    setText("membershipGroup", "Belum ditentukan");
    setText("membershipRole", getRoleName());

    setText(
      "membershipUpdated",
      formatDate(memberData.updated_at)
    );

    setText("qrMemberNumber", memberNumber);
    setText("qrMemberStatus", status);
  }

  /* ========================================================
     16. ACCOUNT STATUS
     ======================================================== */

  function renderAccountStatus() {
    setText(
      "accountStatus",
      currentUser ? "Akun Terhubung" : "Tidak Terhubung"
    );

    const emailVerified =
      currentUser?.email_confirmed_at ||
      currentUser?.confirmed_at;

    setText(
      "emailVerificationStatus",
      emailVerified
        ? "Email Terverifikasi"
        : "Email Belum Terverifikasi"
    );
  }

  /* ========================================================
     17. EDIT PROFILE
     ======================================================== */

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

    const editButton = $("btnEditProfile");
    const actions = $("profileEditActions");

    if (editButton) {
      editButton.hidden = isEditing;
    }

    if (actions) {
      actions.hidden = !isEditing;
    }

    const saveButton = $("btnSaveProfile");

    if (saveButton) {
      saveButton.disabled = false;
    }
  }

  /* ========================================================
     18. SAVE PROFILE
     ======================================================== */

  async function saveProfile(event) {
    if (event) {
      event.preventDefault();
    }

    if (!currentUser || !isEditing) {
      return;
    }

    const saveButton = $("btnSaveProfile");

    try {
      setLoading(
        saveButton,
        true,
        "Menyimpan..."
      );

      const fullName = getValue("inputFullName");
      const phone = getValue("inputPhone");

      if (!fullName) {
        throw new Error(
          "Nama lengkap wajib diisi."
        );
      }

      const payload = {
        full_name: fullName,
        phone: phone || null,
        updated_at: new Date().toISOString()
      };

      /*
       * Kolom username dan bio hanya dikirim
       * apabila elemen input memang tersedia.
       */

      if ($("inputUsername")) {
        payload.username =
          getValue("inputUsername") || null;
      }

      if ($("inputBio")) {
        payload.bio =
          getValue("inputBio") || null;
      }

      const { data, error } = await supabase
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
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Profil tidak berhasil diperbarui. Periksa kebijakan RLS."
        );
      }

      profileData = data;

      await renderProfile();

      originalFormData = captureFormData();

      setEditMode(false);

      notify(
        "Profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Save profile error:",
        error
      );

      notify(
        error.message || "Gagal menyimpan profil.",
        "error"
      );

    } finally {
      setLoading(saveButton, false);
    }
  }

  /* ========================================================
     19. UPLOAD AVATAR
     ======================================================== */

  async function uploadAvatar(file) {
    if (!file || !currentUser) return;

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error(
          "File harus berupa gambar."
        );
      }

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

      const extension =
        file.type === "image/jpeg"
          ? "jpg"
          : file.type.split("/")[1];

      const filePath =
        `${currentUser.id}/${Date.now()}.${extension}`;

      const oldAvatarPath =
        profileData?.avatar_path || null;

      const { error: uploadError } =
        await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          });

      if (uploadError) {
        throw uploadError;
      }

      const { data, error: updateError } =
        await supabase
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
          .maybeSingle();

      if (updateError || !data) {
        await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .remove([filePath]);

        if (updateError) throw updateError;

        throw new Error(
          "Foto berhasil diunggah tetapi profil gagal diperbarui."
        );
      }

      profileData = data;

      await renderAvatar();

      /*
       * Hapus foto lama hanya setelah
       * foto baru berhasil disimpan.
       */

      if (oldAvatarPath && oldAvatarPath !== filePath) {
        const { error: removeError } =
          await supabase.storage
            .from(CONFIG.AVATAR_BUCKET)
            .remove([oldAvatarPath]);

        if (removeError) {
          console.warn(
            "[TARBIYAH] Foto lama belum dapat dihapus:",
            removeError
          );
        }
      }

      notify(
        "Foto profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Upload avatar error:",
        error
      );

      notify(
        error.message || "Gagal mengunggah foto profil.",
        "error"
      );

    } finally {
      const input = $("avatarInput");

      if (input) {
        input.value = "";
      }
    }
  }

  /* ========================================================
     20. PROFILE TABS
     ======================================================== */

  function setupTabs() {
    const tabButtons = document.querySelectorAll(
      ".profile-tabs [data-tab]"
    );

    const tabPanels = document.querySelectorAll(
      ".profile-tab-content"
    );

    if (!tabButtons.length || !tabPanels.length) {
      console.warn(
        "[TARBIYAH] Elemen navigasi tab atau panel tidak ditemukan."
      );

      return;
    }

    function activateTab(tabName) {
      const targetPanel = $(`tab-${tabName}`);

      if (!targetPanel) {
        console.warn(
          "[TARBIYAH] Panel tab tidak ditemukan:",
          tabName
        );

        return;
      }

      tabButtons.forEach(button => {
        const active =
          button.dataset.tab === tabName;

        button.classList.toggle(
          "active",
          active
        );

        button.setAttribute(
          "aria-selected",
          active ? "true" : "false"
        );

        button.setAttribute(
          "tabindex",
          active ? "0" : "-1"
        );
      });

      tabPanels.forEach(panel => {
        const active =
          panel.id === `tab-${tabName}`;

        panel.hidden = !active;

        panel.classList.toggle(
          "active",
          active
        );

        panel.style.display =
          active ? "" : "none";
      });
    }

    tabButtons.forEach(button => {
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

  /* ========================================================
     21. ACTIVITY PLACEHOLDER
     ======================================================== */

  function renderAttendanceNotice() {
    /*
     * Belum ada tabel riwayat kajian dan
     * kehadiran yang terverifikasi dalam
     * struktur database saat ini.
     *
     * Jangan membuat statistik palsu.
     */

    setText("totalKajian", "—");
    setText("totalAttendance", "—");
    setText("attendancePercentage", "—");

    const history = $("attendanceHistory");

    if (history) {
      history.textContent =
        "Riwayat kajian dan kehadiran belum tersedia. " +
        "Fitur ini memerlukan tabel kehadiran dan kajian di database.";
    }
  }

  /* ========================================================
     22. QR MEMBER
     ======================================================== */

  function setupQRNotice() {
    const generateButton = $("btnGenerateQR");
    const downloadButton = $("btnDownloadQR");

    generateButton?.addEventListener("click", () => {
      notify(
        "Penerbitan QR anggota belum diaktifkan. " +
        "Integrasi layanan member-qr-mint perlu diverifikasi terlebih dahulu.",
        "info"
      );
    });

    downloadButton?.addEventListener("click", () => {
      notify(
        "QR anggota belum tersedia untuk diunduh.",
        "info"
      );
    });
  }

  /* ========================================================
     23. EVENT LISTENERS
     ======================================================== */

  function setupEvents() {
    if (eventsInitialized) return;

    eventsInitialized = true;

    $("btnBack")?.addEventListener(
      "click",
      () => {
        window.location.href =
          CONFIG.DASHBOARD_PAGE;
      }
    );

    $("btnEditProfile")?.addEventListener(
      "click",
      () => {
        setEditMode(true);
      }
    );

    $("btnCancelEdit")?.addEventListener(
      "click",
      () => {
        setEditMode(false);
      }
    );

    $("personalProfileForm")?.addEventListener(
      "submit",
      saveProfile
    );

    $("btnChangeAvatar")?.addEventListener(
      "click",
      () => {
        $("avatarInput")?.click();
      }
    );

    $("avatarInput")?.addEventListener(
      "change",
      event => {
        const file =
          event.target.files?.[0];

        if (file) {
          uploadAvatar(file);
        }
      }
    );

    $("btnTheme")?.addEventListener(
      "click",
      toggleProfileTheme
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

    /*
     * Kolom ini belum tersedia di database.
     * Jangan mengaktifkannya untuk diedit.
     */

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
    setupQRNotice();
  }

  /* ========================================================
     24. INITIALIZATION
     ======================================================== */

  async function initialize() {
    console.log(
      "[TARBIYAH] Profil Anggota v3.0 dimulai."
    );

    applyTarbiyahLogo();
    applySavedTheme();

    if (!supabase) {
      console.error(
        "[TARBIYAH] Supabase client tidak ditemukan."
      );

      notify(
        "Koneksi Supabase belum tersedia. Periksa konfigurasi.",
        "error"
      );

      return;
    }

    try {
      currentUser = await getAuthenticatedUser();

      if (!currentUser) return;

      setupEvents();

      setEditMode(false);

      await loadProfile();

      await Promise.all([
        loadMembership(),
        loadUserRole()
      ]);

      await renderProfile();

      renderMembership();

      renderAttendanceNotice();

      renderAccountStatus();

      console.log(
        "[TARBIYAH] Profil berhasil dimuat.",
        {
          userId: currentUser.id,
          profileLoaded: Boolean(profileData),
          membershipLoaded: Boolean(memberData),
          roleLoaded: Boolean(roleData)
        }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Initialization error:",
        error
      );

      notify(
        error.message ||
        "Terjadi kesalahan saat memuat profil.",
        "error"
      );
    }

    /*
     * Pantau perubahan sesi autentikasi.
     */

    if (!authSubscription) {
      const { data } =
        supabase.auth.onAuthStateChange(
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
        data?.subscription || null;
    }
  }

  /* ========================================================
     25. START
     ======================================================== */

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
