document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const card = $("welcomeCard"), stage = document.querySelector(".brand-stage");
  const toast = $("appToast"), enter = $("enterButton"), about = $("aboutButton");
  const dialog = $("aboutDialog");
  const cfg = window.TARBIYAH_CONFIG;
  const showToast = (message) => {
    toast.textContent = message; toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2800);
  };

  // Branding dapat diganti melalui pengaturan identitas aplikasi di database pada tahap admin.
  // Nilai bawaan ditampilkan sampai pengaturan branding terhubung.
  const revealWelcome = () => {
    stage.hidden = true; card.hidden = false;
    showToast("Selamat datang di TARBIYAH");
  };

  let session = null;
  try {
    const result = await window.TARBIYAH_AUTH.getSession();
    if (result.configured) session = result.session;
  } catch (error) {
    console.error("[TARBIYAH] Pemeriksaan sesi gagal:", error);
    showToast("Koneksi akun belum dapat diperiksa.");
  }

  if (session) {
    window.location.replace(cfg.DASHBOARD_PAGE);
    return;
  }

  window.setTimeout(revealWelcome, 1900);
  enter.addEventListener("click", () => {
    if (!window.TARBIYAH_BACKEND_READY) {
      showToast("Aplikasi perlu dikonfigurasi Supabase sebelum login.");
      return;
    }
    window.location.href = cfg.LOGIN_PAGE;
  });
  about.addEventListener("click", () => dialog.showModal());
});
