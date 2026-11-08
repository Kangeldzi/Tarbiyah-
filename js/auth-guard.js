(() => {
  const loginUrl = window.TARBIYAH_CONFIG?.LOGIN_PAGE || "./login-register.html";
  let redirecting = false;
  function goToLogin() { if (redirecting) return; redirecting = true; location.replace(loginUrl); }
  window.TARBIYAH_SESSION = { user: null, ready: false };
  document.documentElement.classList.add("auth-check-pending");
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const result = await window.TARBIYAH_AUTH.getSession();
      if (!result.configured || !result.session?.user) { goToLogin(); return; }
      window.TARBIYAH_SESSION.user = result.session.user;
      window.TARBIYAH_SESSION.ready = true;
      document.documentElement.classList.remove("auth-check-pending");
      document.documentElement.classList.add("auth-check-ready");
      document.dispatchEvent(new CustomEvent("tarbiyah:session-ready", { detail: { user: result.session.user } }));
      window.TARBIYAH_AUTH.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) goToLogin();
      });
    } catch (error) { console.error("[TARBIYAH] Pemeriksaan sesi dashboard gagal.", error); goToLogin(); }
  }, { once: true });
})();
