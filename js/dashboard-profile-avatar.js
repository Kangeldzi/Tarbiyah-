
/* =========================================================
   TARBIYAH — PROFILE AVATAR CONTROLLER
   Foto profil akun aktif + sinkronisasi Header dan Sidebar
   ========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_PROFILE_AVATAR__) return;
  window.__TARBIYAH_PROFILE_AVATAR__ = true;

  const DEFAULT_AVATAR = "./assets/images/default-avatar.png";

  const $all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  function getClient() {
    if (
      window.TARBIYAH_BACKEND_READY &&
      window.tarbiyahSupabase
    ) {
      return window.tarbiyahSupabase;
    }

    return null;
  }

  function getPhotoUrl(user) {
    const metadata = user?.user_metadata || {};

    const candidates = [
      metadata.avatar_url,
      metadata.picture,
      metadata.photo_url,
      metadata.profile_photo_url,
      metadata.profile_image,
      metadata.avatar
    ];

    return candidates.find(value =>
      typeof value === "string" &&
      /^https?:\/\//i.test(value.trim())
    )?.trim() || DEFAULT_AVATAR;
  }

  function setPhoto(url) {
    $all("[data-profile-photo]").forEach(img => {
      img.onerror = () => {
        img.onerror = null;
        img.src = DEFAULT_AVATAR;
      };

      img.src = url || DEFAULT_AVATAR;
      img.alt = "Foto profil pengguna TARBIYAH";
    });
  }

  function setName(user) {
    const metadata = user?.user_metadata || {};

    const name =
      metadata.full_name ||
      metadata.display_name ||
      metadata.name ||
      user?.email?.split("@")[0] ||
      "Pengguna";

    $all("[data-user-name]").forEach(el => {
      el.textContent = name;
    });

    $all("[data-sidebar-user-name]").forEach(el => {
      el.textContent = name;
    });
  }

  function normalizeRole(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function getRoleLabel(role) {
    const normalized = normalizeRole(role);

    if (normalized === "super_admin" ||
        normalized === "superadmin") {
      return "Super Admin";
    }

    if (normalized === "admin") {
      return "Admin";
    }

    if (normalized === "anggota" ||
        normalized === "member") {
      return "Anggota";
    }

    return role || "Role belum ditetapkan";
  }

  function setRole(role) {
    const label = getRoleLabel(role);

    $all("[data-sidebar-user-role]").forEach(el => {
      el.textContent = label;
    });

    $all("[data-user-role]").forEach(el => {
      el.textContent = label;
    });
  }

  async function initialize() {
    const client = getClient();

    if (!client) {
      console.warn(
        "[TARBIYAH PROFILE] Backend belum tersedia."
      );
      return;
    }

    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    const user = data?.session?.user;

    if (!user) {
      setPhoto(DEFAULT_AVATAR);
      return;
    }

    setPhoto(getPhotoUrl(user));
    setName(user);

    // Role hanya diambil dari hasil pemeriksaan database
    // oleh dashboard.js, bukan dari metadata akun.
    const roleState = window.TARBIYAH_USER_ROLE;

    if (roleState?.ready && roleState?.name) {
      setRole(roleState.name);
    } else {
      setRole("Role belum ditetapkan");
    }

    console.info(
      "[TARBIYAH PROFILE] Foto profil berhasil diproses.",
      {
        userId: user.id,
        role: roleState?.name || "Belum ditetapkan"
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => initialize().catch(console.error),
      { once: true }
    );
  } else {
    initialize().catch(console.error);
  }

})();
