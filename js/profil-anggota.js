
/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   File: js/profil-anggota.js

   Fitur:
   1. Memuat sesi dan data profil anggota
   2. Menampilkan identitas anggota
   3. Memperbarui informasi profil
   4. Mengunggah foto profil ke Supabase Storage
   5. Menghapus foto profil lama setelah update berhasil
   6. Membuat QR anggota melalui Edge Function
   7. Menampilkan riwayat dan ringkasan kehadiran
   8. Menangani modal dan notifikasi halaman profil

   Catatan:
   Sesuaikan PROFILE_CONFIG dengan skema tabel Supabase
   TARBIYAH yang digunakan pada proyek.
   ========================================================= */

(function () {
  "use strict";

  if (window.__TARBIYAH_PROFILE_INITIALIZED__) return;
  window.__TARBIYAH_PROFILE_INITIALIZED__ = true;

  /* =======================================================
     1. KONFIGURASI
     ======================================================= */

  const PROFILE_CONFIG = {
    table: "members",
    userIdColumn: "user_id",

    // Bucket Supabase Storage untuk foto anggota.
    avatarBucket: "avatar",

    // Edge Function untuk membuat QR anggota.
    qrFunction: "member-qr-mint",

    // Batas ukuran foto: 2 MB.
    maxAvatarSize: 2 * 1024 * 1024,

    allowedAvatarTypes: [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],

    // Masa berlaku signed URL foto privat.
    signedUrlSeconds: 3600,

    // Kolom yang diizinkan untuk diperbarui.
    editableFields: [
      "full_name",
      "phone",
      "address",
      "birth_date",
      "gender",
      "bio"
    ],

    // Nama kolom foto profil.
    avatarColumn: "avatar_path"
  };

  /*
   * Konfigurasi dapat ditimpa sebelum file ini dimuat:
   *
   * window.TARBIYAH_PROFILE_CONFIG = {
   *   table: "nama_tabel_profil",
   *   userIdColumn: "user_id"
   * };
   */

  const CONFIG = Object.assign(
    {},
    PROFILE_CONFIG,
    window.TARBIYAH_PROFILE_CONFIG || {}
  );

  const state = {
    initialized: false,
    loading: false,
    saving: false,
    user: null,
    profile: null,
    avatarUrl: null,
    avatarPath: null,
    qrUrl: null,
    qrExpiresAt: null,
    qrTimer: null,
    originalAvatarPath: null
  };

  /* =======================================================
     2. UTILITAS
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

  function setLoading(element, loading, loadingText = "Memproses...") {
    if (!element) return;

    if (loading) {
      if (!element.dataset.originalText) {
        element.dataset.originalText =
          element.textContent.trim();
      }

      element.disabled = true;
      element.textContent = loadingText;
    } else {
      element.disabled = false;

      if (element.dataset.originalText) {
        element.textContent = element.dataset.originalText;
        delete element.dataset.originalText;
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
    const parts = String(name || "Anggota")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return parts
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }

  function normalizeStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();

  if (["active", "aktif", "approved"].includes(value)) {
    return "active";
  }

  if (["pending", "menunggu", "verification"].includes(value)) {
    return "pending";
  }

  if (["suspended", "ditangguhkan", "nonaktif sementara"].includes(value)) {
    return "suspended";
  }

  if (["rejected", "ditolak"].includes(value)) {
    return "rejected";
  }

  return "inactive";
}

  function getSupabaseClient() {
    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    if (window.TARBIYAH_SUPABASE) {
      return window.TARBIYAH_SUPABASE;
    }

    if (
      window.TARBIYAH &&
      window.TARBIYAH.supabase
    ) {
      return window.TARBIYAH.supabase;
    }

    return null;
  }

  function getAuthModule() {
    return window.TARBIYAH_AUTH || null;
  }

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

  function setText(selectors, value) {
    const list = Array.isArray(selectors)
      ? selectors
      : [selectors];

    list.forEach(selector => {
      $$(selector).forEach(element => {
        element.textContent =
          value === undefined ||
          value === null ||
          value === ""
            ? "Belum diisi"
            : String(value);
      });
    });
  }

  /* =======================================================
     3. MEMUAT DATA PROFIL
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
      warn(
        "Profil anggota belum ditemukan pada tabel:",
        CONFIG.table
      );

      state.profile = null;
      return null;
    }

    state.profile = data;
    state.originalAvatarPath =
      data[CONFIG.avatarColumn] || null;

    return data;
  }

  async function loadProfile() {
    if (state.loading) return;

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
          "Akun berhasil dikenali, tetapi data profil anggota belum tersedia.",
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
          "Tidak dapat memuat data profil anggota.",
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

  function renderFallbackProfile() {
    const user = state.user;

    if (!user) return;

    const metadata = user.user_metadata || {};

    const name =
      metadata.full_name ||
      metadata.name ||
      user.email ||
      "Anggota TARBIYAH";

    setText(
      ["#profileName", "[data-profile-name]", ".profile-name"],
      name
    );

    setText(
      ["#profileEmail", "[data-profile-email]", ".profile-email"],
      user.email || ""
    );

    renderAvatar(null, name);
  }

  /* =======================================================
     4. MENAMPILKAN DATA PROFIL
     ======================================================= */

  async function renderProfile(profile) {
    if (!profile) return;

    const name = getProfileValue(
      "full_name",
      "name",
      "nama_lengkap"
    ) || state.user?.email || "Anggota TARBIYAH";

    const email =
      profile.email ||
      state.user?.email ||
      "";

    const memberNumber = getProfileValue(
  "member_number",
  "nomor_anggota",
  "member_code"
);

const status = normalizeStatus(
  getProfileValue(
    "membership_status",
    "status",
    "member_status"
  )
);

    setText(
      ["#profileName", "[data-profile-name]", ".profile-name"],
      name
    );

    setText(
      ["#profileEmail", "[data-profile-email]", ".profile-email"],
      email
    );

    setText(
  [
    "[data-profile-member-id]",
    "#profileMemberNumber",
    "[data-member-number]",
    ".profile-member-number"
  ],
  memberNumber || "Belum tersedia"
);

    setText(
      ["#profilePhone", "[data-profile-phone]"],
      getProfileValue("phone", "nomor_telepon", "no_hp")
    );

    setText(
      ["#profileAddress", "[data-profile-address]"],
      getProfileValue("address", "alamat")
    );

    setText(
      ["#profileBirthDate", "[data-profile-birth-date]"],
      formatDate(
        getProfileValue("birth_date", "tanggal_lahir")
      )
    );

    setText(
      ["#profileGender", "[data-profile-gender]"],
      getProfileValue("gender", "jenis_kelamin")
    );

    setText(
      ["#profileBio", "[data-profile-bio]"],
      getProfileValue("bio", "about", "tentang")
    );

    setText(
      ["#profileJoinDate", "[data-profile-join-date]"],
      formatDate(
        getProfileValue("created_at", "joined_at")
      )
    );

    renderStatus(status);
    renderAvatar(
      getProfileValue(CONFIG.avatarColumn),
      name
    );

    populateForm(profile);

    await renderAttendanceSummary(profile);
    await loadAttendanceHistory();
  }

// Isi identitas pada kartu digital.
setText(
  "[data-profile-qr-member-name]",
  name
);

setText(
  "[data-profile-qr-member-id]",
  `Nomor Anggota: ${memberNumber || "Belum tersedia"}`
);

// Tampilkan status keanggotaan pada kartu.
renderMemberCardStatus(status);
   
  function renderStatus(status) {
  const labels = {
    active: "Anggota Aktif",
    pending: "Menunggu Verifikasi",
    suspended: "Keanggotaan Ditangguhkan",
    rejected: "Pengajuan Ditolak",
    inactive: "Tidak Aktif"
  };

  const elements = [
    ...$$("[data-profile-status]"),
    ...$$("#profileStatus"),
    ...$$(".profile-status")
  ];

  elements.forEach(element => {
    element.textContent = labels[status] || labels.inactive;

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

  const labels = {
    active: "KARTU ANGGOTA AKTIF",
    pending: "MENUNGGU VERIFIKASI",
    suspended: "KEANGGOTAAN DITANGGUHKAN",
    rejected: "PENGAJUAN DITOLAK",
    inactive: "STATUS TIDAK AKTIF"
  };

  element.textContent = labels[status] || labels.inactive;

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
     5. FOTO PROFIL
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
      warn("Gagal membuat signed URL foto:", error);
      return null;
    }

    return data?.signedUrl || null;
  }

  async function renderAvatar(path, name = "") {
    const fallback = getInitials(name);

    const imageElements = [
      ...$$("[data-profile-avatar]"),
      ...$$(".profile-avatar img"),
      ...$$("#profileAvatar")
    ];

    const placeholderElements = [
      ...$$("[data-profile-avatar-placeholder]"),
      ...$$(".profile-avatar-placeholder")
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
      element.textContent = fallback;
      element.hidden = Boolean(url);
    });

    $$("[data-profile-avatar-fallback]").forEach(element => {
      element.textContent = fallback;
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

    return true;
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

    const newPath = makeAvatarPath(file);

    const { error: uploadError } = await supabase
      .storage
      .from(CONFIG.avatarBucket)
      .upload(newPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) {
      throw uploadError;
    }

    return newPath;
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
      warn(
        "Foto lama belum dapat dihapus:",
        error
      );
    }
  }

  async function handleAvatarUpload(file) {
    if (!file || state.saving) return;

    let newPath = null;
    let databaseUpdated = false;

    try {
      state.saving = true;

      showMessage(
        "Mengunggah foto profil...",
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

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Data profil tidak ditemukan. Foto belum disimpan."
        );
      }

      databaseUpdated = true;

      const oldPath = state.originalAvatarPath;

      state.profile = data;
      state.originalAvatarPath = newPath;

      await renderAvatar(
        newPath,
        getProfileValue("full_name", "name")
      );

      /*
       * Hapus foto lama hanya setelah database
       * berhasil menunjuk ke foto yang baru.
       */
      if (oldPath && oldPath !== newPath) {
        await deleteAvatar(oldPath);
      }

      showMessage(
        "Foto profil berhasil diperbarui.",
        "success"
      );

    } catch (error) {
      warn("Upload foto gagal:", error);

      /*
       * Jangan hapus file baru jika database sudah
       * berhasil diperbarui. Database mungkin sudah
       * menunjuk ke file tersebut.
       */
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
     6. FORMULIR PROFIL
     ======================================================= */

  function populateForm(profile) {
    if (!profile) return;

    const fieldMap = {
      full_name: [
        "#editFullName",
        '[name="full_name"]'
      ],
      phone: [
        "#editPhone",
        '[name="phone"]'
      ],
      address: [
        "#editAddress",
        '[name="address"]'
      ],
      birth_date: [
        "#editBirthDate",
        '[name="birth_date"]'
      ],
      gender: [
        "#editGender",
        '[name="gender"]'
      ],
      bio: [
        "#editBio",
        '[name="bio"]'
      ]
    };

    Object.entries(fieldMap).forEach(([key, selectors]) => {
      const value = profile[key] ?? "";

      selectors.forEach(selector => {
        const element = $(selector);

        if (element && !element.matches(":disabled")) {
          element.value = value;
        }
      });
    });
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

    return true;
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

    try {
      validateProfileData(payload);

      state.saving = true;

      const submitButton = $(
        'button[type="submit"]',
        form
      );

      setLoading(
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

      if (error) {
        throw error;
      }

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

      const submitButton = $(
        'button[type="submit"]',
        form
      );

      setLoading(submitButton, false);
    }
  }

  /* =======================================================
     7. MODAL PROFIL
     ======================================================= */

  function openProfileModal() {
    const modal =
      $("#editProfileModal") ||
      $("#profileEditModal") ||
      $(".profile-modal");

    if (!modal) {
      warn("Modal edit profil tidak ditemukan.");
      return;
    }

    if (state.profile) {
      populateForm(state.profile);
    }

    modal.classList.add("is-open", "active");
    modal.setAttribute("aria-hidden", "false");

    document.body.dataset.profileModalOpen = "true";
  }

  function closeProfileModal() {
    const modal =
      $("#editProfileModal") ||
      $("#profileEditModal") ||
      $(".profile-modal");

    if (!modal) return;

    modal.classList.remove("is-open", "active", "show");
    modal.setAttribute("aria-hidden", "true");

    delete document.body.dataset.profileModalOpen;
  }

  /* =======================================================
     8. QR ANGGOTA
     ======================================================= */

  function clearMemberQr() {
    if (state.qrTimer) {
      clearInterval(state.qrTimer);
      state.qrTimer = null;
    }

    state.qrUrl = null;
    state.qrExpiresAt = null;

     const qrImage =
  $("#memberQrImage") ||
  $("#profileQrImage") ||
  $("[data-member-qr]");

if (qrImage) {
  qrImage.removeAttribute("src");
  qrImage.hidden = true;
}

const placeholder = $("[data-profile-qr-placeholder]");

if (placeholder) {
  placeholder.hidden = false;
}

     const expiry = $(
      "#memberQrExpiry, [data-qr-expiry]"
    );

    if (expiry) {
      expiry.textContent = "QR belum dibuat.";
    }
  }

  function startQrExpiryTimer(expiresAt) {
    if (state.qrTimer) {
      clearInterval(state.qrTimer);
      state.qrTimer = null;
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

      const minutes = Math.floor(
        totalSeconds / 60
      );

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

    const button =
  $("[data-profile-qr-refresh]") ||
  $("#generateMemberQr") ||
  $("#btnGenerateQr") ||
  $("[data-generate-qr]");

    try {
      setLoading(button, true, "Membuat QR...");

      clearMemberQr();

      const { data, error } = await supabase.functions.invoke(
        CONFIG.qrFunction,
        {
          body: {
            member_id: state.user.id
          }
        }
      );

      if (error) {
        throw error;
      }

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

      const qrImage =
        $("#memberQrImage") ||
        $("#profileQrImage") ||
        $("[data-member-qr]");

      if (!qrImage) {
        throw new Error(
          "Elemen gambar QR tidak ditemukan."
        );
      }

      state.qrUrl = qrUrl;

      qrImage.src = qrUrl;
      qrImage.alt = "QR Anggota TARBIYAH";
      qrImage.hidden = false;

      const placeholder = $("[data-profile-qr-placeholder]");
      if (placeholder) {
      placeholder.hidden = true;
    }
       
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
        "QR anggota berhasil dibuat.",
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
      setLoading(button, false);
    }
  }

  /* =======================================================
     9. RINGKASAN KEHADIRAN
     ======================================================= */

  async function renderAttendanceSummary(profile) {
    /*
     * Ringkasan menggunakan data yang tersedia pada
     * record profil. Integrasi dengan tabel presensi
     * terpisah dilakukan melalui modul kehadiran.
     */

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

    const percent =
      total > 0
        ? Math.min(100, Math.round((attended / total) * 100))
        : 0;

    setText(
      ["#profileAttendanceCount", "[data-attendance-count]"],
      attended
    );

    setText(
      ["#profileSessionCount", "[data-session-count]"],
      total
    );

    setText(
      ["#profileAttendancePercent", "[data-attendance-percent]"],
      `${percent}%`
    );

    const progress = $(
      "#profileAttendanceProgress, [data-attendance-progress]"
    );

    if (progress) {
      progress.style.width = `${percent}%`;
    }
  }

  /* =======================================================
     10. RIWAYAT KEHADIRAN
     ======================================================= */

  async function loadAttendanceHistory() {
    /*
     * Riwayat presensi berasal dari modul kehadiran.
     * Jika modul tersebut menyediakan API, gunakan API
     * yang sama agar tidak mengasumsikan nama tabel.
     */

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
        item.status || item.attendance_status || ""
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
     11. EVENT LISTENERS
     ======================================================= */

  function bindProfileEvents() {
    const editButtons = [
      ...$$("[data-edit-profile]"),
      ...$$("#btnEditProfile"),
      ...$$("#editProfileButton")
    ];

    editButtons.forEach(button => {
      button.addEventListener("click", openProfileModal);
    });

    const closeButtons = [
      ...$$("[data-close-profile-modal]"),
      ...$$("#closeProfileModal"),
      ...$$("#cancelEditProfile")
    ];

    closeButtons.forEach(button => {
      button.addEventListener("click", closeProfileModal);
    });

    const modal =
      $("#editProfileModal") ||
      $("#profileEditModal") ||
      $(".profile-modal");

    if (modal) {
      modal.addEventListener("click", event => {
        if (event.target === modal) {
          closeProfileModal();
        }
      });
    }

    const form =
      $("#profileEditForm") ||
      $("#editProfileForm") ||
      $("form[data-profile-form]");

    if (form) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        saveProfile(form);
      });
    }

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

        // Memungkinkan file yang sama dipilih kembali.
        input.value = "";
      });
    });

    const qrButtons = [
  ...$$("[data-generate-qr]"),
  ...$$("[data-profile-qr-refresh]"),
  ...$$("#generateMemberQr"),
  ...$$("#btnGenerateQr")
];

qrButtons.forEach(button => {
  button.addEventListener("click", generateMemberQr);
});

    const refreshButtons = [
      ...$$("[data-refresh-profile]"),
      ...$$("#refreshProfile")
    ];

    refreshButtons.forEach(button => {
      button.addEventListener("click", loadProfile);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeProfileModal();
      }
    });
  }

  /* =======================================================
     12. INISIALISASI
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
     13. API PUBLIK
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

  start();

})();
