
/* =========================================================
   TARBIYAH — PROFILE AVATAR CONTROLLER v2
   Sumber foto: members.avatar_path
   Storage: avatar
   ========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_PROFILE_AVATAR_V2__) return;
  window.__TARBIYAH_PROFILE_AVATAR_V2__ = true;

  const BUCKET = "avatar";
  const TABLE = "members";
  const DEFAULT_AVATAR = "./assets/icons/icon-192.png";
  const SIGNED_URL_SECONDS = 3600;

  const $all = selector =>
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

  function setPhoto(url, name) {
    $all("[data-profile-photo]").forEach(img => {
      img.onerror = () => {
        img.onerror = null;
        img.src = DEFAULT_AVATAR;
      };

      img.src = url || DEFAULT_AVATAR;
      img.alt = name
        ? `Foto profil ${name}`
        : "Foto profil pengguna TARBIYAH";
    });
  }

  function setName(user, profile) {
    const metadata = user?.user_metadata || {};

    const name =
      profile?.full_name ||
      profile?.name ||
      profile?.nama_lengkap ||
      metadata.full_name ||
      metadata.display_name ||
      metadata.name ||
      user?.email?.split("@")[0] ||
      "Pengguna";

    $all("[data-user-name], [data-sidebar-user-name]")
      .forEach(el => {
        el.textContent = name;
      });

    return name;
  }

  function normalizeRole(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function setRole() {
    const roleState = window.TARBIYAH_USER_ROLE;
    const role = roleState?.name;

    let label = "Role belum ditetapkan";

    if (roleState?.ready && role) {
      const normalized = normalizeRole(role);

      if (
        normalized === "super_admin" ||
        normalized === "superadmin"
      ) {
        label = "Super Admin";
      } else if (normalized === "admin") {
        label = "Admin";
      } else if (
        normalized === "anggota" ||
        normalized === "member"
      ) {
        label = "Anggota";
      } else {
        label = role;
      }
    }

    $all("[data-sidebar-user-role], [data-user-role]")
      .forEach(el => {
        el.textContent = label;
      });
  }

  async function loadAvatar() {
    const client = getClient();

    if (!client) {
      throw new Error("Koneksi Supabase belum tersedia.");
    }

    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();

    if (sessionError) throw sessionError;

    const user = sessionData?.session?.user;

    if (!user) {
      setPhoto(DEFAULT_AVATAR);
      return;
    }

    // Ambil profil milik akun yang sedang login.
    const { data: profile, error: profileError } =
      await client
        .from(TABLE)
        .select("full_name, avatar_path")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) throw profileError;

    const name = setName(user, profile);

    let photoUrl = null;

    if (profile?.avatar_path) {
      const { data, error } = await client
        .storage
        .from(BUCKET)
        .createSignedUrl(
          profile.avatar_path,
          SIGNED_URL_SECONDS
        );

      if (error) {
        console.error(
          "[TARBIYAH AVATAR] Signed URL gagal:",
          error
        );
      } else {
        photoUrl = data?.signedUrl || null;
      }
    }

    setPhoto(photoUrl || DEFAULT_AVATAR, name);
    setRole();

    console.info("[TARBIYAH AVATAR] Selesai", {
      userId: user.id,
      hasProfile: Boolean(profile),
      hasAvatar: Boolean(photoUrl)
    });
  }

  async function initialize() {
    try {
      await loadAvatar();
    } catch (error) {
      console.error(
        "[TARBIYAH AVATAR] Gagal memuat foto:",
        error
      );

      setPhoto(DEFAULT_AVATAR);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

  // API untuk memperbarui foto setelah pengguna
  // mengganti foto profil tanpa memuat ulang halaman.
  window.TARBIYAH_PROFILE_AVATAR = {
    refresh: initialize
  };

})();
