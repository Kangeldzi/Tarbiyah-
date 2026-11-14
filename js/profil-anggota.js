
/* ============================================================
   TARBIYAH — PROFIL ANGGOTA
   File       : js/profil-anggota.js
   Version    : 1.0
   Backend    : Supabase
   ============================================================ */

(function () {
  "use strict";

  /* ==========================================================
     01. CONFIGURATION
  ========================================================== */

  const CONFIG = {
    LOGIN_PAGE: "./login-register.html",
    DASHBOARD_PAGE: "./tarbiyah.html",

    AVATAR_BUCKET: "avatar",
    AVATAR_MAX_SIZE: 2 * 1024 * 1024,
    AVATAR_SIGNED_URL_SECONDS: 3600,

    QR_FUNCTION: "member-qr-mint",

    QR_LIBRARY:
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
  };

  const supabase = window.tarbiyahSupabase;

  let currentUser = null;
  let currentProfile = null;
  let currentMember = null;

  let originalProfileData = {};
  let currentAvatarPath = null;
  let currentQRToken = null;

  let isEditing = false;
  let isSaving = false;

  const $ = (id) => document.getElementById(id);


  /* ==========================================================
     02. DATABASE FIELD MAPPING
     Mendukung beberapa nama kolom umum.
     Kolom hanya digunakan jika benar-benar tersedia.
  ========================================================== */

  const PROFILE_FIELDS = {
    name: ["full_name", "name", "nama_lengkap"],
    phone: ["phone", "phone_number", "no_hp", "nomor_telepon"],
    gender: ["gender", "jenis_kelamin"],
    birthDate: ["birth_date", "tanggal_lahir"],
    city: ["city", "kota", "kabupaten"],
    address: ["address", "alamat"],
    avatar: ["avatar_path", "avatar_url", "avatar"]
  };

  const MEMBER_FIELDS = {
    number: ["member_number", "membership_number", "nomor_anggota"],
    status: ["status", "membership_status"],
    joined: ["joined_at", "created_at", "tanggal_bergabung"],
    group: ["group_name", "community_name", "kelompok"],
    role: ["role", "member_role"],
    updated: ["updated_at"]
  };


  /* ==========================================================
     03. UTILITIES
  ========================================================== */

  function getFirstValue(object, keys) {
    if (!object) return null;

    for (const key of keys) {
      const value = object[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return null;
  }


  function getExistingField(object, keys) {
    if (!object) return null;

    return keys.find((key) =>
      Object.prototype.hasOwnProperty.call(object, key)
    ) || null;
  }


  function setText(id, value, fallback = "—") {
    const element = $(id);

    if (!element) return;

    element.textContent =
      value === null || value === undefined || value === ""
        ? fallback
        : String(value);
  }


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


  function showToast(message) {
    const toast = $("profileToast");
    const text = $("toastMessage");

    if (!toast || !text) return;

    text.textContent = message;
    toast.hidden = false;

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }


  function setLoading(loading) {
    const element = $("pageLoading");

    if (!element) return;

    element.hidden = !loading;
  }


  function setButtonLoading(button, loading, label) {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = label || "Memproses...";
    } else {
      button.disabled = false;

      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }


  function safeImage(element, url) {
    if (!element) return;

    if (url) {
      element.src = url;
    }
  }


  function getProfileName() {
    return getFirstValue(
      currentProfile,
      PROFILE_FIELDS.name
    ) || currentUser?.user_metadata?.full_name ||
      currentUser?.user_metadata?.name ||
      currentUser?.email ||
      "Anggota TARBIYAH";
  }


  /* ==========================================================
     04. APPLICATION VALIDATION
  ========================================================== */

  function validateBackend() {
    if (!supabase) {
      throw new Error(
        "Supabase client tidak ditemukan. Periksa supabase-client.js."
      );
    }

    if (!window.TARBIYAH_CONFIG) {
      throw new Error(
        "Konfigurasi TARBIYAH tidak ditemukan."
      );
    }

    return true;
  }


  function redirectToLogin() {
    window.location.replace(
      window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
      CONFIG.LOGIN_PAGE
    );
  }


  /* ==========================================================
     05. AUTHENTICATION
  ========================================================== */

  async function checkSession() {
    validateBackend();

    const { data, error } =
      await supabase.auth.getSession();

    if (error) throw error;

    const session = data?.session;

    if (!session?.user) {
      redirectToLogin();
      return false;
    }

    currentUser = session.user;

    window.TARBIYAH_SESSION = session;

    return true;
  }


  async function checkAccountSecurity() {
    if (!currentUser) return;

    setText(
      "accountStatus",
      "Aktif"
    );

    setText(
      "emailVerificationStatus",
      currentUser.email_confirmed_at
        ? "Terverifikasi"
        : "Belum terverifikasi"
    );
  }


  /* ==========================================================
     06. LOAD PROFILE
  ========================================================== */

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "Data profil belum ditemukan pada tabel profiles."
      );
    }

    currentProfile = data;
    originalProfileData = { ...data };

    await renderProfile();
  }


  /* ==========================================================
     07. LOAD MEMBERSHIP
  ========================================================== */

  async function loadMembership() {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    currentMember = data || null;

    renderMembership();
  }


  /* ==========================================================
     08. RENDER PROFILE
  ========================================================== */

  async function renderProfile() {
    const name = getProfileName();

    const email = currentUser.email || "—";

    setText("profileName", name);
    setText("profileEmail", email);

    setText("inputFullName", name);

    const fullName = $("inputFullName");
    if (fullName) fullName.value = name;

    const emailInput = $("inputEmail");
    if (emailInput) emailInput.value = email;

    const fieldMap = [
      ["inputPhone", PROFILE_FIELDS.phone],
      ["inputGender", PROFILE_FIELDS.gender],
      ["inputBirthDate", PROFILE_FIELDS.birthDate],
      ["inputCity", PROFILE_FIELDS.city],
      ["inputAddress", PROFILE_FIELDS.address]
    ];

    fieldMap.forEach(([id, keys]) => {
      const element = $(id);

      if (!element) return;

      element.value =
        getFirstValue(currentProfile, keys) || "";
    });

    await loadAvatar();

    renderMemberCardIdentity();

    checkAccountSecurity();
  }


  /* ==========================================================
     09. RENDER MEMBERSHIP
  ========================================================== */

  function renderMembership() {
    const member = currentMember;

    if (!member) {
      setText("memberNumber", "Belum terdaftar");
      setText("memberStatus", "Belum terdaftar");

      setText("membershipNumber", "Belum tersedia");
      setText("membershipStatus", "Belum tersedia");
      setText("membershipDate", "—");
      setText("membershipGroup", "—");
      setText("membershipRole", "—");
      setText("membershipUpdated", "—");
      setText("memberSince", "Bergabung: —");

      setText("accountStatus", "Akun aktif");

      return;
    }

    const number = getFirstValue(
      member,
      MEMBER_FIELDS.number
    );

    const status = getFirstValue(
      member,
      MEMBER_FIELDS.status
    );

    const joined = getFirstValue(
      member,
      MEMBER_FIELDS.joined
    );

    const group = getFirstValue(
      member,
      MEMBER_FIELDS.group
    );

    const role = getFirstValue(
      member,
      MEMBER_FIELDS.role
    );

    const updated = getFirstValue(
      member,
      MEMBER_FIELDS.updated
    );

    setText("memberNumber", number);
    setText("memberStatus", status);

    setText("memberSince", "Bergabung: " + formatDate(joined));

    setText("membershipNumber", number);
    setText("membershipStatus", status);
    setText("membershipDate", formatDate(joined));
    setText("membershipGroup", group);
    setText("membershipRole", role);
    setText("membershipUpdated", formatDate(updated));
  }


  /* ==========================================================
     10. MEMBER CARD IDENTITY
  ========================================================== */

  function renderMemberCardIdentity() {
    const name = getProfileName();

    const number = getFirstValue(
      currentMember,
      MEMBER_FIELDS.number
    );

    const status = getFirstValue(
      currentMember,
      MEMBER_FIELDS.status
    );

    setText("qrMemberName", name);
    setText("qrMemberNumber", number);
    setText("qrMemberStatus", status);

    const avatar = $("profileAvatar");

    if (avatar && $("qrMemberAvatar")) {
      $("qrMemberAvatar").src = avatar.src;
    }
  }


  /* ==========================================================
     11. PRIVATE AVATAR STORAGE
  ========================================================== */

  async function loadAvatar() {
    const avatarField = getExistingField(
      currentProfile,
      PROFILE_FIELDS.avatar
    );

    if (!avatarField) return;

    const path = currentProfile[avatarField];

    if (!path) return;

    currentAvatarPath = path;

    const { data, error } = await supabase
      .storage
      .from(CONFIG.AVATAR_BUCKET)
      .createSignedUrl(
        path,
        CONFIG.AVATAR_SIGNED_URL_SECONDS
      );

    if (error) {
      console.warn(
        "Tidak dapat membuat signed URL avatar:",
        error.message
      );

      return;
    }

    if (data?.signedUrl) {
      safeImage($("profileAvatar"), data.signedUrl);
      safeImage($("qrMemberAvatar"), data.signedUrl);
    }
  }


  function validateAvatar(file) {
    if (!file) {
      throw new Error("Silakan pilih foto terlebih dahulu.");
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
  }


  async function uploadAvatar(file) {
    validateAvatar(file);

    const avatarField = getExistingField(
      currentProfile,
      PROFILE_FIELDS.avatar
    );

    if (!avatarField) {
      throw new Error(
        "Kolom penyimpanan path avatar belum ditemukan pada profiles. Upload dibatalkan agar lokasi foto tidak hilang."
      );
    }

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    }[file.type];

    const filePath =
      currentUser.id +
      "/" +
      Date.now() +
      "." +
      extension;

    const { error: uploadError } = await supabase
      .storage
      .from(CONFIG.AVATAR_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const updateData = {
      [avatarField]: filePath
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", currentUser.id);

    if (updateError) {
      await supabase
        .storage
        .from(CONFIG.AVATAR_BUCKET)
        .remove([filePath]);

      throw updateError;
    }

    currentProfile[avatarField] = filePath;

    currentAvatarPath = filePath;

    await loadAvatar();

    showToast("Foto profil berhasil diperbarui.");
  }


  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const button = $("btnChangeAvatar");

      setButtonLoading(
        button,
        true,
        "Mengunggah..."
      );

      await uploadAvatar(file);

      renderMemberCardIdentity();

    } catch (error) {
      console.error("Avatar error:", error);
      showToast(error.message || "Gagal mengunggah foto.");

    } finally {
      setButtonLoading($("btnChangeAvatar"), false);

      event.target.value = "";
    }
  }


  /* ==========================================================
     12. PROFILE EDITING
  ========================================================== */

  function setProfileEditMode(enabled) {
    isEditing = enabled;

    const editableIds = [
      "inputFullName",
      "inputPhone",
      "inputGender",
      "inputBirthDate",
      "inputCity",
      "inputAddress"
    ];

    editableIds.forEach((id) => {
      const element = $(id);

      if (element) {
        element.disabled = !enabled;
      }
    });

    const actions = $("profileEditActions");

    if (actions) {
      actions.hidden = !enabled;
    }

    const editButton = $("btnEditProfile");

    if (editButton) {
      editButton.hidden = enabled;
    }
  }


  function restoreOriginalProfile() {
    if (!currentProfile) return;

    const fields = [
      ["inputFullName", PROFILE_FIELDS.name],
      ["inputPhone", PROFILE_FIELDS.phone],
      ["inputGender", PROFILE_FIELDS.gender],
      ["inputBirthDate", PROFILE_FIELDS.birthDate],
      ["inputCity", PROFILE_FIELDS.city],
      ["inputAddress", PROFILE_FIELDS.address]
    ];

    fields.forEach(([id, keys]) => {
      const element = $(id);

      if (!element) return;

      element.value =
        getFirstValue(originalProfileData, keys) || "";
    });
  }


  function buildProfileUpdate() {
    const values = {
      name: $("inputFullName")?.value.trim() || "",
      phone: $("inputPhone")?.value.trim() || "",
      gender: $("inputGender")?.value || "",
      birthDate: $("inputBirthDate")?.value || "",
      city: $("inputCity")?.value.trim() || "",
      address: $("inputAddress")?.value.trim() || ""
    };

    if (!values.name) {
      throw new Error("Nama lengkap wajib diisi.");
    }

    const update = {};

    Object.entries(values).forEach(([key, value]) => {
      const column = getExistingField(
        currentProfile,
        PROFILE_FIELDS[key] || []
      );

      if (column) {
        update[column] = value || null;
      }
    });

    if (!Object.keys(update).length) {
      throw new Error(
        "Tidak ditemukan kolom profil yang dapat diperbarui."
      );
    }

    return update;
  }


  async function saveProfile(event) {
    event.preventDefault();

    if (isSaving) return;

    try {
      isSaving = true;

      const button = $("btnSaveProfile");

      setButtonLoading(button, true, "Menyimpan...");

      const updateData = buildProfileUpdate();

      const { data, error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", currentUser.id)
        .select()
        .single();

      if (error) throw error;

      currentProfile = data;
      originalProfileData = { ...data };

      setProfileEditMode(false);

      await renderProfile();

      showToast("Profil berhasil diperbarui.");

    } catch (error) {
      console.error("Save profile error:", error);

      showToast(
        error.message || "Gagal menyimpan profil."
      );

    } finally {
      isSaving = false;

      setButtonLoading($("btnSaveProfile"), false);
    }
  }


  /* ==========================================================
     13. QR CODE LIBRARY
  ========================================================== */

  function loadQRCodeLibrary() {
    return new Promise((resolve, reject) => {
      if (window.QRCode) {
        resolve(window.QRCode);
        return;
      }

      const script = document.createElement("script");

      script.src = CONFIG.QR_LIBRARY;
      script.async = true;

      script.onload = () => {
        if (window.QRCode) {
          resolve(window.QRCode);
        } else {
          reject(
            new Error("Library QR tidak berhasil dimuat.")
          );
        }
      };

      script.onerror = () => {
        reject(
          new Error("Gagal memuat library QR Code.")
        );
      };

      document.head.appendChild(script);
    });
  }


  /* ==========================================================
     14. OFFICIAL QR MINTING
     Token wajib berasal dari Edge Function.
  ========================================================== */

  async function generateMemberQR() {
    if (!currentUser) {
      throw new Error("Sesi pengguna tidak ditemukan.");
    }

    if (!currentMember) {
      throw new Error(
        "Data keanggotaan belum tersedia. QR belum dapat diterbitkan."
      );
    }

    const number = getFirstValue(
      currentMember,
      MEMBER_FIELDS.number
    );

    if (!number) {
      throw new Error(
        "Nomor anggota belum tersedia."
      );
    }

    const status = String(
      getFirstValue(
        currentMember,
        MEMBER_FIELDS.status
      ) || ""
    ).toLowerCase();

    if (
      !["active", "aktif"].includes(status)
    ) {
      throw new Error(
        "QR hanya dapat diterbitkan untuk anggota berstatus aktif."
      );
    }

    /*
      Edge Function harus memvalidasi identitas
      berdasarkan JWT pengguna yang sedang login.

      Tidak membuat token QR secara lokal.
    */

    const { data, error } = await supabase.functions.invoke(
      CONFIG.QR_FUNCTION
    );

    if (error) throw error;

    if (!data || typeof data !== "object") {
      throw new Error(
        "Respons penerbitan QR tidak valid."
      );
    }

    const token =
      data.token ||
      data.qr_token ||
      data.verification_token ||
      data.payload;

    const imageUrl =
      data.qr_url ||
      data.image_url ||
      data.qr_image_url;

    const imageData =
      data.qr_data_url ||
      data.data_url;

    if (!token && !imageUrl && !imageData) {
      throw new Error(
        "Edge Function belum mengembalikan token atau gambar QR yang dikenali. Periksa kontrak respons member-qr-mint."
      );
    }

    currentQRToken = token || null;

    const container = $("memberQRCode");

    if (!container) return;

    container.replaceChildren();

    if (imageData || imageUrl) {
      const image = document.createElement("img");

      image.src = imageData || imageUrl;
      image.alt = "QR resmi anggota TARBIYAH";

      image.style.width = "150px";
      image.style.height = "150px";
      image.style.objectFit = "contain";

      container.appendChild(image);

    } else {
      const QRCode = await loadQRCodeLibrary();

      new QRCode(container, {
        text: token,
        width: 150,
        height: 150,
        colorDark: "#064e3b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    const downloadButton = $("btnDownloadQR");

    if (downloadButton) {
      downloadButton.disabled = false;
    }

    showToast("QR resmi berhasil diterbitkan.");
  }


  async function handleGenerateQR() {
    const button = $("btnGenerateQR");

    try {
      setButtonLoading(
        button,
        true,
        "Menerbitkan QR..."
      );

      await generateMemberQR();

    } catch (error) {
      console.error("QR error:", error);

      showToast(
        error.message || "Penerbitan QR gagal."
      );

    } finally {
      setButtonLoading(button, false);
    }
  }


  /* ==========================================================
     15. DOWNLOAD QR
  ========================================================== */

  function downloadMemberQR() {
    const container = $("memberQRCode");

    if (!container) return;

    const canvas = container.querySelector("canvas");
    const image = container.querySelector("img");

    let url = null;

    if (canvas) {
      url = canvas.toDataURL("image/png");
    } else if (image) {
      if (!image.src.startsWith("data:")) {
        showToast(
          "Unduhan QR dari URL eksternal belum didukung."
        );

        return;
      }

      url = image.src;
    }

    if (!url) {
      showToast("QR belum tersedia.");
      return;
    }

    const link = document.createElement("a");

    link.href = url;
    link.download = "tarbiyah-qr-anggota.png";

    document.body.appendChild(link);
    link.click();
    link.remove();
  }


  /* ==========================================================
     16. ATTENDANCE HISTORY
     Belum mengasumsikan nama tabel kajian/kehadiran.
  ========================================================== */

  function renderAttendanceHistory() {
    const container = $("attendanceHistory");

    if (!container) return;

    container.replaceChildren();

    const empty = document.createElement("div");

    empty.className = "empty-state";

    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.textContent = "◷";

    const heading = document.createElement("h4");
    heading.textContent = "Riwayat belum tersedia";

    const paragraph = document.createElement("p");
    paragraph.textContent =
      "Sumber data kajian dan kehadiran belum dikonfigurasi. Data akan ditampilkan setelah tabel dan relasinya terverifikasi.";

    empty.append(icon, heading, paragraph);

    container.appendChild(empty);

    setText("totalKajian", "—");
    setText("totalAttendance", "—");
    setText("attendancePercentage", "—");
  }


  /* ==========================================================
     17. TAB NAVIGATION
  ========================================================== */

  function setupTabs() {
    const tabs = document.querySelectorAll(".profile-tab");

    tabs.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.tab;

        if (!target) return;

        tabs.forEach((tab) => {
          tab.classList.toggle(
            "active",
            tab === button
          );
        });

        document.querySelectorAll(
          ".profile-tab-content"
        ).forEach((section) => {
          const active = section.id === "tab-" + target;

          section.classList.toggle("active", active);
          section.hidden = !active;
        });
      });
    });
  }


  /* ==========================================================
     18. THEME MANAGEMENT
  ========================================================== */

  function setupTheme() {
    const button = $("btnTheme");

    if (!button) return;

    button.addEventListener("click", () => {
      const html = document.documentElement;

      const current =
        html.getAttribute("data-theme") || "dark";

      const next =
        current === "dark" ? "light" : "dark";

      html.setAttribute("data-theme", next);

      try {
        localStorage.setItem(
          "tarbiyah-theme",
          next
        );
      } catch (error) {
        console.warn("Tema tidak dapat disimpan.");
      }
    });
  }


  /* ==========================================================
     19. NAVIGATION
  ========================================================== */

  function setupNavigation() {
    $("btnBack")?.addEventListener("click", () => {
      window.location.href =
        window.TARBIYAH_CONFIG?.DASHBOARD_PAGE ||
        CONFIG.DASHBOARD_PAGE;
    });

    $("btnNotifications")?.addEventListener("click", () => {
      showToast("Belum ada notifikasi baru.");
    });
  }


  /* ==========================================================
     20. LOGOUT
  ========================================================== */

  async function handleLogout() {
    const button = $("btnLogout");

    if (
      !window.confirm(
        "Apakah Anda yakin ingin keluar dari akun TARBIYAH?"
      )
    ) {
      return;
    }

    try {
      setButtonLoading(
        button,
        true,
        "Keluar..."
      );

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      window.TARBIYAH_SESSION = null;

      window.location.replace(
        window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
        CONFIG.LOGIN_PAGE
      );

    } catch (error) {
      console.error("Logout error:", error);

      showToast(
        error.message || "Gagal keluar dari akun."
      );

      setButtonLoading(button, false);
    }
  }


  /* ==========================================================
     21. EVENT LISTENERS
  ========================================================== */

  function setupEventListeners() {
    $("btnEditProfile")?.addEventListener(
      "click",
      () => setProfileEditMode(true)
    );

    $("btnCancelEdit")?.addEventListener(
      "click",
      () => {
        restoreOriginalProfile();
        setProfileEditMode(false);
      }
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
      handleAvatarChange
    );

    $("btnGenerateQR")?.addEventListener(
      "click",
      handleGenerateQR
    );

    $("btnDownloadQR")?.addEventListener(
      "click",
      downloadMemberQR
    );

    $("btnLogout")?.addEventListener(
      "click",
      handleLogout
    );

    setupTabs();
    setupTheme();
    setupNavigation();
  }


  /* ==========================================================
     22. AUTH STATE LISTENER
  ========================================================== */

  function setupAuthListener() {
    supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          !session?.user
        ) {
          window.TARBIYAH_SESSION = null;
          redirectToLogin();
        }
      }
    );
  }


  /* ==========================================================
     23. INITIALIZATION
  ========================================================== */

  async function initializeProfile() {
    try {
      setLoading(true);

      validateBackend();

      setupEventListeners();

      const authenticated = await checkSession();

      if (!authenticated) return;

      setupAuthListener();

      await loadProfile();

      await loadMembership();

      renderAttendanceHistory();

      setProfileEditMode(false);

      console.info(
        "[TARBIYAH] Profil anggota berhasil dimuat."
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Profile initialization error:",
        error
      );

      showToast(
        error.message ||
        "Terjadi kesalahan saat memuat profil."
      );

    } finally {
      setLoading(false);
    }
  }


  /* ==========================================================
     24. START APPLICATION
  ========================================================== */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeProfile,
      { once: true }
    );
  } else {
    initializeProfile();
  }


  /* ==========================================================
     25. PUBLIC API
  ========================================================== */

  window.TARBIYAH_PROFILE = {
    reload: initializeProfile,

    getCurrentUser: () => currentUser,

    getCurrentProfile: () => currentProfile,

    getCurrentMember: () => currentMember,

    getCurrentAvatarPath: () => currentAvatarPath,

    getQRToken: () => currentQRToken
  };

})();
