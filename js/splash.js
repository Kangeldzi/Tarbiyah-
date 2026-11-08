document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const card = $("welcomeCard"), stage = document.querySelector(".brand-stage");
  const toast = $("appToast"), enter = $("enterButton"), about = $("aboutButton");
  const dialog = $("aboutDialog"), cfg = window.TARBIYAH_CONFIG || {};
  const showToast = (message) => {
    if (!toast) return; toast.textContent = message; toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2800);
  };
  const revealWelcome = () => { if (stage) stage.hidden = true; if (card) card.hidden = false; showToast("Selamat datang di TARBIYAH"); };

  // Kilau acak pada logo, mengambil efek visual dari referensi animasi Tahap 1.
  const mark = $("brandMark");
  if (mark && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const directions = ["shine-left", "shine-right", "shine-up", "shine-down"];
    let previous = -1;
    const shine = () => {
      let next; do { next = Math.floor(Math.random() * directions.length); } while (next === previous);
      previous = next; mark.classList.remove(...directions); void mark.offsetWidth; mark.classList.add(directions[next]);
      window.setTimeout(() => mark.classList.remove(directions[next]), 1100);
      window.setTimeout(shine, 3500 + Math.random() * 3000);
    };
    window.setTimeout(shine, 900);
  }

  // Handler dipasang sebelum pemeriksaan jaringan agar tombol tidak terasa macet.
  enter?.addEventListener("click", () => {
    if (!window.TARBIYAH_BACKEND_READY) { showToast("Aplikasi perlu dikonfigurasi Supabase sebelum login."); return; }
    location.href = cfg.LOGIN_PAGE || "./login-register.html";
  });
  about?.addEventListener("click", () => dialog?.showModal());

  // Reveal tidak menunggu jaringan: pengguna tetap melihat splash saat koneksi lambat.
  window.setTimeout(revealWelcome, 1900);
  try {
    const result = await window.TARBIYAH_AUTH.getSession();
    if (result.session) { location.replace(cfg.DASHBOARD_PAGE || "./dashboard.html"); return; }
  } catch (error) { console.warn("[TARBIYAH] Pemeriksaan sesi belum berhasil.", error); }
});
