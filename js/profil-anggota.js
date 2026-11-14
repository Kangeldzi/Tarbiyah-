
/* =========================================================
   TARBIYAH — PROFIL ANGGOTA
   Integrasi Supabase berdasarkan struktur database aktual
   Versi: 2.0
   ========================================================= */

(() => {
  "use strict";

  const CONFIG = {
    LOGIN_PAGE: "./login-register.html",
    AVATAR_BUCKET: "avatar",
    AVATAR_MAX_SIZE: 2 * 1024 * 1024,
    AVATAR_SIGNED_URL_SECONDS: 3600
  };

  const supabase = window.tarbiyahSupabase;

  let currentUser = null;
  let profileData = null;
  let memberData = null;
  let originalFormData = {};
  let isEditing = false;
  let authSubscription = null;

  const $ = (id) => document.getElementById(id);

  /* =======================================================
     UTILITAS
     ======================================================= */

  function notify(message, type = "info") {
    const toast = $("profileToast");
    const messageEl = $("toastMessage");

    if (messageEl) {
      messageEl.textContent = message;
    }

    if (toast) {
      toast.dataset.type = type;
      toast.classList.add("show");

      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => {
        toast.classList.remove("show");
      }, 3500);
    } else {
      console.log("[TARBIYAH]", message);
    }
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "-";
  }

  function setValue(id, value) {
    const el = $(id);
    if (el && "value" in el) {
      el.value = value ?? "";
    }
  }

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getInitials(name) {
    const words = String(name || "Pengguna")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return words.slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join("") || "TA";
  }

  function setLoading(loading) {
    const el = $("pageLoading");
    if (!el) return;

    el.hidden = !loading;
    el.style.display = loading ? "" : "none";
  }

  function getDashboardPage() {
    return window.TARBIYAH_CONFIG?.DASHBOARD_PAGE
      || "./dashboard.html";
  }

  function getLoginPage() {
    return window.TARBIYAH_CONFIG?.LOGIN_PAGE
      || CONFIG.LOGIN_PAGE;
  }

  function getMembershipStatus(status) {
    const value = String(status || "").toLowerCase();

    const labels = {
      pending: "Menunggu verifikasi",
      active: "Anggota aktif",
      approved: "Disetujui",
      rejected: "Ditolak",
      suspended: "Ditangguhkan",
      inactive: "Tidak aktif",
      aktif: "Anggota aktif",
      menunggu: "Menunggu verifikasi"
    };

    return labels[value] || status || "Belum tersedia";
  }

  function getRoleLabel(role) {
    const labels = {
      super_admin: "Super Admin",
      admin: "Admin",
      member: "Anggota",
      registered_user: "Pengguna Terdaftar"
    };

    return labels[role] || role || "Pengguna";
  }

  function showAvatarFallback(name) {
    const initials = getInitials(name);
    const avatar = $("profileAvatar");
    const qrAvatar = $("qrMemberAvatar");

    if (avatar) {
      if (avatar.tagName === "IMG") {
        avatar.removeAttribute("src");
        avatar.alt = initials;
      } else {
        avatar.textContent = initials;
        avatar.style.backgroundImage = "none";
      }
    }

    if (qrAvatar) {
      if (qrAvatar.tagName === "IMG") {
        qrAvatar.removeAttribute("src");
        qrAvatar.alt = initials;
      } else {
        qrAvatar.textContent = initials;
      }
    }
  }

  async function getAvatarUrl(path) {
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from(CONFIG.AVATAR_BUCKET)
      .createSignedUrl(
        path,
        CONFIG.AVATAR_SIGNED_URL_SECONDS
      );

    if (error) {
      console.warn("[TARBIYAH] Gagal membuat signed URL:", error);
      return null;
    }

    return data?.signedUrl || null;
  }

  async function renderAvatar(path, name) {
    const avatar = $("profileAvatar");
    const qrAvatar = $("qrMemberAvatar");

    showAvatarFallback(name);

    if (!path) return;

    const url = await getAvatarUrl(path);
    if (!url) return;

    [avatar, qrAvatar].forEach(el => {
      if (!el) return;

      if (el.tagName === "IMG") {
        el.src = url;
        el.alt = name || "Foto profil";
      } else {
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.textContent = "";
      }
    });
  }

  /* =======================================================
     AUTENTIKASI
     ======================================================= */

  async function getAuthenticatedUser() {
    if (!window.TARBIYAH_BACKEND_READY || !supabase) {
      throw new Error("Koneksi Supabase belum siap.");
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const user = data?.session?.user;

    if (!user) {
      window.location.replace(getLoginPage());
      return null;
    }

    return user;
  }

  /* =======================================================
     MEMBACA PROFIL
     Tabel: public.profiles
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

    if (error) throw error;

    if (!data) {
      throw new Error(
        "Data profil belum ditemukan. Periksa trigger pendaftaran TARBIYAH."
      );
    }

    profileData = data;
    renderProfile();
  }

  function renderProfile() {
    if (!profileData) return;

    const name =
      profileData.full_name ||
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split("@")[0] ||
      "Pengguna TARBIYAH";

    setText("profileName", name);
    setText("profileEmail", currentUser.email || "-");

    setValue("inputFullName", profileData.full_name);
    setValue("inputEmail", currentUser.email);
    setValue("inputPhone", profileData.phone);
    setValue("inputCity", "");
    setValue("inputAddress", "");
    setValue("inputGender", "");
    setValue("inputBirthDate", "");

    // Username dan bio disimpan di database.
    // Jika HTML memiliki elemen dengan ID tersebut,
    // nilainya akan diisi otomatis.
    setValue("inputUsername", profileData.username);
    setValue("inputBio", profileData.bio);

    setText("memberSince", formatDate(profileData.created_at));

    renderAvatar(profileData.avatar_path, name);

    originalFormData = {
      full_name: profileData.full_name || "",
      username: profileData.username || "",
      phone: profileData.phone || "",
      bio: profileData.bio || ""
    };

    setText("accountStatus", "Akun terautentikasi");
    setText(
      "emailVerificationStatus",
      currentUser.email_confirmed_at
        ? "Email terverifikasi"
        : "Email belum terverifikasi"
    );
  }

  /* =======================================================
     MEMBACA DATA KEANGGOTAAN
     Tabel: public.members
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
        review_note,
        created_at,
        updated_at
      `)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    memberData = data;
    renderMembership();
  }

  function renderMembership() {
    if (!memberData) {
      setText("memberStatus", "Data keanggotaan belum tersedia");
      setText("memberNumber", "Belum tersedia");
      setText("membershipNumber", "Belum tersedia");
      setText("membershipStatus", "Belum tersedia");
      setText("membershipDate", "-");
      setText("membershipUpdated", "-");
      setText("membershipGroup", "Belum ditentukan");
      setText("membershipRole", "Pengguna");
      return;
    }

    const number = memberData.member_number || "Belum diterbitkan";
    const status = getMembershipStatus(
      memberData.membership_status
    );

    setText("memberNumber", number);
    setText("membershipNumber", number);
    setText("memberStatus", status);
    setText("membershipStatus", status);

    setText(
      "membershipDate",
      formatDate(memberData.submitted_at)
    );

    setText(
      "membershipUpdated",
      formatDate(memberData.updated_at)
    );

    // Kolom group_name tidak tersedia di tabel members.
    setText("membershipGroup", "Belum ditentukan");

    // Role aplikasi dibaca terpisah dari user_roles.
    setText("membershipRole", "Memuat hak akses...");

    setText("reviewNote", memberData.review_note || "-");

    // Data QR mengikuti identitas keanggotaan.
    setText(
      "qrMemberNumber",
      number
    );

    setText(
      "qrMemberStatus",
      status
    );
  }

  /* =======================================================
     MEMBACA ROLE PENGGUNA
     Tabel: user_roles + roles
     ======================================================= */

  async function loadUserRole() {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", currentUser.id);

    if (error) {
      console.warn("[TARBIYAH] Role tidak dapat dibaca:", error);
      setText("membershipRole", "Tidak dapat dimuat");
      return;
    }

    const roleNames = (data || [])
      .map(item => {
        const role = Array.isArray(item.roles)
          ? item.roles[0]
          : item.roles;

        return role?.name;
      })
      .filter(Boolean);

    const priority = [
      "super_admin",
      "admin",
      "member",
      "registered_user"
    ];

    const selectedRole =
      priority.find(role => roleNames.includes(role)) ||
      roleNames[0] ||
      "registered_user";

    setText("membershipRole", getRoleLabel(selectedRole));
    setText("rolePill", getRoleLabel(selectedRole));
  }

  /* =======================================================
     EDIT FORM
     ======================================================= */

  function getEditableFields() {
    return [
      $("inputFullName"),
      $("inputPhone"),
      $("inputUsername"),
      $("inputBio")
    ].filter(Boolean);
  }

  function setEditMode(enabled) {
    isEditing = enabled;

    getEditableFields().forEach(el => {
      el.disabled = !enabled;
    });

    const email = $("inputEmail");
    if (email) email.disabled = true;

    const editButton = $("btnEditProfile");
    const actions = $("profileEditActions");

    if (editButton) editButton.hidden = enabled;
    if (actions) actions.hidden = !enabled;

    if (!enabled) {
      restoreForm();
    }
  }

  function restoreForm() {
    setValue("inputFullName", originalFormData.full_name);
    setValue("inputPhone", originalFormData.phone);
    setValue("inputUsername", originalFormData.username);
    setValue("inputBio", originalFormData.bio);
  }

  async function saveProfile(event) {
    if (event) event.preventDefault();
    if (!isEditing || !currentUser) return;

    const fullName = $("inputFullName")?.value.trim() || "";
    const phone = $("inputPhone")?.value.trim() || null;
    const username = $("inputUsername")?.value.trim() || null;
    const bio = $("inputBio")?.value.trim() || null;

    if (!fullName) {
      notify("Nama lengkap tidak boleh kosong.", "error");
      return;
    }

    const payload = {
      full_name: fullName,
      phone,
      username,
      bio
    };

    const saveButton = $("btnSaveProfile");

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Menyimpan...";
    }

    try {
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
        .single();

      if (error) throw error;

      profileData = data;
      renderProfile();
      setEditMode(false);

      notify("Profil berhasil diperbarui.", "success");

    } catch (error) {
      console.error("[TARBIYAH] Simpan profil gagal:", error);
      notify(
        error.message || "Gagal menyimpan profil.",
        "error"
      );
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = "Simpan Perubahan";
      }
    }
  }

  /* =======================================================
     UPLOAD FOTO PROFIL
     Bucket: avatar (PRIVATE)
     Path: user_id/nama-file.ext
     ======================================================= */

  function getImageExtension(file) {
    const mimeMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    return mimeMap[file.type] || null;
  }

  async function uploadAvatar(file) {
    if (!file || !currentUser) return;

    if (file.size > CONFIG.AVATAR_MAX_SIZE) {
      notify("Ukuran foto maksimal 2 MB.", "error");
      return;
    }

    const extension = getImageExtension(file);

    if (!extension) {
      notify("Format foto harus JPG, PNG, atau WebP.", "error");
      return;
    }

    const oldPath = profileData?.avatar_path || null;

    const fileName =
      `${currentUser.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`;

    const uploadButton = $("btnChangeAvatar");

    if (uploadButton) uploadButton.disabled = true;

    try {
      const { error: uploadError } = await supabase.storage
        .from(CONFIG.AVATAR_BUCKET)
        .upload(fileName, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_path: fileName })
        .eq("id", currentUser.id)
        .select("avatar_path")
        .single();

      if (updateError) {
        // Jika update database gagal, hapus file baru.
        await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .remove([fileName]);

        throw updateError;
      }

      profileData.avatar_path = data.avatar_path;

      await renderAvatar(data.avatar_path, profileData.full_name);

      // Hapus foto lama hanya setelah path baru berhasil disimpan.
      if (
        oldPath &&
        oldPath !== fileName &&
        oldPath.startsWith(`${currentUser.id}/`)
      ) {
        const { error: removeError } = await supabase.storage
          .from(CONFIG.AVATAR_BUCKET)
          .remove([oldPath]);

        if (removeError) {
          console.warn(
            "[TARBIYAH] Foto lama belum berhasil dihapus:",
            removeError
          );
        }
      }

      notify("Foto profil berhasil diperbarui.", "success");

    } catch (error) {
      console.error("[TARBIYAH] Upload avatar gagal:", error);
      notify(
        error.message || "Gagal mengunggah foto profil.",
        "error"
      );
    } finally {
      if (uploadButton) uploadButton.disabled = false;

      const input = $("avatarInput");
      if (input) input.value = "";
    }
  }

  /* =======================================================
     TAB NAVIGATION
     ======================================================= */

  function setupTabs() {
    const tabButtons = document.querySelectorAll("[data-tab]");

    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const tabName = button.dataset.tab;

        tabButtons.forEach(item => {
          item.classList.toggle("active", item === button);
          item.setAttribute(
            "aria-selected",
            item === button ? "true" : "false"
          );
        });

        document.querySelectorAll("[data-tab-content]")
          .forEach(panel => {
            panel.hidden = panel.dataset.tabContent !== tabName;
          });

        // Mendukung struktur panel berdasarkan ID.
        document.querySelectorAll(".tab-panel")
          .forEach(panel => {
            panel.hidden = panel.id !== `tab-${tabName}`;
          });
      });
    });
  }

  /* =======================================================
     QR ANGGOTA
     ======================================================= */

  function setupQRNotice() {
    const message =
      "Fitur QR anggota menunggu verifikasi kontrak Edge Function member-qr-mint.";

    const generate = $("btnGenerateQR");
    const download = $("btnDownloadQR");

    if (generate) {
      generate.addEventListener("click", () => {
        notify(message, "info");
      });
    }

    if (download) {
      download.addEventListener("click", () => {
        notify(
          "QR belum dapat diunduh karena token QR belum diterbitkan.",
          "info"
        );
      });
    }
  }

  /* =======================================================
     RIWAYAT KAJIAN DAN PRESENSI
     ======================================================= */

  function renderAttendanceNotice() {
    setText("totalKajian", "—");
    setText("totalAttendance", "—");
    setText("attendancePercentage", "—");

    const history = $("attendanceHistory");

    if (history) {
      history.textContent =
        "Riwayat kajian dan presensi belum terhubung. " +
        "Struktur tabel presensi belum ditemukan pada database.";
    }
  }

  /* =======================================================
     LOGOUT
     ======================================================= */

  async function logout() {
    const button = $("btnLogout");
    if (button) button.disabled = true;

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      window.location.replace(getLoginPage());

    } catch (error) {
      console.error("[TARBIYAH] Logout gagal:", error);
      notify("Gagal keluar dari akun. Silakan coba lagi.", "error");

      if (button) button.disabled = false;
    }
  }

  /* =======================================================
     EVENT LISTENERS
     ======================================================= */

  function setupEvents() {
    $("btnBack")?.addEventListener("click", () => {
      window.location.href = getDashboardPage();
    });

    $("btnEditProfile")?.addEventListener("click", () => {
      setEditMode(true);
    });

    $("btnCancelEdit")?.addEventListener("click", () => {
      setEditMode(false);
    });

    $("personalProfileForm")?.addEventListener(
      "submit",
      saveProfile
    );

    $("btnSaveProfile")?.addEventListener("click", saveProfile);

    $("btnChangeAvatar")?.addEventListener("click", () => {
      $("avatarInput")?.click();
    });

    $("avatarInput")?.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (file) uploadAvatar(file);
    });

    $("btnLogout")?.addEventListener("click", logout);

    setupTabs();
    setupQRNotice();

    // Field yang tidak tersedia di tabel profiles
    // tidak boleh diedit seolah-olah dapat disimpan.
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
          "Kolom ini belum tersedia pada struktur database TARBIYAH.";
      }
    });
  }

  /* =======================================================
     INISIALISASI HALAMAN
     ======================================================= */

  async function initialize() {
    setLoading(true);

    try {
      if (!supabase || !window.TARBIYAH_BACKEND_READY) {
        throw new Error(
          "Supabase belum siap. Periksa urutan pemuatan script."
        );
      }

      currentUser = await getAuthenticatedUser();

      if (!currentUser) return;

      await loadProfile();

      await Promise.all([
        loadMembership(),
        loadUserRole()
      ]);

      renderAttendanceNotice();

      setupEvents();
      setEditMode(false);

      // Pantau perubahan sesi autentikasi.
      const { data } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === "SIGNED_OUT" || !session?.user) {
            window.location.replace(getLoginPage());
          }
        }
      );

      authSubscription = data?.subscription || null;

      console.log("[TARBIYAH] Profil berhasil dimuat.", {
        userId: currentUser.id,
        profileLoaded: Boolean(profileData),
        memberLoaded: Boolean(memberData)
      });

    } catch (error) {
      console.error("[TARBIYAH] Inisialisasi profil gagal:", error);

      notify(
        error.message || "Halaman profil gagal dimuat.",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.TARBIYAH_PROFILE = Object.freeze({
    reload: initialize,
    getProfile: () => profileData,
    getMembership: () => memberData,
    getUser: () => currentUser,
    logout
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }

  window.addEventListener("pagehide", () => {
    authSubscription?.unsubscribe?.();
  });

})();
