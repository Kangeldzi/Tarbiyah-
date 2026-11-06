(() => {
  const cfg = window.TARBIYAH_CONFIG;
  const valid = cfg && /^https:\/\/.+\.supabase\.co$/.test(cfg.SUPABASE_URL) &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("GANTI_");
  if (!window.supabase || !valid) {
    window.tarbiyahSupabase = null;
    window.TARBIYAH_BACKEND_READY = false;
    console.warn("[TARBIYAH] Supabase belum dikonfigurasi. Lengkapi js/config.js.");
    return;
  }
  window.tarbiyahSupabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.TARBIYAH_BACKEND_READY = true;
})();
