
/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   JavaScript v3.3
   Berbasis v3.1 — Perbaikan dan penyempurnaan

   FITUR:
   1. Supabase Authentication
   2. Memuat data profil anggota
   3. Edit dan simpan data profil
   4. Gender, birth_date, city, address
   5. Status keanggotaan
   6. Foto profil melalui Supabase Storage
   7. Navigasi tab
   8. Pengaturan tema
   9. QR anggota melalui Edge Function
   10. Logout dan tombol kembali

   DATABASE:
   profiles:
   id, full_name, username, phone, gender,
   birth_date, city, address, avatar_path,
   bio, created_at, updated_at

   members:
   id, user_id, member_number, membership_status,
   submitted_at, reviewed_at, reviewed_by,
   review_note, created_at, updated_at
========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_PROFILE_V33__) return;
  window.__TARBIYAH_PROFILE_V33__ = true;

  /* =====================================================
     01. KONFIGURASI
  ===================================================== */

  const CONFIG = {
    VERSION: "3.3",

    AVATAR_BUCKET: "avatar",
    AVATAR_MAX_SIZE: 2 * 1024 * 1024,
    AVATAR_EXPIRY: 3600,

    QR_FUNCTION: "member-qr-mint",

    DEFAULT_LOGO:
      window.TARBIYAH_CONFIG?.DEFAULT_LOGO ||
      "./assets/icons/tarbiyah-mark.svg",

    LOGIN_PAGE:
      window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
      "./login-register.html",

    DASHBOARD_PAGE:
      window.TARBIYAH_CONFIG?.DASHBOARD_PAGE ||
      "./dashboard.html",

    PROFILE_COLUMNS: [
      "id",
      "full_name",
      "username",
      "phone",
      "gender",
      "birth_date",
      "city",
      "address",
      "avatar_path",
      "bio",
      "created_at",
      "updated_at"
    ]
  };

  /* =====================================================
     02. VARIABEL SISTEM
  ===================================================== */

  let supabase = null;
  let currentUser = null;
  let profileData = null;
  let membershipData = null;

  let originalFormData = null;

  let isEditing = false;
  let isSaving = false;
  let isInitialized = false;

  let toastTimer = null;
  let avatarSignedUrl = null;

  /* =====================================================
     03. DOM HELPER
  ===================================================== */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const getById = id =>
    document.getElementById(id);

  function setText(id, value) {
    const element = getById(id);

    if (element) {
      element.textContent =
        value === null || value === undefined || value === ""
          ? "-"
          : String(value);
    }
  }

  function showElement(element) {
    if (element) element.hidden = false;
  }

  function hideElement(element) {
    if (element) element.hidden = true;
  }

  function getErrorMessage(error) {
    return error?.message ||
      String(error || "Terjadi kesalahan.");
  }

  /* =====================================================
     04. ELEMEN HALAMAN
  ===================================================== */

  const DOM = {
    loading: getById("pageLoading"),

    toast: getById("profileToast"),
    toastMessage: getById("toastMessage"),

    form: getById("personalProfileForm"),

    editButton: getById("btnEditProfile"),
    editActions: getById("profileEditActions"),
    cancelButton: getById("btnCancelEdit"),
    saveButton: getById("btnSaveProfile"),

    backButton: getById("btnBack"),
    themeButton: getById("btnTheme"),
    notificationButton: getById("btnNotifications"),
    logoutButton: getById("btnLogout"),

    avatar: getById("profileAvatar"),
    avatarButton: getById("btnChangeAvatar"),
    avatarInput: getById("avatarInput")
  };

  const FIELDS = {
    full_name: getById("inputFullName"),
    email: getById("inputEmail"),
    phone: getById("inputPhone"),
    gender: getById("inputGender"),
    birth_date: getById("inputBirthDate"),
    city: getById("inputCity"),
    address: getById("inputAddress")
  };

  /* =====================================================
     05. NOTIFIKASI
  ===================================================== */

  function notify(message, type = "info") {
    if (DOM.toast && DOM.toastMessage) {
      DOM.toastMessage.textContent = message;

      DOM.toast.dataset.type = type;
      DOM.toast.hidden = false;
      DOM.toast.classList.add("show");

      if (toastTimer) {
        clearTimeout(toastTimer);
      }

      toastTimer = setTimeout(() => {
        DOM.toast.classList.remove("show");
        DOM.toast.hidden = true;
      }, 4000);

      return;
    }

    console.log("[TARBIYAH]", message);
  }

  /* =====================================================
     06. FORMAT TANGGAL
  ===================================================== */

  function formatDate(value) {
    if (!value) return "-";

    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? new Date(value + "T00:00:00")
      : new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  /* =====================================================
     07. SUPABASE CLIENT
  ===================================================== */

  function getSupabaseClient() {
    const client = window.tarbiyahSupabase;

    if (!client) {
      throw new Error(
        "Supabase belum terhubung. Periksa js/config.js dan js/supabase-client.js."
      );
    }

    if (!client.auth || !client.from || !client.storage) {
      throw new Error(
        "Supabase Client belum siap digunakan."
      );
    }

    return client;
  }

  /* =====================================================
     08. AUTHENTICATION
  ===================================================== */

  async function getCurrentUser() {
    const { data, error } =
      await supabase.auth.getSession();

    if (error) throw error;

    const user = data?.session?.user;

    if (!user?.id) {
      throw new Error(
        "Sesi login tidak ditemukan. Silakan masuk kembali."
      );
    }

    return user;
  }

  /* =====================================================
     09. LOGO
  ===================================================== */

  function applyLogo() {
    const logoImages = $$(
      ".header-brand img, .digital-card-header img, .profile-footer img"
    );

    logoImages.forEach(img => {
      img.onerror = () => {
        img.onerror = null;
        img.src = "./assets/icons/tarbiyah-mark.svg";
      };

      img.src = CONFIG.DEFAULT_LOGO;
    });

    let favicon = $('link[rel="icon"]');

    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }

    favicon.href = CONFIG.DEFAULT_LOGO;
  }

  /* =====================================================
     10. TEMA
  ===================================================== */

  function applyTheme() {
    const savedTheme =
      localStorage.getItem("tarbiyah-theme");

    const theme =
      savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : document.documentElement.dataset.theme || "dark";

    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;

    if (DOM.themeButton) {
      DOM.themeButton.setAttribute(
        "aria-label",
        theme === "dark"
          ? "Aktifkan tema terang"
          : "Aktifkan tema gelap"
      );
    }
  }

  function toggleTheme() {
    const current =
      document.documentElement.dataset.theme || "dark";

    const next =
      current === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = next;
    document.body.dataset.theme = next;

    localStorage.setItem("tarbiyah-theme", next);

    applyTheme();
  }

  console.info(
    "[TARBIYAH PROFILE] BLOK 1 v3.3 berhasil dimuat."
  );


/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   JAVASCRIPT v3.3
   BLOK 2: DATABASE, RENDER, EDIT, AVATAR, NAVIGASI
========================================================= */

/* ---------- 1. UTILITAS DASAR ---------- */

function v33Get(selector, parent = document) {
  return parent.querySelector(selector);
}

function v33GetAll(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

function v33Toast(message, type = "info") {
  const toast = document.getElementById("profileToast");
  const toastMessage = document.getElementById("toastMessage");

  if (toastMessage) toastMessage.textContent = message;

  if (toast) {
    toast.classList.remove(
      "success",
      "error",
      "warning",
      "info",
      "show"
    );

    toast.classList.add(type);
    toast.classList.add("show");

    if (typeof toastTimer !== "undefined" && toastTimer) {
      clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  } else {
    console.log("[TARBIYAH]", message);
  }
}

function v33SetLoading(show) {
  const loading = document.getElementById("pageLoading");

  if (loading) {
    loading.style.display = show ? "flex" : "none";
    loading.setAttribute("aria-hidden", show ? "false" : "true");
  }
}

function v33FormatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function v33SetValue(selector, value) {
  const element = document.getElementById(selector);

  if (element) {
    element.value = value ?? "";
  }
}

function v33SetText(selector, value) {
  const element = document.getElementById(selector);

  if (element) {
    element.textContent = value ?? "-";
  }
}

function v33SafeRevokePreview() {
  if (selectedAvatarPreviewUrl) {
    URL.revokeObjectURL(selectedAvatarPreviewUrl);
    selectedAvatarPreviewUrl = null;
  }
}

/* ---------- 2. LOGO APLIKASI ---------- */

function v33ApplyLogo() {
  const logoElements = document.querySelectorAll(
    ".header-brand img, .digital-card-header img"
  );

  const defaultLogo =
    CONFIG.defaultLogo ||
    "./assets/icons/tarbiyah-mark.svg";

  logoElements.forEach((img) => {
    if (!img) return;

    img.onerror = function () {
      this.onerror = null;
      this.src = "./assets/icons/tarbiyah-mark.svg";
    };

    img.src = defaultLogo;
  });
}

/* ---------- 3. TEMA APLIKASI ---------- */

function v33ApplyTheme() {
  const savedTheme = localStorage.getItem("tarbiyah-theme");

  const theme =
    savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : document.documentElement.dataset.theme || "dark";

  document.documentElement.dataset.theme = theme;

  const button = document.getElementById("btnTheme");

  if (button) {
    button.setAttribute(
      "aria-label",
      theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"
    );
  }
}

function v33ToggleTheme() {
  const current =
    document.documentElement.dataset.theme || "dark";

  const next = current === "dark" ? "light" : "dark";

  document.documentElement.dataset.theme = next;

  localStorage.setItem("tarbiyah-theme", next);

  const button = document.getElementById("btnTheme");

  if (button) {
    button.setAttribute(
      "aria-label",
      next === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"
    );
  }
}

/* ---------- 4. DATA PROFIL DARI SUPABASE ---------- */

async function v33LoadProfile() {
  if (!supabase || !currentUser) {
    throw new Error("Koneksi atau sesi pengguna belum tersedia.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      "Data profil belum ditemukan. Silakan hubungi administrator."
    );
  }

  currentProfile = data;

  return data;
}

/* ---------- 5. DATA KEANGGOTAAN ---------- */

async function v33LoadMembership() {
  if (!supabase || !currentUser) return null;

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn("[TARBIYAH] Data keanggotaan:", error.message);
    return null;
  }

  currentMembership = data || null;

  return currentMembership;
}

/* ---------- 6. DATA ROLE / HAK AKSES ---------- */

async function v33LoadRole() {
  if (!supabase || !currentUser) return null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role_id, roles(name)")
    .eq("user_id", currentUser.id);

  if (error) {
    console.warn("[TARBIYAH] Data role:", error.message);
    return null;
  }

  return data || [];
}

/* ---------- 7. RENDER DATA PROFIL ---------- */

function v33RenderProfile() {
  if (!currentProfile) return;

  const profile = currentProfile;

  v33SetValue("inputFullName", profile.full_name);
  v33SetValue("inputEmail", currentUser?.email || "");
  v33SetValue("inputPhone", profile.phone);
  v33SetValue("inputGender", profile.gender);
  v33SetValue("inputBirthDate", profile.birth_date);
  v33SetValue("inputCity", profile.city);
  v33SetValue("inputAddress", profile.address);

  // Kolom tambahan jika tersedia pada HTML.
  v33SetValue("inputUsername", profile.username);
  v33SetValue("inputBio", profile.bio);

  v33SetText("memberName", profile.full_name || "Anggota TARBIYAH");
  v33SetText("memberEmail", currentUser?.email || "-");
  v33SetText("memberPhone", profile.phone || "-");

  v33SetText(
    "memberJoinDate",
    v33FormatDate(profile.created_at)
  );

  v33SetText(
    "memberBirthDate",
    v33FormatDate(profile.birth_date)
  );

  v33SetText(
    "memberCity",
    profile.city || "-"
  );

  v33SetText(
    "memberGender",
    profile.gender || "-"
  );

  v33RenderMembership();
}

/* ---------- 8. RENDER DATA KEANGGOTAAN ---------- */

function v33RenderMembership() {
  const membership = currentMembership;

  if (!membership) {
    v33SetText("memberNumber", "Belum tersedia");
    v33SetText("membershipStatus", "Belum terdaftar");
    return;
  }

  v33SetText(
    "memberNumber",
    membership.member_number || "Menunggu nomor anggota"
  );

  v33SetText(
    "membershipStatus",
    membership.membership_status || "Belum diketahui"
  );

  v33SetText(
    "memberSubmittedAt",
    v33FormatDate(membership.submitted_at)
  );
}

/* ---------- 9. FOTO PROFIL / AVATAR ---------- */

async function v33RenderAvatar() {
  const avatar = document.getElementById("profileAvatar");
  const qrAvatar = document.getElementById("qrMemberAvatar");

  if (!avatar) return;

  const fallback =
    CONFIG.defaultLogo ||
    "./assets/icons/tarbiyah-mark.svg";

  const avatarPath = currentProfile?.avatar_path;

  if (!avatarPath || !supabase) {
    avatar.src = fallback;

    if (qrAvatar) qrAvatar.src = fallback;

    return;
  }

  try {
    const { data, error } = await supabase.storage
      .from(CONFIG.avatarBucket)
      .createSignedUrl(
        avatarPath,
        CONFIG.signedUrlExpiry
      );

    if (error) throw error;

    currentAvatarSignedUrl = data?.signedUrl || null;

    if (currentAvatarSignedUrl) {
      avatar.src = currentAvatarSignedUrl;

      if (qrAvatar) {
        qrAvatar.src = currentAvatarSignedUrl;
      }
    } else {
      avatar.src = fallback;

      if (qrAvatar) qrAvatar.src = fallback;
    }
  } catch (error) {
    console.warn("[TARBIYAH] Avatar:", error.message);

    avatar.src = fallback;

    if (qrAvatar) qrAvatar.src = fallback;
  }
}

/* ---------- 10. MODE EDIT PROFIL ---------- */

function v33GetEditableInputs() {
  return [
    "inputFullName",
    "inputPhone",
    "inputGender",
    "inputBirthDate",
    "inputCity",
    "inputAddress",
    "inputUsername",
    "inputBio"
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function v33CaptureFormData() {
  const result = {};

  v33GetEditableInputs().forEach((input) => {
    result[input.id] = input.value;
  });

  return result;
}

function v33RestoreFormData() {
  if (!originalFormData) return;

  Object.entries(originalFormData).forEach(([id, value]) => {
    const input = document.getElementById(id);

    if (input) input.value = value ?? "";
  });
}

function v33SetEditMode(enabled) {
  isEditing = Boolean(enabled);

  v33GetEditableInputs().forEach((input) => {
    input.disabled = !isEditing;
  });

  const editButton = document.getElementById("btnEditProfile");
  const actions = document.getElementById("profileEditActions");

  if (editButton) {
    editButton.style.display = isEditing ? "none" : "";
  }

  if (actions) {
    actions.style.display = isEditing ? "flex" : "none";
  }

  const saveButton = document.getElementById("btnSaveProfile");

  if (saveButton) {
    saveButton.disabled = isSaving;
    saveButton.textContent = isSaving
      ? "Menyimpan..."
      : "Simpan Perubahan";
  }
}

function v33StartEditing() {
  if (!currentProfile) {
    v33Toast("Data profil belum tersedia.", "warning");
    return;
  }

  originalFormData = v33CaptureFormData();

  v33SetEditMode(true);

  v33Toast(
    "Mode edit aktif. Silakan perbarui data profil.",
    "info"
  );
}

function v33CancelEditing() {
  v33RestoreFormData();

  v33SetEditMode(false);

  v33Toast("Perubahan dibatalkan.", "info");
}

/* ---------- 11. SIMPAN PERUBAHAN PROFIL ---------- */

async function v33SaveProfile(event) {
  if (event) event.preventDefault();

  if (isSaving) return;

  if (!supabase || !currentUser) {
    v33Toast("Sesi pengguna tidak tersedia.", "error");
    return;
  }

  const fullName =
    document.getElementById("inputFullName")?.value.trim() || "";

  if (!fullName) {
    v33Toast("Nama lengkap wajib diisi.", "warning");
    return;
  }

  const payload = {
    full_name: fullName,
    phone:
      document.getElementById("inputPhone")?.value.trim() || null,
    gender:
      document.getElementById("inputGender")?.value || null,
    birth_date:
      document.getElementById("inputBirthDate")?.value || null,
    city:
      document.getElementById("inputCity")?.value.trim() || null,
    address:
      document.getElementById("inputAddress")?.value.trim() || null,
    updated_at: new Date().toISOString()
  };

  // Simpan kolom tambahan hanya jika inputnya memang tersedia.
  const usernameInput = document.getElementById("inputUsername");
  const bioInput = document.getElementById("inputBio");

  if (usernameInput) {
    payload.username = usernameInput.value.trim() || null;
  }

  if (bioInput) {
    payload.bio = bioInput.value.trim() || null;
  }

  isSaving = true;

  v33SetEditMode(true);

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", currentUser.id)
      .select("*")
      .single();

    if (error) throw error;

    currentProfile = data;

    v33RenderProfile();

    // Perbarui snapshot agar data yang baru disimpan
    // tidak tertimpa oleh fungsi pembatalan.
    originalFormData = v33CaptureFormData();

    v33Toast("Alhamdulillah, profil berhasil diperbarui.", "success");

    v33SetEditMode(false);

  } catch (error) {
    console.error("[TARBIYAH] Simpan profil:", error);

    v33Toast(
      "Gagal menyimpan profil: " + (error.message || "Terjadi kesalahan."),
      "error"
    );

  } finally {
    isSaving = false;

    if (isEditing) {
      v33SetEditMode(true);
    } else {
      v33SetEditMode(false);
    }
  }
}

/* ---------- 12. PILIH FOTO PROFIL ---------- */

function v33PreviewAvatar(file) {
  if (!file) return;

  if (!CONFIG.allowedAvatarTypes.includes(file.type)) {
    v33Toast(
      "Format foto harus JPG, PNG, atau WEBP.",
      "warning"
    );
    return;
  }

  if (file.size > CONFIG.maxAvatarSize) {
    v33Toast(
      "Ukuran foto maksimal 2 MB.",
      "warning"
    );
    return;
  }

  v33SafeRevokePreview();

  selectedAvatarFile = file;

  selectedAvatarPreviewUrl = URL.createObjectURL(file);

  const avatar = document.getElementById("profileAvatar");

  if (avatar) {
    avatar.src = selectedAvatarPreviewUrl;
  }

  v33Toast(
    "Pratinjau foto berhasil. Tekan tombol simpan foto untuk mengunggahnya.",
    "info"
  );
}

/* ---------- 13. UPLOAD FOTO KE SUPABASE STORAGE ---------- */

async function v33UploadAvatar() {
  if (!selectedAvatarFile) {
    v33Toast("Pilih foto terlebih dahulu.", "warning");
    return;
  }

  if (!supabase || !currentUser) {
    v33Toast("Sesi pengguna tidak tersedia.", "error");
    return;
  }

  const file = selectedAvatarFile;

  const extension =
    file.name.split(".").pop()?.toLowerCase() || "jpg";

  const filePath =
    currentUser.id +
    "/" +
    Date.now() +
    "." +
    extension;

  try {
    v33Toast("Sedang mengunggah foto...", "info");

    const { error: uploadError } = await supabase.storage
      .from(CONFIG.avatarBucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_path: filePath,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentUser.id)
      .select("*")
      .single();

    if (updateError) {
      // Jika penyimpanan path gagal, hapus file yang baru diunggah.
      await supabase.storage
        .from(CONFIG.avatarBucket)
        .remove([filePath]);

      throw updateError;
    }

    currentProfile = data;

    selectedAvatarFile = null;

    v33SafeRevokePreview();

    await v33RenderAvatar();

    v33Toast("Foto profil berhasil diperbarui.", "success");

  } catch (error) {
    console.error("[TARBIYAH] Upload avatar:", error);

    v33Toast(
      "Gagal mengunggah foto: " + (error.message || "Terjadi kesalahan."),
      "error"
    );

    // Kembalikan tampilan ke foto yang tersimpan.
    await v33RenderAvatar();
  }
}

/* ---------- 14. TAB NAVIGASI PROFIL ---------- */

function v33SetupTabs() {
  const tabs = v33GetAll(".profile-tab[data-tab]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      if (!target) return;

      tabs.forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-selected", "false");
      });

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      v33GetAll(".profile-tab-content").forEach((panel) => {
        panel.classList.remove("active");
      });

      const targetPanel = document.getElementById(
        "tab-" + target
      );

      if (targetPanel) {
        targetPanel.classList.add("active");
      }
    });
  });
}

/* ---------- 15. RIWAYAT KEHADIRAN ---------- */

function v33RenderAttendanceNotice() {
  const container = document.getElementById("attendanceHistory");

  if (!container) return;

  container.innerHTML = `
    <div class="attendance-empty">
      <div class="attendance-empty-icon">📚</div>
      <h3>Riwayat Kajian</h3>
      <p>
        Riwayat kehadiran akan ditampilkan setelah
        sistem database absensi kajian tersedia.
      </p>
    </div>
  `;
}

/* ---------- 16. QR ANGGOTA ---------- */

function v33SetupQR() {
  const generateButton = document.getElementById("btnGenerateQR");
  const downloadButton = document.getElementById("btnDownloadQR");

  if (generateButton) {
    generateButton.addEventListener("click", () => {
      v33Toast(
        "Fitur QR anggota memerlukan Edge Function member-qr-mint. Format permintaan dan respons backend perlu diverifikasi terlebih dahulu.",
        "warning"
      );
    });
  }

  if (downloadButton) {
    downloadButton.addEventListener("click", () => {
      v33Toast(
        "QR belum tersedia untuk diunduh. Silakan aktifkan layanan QR anggota terlebih dahulu.",
        "warning"
      );
    });
  }
}

/* ---------- 17. NAVIGASI KEMBALI ---------- */

function v33GoBack() {
  const destination =
    CONFIG.dashboardPage || "./dashboard.html";

  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = destination;
  }
}

/* ---------- 18. LOGOUT ---------- */

async function v33Logout() {
  if (!supabase) {
    window.location.href =
      CONFIG.loginPage || "./login-register.html";
    return;
  }

  const confirmed = window.confirm(
    "Apakah Anda yakin ingin keluar dari akun TARBIYAH?"
  );

  if (!confirmed) return;

  try {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    window.location.href =
      CONFIG.loginPage || "./login-register.html";

  } catch (error) {
    console.error("[TARBIYAH] Logout:", error);

    v33Toast(
      "Gagal keluar: " + (error.message || "Terjadi kesalahan."),
      "error"
    );
  }
}

/* ---------- 19. EVENT LISTENERS ---------- */

function v33SetupEvents() {
  const editButton = document.getElementById("btnEditProfile");
  const cancelButton = document.getElementById("btnCancelEdit");
  const saveButton = document.getElementById("btnSaveProfile");
  const form = document.getElementById("personalProfileForm");

  const backButton = document.getElementById("btnBack");
  const themeButton = document.getElementById("btnTheme");
  const notificationButton = document.getElementById("btnNotifications");
  const logoutButton = document.getElementById("btnLogout");

  const avatarButton = document.getElementById("btnChangeAvatar");
  const avatarInput = document.getElementById("avatarInput");

  if (editButton) {
    editButton.addEventListener("click", v33StartEditing);
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", v33CancelEditing);
  }

  if (saveButton) {
    saveButton.addEventListener("click", v33SaveProfile);
  }

  if (form) {
    form.addEventListener("submit", v33SaveProfile);
  }

  if (backButton) {
    backButton.addEventListener("click", v33GoBack);
  }

  if (themeButton) {
    themeButton.addEventListener("click", v33ToggleTheme);
  }

  if (notificationButton) {
    notificationButton.addEventListener("click", () => {
      v33Toast(
        "Belum ada notifikasi baru.",
        "info"
      );
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", v33Logout);
  }

  if (avatarButton && avatarInput) {
    avatarButton.addEventListener("click", () => {
      avatarInput.click();
    });

    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files?.[0];

      if (file) {
        v33PreviewAvatar(file);
      }
    });
  }

  v33SetupTabs();
  v33SetupQR();
}

/* ---------- 20. MUAT SELURUH DATA ---------- */

async function v33LoadAllData() {
  await v33LoadProfile();

  // Keanggotaan dan role tidak boleh menghalangi
  // halaman profil apabila salah satunya gagal dimuat.
  await Promise.allSettled([
    v33LoadMembership(),
    v33LoadRole()
  ]);

  v33RenderProfile();

  await v33RenderAvatar();

  v33RenderAttendanceNotice();

  originalFormData = v33CaptureFormData();

  v33SetEditMode(false);
}

/* ---------- 21. INISIALISASI APLIKASI ---------- */

async function v33Initialize() {
  if (isInitialized) return;

  isInitialized = true;

  v33SetLoading(true);

  try {
    v33ApplyLogo();
    v33ApplyTheme();
    v33SetupEvents();

    supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error(
        "Supabase belum terhubung. Periksa js/config.js dan js/supabase-client.js."
      );
    }

    const user = await getCurrentUser();

    if (!user) {
      window.location.href =
        CONFIG.loginPage || "./login-register.html";

      return;
    }

    currentUser = user;

    await v33LoadAllData();

    console.log(
      "TARBIYAH PROFIL v3.3 berhasil diinisialisasi."
    );

  } catch (error) {
    console.error(
      "[TARBIYAH PROFIL v3.3]",
      error
    );

    v33Toast(
      error.message || "Gagal memuat halaman profil.",
      "error"
    );

    isInitialized = false;

  } finally {
    v33SetLoading(false);
  }
}

/* ---------- 22. JALANKAN APLIKASI ---------- */

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    v33Initialize,
    { once: true }
  );
} else {
  v33Initialize();
}

/* =========================================================
   AKHIR TARBIYAH — PROFIL ANGGOTA v3.3
========================================================= */

})();


 
