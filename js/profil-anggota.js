
/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   JavaScript Version 3.2
   Perbaikan:
   - Edit Profil dan penguncian field
   - Simpan dan Batalkan perubahan
   - Supabase profile dan membership
   - Upload avatar ke Storage private bucket
   - Tab navigasi
   - Tema dan logout
   - Loading timeout agar halaman tidak menggantung

   File: js/profil-anggota.js
========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_PROFILE_V32__) {
    console.warn("[TARBIYAH] profil-anggota.js sudah berjalan.");
    return;
  }
  window.__TARBIYAH_PROFILE_V32__ = true;

  const VERSION = "3.2";
  const TABLE_PROFILES = "profiles";
  const TABLE_MEMBERS = "members";
  const TABLE_USER_ROLES = "user_roles";
  const TABLE_ROLES = "roles";
  const AVATAR_BUCKET = "avatar";

  const $ = (id) => document.getElementById(id);

  const state = {
    user: null,
    profile: null,
    membership: null,
    roleNames: [],
    editing: false,
    originalFormData: {},
    originalFieldStates: new Map(),
    originalFieldsetStates: new Map(),
    originalAvatarPath: null,
    saving: false,
    uploading: false
  };

  const EDITABLE_FIELD_IDS = [
    "inputFullName",
    "inputPhone",
    "inputUsername",
    "inputBio"
  ];

  const PROFILE_SELECT = [
    "id",
    "full_name",
    "username",
    "phone",
    "avatar_path",
    "bio",
    "created_at",
    "updated_at"
  ].join(",");

  /* =======================================================
     1. UTILITAS
  ======================================================= */

  function log(...args) {
    console.log("[TARBIYAH PROFILE v" + VERSION + "]", ...args);
  }

  function warn(...args) {
    console.warn("[TARBIYAH PROFILE v" + VERSION + "]", ...args);
  }

  function showToast(message, type = "info") {
    const toast =
      $("toast") ||
      $("notificationToast") ||
      $("profileToast") ||
      document.querySelector(".toast");

    if (toast) {
      toast.textContent = message;
      toast.classList.remove(
        "success",
        "error",
        "warning",
        "info",
        "show"
      );
      toast.classList.add(type, "show");
      toast.hidden = false;
      toast.style.display = "block";

      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
        toast.hidden = true;
        toast.style.display = "none";
      }, 3500);

      return;
    }

    if (type === "error") {
      console.error(message);
    } else {
      console.info(message);
    }
  }

  function setText(id, value) {
    const element = $(id);
    if (element) {
      element.textContent =
        value === null || value === undefined || value === ""
          ? "-"
          : String(value);
    }
  }

  function setValue(id, value) {
    const element = $(id);
    if (element && "value" in element) {
      element.value = value ?? "";
    }
  }

  function withTimeout(promise, milliseconds = 10000, label = "Proses") {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(label + " melewati batas waktu."));
      }, milliseconds);
    });

    return Promise.race([promise, timeoutPromise])
      .finally(() => clearTimeout(timeoutId));
  }

  function getSupabase() {
    const client = window.tarbiyahSupabase;

    if (!client || !client.auth || !client.from) {
      throw new Error(
        "Koneksi Supabase belum siap. Periksa urutan pemuatan script."
      );
    }

    return client;
  }

  function getEditableFields() {
    return EDITABLE_FIELD_IDS
      .map((id) => $(id))
      .filter((field) => {
        if (!field) return false;
        return ["INPUT", "TEXTAREA"].includes(field.tagName);
      });
  }

  function getFieldsets(fields) {
    const fieldsets = new Set();

    fields.forEach((field) => {
      let parent = field.parentElement;

      while (parent) {
        if (parent.tagName === "FIELDSET") {
          fieldsets.add(parent);
        }
        parent = parent.parentElement;
      }
    });

    return [...fieldsets];
  }

  function captureFormData() {
    const data = {};

    getEditableFields().forEach((field) => {
      data[field.id] = field.value;
    });

    return data;
  }

  function restoreFormData() {
    Object.entries(state.originalFormData).forEach(([id, value]) => {
      setValue(id, value);
    });
  }

  /* =======================================================
     2. MODE EDIT PROFIL
  ======================================================= */

  function setEditMode(enabled) {
    const shouldEdit = Boolean(enabled);
    const fields = getEditableFields();
    const fieldsets = getFieldsets(fields);
    const editButton = $("btnEditProfile");
    const editActions = $("profileEditActions");
    const saveButton = $("btnSaveProfile");

    log("setEditMode dipanggil:", shouldEdit);

    if (shouldEdit === state.editing) {
      // Tetap lakukan sinkronisasi UI jika kondisi DOM berubah.
      log("Mode edit sudah sesuai:", shouldEdit);
    }

    if (shouldEdit) {
      state.originalFormData = captureFormData();
      state.originalFieldStates.clear();
      state.originalFieldsetStates.clear();

      fieldsets.forEach((fieldset) => {
        state.originalFieldsetStates.set(
          fieldset,
          fieldset.disabled
        );

        // Membuka penguncian pada fieldset induk.
        fieldset.disabled = false;
      });

      fields.forEach((field) => {
        state.originalFieldStates.set(field, {
          disabled: field.disabled,
          readOnly: field.readOnly
        });

        field.disabled = false;
        field.readOnly = false;
        field.removeAttribute("readonly");
        field.removeAttribute("disabled");

        // Pastikan input dapat menerima interaksi.
        field.style.pointerEvents = "auto";
        field.style.userSelect = "text";
      });

      // Email tetap tidak dapat diedit.
      if ($("inputEmail")) {
        $("inputEmail").disabled = true;
        $("inputEmail").readOnly = true;
      }

      if (editButton) {
        editButton.hidden = true;
        editButton.style.display = "none";
      }

      if (editActions) {
        editActions.hidden = false;
        editActions.style.display = "flex";
      }

      if (saveButton) {
        saveButton.disabled = false;
      }

      state.editing = true;

      const firstField = fields.find(
        (field) => !field.disabled && !field.readOnly
      );

      if (firstField) {
        setTimeout(() => {
          try {
            firstField.focus();
          } catch (_) {}
        }, 50);
      }

      log("MODE EDIT AKTIF. Field yang dapat diedit:", fields.map(
        (field) => field.id
      ));

      return;
    }

    // Mode batal atau selesai menyimpan.
    fields.forEach((field) => {
      const original = state.originalFieldStates.get(field);

      field.disabled = original ? original.disabled : true;
      field.readOnly = original ? original.readOnly : false;

      if (original && original.readOnly) {
        field.setAttribute("readonly", "");
      } else {
        field.removeAttribute("readonly");
      }

      if (original && original.disabled) {
        field.setAttribute("disabled", "");
      } else {
        field.removeAttribute("disabled");
      }

      field.style.pointerEvents = "";
      field.style.userSelect = "";
    });

    fieldsets.forEach((fieldset) => {
      const originalDisabled =
        state.originalFieldsetStates.get(fieldset);

      fieldset.disabled =
        originalDisabled === undefined ? false : originalDisabled;
    });

    if ($("inputEmail")) {
      $("inputEmail").disabled = true;
      $("inputEmail").readOnly = true;
    }

    if (editButton) {
      editButton.hidden = false;
      editButton.style.display = "";
    }

    if (editActions) {
      editActions.hidden = true;
      editActions.style.display = "none";
    }

    if (saveButton) {
      saveButton.disabled = false;
    }

    state.editing = false;

    log("MODE EDIT NONAKTIF.");
  }

  function cancelEdit() {
    if (!state.editing) return;

    restoreFormData();
    setEditMode(false);
    showToast("Perubahan dibatalkan.", "info");
  }

  /* =======================================================
     3. LOADING
  ======================================================= */

  function hideLoadingScreen() {
    const candidates = [
      $("profileLoading"),
      $("loadingScreen"),
      $("loadingOverlay"),
      $("pageLoading"),
      $("appLoading"),
      document.querySelector(".profile-loading"),
      document.querySelector(".loading-overlay"),
      document.querySelector(".page-loading"),
      document.querySelector(".loading-screen")
    ].filter(Boolean);

    candidates.forEach((element) => {
      element.hidden = true;
      element.classList.add("hidden");
      element.classList.remove("active", "show");
      element.style.display = "none";
      element.setAttribute("aria-hidden", "true");
    });

    document.body.classList.remove(
      "loading",
      "is-loading",
      "page-loading"
    );

    log("Loading screen disembunyikan.");
  }

  /* =======================================================
     4. SESSION DAN DATA PROFIL
  ======================================================= */

  async function getCurrentSession() {
    const supabase = getSupabase();

    const result = await withTimeout(
      supabase.auth.getSession(),
      10000,
      "Pemeriksaan sesi"
    );

    if (result.error) throw result.error;

    const session = result.data?.session;

    if (!session || !session.user) {
      throw new Error("Sesi login tidak ditemukan.");
    }

    state.user = session.user;
    return session;
  }

  async function loadProfile() {
    const supabase = getSupabase();

    const { data, error } = await withTimeout(
      supabase
        .from(TABLE_PROFILES)
        .select(PROFILE_SELECT)
        .eq("id", state.user.id)
        .maybeSingle(),
      10000,
      "Memuat profil"
    );

    if (error) throw error;

    if (!data) {
      throw new Error("Data profil anggota tidak ditemukan.");
    }

    state.profile = data;
    state.originalAvatarPath = data.avatar_path || null;

    renderProfile(data);
    return data;
  }

  async function loadMembership() {
    const supabase = getSupabase();

    const { data, error } = await withTimeout(
      supabase
        .from(TABLE_MEMBERS)
        .select("*")
        .eq("user_id", state.user.id)
        .maybeSingle(),
      10000,
      "Memuat keanggotaan"
    );

    if (error) throw error;

    state.membership = data || null;
    renderMembership(state.membership);

    return state.membership;
  }

  async function loadUserRoles() {
    const supabase = getSupabase();

    const { data: assignments, error } = await withTimeout(
      supabase
        .from(TABLE_USER_ROLES)
        .select("role_id")
        .eq("user_id", state.user.id),
      10000,
      "Memuat peran pengguna"
    );

    if (error) throw error;

    const roleIds = (assignments || [])
      .map((item) => item.role_id)
      .filter(Boolean);

    if (!roleIds.length) {
      state.roleNames = [];
      renderRoles();
      return [];
    }

    const { data: roles, error: rolesError } = await withTimeout(
      supabase
        .from(TABLE_ROLES)
        .select("id,name")
        .in("id", roleIds),
      10000,
      "Memuat nama peran"
    );

    if (rolesError) throw rolesError;

    state.roleNames = (roles || []).map((role) => role.name);
    renderRoles();

    return state.roleNames;
  }

  /* =======================================================
     5. RENDER PROFIL
  ======================================================= */

  function renderProfile(profile) {
    if (!profile) return;

    setText("profileName", profile.full_name);
    setText("profileFullName", profile.full_name);
    setText("profileEmail", state.user?.email);
    setText("profileUsername", profile.username);
    setText("profilePhone", profile.phone);

    setValue("inputFullName", profile.full_name);
    setValue("inputEmail", state.user?.email);
    setValue("inputPhone", profile.phone);
    setValue("inputUsername", profile.username);
    setValue("inputBio", profile.bio);

    // Email tidak boleh diedit dari halaman profil.
    if ($("inputEmail")) {
      $("inputEmail").disabled = true;
      $("inputEmail").readOnly = true;
    }

    const avatarFallback =
      profile.full_name?.trim()?.charAt(0)?.toUpperCase() || "T";

    setText("profileInitial", avatarFallback);
    setText("avatarInitial", avatarFallback);

    renderAvatar(profile.avatar_path);

    const createdAt = profile.created_at
      ? new Date(profile.created_at).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      : "-";

    setText("profileCreatedAt", createdAt);

    log("Data profil berhasil ditampilkan.");
  }

  async function renderAvatar(path) {
    if (!path) return;

    try {
      const supabase = getSupabase();

      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, 3600);

      if (error) throw error;

      if (!data?.signedUrl) return;

      const selectors = [
        $("profileAvatar"),
        $("avatarPreview"),
        $("profilePhoto"),
        document.querySelector("[data-profile-avatar]")
      ].filter(Boolean);

      selectors.forEach((element) => {
        if (element.tagName === "IMG") {
          element.src = data.signedUrl;
          element.hidden = false;
        }
      });
    } catch (error) {
      warn("Foto profil tidak dapat dimuat:", error.message);
    }
  }

  /* =======================================================
     6. RENDER KEANGGOTAAN DAN PERAN
  ======================================================= */

  function renderMembership(member) {
    if (!member) {
      setText("memberNumber", "Belum diterbitkan");
      setText("membershipStatus", "Belum terdaftar");
      setText("memberStatus", "Belum terdaftar");
      setText("membershipDate", "-");
      return;
    }

    setText(
      "memberNumber",
      member.member_number || "Belum diterbitkan"
    );

    setText(
      "membershipStatus",
      member.membership_status || "Menunggu"
    );

    setText(
      "memberStatus",
      member.membership_status || "Menunggu"
    );

    const submitted = member.submitted_at
      ? new Date(member.submitted_at).toLocaleDateString("id-ID")
      : "-";

    setText("membershipDate", submitted);
    setText("memberSubmittedAt", submitted);
    setText("memberReviewNote", member.review_note || "-");
  }

  function renderRoles() {
    const roleText = state.roleNames.length
      ? state.roleNames.join(", ")
      : "Anggota";

    setText("profileRole", roleText);
    setText("userRole", roleText);
  }

  /* =======================================================
     7. SIMPAN PERUBAHAN PROFIL
  ======================================================= */

  async function saveProfile(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!state.editing || state.saving) return;

    const fullName = $("inputFullName")?.value.trim() || "";
    const phone = $("inputPhone")?.value.trim() || "";

    if (!fullName) {
      showToast("Nama lengkap wajib diisi.", "warning");
      $("inputFullName")?.focus();
      return;
    }

    const updateData = {
      full_name: fullName,
      phone: phone || null,
      updated_at: new Date().toISOString()
    };

    const usernameField = $("inputUsername");
    const bioField = $("inputBio");

    if (usernameField) {
      updateData.username =
        usernameField.value.trim() || null;
    }

    if (bioField) {
      updateData.bio =
        bioField.value.trim() || null;
    }

    const saveButton = $("btnSaveProfile");
    const originalButtonText = saveButton?.textContent;

    try {
      state.saving = true;

      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Menyimpan...";
      }

      const supabase = getSupabase();

      const { data, error } = await withTimeout(
        supabase
          .from(TABLE_PROFILES)
          .update(updateData)
          .eq("id", state.user.id)
          .select(PROFILE_SELECT)
          .single(),
        15000,
        "Menyimpan profil"
      );

      if (error) throw error;

      state.profile = data;
      renderProfile(data);

      setEditMode(false);

      showToast("Profil berhasil diperbarui.", "success");
      log("Profil berhasil disimpan.");

    } catch (error) {
      console.error("[TARBIYAH] Gagal menyimpan profil:", error);

      showToast(
        error.message || "Gagal menyimpan perubahan profil.",
        "error"
      );

    } finally {
      state.saving = false;

      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent =
          originalButtonText || "Simpan Perubahan";
      }
    }
  }

  /* =======================================================
     8. UPLOAD FOTO PROFIL
  ======================================================= */

  async function uploadAvatar(file) {
    if (!file || state.uploading) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      showToast(
        "Format foto harus JPG, PNG, atau WEBP.",
        "warning"
      );
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast("Ukuran foto maksimal 2 MB.", "warning");
      return;
    }

    try {
      state.uploading = true;

      const supabase = getSupabase();
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        state.user.id +
        "/" +
        Date.now() +
        "." +
        extension;

      const { error: uploadError } = await withTimeout(
        supabase.storage
          .from(AVATAR_BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          }),
        20000,
        "Mengunggah foto"
      );

      if (uploadError) throw uploadError;

      const oldPath = state.profile?.avatar_path || null;

      const { data, error: updateError } = await withTimeout(
        supabase
          .from(TABLE_PROFILES)
          .update({
            avatar_path: filePath,
            updated_at: new Date().toISOString()
          })
          .eq("id", state.user.id)
          .select(PROFILE_SELECT)
          .single(),
        15000,
        "Menyimpan foto profil"
      );

      if (updateError) {
        // Hapus file baru jika penyimpanan data profil gagal.
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([filePath]);

        throw updateError;
      }

      state.profile = data;
      state.originalAvatarPath = filePath;

      renderProfile(data);

      // Hapus foto lama setelah foto baru berhasil tersimpan.
      if (oldPath && oldPath !== filePath) {
        const { error: removeError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([oldPath]);

        if (removeError) {
          warn("Foto lama belum dapat dihapus:", removeError.message);
        }
      }

      showToast("Foto profil berhasil diperbarui.", "success");

    } catch (error) {
      console.error("[TARBIYAH] Upload avatar gagal:", error);
      showToast(
        error.message || "Gagal mengunggah foto profil.",
        "error"
      );

    } finally {
      state.uploading = false;

      const avatarInput =
        $("avatarInput") ||
        $("inputAvatar") ||
        $("profileAvatarInput");

      if (avatarInput) avatarInput.value = "";
    }
  }

  /* =======================================================
     9. NAVIGASI TAB
  ======================================================= */

  function setupTabs() {
    const tabButtons = document.querySelectorAll(
      ".profile-tabs [data-tab]"
    );

    const tabPanels = document.querySelectorAll(
      ".profile-tab-content"
    );

    if (!tabButtons.length || !tabPanels.length) {
      warn("Elemen navigasi tab tidak ditemukan.");
      return;
    }

    tabButtons.forEach((button) => {
      if (button.dataset.tarbiyahTabReady === "true") return;
      button.dataset.tarbiyahTabReady = "true";

      button.addEventListener("click", (event) => {
        event.preventDefault();

        const tabName = button.dataset.tab;
        if (!tabName) return;

        tabButtons.forEach((item) => {
          item.classList.toggle("active", item === button);
          item.setAttribute(
            "aria-selected",
            item === button ? "true" : "false"
          );
        });

        tabPanels.forEach((panel) => {
          const isActive = panel.id === "tab-" + tabName;

          panel.classList.toggle("active", isActive);
          panel.hidden = !isActive;
          panel.style.display = isActive ? "" : "none";
        });

        log("Tab aktif:", tabName);
      });
    });

    // Menampilkan tab awal yang sudah aktif di HTML.
    const activeButton =
      document.querySelector(".profile-tabs [data-tab].active") ||
      tabButtons[0];

    if (activeButton) {
      activeButton.click();
    }
  }

  /* =======================================================
     10. QR ANGGOTA
     Belum menerbitkan token secara lokal.
     Menunggu kontrak Edge Function member-qr-mint.
  ======================================================= */

  function setupQR() {
    const generateButton = $("btnGenerateQR");
    const downloadButton = $("btnDownloadQR");

    if (generateButton &&
        generateButton.dataset.tarbiyahQRReady !== "true") {
      generateButton.dataset.tarbiyahQRReady = "true";

      generateButton.addEventListener("click", (event) => {
        event.preventDefault();

        showToast(
          "Penerbitan QR belum diaktifkan. Layanan backend member-qr-mint perlu diverifikasi.",
          "warning"
        );

        warn(
          "QR tidak diterbitkan karena kontrak Edge Function belum diverifikasi."
        );
      });
    }

    if (downloadButton &&
        downloadButton.dataset.tarbiyahQRReady !== "true") {
      downloadButton.dataset.tarbiyahQRReady = "true";

      downloadButton.addEventListener("click", (event) => {
        event.preventDefault();

        showToast(
          "QR belum tersedia untuk diunduh.",
          "warning"
        );
      });
    }

    setText("qrMemberName", state.profile?.full_name || "-");
    setText(
      "qrMemberNumber",
      state.membership?.member_number || "Belum diterbitkan"
    );
  }

  /* =======================================================
     11. RIWAYAT KEHADIRAN
     Belum ada tabel attendance/kajian di database.
  ======================================================= */

  function renderAttendanceNotice() {
    const container =
      $("attendanceList") ||
      $("activityList") ||
      $("kajianHistory");

    if (!container) return;

    container.innerHTML = "";

    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent =
      "Riwayat kehadiran akan ditampilkan setelah tabel kehadiran dan kajian diaktifkan pada database.";

    container.appendChild(message);
  }

  /* =======================================================
     12. TEMA
  ======================================================= */

  function setupTheme() {
    const button =
      $("btnTheme") ||
      $("themeToggle") ||
      $("themeToggleButton");

    if (!button || button.dataset.tarbiyahThemeReady === "true") {
      return;
    }

    button.dataset.tarbiyahThemeReady = "true";

    button.addEventListener("click", (event) => {
      event.preventDefault();

      const root = document.documentElement;
      const currentTheme =
        root.getAttribute("data-theme") || "dark";

      const nextTheme =
        currentTheme === "dark" ? "light" : "dark";

      root.setAttribute("data-theme", nextTheme);

      try {
        localStorage.setItem("tarbiyah-theme", nextTheme);
      } catch (_) {}

      log("Tema diubah:", nextTheme);
    });

    try {
      const savedTheme = localStorage.getItem("tarbiyah-theme");

      if (savedTheme === "dark" || savedTheme === "light") {
        document.documentElement.setAttribute(
          "data-theme",
          savedTheme
        );
      }
    } catch (_) {}
  }

  /* =======================================================
     13. LOGOUT
  ======================================================= */

  async function logout() {
    const confirmed = window.confirm(
      "Apakah Anda yakin ingin keluar dari akun TARBIYAH?"
    );

    if (!confirmed) return;

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      window.location.href =
        window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
        "./login-register.html";

    } catch (error) {
      console.error("[TARBIYAH] Logout gagal:", error);
      showToast(
        error.message || "Gagal keluar dari akun.",
        "error"
      );
    }
  }

  /* =======================================================
     14. EVENT LISTENERS
  ======================================================= */

  function setupEvents() {
    const editButton = $("btnEditProfile");
    const cancelButton = $("btnCancelEdit");
    const form = $("personalProfileForm");

    if (editButton) {
      // Pastikan tombol edit tidak mengirim form.
      editButton.type = "button";

      if (editButton.dataset.tarbiyahEditReady !== "true") {
        editButton.dataset.tarbiyahEditReady = "true";

        editButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          log("TOMBOL EDIT PROFIL DIKLIK.");

          setEditMode(true);
        });
      }
    } else {
      warn("Tombol btnEditProfile tidak ditemukan.");
    }

    if (cancelButton) {
      cancelButton.type = "button";

      if (cancelButton.dataset.tarbiyahCancelReady !== "true") {
        cancelButton.dataset.tarbiyahCancelReady = "true";

        cancelButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          cancelEdit();
        });
      }
    }

    if (form && form.dataset.tarbiyahFormReady !== "true") {
      form.dataset.tarbiyahFormReady = "true";

      form.addEventListener("submit", saveProfile);
    }

    if ($("btnSaveProfile")) {
      $("btnSaveProfile").type = "submit";
    }

    const avatarInput =
      $("avatarInput") ||
      $("inputAvatar") ||
      $("profileAvatarInput");

    if (avatarInput &&
        avatarInput.dataset.tarbiyahAvatarReady !== "true") {
      avatarInput.dataset.tarbiyahAvatarReady = "true";

      avatarInput.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) uploadAvatar(file);
      });
    }

    const avatarButton =
      $("btnChangeAvatar") ||
      $("btnUploadAvatar");

    if (avatarButton &&
        avatarButton.dataset.tarbiyahAvatarButtonReady !== "true") {
      avatarButton.dataset.tarbiyahAvatarButtonReady = "true";

      avatarButton.addEventListener("click", (event) => {
        event.preventDefault();
        avatarInput?.click();
      });
    }

    const logoutButton =
      $("btnLogout") ||
      $("btnSignOut") ||
      $("btnLogoutProfile");

    if (logoutButton &&
        logoutButton.dataset.tarbiyahLogoutReady !== "true") {
      logoutButton.dataset.tarbiyahLogoutReady = "true";

      logoutButton.addEventListener("click", (event) => {
        event.preventDefault();
        logout();
      });
    }

    const notificationButton =
      $("btnNotifications") ||
      $("notificationButton");

    if (notificationButton &&
        notificationButton.dataset.tarbiyahNotificationReady !== "true") {
      notificationButton.dataset.tarbiyahNotificationReady = "true";

      notificationButton.addEventListener("click", (event) => {
        event.preventDefault();

        showToast(
          "Belum ada notifikasi baru.",
          "info"
        );
      });
    }

    log("Event listeners berhasil dipasang.");
  }

  /* =======================================================
     15. INISIALISASI
  ======================================================= */

  async function initialize() {
    log("Memulai inisialisasi halaman profil.");

    // Kunci kolom edit sejak awal.
    setEditMode(false);

    setupTabs();
    setupEvents();
    setupTheme();

    try {
      await getCurrentSession();

      const profileResult = await loadProfile();

      const secondaryResults = await Promise.allSettled([
        loadMembership(),
        loadUserRoles()
      ]);

      secondaryResults.forEach((result, index) => {
        if (result.status === "rejected") {
          warn(
            index === 0
              ? "Data keanggotaan gagal dimuat:"
              : "Data peran gagal dimuat:",
            result.reason?.message || result.reason
          );
        }
      });

      renderAttendanceNotice();
      setupQR();

      log("Halaman profil selesai diinisialisasi.");
      return profileResult;

    } catch (error) {
      console.error(
        "[TARBIYAH] Inisialisasi profil gagal:",
        error
      );

      showToast(
        error.message || "Gagal memuat data profil.",
        "error"
      );

    } finally {
      hideLoadingScreen();
    }
  }

  /* =======================================================
     16. JALANKAN SETELAH DOM SIAP
  ======================================================= */

  function start() {
    initialize();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {
      once: true
    });
  } else {
    start();
  }

  // Untuk pemeriksaan melalui Eruda Console.
  window.TARBIYAH_PROFILE = {
    version: VERSION,
    setEditMode,
    cancelEdit,
    loadProfile,
    loadMembership,
    initialize,
    getState: () => ({
      editing: state.editing,
      saving: state.saving,
      uploading: state.uploading,
      userId: state.user?.id || null,
      profileLoaded: Boolean(state.profile)
    })
  };

  log("Script berhasil dimuat.");
})();
