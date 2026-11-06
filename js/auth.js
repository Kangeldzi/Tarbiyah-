(() => {
  const backend = () => {
    if (!window.TARBIYAH_BACKEND_READY || !window.tarbiyahSupabase) {
      throw new Error("Supabase belum dikonfigurasi. Lengkapi Project URL dan anon/public key di js/config.js.");
    }
    return window.tarbiyahSupabase;
  };

  window.TARBIYAH_AUTH = {
    async getSession() {
      if (!window.TARBIYAH_BACKEND_READY) return { configured: false, session: null };
      const { data, error } = await backend().auth.getSession();
      if (error) throw error;
      return { configured: true, session: data.session };
    },
    async signIn(email, password) {
      const { data, error } = await backend().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      return data;
    },
    async signUp(fullName, email, password) {
      const redirectTo = new URL("./tarbiyah.html", window.location.href).href;
      const { data, error } = await backend().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim(), display_name: fullName.trim() },
          emailRedirectTo: redirectTo
        }
      });
      if (error) throw error;
      return data;
    },
    async resetPassword(email) {
      const redirectTo = new URL("./login-register.html?mode=recovery", window.location.href).href;
      const { data, error } = await backend().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      return data;
    },
    async updatePassword(password) {
      const { data, error } = await backend().auth.updateUser({ password });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const { error } = await backend().auth.signOut();
      if (error) throw error;
    }
  };
})();
