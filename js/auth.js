window.TARBIYAH_AUTH = {
  async getSession() {
    if (!window.TARBIYAH_BACKEND_READY) return { configured: false, session: null };
    const { data, error } = await window.tarbiyahSupabase.auth.getSession();
    if (error) throw error;
    return { configured: true, session: data.session };
  },
  async signOut() {
    if (!window.TARBIYAH_BACKEND_READY) throw new Error("Layanan akun belum dikonfigurasi.");
    const { error } = await window.tarbiyahSupabase.auth.signOut();
    if (error) throw error;
  }
};
