
/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   File: js/profil-anggota.js

   Versi penulisan ulang:
   - Memuat sesi dan profil anggota dari Supabase
   - Menampilkan identitas dan nomor anggota
   - Membaca membership_status
   - Mengedit data profil
   - Mengunggah foto profil
   - Membuat QR melalui Edge Function
   - Menampilkan ringkasan dan riwayat kehadiran

   Catatan:
   Nomor anggota dan status keanggotaan tidak dapat
   diubah melalui formulir profil.
   ========================================================= */

(function () {
  "use strict";

  /* =======================================================
     1. PENCEGAHAN INISIALISASI GANDA
     ======================================================= */

  if (window.__TARBIYAH_PROFILE_INITIALIZED__) {
    console.warn("[TARBIYAH PROFILE] Sudah diinisialisasi.");
    return;
  }

  window.__TARBIYAH_PROFILE_INITIALIZED__ = true;

  /* =======================================================
     2. KONFIGURASI
     ======================================================= */

  const CONFIG = Object.assign(
    {
      table: "members",
      userIdColumn: "user_id",

      avatarBucket: "avatar",
      avatarColumn: "avatar_path",

      qrFunction: "member-qr-mint",

      maxAvatarSize: 2 * 1024 * 1024,

      allowedAvatarTypes: [
        "image/jpeg",
        "image/png",
        "image/webp"
      ],

      signedUrlSeconds: 3600,

      /*
       * Hanya kolom profil yang boleh diperbarui.
       * member_number dan membership_status sengaja
       * tidak dimasukkan ke daftar ini.
       */
      editableFields: [
        "full_name",
        "phone",
        "address",
        "birth_date",
        "gender",
        "bio"
      ]
    },
    window.TARBIYAH_PROFILE_CONFIG || {}
  );

  /* =======================================================
     3. STATE
     ======================================================= */

  const state = {
    initialized: false,
    loading: false,
    saving: false,

    user: null,
    profile: null,

    avatarPath: null,
    avatarUrl: null,

    qrUrl: null,
    qrExpiresAt: null,
    qrTimer: null
  };

  /* =======================================================
     4. UTILITAS
     ======================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  function log(...args) {
    console.log("[TARBIYAH PROFILE]", ...args);
  }

  function warn(...args) {
    console.warn("[TARBIYAH PROFILE]", ...args);
  }

  function getSupabaseClient() {
    return (
      window.supabaseClient ||
      window.TARBIYAH_SUPABASE ||
      window.TARBIYAH?.supabase ||
      null
    );
  }

  function getAuthModule() {
    return window.TARBIYAH_AUTH || null;
  }

  function showMessage(message, type = "info") {
    const target =
      $("#profileMessage") ||
      $(".profile-message-container") ||
      $("[data-profile-message]");

    if (target) {
      target.textContent = message;
      target.className = `profile-message ${type}`;
      target.hidden = false;
      return;
    }

    if (typeof window.TARBIYAH_NOTIFY === "function") {
      window.TARBIYAH_NOTIFY(message, type);
      return;
    }

    log(message);
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText =
          button.textContent.trim();
      }

      button.disabled = true;

      if (text) {
        button.textContent = text;
      }
    } else {
      button.disabled = false;

      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function formatDate(value) {
    if (!value) return "Belum diisi";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getInitials(name) {
    const words = String(name || "Anggota")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return words
      .slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join("");
  }

  function getProfileValue(...keys) {
    for (const key of keys) {
      const value = state.profile?.[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return "";
  }

  /*
   * setText hanya untuk elemen tampilan.
   * Jangan gunakan fungsi ini untuk mengisi input,
   * textarea, atau select.
   */
  function setText(selectors, value, fallback = "Belum diisi") {
    const list = Array.isArray(selectors)
      ? selectors
      : [selectors];

    const text =
      value === undefined ||
      value === null ||
      value === ""
        ? fallback
        : String(value);

    list.forEach(selector => {
      $$(selector).forEach(element => {
        element.textContent = text;
      });
    });
  }

  function normalizeStatus(status) {
    const value = String(status || "")
      .trim()
      .toLowerCase();

    if (
      ["active", "aktif", "approved"].includes(value)
    ) {
      return "active";
    }

    if (
      ["pending", "menunggu", "verification"].includes(value)
    ) {
      return "pending";
    }

    if (
      ["suspended", "ditangguhkan", "nonaktif_sementara"].includes(value)
    ) {
      return "suspended";
    }

    if (
      ["rejected", "ditolak"].includes(value)
    ) {
      return "rejected";
    }

    return "inactive";
  }

  function getStatusLabel(status) {
    const labels = {
      active: "Anggota Aktif",
      pending: "Menunggu Verifikasi",
      suspended: "Anggota Ditangguhkan",
      rejected: "Pendaftaran Ditolak",
      inactive: "Tidak Aktif"
    };

    return labels[status] || labels.inactive;
  }

  /* =======================================================
     5. AUTENTIKASI
     ======================================================= */

  async function getCurrentUser() {
    const auth = getAuthModule();

    if (!auth || typeof auth.getSession !== "function") {
      throw new Error(
        "Modul autentikasi TARBIYAH belum tersedia."
      );
    }

    const result = await auth.getSession();

    if (result?.error) {
      throw result.error;
    }

    const session =
      result?.data?.session ||
      result?.session ||
      result?.data ||
      result;

    const user =
      session?.user ||
      result?.user ||
      null;

    if (!user) {
      throw new Error(
        "Sesi anggota tidak ditemukan. Silakan masuk kembali."
      );
    }

    return user;
  }

  /* =======================================================
     6. MEMUAT PROFIL DARI SUPABASE
     ======================================================= */

  async function fetchProfile() {
    const supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error(
        "Koneksi Supabase belum tersedia."
      );
    }

    if (!state.user) {
      throw new Error(
        "Data pengguna belum tersedia."
      );
    }

    const { data, error } = await supabase
      .from(CONFIG.table)
      .select("*")
      .eq(CONFIG.userIdColumn, state.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      state.profile = null;
      return null;
    }

    state.profile = data;

    return data;
  }

  async function loadProfile() {
    if (state.loading) return null;

    state.loading = true;

    document.documentElement.classList.add(
      "profile-loading-active"
    );

    try {
      state.user = await getCurrentUser();

      const profile = await fetchProfile();

      if (!profile) {
        renderFallbackProfile();

        showMessage(
          "Akun dikenali, tetapi data profil anggota belum ditemukan.",
          "warning"
        );

        return null;
      }

      await renderProfile(profile);

      log("Profil anggota berhasil dimuat.");

      return profile;

    } catch (error) {
      warn("Gagal memuat profil:", error);

      showMessage(
        error.message ||
          "Tidak dapat memuat profil anggota.",
        "error"
      );

      return null;

    } finally {
      state.loading = false;

      document.documentElement.classList.remove(
        "profile-loading-active"
      );
    }
  }

  /* =======================================================
     7. TAMPILAN PROFIL CADANGAN
     ======================================================= */

  function renderFallbackProfile() {
    const user = state.user;

    if (!user) return;

    const metadata = user.user_metadata || {};

    const name =
      metadata.full_name ||
      metadata.name ||
      user.email ||
      "Anggota TARBIYAH";

    setText("[data-profile-name]", name);
    setText("[data-profile-email]", user.email || "");

    setText(
      "[data-profile-member-id]",
      "ID Anggota: Belum tersedia"
    );

    setText(
      "[data-profile-qr-member-name]",
      name
    );

    setText(
      "[data-profile-qr-member-id]",
      "Nomor Anggota: Belum tersedia"
    );

    setText(
      "[data-profile-card-status]",
      "Data anggota belum tersedia"
    );

    renderAvatar(null, name);
  }

  /* =======================================================
     8. RENDER PROFIL UTAMA
     ======================================================= */

  async function renderProfile(profile) {
    if (!profile) return;

    const name =
      profile.full_name ||
      profile.name ||
      profile.nama_lengkap ||
      state.user?.email ||
      "Anggota TARBIYAH";

    const email =
      profile.email ||
      state.user?.email ||
      "";

    const memberNumber =
      profile.member_number ||
      profile.nomor_anggota ||
      profile.member_code ||
      "";

    /*
     * membership_status adalah kolom status
     * keanggotaan yang digunakan oleh sistem.
     */
    const status = normalizeStatus(
      profile.membership_status ||
      profile.status ||
      profile.member_status
    );

    /* Identitas utama */
    setText("[data-profile-name]", name);
    setText("[data-profile-email]", email);

    setText(
      "[data-profile-member-id]",
      memberNumber
        ? `ID Anggota: ${memberNumber}`
        : "ID Anggota: Belum tersedia"
    );

    /* Informasi profil */
    setText("[data-profile-full-name]", name);
    setText("[data-profile-info-email]", email);

    setText(
      "[data-profile-phone]",
      profile.phone ||
      profile.nomor_telepon ||
      profile.no_hp
    );

    setText(
      "[data-profile-gender]",
      profile.gender ||
      profile.jenis_kelamin
    );

    setText(
      "[data-profile-birth-date]",
      formatDate(
        profile.birth_date ||
        profile.tanggal_lahir
      )
    );

    setText(
      "[data-profile-address]",
      profile.address ||
      profile.alamat
    );

    setText(
      "[data-profile-joined-date]",
      formatDate(
        profile.created_at ||
        profile.joined_at ||
        profile.submitted_at
      )
    );

    setText(
      "[data-profile-group]",
      profile.group_name ||
      profile.halaqah ||
      profile.group
    );

    setText(
      "[data-profile-bio]",
      profile.bio ||
      profile.about ||
      profile.tentang
    );

    /* Kartu anggota digital */
    setText(
      "[data-profile-qr-member-name]",
      name
    );

    setText(
      "[data-profile-qr-member-id]",
      memberNumber
        ? `Nomor Anggota: ${memberNumber}`
        : "Nomor Anggota: Belum tersedia"
    );

    /* Status keanggotaan */
    renderStatus(status);
    renderMemberCardStatus(status);

    /* Foto profil */
    await renderAvatar(
      profile[CONFIG.avatarColumn],
      name
    );

    /* Isi formulir tanpa mengubah nomor/status anggota */
    populateForm(profile);

    /* Ringkasan dan riwayat kehadiran */
    await renderAttendanceSummary(profile);
    await loadAttendanceHistory();
  }

  /* =======================================================
     9. STATUS KEANGGOTAAN
     ======================================================= */

  function renderStatus(status) {
    const elements = [
      ...$$("[data-profile-status]"),
      ...$$("#profileStatus")
    ];

    elements.forEach(element => {
      element.textContent = getStatusLabel(status);

      element.classList.remove(
        "is-active",
        "is-pending",
        "is-suspended",
        "is-rejected",
        "is-inactive"
      );

      element.classList.add(`is-${status}`);
    });
  }

  function renderMemberCardStatus(status) {
    const element = $("[data-profile-card-status]");

    if (!element) return;

    element.textContent = getStatusLabel(status);

    element.classList.remove(
      "is-active",
      "is-pending",
      "is-suspended",
      "is-rejected",
      "is-inactive"
    );

    element.classList.add(`is-${status}`);
  }

  /* =======================================================
     10. FOTO PROFIL
     ======================================================= */

  async function getAvatarUrl(path) {
    if (!path) return null;

    const supabase = getSupabaseClient();

    if (!supabase) return null;

    const { data, error } = await supabase
      .storage
      .from(CONFIG.avatarBucket)
      .createSignedUrl(
        path,
        CONFIG.signedUrlSeconds
      );

    if (error) {
      warn("Gagal membuat URL foto:", error);
      return null;
    }

    return data?.signedUrl || null;
  }

  async function renderAvatar(path, name = "") {
    const initials = getInitials(name);

    const imageElements = [
      ...$$("[data-profile-avatar]"),
      ...$$(".profile-avatar img"),
      ...$$("#profileAvatar")
    ];

    const placeholderElements = [
      ...$$("[data-profile-avatar-placeholder]"),
      ...$$(".profile-avatar-placeholder"),
      ...$$("[data-profile-avatar-fallback]")
    ];

    let url = null;

    if (path) {
      url = await getAvatarUrl(path);
    }

    state.avatarPath = path || null;
    state.avatarUrl = url;

    imageElements.forEach(image => {
      if (url) {
        image.src = url;
        image.alt = `Foto profil ${name}`;
        image.hidden = false;
      } else {
        image.removeAttribute("src");
        image.hidden = true;
      }
    });

    placeholderElements.forEach(element => {
      element.textContent = initials;
      element.hidden = Boolean(url);
    });
  }

  function validateAvatar(file) {
    if (!file) {
      throw new Error("Pilih foto terlebih dahulu.");
    }

    if (!CONFIG.allowedAvatarTypes.includes(file.type)) {
      throw new Error(
        "Format foto harus JPG, PNG, atau WEBP."
      );
    }

    if (file.size > CONFIG.maxAvatarSize) {
      throw new Error(
        "Ukuran foto maksimal 2 MB."
      );
    }
  }

  function makeAvatarPath(file) {
    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension =
      extensionMap[file.type] || "jpg";

    return `${state.user.id}/${Date.now()}.${extension}`;
  }

  async function uploadAvatar(file) {
    const supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error("Supabase belum terhubung.");
    }

    validateAvatar(file);

    const path = makeAvatarPath(file);

    const { error } = await supabase
      .storage
      .from(CONFIG.avatarBucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    return path;
  }

  async function deleteAvatar(path) {
    if (!path) return;

    const supabase = getSupabaseClient();

    if (!supabase) return;

    const { error } = await supabase
      .storage
      .from(CONFIG.avatarBucket)
      .remove([path]);

    if (error) {
      warn("Foto lama belum dapat dihapus:", error);
    }
  }

  async function handleAvatarUpload(file) {
    if (!file || state.saving) return;

    let newPath = null;
    let databaseUpdated = false;

    try {
      if (!state.user) {
        throw new Error("Sesi anggota tidak tersedia.");
      }

      state.saving = true;

      showMessage(
        "Sedang mengunggah foto profil...",
        "info"
      );

      newPath = await uploadAvatar(file);

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from(CONFIG.table)
        .update({
          [CONFIG.avatarColumn]: newPath
        })
        .eq(CONFIG.userIdColumn, state.user.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Data profil tidak ditemukan. Foto belum disimpan."
        );
      }

      databaseUpdated = true;

      const oldPath = state.profile?.[CONFIG.avatarColumn];

      state.profile = data;

      await renderAvatar(
        newPath,
        data.full_name || state.user.email
      );

      if (oldPath && oldPath !== newPath) {
        await deleteAvatar(oldPath);
      }

      showMessage(
        "Foto profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      warn("Upload foto gagal:", error);

      if (newPath && !databaseUpdated) {
        await deleteAvatar(newPath);
      }

      showMessage(
        error.message ||
          "Gagal memperbarui foto profil.",
        "error"
      );

    } finally {
      state.saving = false;
    }
  }

  /* =======================================================
     11. FORMULIR EDIT PROFIL
     ======================================================= */

  function getProfileForm() {
    return $("form[data-profile-form]");
  }

  function populateForm(profile) {
    if (!profile) return;

    const form = getProfileForm();

    if (!form) return;

    const fields = [
      "full_name",
      "phone",
      "address",
      "birth_date",
      "gender",
      "bio"
    ];

    fields.forEach(field => {
      const element = form.elements.namedItem(field);

      if (!element) return;

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        element.value = profile[field] ?? "";
      }
    });
  }

  function openProfileModal() {
    /*
     * HTML menggunakan section dengan atribut hidden,
     * bukan modal dialog.
     */
    const section = $("[data-profile-form-section]");

    if (!section) {
      warn("Bagian formulir profil tidak ditemukan.");
      showMessage(
        "Formulir edit profil tidak ditemukan pada halaman.",
        "error"
      );
      return;
    }

    if (state.profile) {
      populateForm(state.profile);
    }

    section.hidden = false;
    section.setAttribute("aria-hidden", "false");

    const firstInput = $(
      'input[name="full_name"]',
      section
    );

    if (firstInput) {
      firstInput.focus();
    }

    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function closeProfileModal() {
    const section = $("[data-profile-form-section]");

    if (!section) return;

    section.hidden = true;
    section.setAttribute("aria-hidden", "true");

    if (state.profile) {
      populateForm(state.profile);
    }
  }

  function collectFormData(form) {
    const formData = new FormData(form);
    const payload = {};

    CONFIG.editableFields.forEach(field => {
      if (!formData.has(field)) return;

      const value = formData.get(field);

      payload[field] =
        typeof value === "string"
          ? value.trim()
          : value;
    });

    return payload;
  }

  function validateProfileData(payload) {
    if (
      payload.full_name !== undefined &&
      payload.full_name.length < 2
    ) {
      throw new Error(
        "Nama lengkap minimal 2 karakter."
      );
    }

    if (
      payload.phone &&
      !/^[0-9+\-\s()]{7,20}$/.test(payload.phone)
    ) {
      throw new Error(
        "Format nomor telepon belum benar."
      );
    }
  }

  async function saveProfile(form) {
    if (state.saving) return;

    const supabase = getSupabaseClient();

    if (!supabase || !state.user) {
      showMessage(
        "Sesi atau koneksi Supabase belum tersedia.",
        "error"
      );
      return;
    }

    const payload = collectFormData(form);

    const submitButton = $(
      'button[type="submit"]',
      form
    );

    try {
      validateProfileData(payload);

      if (Object.keys(payload).length === 0) {
        throw new Error(
          "Tidak ada data profil yang dapat disimpan."
        );
      }

      state.saving = true;

      setButtonLoading(
        submitButton,
        true,
        "Menyimpan..."
      );

      const { data, error } = await supabase
        .from(CONFIG.table)
        .update(payload)
        .eq(CONFIG.userIdColumn, state.user.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Profil tidak ditemukan atau tidak dapat diperbarui."
        );
      }

      state.profile = data;

      await renderProfile(data);

      closeProfileModal();

      showMessage(
        "Perubahan profil berhasil disimpan.",
        "success"
      );

      log("Profil berhasil diperbarui.");

    } catch (error) {
      warn("Gagal menyimpan profil:", error);

      showMessage(
        error.message ||
          "Terjadi kesalahan saat menyimpan profil.",
        "error"
      );

    } finally {
      state.saving = false;
      setButtonLoading(submitButton, false);
    }
  }

  /* =======================================================
     12. QR ANGGOTA
     ======================================================= */

  function getQrImage() {
    return $("#memberQrImage");
  }

  function getQrPlaceholder() {
    return $("[data-profile-qr-placeholder]");
  }

  function clearMemberQr() {
    if (state.qrTimer) {
      clearInterval(state.qrTimer);
      state.qrTimer = null;
    }

    state.qrUrl = null;
    state.qrExpiresAt = null;

    const image = getQrImage();

    if (image) {
      image.removeAttribute("src");
      image.hidden = true;
    }

    const placeholder = getQrPlaceholder();

    if (placeholder) {
      placeholder.hidden = false;
    }

    setText(
      ["#memberQrExpiry", "[data-qr-expiry]"],
      "QR belum dibuat."
    );
  }

  function startQrExpiryTimer(expiresAt) {
    if (state.qrTimer) {
      clearInterval(state.qrTimer);
    }

    const expiryElement = $(
      "#memberQrExpiry, [data-qr-expiry]"
    );

    function updateCountdown() {
      const remaining = expiresAt - Date.now();

      if (remaining <= 0) {
        clearMemberQr();

        if (expiryElement) {
          expiryElement.textContent =
            "QR telah kedaluwarsa. Silakan buat ulang.";
        }

        return;
      }

      const totalSeconds = Math.floor(
        remaining / 1000
      );

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (expiryElement) {
        expiryElement.textContent =
          `Berlaku ${minutes} menit ${seconds} detik`;
      }
    }

    updateCountdown();

    state.qrTimer = setInterval(
      updateCountdown,
      1000
    );
  }

  async function generateMemberQr() {
    const supabase = getSupabaseClient();

    if (!supabase || !state.user) {
      showMessage(
        "Sesi anggota belum tersedia.",
        "error"
      );
      return;
    }

    const button = $("[data-profile-qr-refresh]");

    try {
      setButtonLoading(
        button,
        true,
        "Membuat QR..."
      );

      clearMemberQr();

      const { data, error } = await supabase.functions.invoke(
        CONFIG.qrFunction,
        {
          body: {
            member_id: state.user.id
          }
        }
      );

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Server tidak mengembalikan data QR."
        );
      }

      const qrUrl =
        data.qr_url ||
        data.qrUrl ||
        data.signed_url ||
        data.signedUrl ||
        data.url;

      if (!qrUrl) {
        throw new Error(
          "URL QR tidak ditemukan dalam respons server."
        );
      }

      const image = getQrImage();

      if (!image) {
        throw new Error(
          "Elemen gambar QR tidak ditemukan."
        );
      }

      state.qrUrl = qrUrl;

      image.onload = function () {
        image.hidden = false;

        const placeholder = getQrPlaceholder();

        if (placeholder) {
          placeholder.hidden = true;
        }
      };

      image.onerror = function () {
        image.hidden = true;

        const placeholder = getQrPlaceholder();

        if (placeholder) {
          placeholder.hidden = false;
        }

        showMessage(
          "QR diterima, tetapi gambar QR tidak dapat ditampilkan.",
          "error"
        );
      };

      image.src = qrUrl;

      const expiryValue =
        data.expires_at ||
        data.expiresAt ||
        data.exp;

      let expiryTimestamp = expiryValue
        ? new Date(expiryValue).getTime()
        : NaN;

      if (!Number.isFinite(expiryTimestamp)) {
        expiryTimestamp =
          Date.now() + 5 * 60 * 1000;
      }

      state.qrExpiresAt = expiryTimestamp;

      startQrExpiryTimer(expiryTimestamp);

      showMessage(
        "Permintaan pembuatan QR berhasil dikirim.",
        "success"
      );

    } catch (error) {
      warn("Gagal membuat QR:", error);

      showMessage(
        error.message ||
          "Tidak dapat membuat QR anggota.",
        "error"
      );

    } finally {
      setButtonLoading(button, false);
    }
  }

  /* =======================================================
     13. RINGKASAN KEHADIRAN
     ======================================================= */

  async function renderAttendanceSummary(profile) {
    const attended = Number(
      profile.total_attendance ??
      profile.attendance_count ??
      0
    );

    const total = Number(
      profile.total_sessions ??
      profile.total_kajian ??
      0
    );

    const percent = total > 0
      ? Math.min(
          100,
          Math.round((attended / total) * 100)
        )
      : 0;

    setText(
      ["#profileAttendanceCount", "[data-attendance-count]"],
      attended,
      "0"
    );

    setText(
      ["#profileSessionCount", "[data-session-count]"],
      total,
      "0"
    );

    setText(
      ["#profileAttendancePercent", "[data-attendance-percent]"],
      `${percent}%`,
      "0%"
    );

    const progress = $(
      "#profileAttendanceProgress, [data-attendance-progress]"
    );

    if (progress) {
      progress.style.width = `${percent}%`;
    }
  }

  /* =======================================================
     14. RIWAYAT KEHADIRAN
     ======================================================= */

  async function loadAttendanceHistory() {
    const container =
      $("#profileAttendanceHistory") ||
      $("[data-profile-attendance-history]");

    if (!container) return;

    const attendanceApi =
      window.TARBIYAH_ATTENDANCE ||
      window.TARBIYAH_KEHADIRAN ||
      null;

    if (
      !attendanceApi ||
      typeof attendanceApi.getMemberHistory !== "function"
    ) {
      container.innerHTML = `
        <div class="profile-empty-state">
          <div class="profile-empty-icon">◷</div>
          <h3 class="profile-empty-title">
            Riwayat belum tersedia
          </h3>
          <p class="profile-empty-description">
            Riwayat kehadiran akan ditampilkan setelah
            modul presensi terhubung.
          </p>
        </div>
      `;

      return;
    }

    try {
      const result =
        await attendanceApi.getMemberHistory(state.user.id);

      if (result?.error) {
        throw result.error;
      }

      const rows =
        result?.data ||
        result ||
        [];

      renderAttendanceHistory(rows);

    } catch (error) {
      warn("Gagal memuat riwayat kehadiran:", error);

      container.innerHTML = `
        <div class="profile-empty-state">
          <h3 class="profile-empty-title">
            Riwayat belum dapat dimuat
          </h3>
          <p class="profile-empty-description">
            Silakan coba kembali beberapa saat lagi.
          </p>
        </div>
      `;
    }
  }

  function renderAttendanceHistory(rows) {
    const container =
      $("#profileAttendanceHistory") ||
      $("[data-profile-attendance-history]");

    if (!container) return;

    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = `
        <div class="profile-empty-state">
          <div class="profile-empty-icon">◷</div>
          <h3 class="profile-empty-title">
            Belum ada riwayat kehadiran
          </h3>
          <p class="profile-empty-description">
            Riwayat kajian dan presensi akan muncul
            di bagian ini.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML = rows.map(item => {
      const title =
        item.title ||
        item.agenda_title ||
        item.name ||
        "Kegiatan TARBIYAH";

      const date = formatDate(
        item.date ||
        item.attendance_date ||
        item.created_at
      );

      const status = String(
        item.status ||
        item.attendance_status ||
        ""
      ).toLowerCase();

      let statusLabel = "Hadir";
      let statusClass = "";

      if (
        ["absent", "tidak_hadir", "alpa"].includes(status)
      ) {
        statusLabel = "Tidak Hadir";
        statusClass = "is-absent";
      } else if (
        ["permission", "izin", "sick", "sakit"].includes(status)
      ) {
        statusLabel = "Izin";
        statusClass = "is-permission";
      }

      return `
        <article class="profile-history-item">
          <div class="profile-history-marker" aria-hidden="true">
            ◷
          </div>

          <div class="profile-history-content">
            <h4 class="profile-history-title">
              ${escapeHtml(title)}
            </h4>

            <div class="profile-history-meta">
              <span>${escapeHtml(date)}</span>
            </div>
          </div>

          <span class="profile-history-status ${statusClass}">
            ${escapeHtml(statusLabel)}
          </span>
        </article>
      `;
    }).join("");
  }

  /* =======================================================
     15. EVENT LISTENERS
     ======================================================= */

  function bindProfileEvents() {
    /* Tombol Edit Profil */
    $$("[data-profile-edit]").forEach(button => {
      button.addEventListener("click", openProfileModal);
    });

    /* Tombol Batal */
    $$("[data-profile-cancel]").forEach(button => {
      button.addEventListener("click", closeProfileModal);
    });

    /* Formulir Simpan */
    const form = getProfileForm();

    if (form) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        saveProfile(form);
      });
    }

    /* Input foto profil */
    const avatarInputs = [
      ...$$('input[type="file"][data-profile-avatar-input]'),
      ...$$("#profileAvatarInput"),
      ...$$("#avatarInput")
    ];

    avatarInputs.forEach(input => {
      input.addEventListener("change", async event => {
        const file = event.target.files?.[0];

        if (!file) return;

        await handleAvatarUpload(file);

        input.value = "";
      });
    });

    /* Tombol Buat / Perbarui QR */
    $$("[data-profile-qr-refresh]").forEach(button => {
      button.addEventListener("click", generateMemberQr);
    });

    /* Tombol refresh profil */
    const refreshButtons = [
      ...$$("[data-refresh-profile]"),
      ...$$("#refreshProfile")
    ];

    refreshButtons.forEach(button => {
      button.addEventListener("click", loadProfile);
    });
  }

  /* =======================================================
     16. INISIALISASI
     ======================================================= */

  async function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    bindProfileEvents();

    const supabase = getSupabaseClient();

    if (!supabase) {
      warn("Supabase client belum ditemukan.");

      showMessage(
        "Koneksi Supabase belum tersedia. Periksa konfigurasi aplikasi.",
        "error"
      );

      return;
    }

    await loadProfile();
  }

  function start() {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
      );
    } else {
      initialize();
    }
  }

  /* =======================================================
     17. API PUBLIK
     ======================================================= */

  window.TARBIYAH_PROFILE = {
    initialize,

    load: loadProfile,
    refresh: loadProfile,

    getState() {
      return {
        loading: state.loading,
        saving: state.saving,
        user: state.user,
        profile: state.profile,
        avatarUrl: state.avatarUrl,
        qrExpiresAt: state.qrExpiresAt
      };
    },

    openEdit: openProfileModal,
    closeEdit: closeProfileModal,

    save: saveProfile,

    uploadAvatar: handleAvatarUpload,

    generateQr: generateMemberQr,
    clearQr: clearMemberQr,

    renderAttendanceHistory,
    loadAttendanceHistory
  };

  /* Mulai aplikasi profil */
  start();

})();
