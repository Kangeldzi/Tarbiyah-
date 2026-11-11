
/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   File: js/profil-anggota.js

   Fitur:
   1. Membaca profil pengguna dari tabel profiles
   2. Membaca keanggotaan dari tabel members
   3. Menampilkan foto profil dari private Storage
   4. Mengedit informasi profil
   5. Mengunggah dan mengganti foto profil
   6. Validasi formulir dan file foto
   7. Menangani error Supabase
   8. Tidak membuat profil secara manual
   9. Tidak mengubah status keanggotaan

   Backend:
   - window.tarbiyahSupabase
   - window.TARBIYAH_SESSION
   - window.TARBIYAH_AUTH

   Database:
   - profiles
   - members

   Storage:
   - avatar (PRIVATE)
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     01. KONFIGURASI
  ======================================================= */

  const CONFIG = {
    avatarBucket: "avatar",
    maxAvatarSize: 2 * 1024 * 1024,
    signedUrlExpiry: 60 * 60,

    allowedAvatarTypes: [
      "image/jpeg",
      "image/png",
      "image/webp"
    ]
  };

  let supabase = null;
  let currentUser = null;
  let currentProfile = null;
  let currentMembership = null;

  let selectedAvatarFile = null;
  let selectedAvatarPreviewUrl = null;
  let currentAvatarSignedUrl = null;

  let isInitialized = false;
  let isSaving = false;
  let previousBodyOverflow = "";

  let toastTimer = null;


  /* =======================================================
     02. DOM HELPER
  ======================================================= */

  const $ = (selector) => document.querySelector(selector);

  function getElement(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = getElement(id);

    if (element) {
      element.textContent = value ?? "";
    }
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


  /* =======================================================
     03. ELEMENT REFERENCES
  ======================================================= */

  const elements = {
    loading: getElement("profileLoading"),
    content: getElement("profileContent"),

    alert: getElement("profileAlert"),
    alertMessage: getElement("profileAlertMessage"),

    modal: getElement("profileEditModal"),
    form: getElement("profileEditForm"),

    openEditor: getElement("openProfileEditor"),
    openEditorSecondary: getElement("openProfileEditorSecondary"),
    closeEditor: getElement("closeProfileEditor"),
    cancelEditor: getElement("cancelProfileEdit"),

    fullName: getElement("editFullName"),
    username: getElement("editUsername"),
    phone: getElement("editPhone"),
    bio: getElement("editBio"),

    avatarFile: getElement("avatarFile"),
    avatarPreview: getElement("avatarPreview"),
    avatarFileName: getElement("avatarFileName"),
    cancelAvatar: getElement("cancelAvatarSelection"),

    saveButton: getElement("saveProfileButton"),

    formError: getElement("profileFormError"),
    formErrorMessage: getElement("profileFormErrorMessage"),

    toast: getElement("profileToast"),
    toastMessage: getElement("profileToastMessage"),
    toastIcon: getElement("toastIcon")
  };


  /* =======================================================
     04. NOTIFICATION HELPERS
  ======================================================= */

  function showAlert(message) {
    if (!elements.alert || !elements.alertMessage) return;

    elements.alertMessage.textContent = message;
    elements.alert.hidden = false;
  }

  function hideAlert() {
    if (elements.alert) {
      elements.alert.hidden = true;
    }
  }

  function showFormError(message) {
    if (!elements.formError || !elements.formErrorMessage) return;

    elements.formErrorMessage.textContent = message;
    elements.formError.hidden = false;
  }

  function hideFormError() {
    if (elements.formError) {
      elements.formError.hidden = true;
    }
  }

  function showToast(message, type = "success") {
    if (!elements.toast) return;

    const iconMap = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      warning: "fa-triangle-exclamation",
      info: "fa-circle-info"
    };

    const colorMap = {
      success: "var(--profile-success)",
      error: "var(--profile-danger)",
      warning: "var(--profile-warning)",
      info: "var(--profile-info)"
    };

    if (toastTimer) {
      clearTimeout(toastTimer);
    }

    if (elements.toastMessage) {
      elements.toastMessage.textContent = message;
    }

    if (elements.toastIcon) {
      const iconName = iconMap[type] || iconMap.info;

      elements.toastIcon.innerHTML =
        `<i class="fa-solid ${iconName}"></i>`;

      elements.toastIcon.style.color =
        colorMap[type] || colorMap.info;
    }

    elements.toast.hidden = false;

    toastTimer = setTimeout(() => {
      elements.toast.hidden = true;
    }, 4000);
  }


  /* =======================================================
     05. DATE FORMATTER
  ======================================================= */

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }


  /* =======================================================
     06. SUPABASE CLIENT
  ======================================================= */

  function getSupabaseClient() {
    const client = window.tarbiyahSupabase;

    if (!client) {
      throw new Error(
        "Supabase client belum tersedia. Periksa js/config.js dan js/supabase-client.js."
      );
    }

    if (!client.auth || !client.from || !client.storage) {
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


  /* =======================================================
     07. AUTHENTICATED USER
  ======================================================= */

  async function getAuthenticatedUser() {

    /*
      Prioritas pertama:
      Session yang telah diperiksa auth-guard.js
    */

    const guardedSession = window.TARBIYAH_SESSION;

    if (
      guardedSession &&
      guardedSession.ready === true &&
      guardedSession.user
    ) {
      return guardedSession.user;
    }

    /*
      Cadangan:
      Ambil session langsung dari Supabase Auth.
    */

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(
        "Tidak dapat memeriksa sesi login: " + error.message
      );
    }

    const user = data?.session?.user;

    if (!user) {
      throw new Error(
        "Sesi login tidak ditemukan. Silakan masuk kembali."
      );
    }

    return user;
  }


  /* =======================================================
     08. LOAD PROFILE FROM DATABASE
  ======================================================= */

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
      console.error(
        "[TARBIYAH PROFILE] Gagal mengambil profiles:",
        error
      );

      throw new Error(
        "Gagal mengambil data profil: " + error.message
      );
    }

    if (!data) {
      throw new Error(
        "Data profil Anda belum ditemukan. Silakan hubungi pengurus atau administrator TARBIYAH. Halaman ini tidak membuat profil baru secara otomatis."
      );
    }

    /*
      Keamanan tambahan:
      Profil harus benar-benar milik pengguna login.
    */

    if (data.id !== currentUser.id) {
      throw new Error(
        "Pemeriksaan keamanan profil gagal."
      );
    }

    currentProfile = data;

    return data;
  }


  /* =======================================================
     09. LOAD MEMBERSHIP
  ======================================================= */

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
        review_note
      `)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.error(
        "[TARBIYAH PROFILE] Gagal mengambil members:",
        error
      );

      currentMembership = null;

      showAlert(
        "Informasi profil berhasil dimuat, tetapi data keanggotaan belum dapat diambil. Silakan coba kembali nanti."
      );

      return null;
    }

    currentMembership = data || null;

    return currentMembership;
  }


  /* =======================================================
     10. PRIVATE AVATAR SIGNED URL
  ======================================================= */

  async function getAvatarSignedUrl(path) {

    if (!path) return null;

    const { data, error } = await supabase
      .storage
      .from(CONFIG.avatarBucket)
      .createSignedUrl(
        path,
        CONFIG.signedUrlExpiry
      );

    if (error) {
      console.error(
        "[TARBIYAH PROFILE] Gagal membuat signed URL avatar:",
        error
      );

      return null;
    }

    return data?.signedUrl || null;
  }


  /* =======================================================
     11. AVATAR RENDERING
  ======================================================= */

  function createAvatarContent(imageUrl, className = "") {

    if (!imageUrl) {
      return '<i class="fa-solid fa-user"></i>';
    }

    const image = document.createElement("img");

    image.src = imageUrl;
    image.alt = "Foto profil anggota";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    if (className) {
      image.className = className;
    }

    return image;
  }


  function renderAvatar(element, imageUrl) {

    if (!element) return;

    element.replaceChildren();

    if (!imageUrl) {
      const icon = document.createElement("i");

      icon.className = "fa-solid fa-user";

      element.appendChild(icon);

      return;
    }

    const image = createAvatarContent(imageUrl);

    image.addEventListener("error", () => {
      element.innerHTML =
        '<i class="fa-solid fa-user"></i>';
    }, { once: true });

    element.appendChild(image);
  }


  async function refreshAvatar() {

    const avatarPath = currentProfile?.avatar_path || "";

    currentAvatarSignedUrl = await getAvatarSignedUrl(
      avatarPath
    );

    renderAvatar(
      getElement("profileAvatar"),
      currentAvatarSignedUrl
    );

    renderAvatar(
      getElement("topbarAvatar"),
      currentAvatarSignedUrl
    );

    renderAvatar(
      getElement("sidebarAvatar"),
      currentAvatarSignedUrl
    );

    renderAvatar(
      elements.avatarPreview,
      currentAvatarSignedUrl
    );
  }


  /* =======================================================
     12. RENDER PROFILE INFORMATION
  ======================================================= */

  function renderProfile() {

    if (!currentProfile || !currentUser) return;

    const fullName =
      currentProfile.full_name?.trim() ||
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      "Anggota TARBIYAH";

    const username = currentProfile.username
      ? "@" + currentProfile.username
      : "Username belum diatur";

    const phone =
      currentProfile.phone?.trim() || "Belum diisi";

    const bio =
      currentProfile.bio?.trim() ||
      "Belum ada deskripsi profil.";

    const email =
      currentUser.email || "-";

    setText("profileFullName", fullName);
    setText("profileUsername", username);
    setText("profileEmail", email);

    setText("detailFullName", fullName);
    setText(
      "detailUsername",
      currentProfile.username
        ? "@" + currentProfile.username
        : "Belum diisi"
    );

    setText("detailPhone", phone);
    setText("detailEmail", email);
    setText("detailBio", bio);

    setText("sidebarUserName", fullName);
    setText("sidebarUserRole", "Anggota TARBIYAH");

    setText("accountUserId", currentUser.id || "-");
    setText("accountEmail", email);

    setText(
      "accountCreatedAt",
      formatDateTime(currentProfile.created_at)
    );

    setText(
      "accountUpdatedAt",
      formatDateTime(currentProfile.updated_at)
    );
  }


  /* =======================================================
     13. RENDER MEMBERSHIP INFORMATION
  ======================================================= */

  function renderMembership() {

    const membership = currentMembership;

    const statusElement = getElement("membershipStatus");
    const statusText = getElement("membershipStatusText");

    if (!statusElement || !statusText) return;

    statusElement.className = "membership-status";

    if (!membership) {

      statusElement.classList.add("status-pending");

      statusText.textContent = "Belum tersedia";

      setText(
        "membershipDescription",
        "Data keanggotaan belum tersedia atau belum dapat ditampilkan."
      );

      setText("memberNumber", "Belum tersedia");
      setText("membershipSubmittedAt", "-");
      setText("membershipReviewedAt", "-");

      return;
    }

    const rawStatus =
      String(membership.membership_status || "pending")
        .trim()
        .toLowerCase();

    const statusMap = {
      pending: {
        label: "Menunggu Verifikasi",
        className: "status-pending",
        description:
          "Pendaftaran keanggotaan Anda sedang menunggu proses pemeriksaan pengurus."
      },

      approved: {
        label: "Disetujui",
        className: "status-active",
        description:
          "Pendaftaran keanggotaan Anda telah disetujui."
      },

      active: {
        label: "Anggota Aktif",
        className: "status-active",
        description:
          "Keanggotaan Anda tercatat aktif di TARBIYAH."
      },

      rejected: {
        label: "Belum Disetujui",
        className: "status-rejected",
        description:
          "Pendaftaran keanggotaan Anda belum disetujui. Silakan hubungi pengurus TARBIYAH."
      }
    };

    const status =
      statusMap[rawStatus] || {
        label: rawStatus
          .replace(/[_-]/g, " ")
          .replace(/\b\w/g, char => char.toUpperCase()),

        className: "",
        description:
          "Status keanggotaan sesuai data yang tercatat di sistem TARBIYAH."
      };

    if (status.className) {
      statusElement.classList.add(status.className);
    }

    statusText.textContent = status.label;

    setText(
      "membershipDescription",
      status.description
    );

    setText(
      "memberNumber",
      membership.member_number || "Belum tersedia"
    );

    setText(
      "membershipSubmittedAt",
      formatDate(membership.submitted_at)
    );

    setText(
      "membershipReviewedAt",
      formatDate(membership.reviewed_at)
    );
  }


  /* =======================================================
     14. INITIALIZE PAGE DATA
  ======================================================= */

  async function loadPageData() {

    if (elements.loading) {
      elements.loading.hidden = false;
    }

    if (elements.content) {
      elements.content.hidden = true;
    }

    hideAlert();

    try {

      supabase = getSupabaseClient();

      currentUser = await getAuthenticatedUser();

      if (!currentUser?.id) {
        throw new Error(
          "Identitas pengguna tidak ditemukan."
        );
      }

      console.info(
        "[TARBIYAH PROFILE] Pengguna terautentikasi:",
        currentUser.id
      );

      /*
        Ambil data profil terlebih dahulu.
        Profil tidak dibuat manual jika tidak ditemukan.
      */

      await loadProfile();

      /*
        Data anggota boleh gagal tanpa menghilangkan
        informasi profil pribadi.
      */

      await loadMembership();

      renderProfile();
      renderMembership();

      await refreshAvatar();

      if (elements.content) {
        elements.content.hidden = false;
      }

      console.info(
        "[TARBIYAH PROFILE] Data profil berhasil dimuat."
      );

    } catch (error) {

      console.error(
        "[TARBIYAH PROFILE] Error:",
        error
      );

      showAlert(
        error.message ||
        "Terjadi kesalahan saat memuat profil."
      );

      if (elements.content) {
        elements.content.hidden = true;
      }

    } finally {

      if (elements.loading) {
        elements.loading.hidden = true;
      }

    }
  }


  /* =======================================================
     15. OPEN EDIT PROFILE MODAL
  ======================================================= */

  function populateEditForm() {

    if (!currentProfile) return;

    if (elements.fullName) {
      elements.fullName.value =
        currentProfile.full_name || "";
    }

    if (elements.username) {
      elements.username.value =
        currentProfile.username || "";
    }

    if (elements.phone) {
      elements.phone.value =
        currentProfile.phone || "";
    }

    if (elements.bio) {
      elements.bio.value =
        currentProfile.bio || "";
    }

    resetSelectedAvatar();
    hideFormError();
  }


  function openEditor() {

    if (!currentProfile) {
      showToast(
        "Data profil belum tersedia.",
        "warning"
      );

      return;
    }

    populateEditForm();

    if (!elements.modal) return;

    previousBodyOverflow = document.body.style.overflow;

    elements.modal.hidden = false;
    elements.modal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    setTimeout(() => {
      elements.fullName?.focus();
    }, 100);
  }


  /* =======================================================
     16. CLOSE EDIT PROFILE MODAL
  ======================================================= */
   
function closeEditor(force = false) {
  if (!elements.modal) return;

  // Hanya nilai boolean true yang boleh memaksa penutupan.
  // Event klik dari tombol tidak dianggap sebagai force.
  const forceClose = force === true;

  if (isSaving && !forceClose) return;

  elements.modal.hidden = true;
  elements.modal.setAttribute("aria-hidden", "true");

  document.body.style.overflow = previousBodyOverflow;

  resetSelectedAvatar();
  hideFormError();
}

  /* =======================================================
     17. AVATAR PREVIEW
  ======================================================= */

  function revokeAvatarPreviewUrl() {

    if (selectedAvatarPreviewUrl) {

      URL.revokeObjectURL(
        selectedAvatarPreviewUrl
      );

      selectedAvatarPreviewUrl = null;
    }
  }


  function resetSelectedAvatar() {

    selectedAvatarFile = null;

    revokeAvatarPreviewUrl();

    if (elements.avatarFile) {
      elements.avatarFile.value = "";
    }

    if (elements.avatarFileName) {
      elements.avatarFileName.textContent =
        "Belum ada foto baru dipilih";
    }

    hideElement(elements.cancelAvatar);

    renderAvatar(
      elements.avatarPreview,
      currentAvatarSignedUrl
    );
  }


  function validateAvatarFile(file) {

    if (!file) {
      return "File foto tidak ditemukan.";
    }

    if (!CONFIG.allowedAvatarTypes.includes(file.type)) {
      return "Format foto harus JPG, PNG, atau WEBP.";
    }

    if (file.size > CONFIG.maxAvatarSize) {
      return "Ukuran foto maksimal 2 MB.";
    }

    if (file.size <= 0) {
      return "File foto kosong atau tidak valid.";
    }

    return null;
  }


  function handleAvatarSelection(event) {

    const file = event.target.files?.[0];

    if (!file) return;

    const validationError = validateAvatarFile(file);

    if (validationError) {

      showFormError(validationError);

      resetSelectedAvatar();

      return;
    }

    hideFormError();

    revokeAvatarPreviewUrl();

    selectedAvatarFile = file;

    selectedAvatarPreviewUrl =
      URL.createObjectURL(file);

    renderAvatar(
      elements.avatarPreview,
      selectedAvatarPreviewUrl
    );

    if (elements.avatarFileName) {
      elements.avatarFileName.textContent =
        file.name;
    }

    showElement(elements.cancelAvatar);
  }


  /* =======================================================
     18. FORM VALIDATION
  ======================================================= */

  function validateProfileForm() {

    const fullName =
      elements.fullName?.value.trim() || "";

    const username =
      elements.username?.value.trim() || "";

    const phone =
      elements.phone?.value.trim() || "";

    const bio =
      elements.bio?.value.trim() || "";

    if (!fullName) {
      return {
        valid: false,
        message: "Nama lengkap wajib diisi."
      };
    }

    if (fullName.length > 100) {
      return {
        valid: false,
        message: "Nama lengkap maksimal 100 karakter."
      };
    }

    if (
      username &&
      !/^[a-zA-Z0-9._]{3,30}$/.test(username)
    ) {
      return {
        valid: false,
        message:
          "Username harus 3–30 karakter dan hanya boleh menggunakan huruf, angka, titik, atau garis bawah."
      };
    }

    if (phone.length > 25) {
      return {
        valid: false,
        message: "Nomor telepon maksimal 25 karakter."
      };
    }

    if (bio.length > 500) {
      return {
        valid: false,
        message: "Deskripsi profil maksimal 500 karakter."
      };
    }

    if (selectedAvatarFile) {

      const avatarError =
        validateAvatarFile(selectedAvatarFile);

      if (avatarError) {
        return {
          valid: false,
          message: avatarError
        };
      }
    }

    return {
      valid: true,
      values: {
        full_name: fullName,
        username: username || null,
        phone: phone || null,
        bio: bio || null
      }
    };
  }


  /* =======================================================
     19. GENERATE AVATAR STORAGE PATH
  ======================================================= */

  function generateAvatarPath(userId, file) {

    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension =
      extensionMap[file.type];

    if (!extension) {
      throw new Error(
        "Format foto tidak didukung."
      );
    }

    let uniqueId;

    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      uniqueId = window.crypto.randomUUID();

    } else {

      uniqueId =
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 12);
    }

    return (
      userId +
      "/" +
      uniqueId +
      "." +
      extension
    );
  }


  /* =======================================================
     20. UPLOAD AVATAR
  ======================================================= */

  async function uploadAvatar(file) {

    const validationError =
      validateAvatarFile(file);

    if (validationError) {
      throw new Error(validationError);
    }

    const newPath = generateAvatarPath(
      currentUser.id,
      file
    );

    const { data, error } = await supabase
      .storage
      .from(CONFIG.avatarBucket)
      .upload(
        newPath,
        file,
        {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false
        }
      );

    if (error) {

      console.error(
        "[TARBIYAH PROFILE] Upload avatar gagal:",
        error
      );

      throw new Error(
        "Gagal mengunggah foto profil: " + error.message
      );
    }

    return data.path || newPath;
  }


  /* =======================================================
     21. REMOVE NEW UPLOAD IF DATABASE UPDATE FAILS
  ======================================================= */

  async function cleanupNewAvatar(path) {

    if (!path) return;

    try {

      const { error } = await supabase
        .storage
        .from(CONFIG.avatarBucket)
        .remove([path]);

      if (error) {
        console.warn(
          "[TARBIYAH PROFILE] Pembersihan foto baru gagal:",
          error
        );
      }

    } catch (cleanupError) {

      console.warn(
        "[TARBIYAH PROFILE] Error saat membersihkan foto baru:",
        cleanupError
      );
    }
  }


  /* =======================================================
     22. DELETE OLD AVATAR AFTER SUCCESS
  ======================================================= */

  async function cleanupOldAvatar(oldPath, newPath) {

    if (!oldPath || oldPath === newPath) return;

    /*
      Pastikan file lama memang berada dalam folder
      milik pengguna yang sedang login.
    */

    const expectedPrefix = currentUser.id + "/";

    if (!oldPath.startsWith(expectedPrefix)) {

      console.warn(
        "[TARBIYAH PROFILE] File avatar lama tidak dihapus karena path tidak sesuai kepemilikan."
      );

      return;
    }

    try {

      const { error } = await supabase
        .storage
        .from(CONFIG.avatarBucket)
        .remove([oldPath]);

      if (error) {

        console.warn(
          "[TARBIYAH PROFILE] Foto lama belum dapat dihapus:",
          error
        );

        showToast(
          "Profil berhasil diperbarui. Foto lama belum berhasil dibersihkan dari penyimpanan.",
          "warning"
        );
      }

    } catch (error) {

      console.warn(
        "[TARBIYAH PROFILE] Error menghapus foto lama:",
        error
      );

      showToast(
        "Profil berhasil diperbarui, tetapi foto lama belum berhasil dibersihkan.",
        "warning"
      );
    }
  }


  /* =======================================================
     23. SET SAVE BUTTON STATE
  ======================================================= */

  function setSavingState(saving) {

    isSaving = saving;

    if (elements.saveButton) {

      elements.saveButton.disabled = saving;

      elements.saveButton.innerHTML = saving
        ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Menyimpan...</span>'
        : '<i class="fa-solid fa-floppy-disk"></i><span>Simpan Perubahan</span>';
    }

    if (elements.cancelEditor) {
      elements.cancelEditor.disabled = saving;
    }

    if (elements.closeEditor) {
      elements.closeEditor.disabled = saving;
    }
  }


  /* =======================================================
     24. SAVE PROFILE
  ======================================================= */

  async function saveProfile(event) {

    event.preventDefault();

    if (isSaving && !force) return;

    hideFormError();

    const validation = validateProfileForm();

    if (!validation.valid) {

      showFormError(validation.message);

      return;
    }

    setSavingState(true);

    let uploadedAvatarPath = null;

    const oldAvatarPath =
      currentProfile?.avatar_path || null;

    try {

      /*
        Pastikan user masih memiliki session.
      */

      const authenticatedUser =
        await getAuthenticatedUser();

      if (authenticatedUser.id !== currentUser.id) {
        throw new Error(
          "Sesi pengguna berubah. Silakan muat ulang halaman."
        );
      }

      /*
        Upload foto terlebih dahulu jika ada foto baru.
      */

      if (selectedAvatarFile) {

        uploadedAvatarPath =
          await uploadAvatar(selectedAvatarFile);
      }

      /*
        Susun data yang boleh diubah pengguna.
        Status keanggotaan dan role tidak disentuh.
      */

      const updatePayload = {
        full_name: validation.values.full_name,
        username: validation.values.username,
        phone: validation.values.phone,
        bio: validation.values.bio,
        updated_at: new Date().toISOString()
      };

      if (uploadedAvatarPath) {
        updatePayload.avatar_path =
          uploadedAvatarPath;
      }

      /*
        Update hanya profil milik pengguna login.
      */

      const { data, error } = await supabase
        .from("profiles")
        .update(updatePayload)
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
        .single();

      if (error) {

        console.error(
          "[TARBIYAH PROFILE] Update profil gagal:",
          error
        );

        throw new Error(
          "Gagal menyimpan perubahan profil: " +
          error.message
        );
      }

      if (!data || data.id !== currentUser.id) {
        throw new Error(
          "Data profil tidak dapat diverifikasi setelah penyimpanan."
        );
      }

      /*
        Update lokal hanya setelah database berhasil.
      */

      currentProfile = data;

      /*
        Hapus foto baru jika proses penyimpanan database gagal
        akan ditangani oleh blok catch.
      */

      await refreshAvatar();

      renderProfile();

      /*
        Hapus foto lama setelah database berhasil menunjuk
        ke path foto baru.
      */

      if (uploadedAvatarPath && oldAvatarPath) {

        await cleanupOldAvatar(
          oldAvatarPath,
          uploadedAvatarPath
        );
      }

      /*
        Bersihkan state file pilihan.
      */

      resetSelectedAvatar();
     // Tutup modal setelah database berhasil menyimpan profil.
      closeEditor(true);
      showToast("Profil berhasil diperbarui.", "success"
      );

      console.info(
        "[TARBIYAH PROFILE] Profil berhasil disimpan."
      );

    } catch (error) {

      console.error(
        "[TARBIYAH PROFILE] Gagal menyimpan profil:",
        error
      );

      /*
        Jika upload berhasil tetapi update database gagal,
        hapus file baru agar tidak meninggalkan file yatim.
      */

      if (uploadedAvatarPath) {
        await cleanupNewAvatar(uploadedAvatarPath);
      }

      showFormError(
        error.message ||
        "Terjadi kesalahan saat menyimpan profil."
      );

    } finally {

      setSavingState(false);
    }
  }


  /* =======================================================
     25. SIDEBAR / MODULE SHELL COMPATIBILITY
  ======================================================= */

  function setCurrentYear() {

    const yearElement = getElement("currentYear");

    if (yearElement) {
      yearElement.textContent =
        new Date().getFullYear();
    }
  }


  /* =======================================================
     26. EVENT LISTENERS
  ======================================================= */

  function bindEvents() {

    /*
      Open modal
    */

    elements.openEditor?.addEventListener(
      "click",
      openEditor
    );

    elements.openEditorSecondary?.addEventListener(
      "click",
      openEditor
    );

     
/* =========================================
   NOTIFICATION MODAL
========================================= */

const notificationModal =
  getElement("notificationModal");

const openNotificationButton =
  getElement("openNotificationModal");

const closeNotificationButton =
  getElement("closeNotificationModal");

function openNotificationModal() {
  if (!notificationModal) return;

  notificationModal.hidden = false;
  notificationModal.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";
}

function closeNotificationModal() {
  if (!notificationModal) return;

  notificationModal.hidden = true;
  notificationModal.setAttribute("aria-hidden", "true");

  // Jangan membuka scroll jika modal edit profil
  // masih sedang terbuka.
  if (!elements.modal || elements.modal.hidden) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

openNotificationButton?.addEventListener(
  "click",
  openNotificationModal
);

closeNotificationButton?.addEventListener(
  "click",
  closeNotificationModal
);

notificationModal
  ?.querySelectorAll("[data-notification-close]")
  .forEach(element => {
    element.addEventListener(
      "click",
      closeNotificationModal
    );
  });

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    notificationModal &&
    !notificationModal.hidden
  ) {
    closeNotificationModal();
  }
});

    /*
      Close modal
    */

    elements.closeEditor?.addEventListener(
      "click",
      closeEditor
    );

    elements.cancelEditor?.addEventListener(
      "click",
      closeEditor
    );

    /*
      Click backdrop
    */

    elements.modal?.querySelectorAll("[data-modal-close]")
      .forEach(element => {
        element.addEventListener(
          "click",
          closeEditor
        );
      });

    /*
      Escape key
    */

    document.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Escape" &&
          elements.modal &&
          !elements.modal.hidden
        ) {
          closeEditor();
        }
      }
    );

    /*
      Submit form
    */

    elements.form?.addEventListener(
      "submit",
      saveProfile
    );

    /*
      Avatar file selection
    */

    elements.avatarFile?.addEventListener(
      "change",
      handleAvatarSelection
    );

    /*
      Cancel new avatar selection
    */

    elements.cancelAvatar?.addEventListener(
      "click",
      () => {
        resetSelectedAvatar();
        hideFormError();

        showToast(
          "Pilihan foto baru dibatalkan.",
          "info"
        );
      }
    );

    /*
      Clear error while user edits fields
    */

    [
      elements.fullName,
      elements.username,
      elements.phone,
      elements.bio
    ].forEach(element => {

      element?.addEventListener(
        "input",
        hideFormError
      );
    });

    /*
      Sidebar year
    */

    setCurrentYear();
  }


  /* =======================================================
     27. INITIALIZATION
  ======================================================= */

  async function initialize() {

    if (isInitialized) return;

    isInitialized = true;

    bindEvents();

    await loadPageData();
  }


  /* =======================================================
     28. AUTH GUARD EVENT
  ======================================================= */

  document.addEventListener(
    "tarbiyah:session-ready",
    () => {

      console.info(
        "[TARBIYAH PROFILE] Session siap. Memulai halaman profil."
      );

      initialize();
    }
  );


  /* =======================================================
     29. DOM READY FALLBACK
  ======================================================= */

  function startWhenReady() {

    /*
      auth-guard.js mungkin sudah menyelesaikan
      pemeriksaan session sebelum halaman ini mulai.
    */

    if (
      window.TARBIYAH_SESSION &&
      window.TARBIYAH_SESSION.ready === true
    ) {
      initialize();
      return;
    }

    /*
      Jika event session belum diterima, beri kesempatan
      auth-guard.js menyelesaikan pemeriksaan session.
    */

    if (!window.TARBIYAH_SESSION) {
      console.info(
        "[TARBIYAH PROFILE] Menunggu pemeriksaan session auth-guard."
      );
    }
  }


  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      startWhenReady,
      { once: true }
    );

  } else {

    startWhenReady();
  }


  /* =======================================================
     30. PUBLIC DEBUG INTERFACE
     Hanya untuk pemeriksaan dari console.
     Tidak menyediakan fungsi perubahan role/status.
  ======================================================= */

  window.TARBIYAH_PROFILE = {
    reload: async () => {
      if (!isInitialized) {
        return initialize();
      }

      return loadPageData();
    },

    getState: () => ({
      initialized: isInitialized,
      userId: currentUser?.id || null,
      profileLoaded: Boolean(currentProfile),
      membershipLoaded: Boolean(currentMembership),
      avatarLoaded: Boolean(currentAvatarSignedUrl),
      saving: isSaving
    })
  };


  console.info(
    "[TARBIYAH PROFILE] Script profil anggota berhasil dimuat."
  );

})();
