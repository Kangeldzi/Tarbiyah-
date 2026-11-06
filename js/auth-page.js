(() => {
  const $ = (id) => document.getElementById(id);
  const forms = {
    login: $("loginForm"), register: $("registerForm"),
    forgot: $("forgotForm"), recovery: $("recoveryForm")
  };
  const tabs = $("authTabs");
  const bottom = $("authBottom");
  const alertBox = $("authAlert");
  const title = $("formTitle");
  const subtitle = $("formSubtitle");
  const params = new URLSearchParams(location.search);
  let busy = false;

  $("currentYear").textContent = new Date().getFullYear();

  function showAlert(message, type = "error") {
    alertBox.textContent = message;
    alertBox.className = `auth-alert ${type}`;
    alertBox.hidden = false;
  }
  function clearAlert() {
    alertBox.hidden = true;
    alertBox.textContent = "";
    alertBox.className = "auth-alert";
  }
  function setView(view) {
    Object.entries(forms).forEach(([key, form]) => form.hidden = key !== view);
    tabs.hidden = view === "forgot" || view === "recovery";
    bottom.hidden = view === "forgot" || view === "recovery";
    $("loginTab").classList.toggle("active", view === "login");
    $("registerTab").classList.toggle("active", view === "register");
    $("loginTab").setAttribute("aria-selected", String(view === "login"));
    $("registerTab").setAttribute("aria-selected", String(view === "register"));
    const headings = {
      login: ["Selamat datang kembali", "Masuk untuk melanjutkan perjalanan kebaikan Anda."],
      register: ["Mulai perjalanan kebaikan", "Buat akun untuk bergabung bersama komunitas TARBIYAH."],
      forgot: ["Pulihkan kata sandi", "Kami akan membantu Anda mendapatkan kembali akses akun."],
      recovery: ["Atur kata sandi baru", "Gunakan kata sandi yang kuat dan mudah Anda ingat."]
    };
    title.textContent = headings[view][0];
    subtitle.textContent = headings[view][1];
    clearAlert();
  }
  function setBusy(form, state, label) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (state) {
      button.dataset.original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span>${label || "Memproses..."}</span><b>…</b>`;
    } else {
      button.disabled = false;
      if (button.dataset.original) button.innerHTML = button.dataset.original;
    }
  }
  function friendlyError(error) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("invalid login credentials")) return "Email atau kata sandi tidak sesuai.";
    if (msg.includes("email not confirmed")) return "Email Anda belum diverifikasi. Silakan periksa kotak masuk email.";
    if (msg.includes("user already registered")) return "Email ini sudah terdaftar. Silakan masuk.";
    if (msg.includes("password should be")) return "Kata sandi belum memenuhi ketentuan.";
    if (msg.includes("rate limit")) return "Terlalu banyak percobaan. Silakan tunggu beberapa saat.";
    if (msg.includes("failed to fetch") || msg.includes("network")) return "Koneksi bermasalah. Periksa jaringan internet Anda.";
    return error?.message || "Terjadi kesalahan. Silakan coba kembali.";
  }
  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }
  function redirectDashboard() {
    location.replace(window.TARBIYAH_CONFIG?.DASHBOARD_PAGE || "./tarbiyah.html");
  }

  $("loginTab").addEventListener("click", () => setView("login"));
  $("registerTab").addEventListener("click", () => setView("register"));
  document.querySelector("[data-switch-register]").addEventListener("click", () => setView("register"));
  document.querySelector("[data-forgot]").addEventListener("click", () => {
    $("forgotEmail").value = $("loginEmail").value;
    setView("forgot");
  });
  document.querySelector("[data-back-login]").addEventListener("click", () => setView("login"));

  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $(button.dataset.toggle);
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute("aria-label", reveal ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
      button.textContent = reveal ? "◎" : "◉";
    });
  });

  forms.login.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    if (!validateEmail(email) || !password) return showAlert("Masukkan alamat email dan kata sandi yang benar.");
    busy = true; setBusy(forms.login, true, "Memeriksa akun...");
    try {
      await window.TARBIYAH_AUTH.signIn(email, password);
      showAlert("Berhasil masuk. Mengarahkan ke dashboard...", "success");
      setTimeout(redirectDashboard, 500);
    } catch (error) { showAlert(friendlyError(error)); }
    finally { busy = false; setBusy(forms.login, false); }
  });

  forms.register.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const name = $("registerName").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;
    const confirm = $("registerConfirm").value;
    if (name.length < 2) return showAlert("Nama lengkap minimal 2 karakter.");
    if (!validateEmail(email)) return showAlert("Format alamat email belum benar.");
    if (password.length < 8) return showAlert("Kata sandi minimal 8 karakter.");
    if (password !== confirm) return showAlert("Konfirmasi kata sandi tidak sama.");
    if (!$("acceptTerms").checked) return showAlert("Centang persetujuan ketentuan untuk melanjutkan.");
    busy = true; setBusy(forms.register, true, "Membuat akun...");
    try {
      const data = await window.TARBIYAH_AUTH.signUp(name, email, password);
      if (data.session) {
        showAlert("Akun berhasil dibuat. Mengarahkan ke dashboard...", "success");
        setTimeout(redirectDashboard, 700);
      } else {
        showAlert("Pendaftaran diterima. Silakan buka email untuk verifikasi akun sebelum masuk.", "success");
        forms.register.reset();
        setTimeout(() => setView("login"), 2600);
      }
    } catch (error) { showAlert(friendlyError(error)); }
    finally { busy = false; setBusy(forms.register, false); }
  });

  forms.forgot.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const email = $("forgotEmail").value.trim();
    if (!validateEmail(email)) return showAlert("Masukkan alamat email yang valid.");
    busy = true; setBusy(forms.forgot, true, "Mengirim email...");
    try {
      await window.TARBIYAH_AUTH.resetPassword(email);
      showAlert("Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam.", "success");
    } catch (error) { showAlert(friendlyError(error)); }
    finally { busy = false; setBusy(forms.forgot, false); }
  });

  forms.recovery.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const password = $("newPassword").value;
    if (password.length < 8) return showAlert("Kata sandi minimal 8 karakter.");
    if (password !== $("newPasswordConfirm").value) return showAlert("Konfirmasi kata sandi tidak sama.");
    busy = true; setBusy(forms.recovery, true, "Menyimpan...");
    try {
      await window.TARBIYAH_AUTH.updatePassword(password);
      showAlert("Kata sandi berhasil diperbarui. Silakan masuk kembali.", "success");
      await window.TARBIYAH_AUTH.signOut();
      setTimeout(() => { history.replaceState({}, "", "./login-register.html"); setView("login"); }, 1800);
    } catch (error) { showAlert(friendlyError(error)); }
    finally { busy = false; setBusy(forms.recovery, false); }
  });

  (async () => {
    if (params.get("mode") === "recovery") {
      setView("recovery");
      return;
    }
    try {
      const result = await window.TARBIYAH_AUTH.getSession();
      if (result.session) redirectDashboard();
      else if (!result.configured) showAlert("Mode tampilan siap. Hubungkan Supabase di js/config.js untuk mengaktifkan login dan pendaftaran.");
    } catch (error) { showAlert(friendlyError(error)); }
  })();
})();
