(() => {
  const cfg = window.TARBIYAH_CONFIG;
  const url = String(cfg?.SUPABASE_URL || "").trim();
  const key = String(cfg?.SUPABASE_ANON_KEY || "").trim();
  const validUrl = /^https:\/\/[^\s/]+\.supabase\.co\/?$/i.test(url);
  const validKey = key && !/^GANTI_/i.test(key) && !/service_role|secret/i.test(key);

  window.tarbiyahSupabase = null;
  window.TARBIYAH_BACKEND_READY = false;
  if (!window.supabase?.createClient || !validUrl || !validKey) {
    console.warn("[TARBIYAH] Supabase belum siap. Periksa js/config.js dan pemuatan Supabase JS.");
    return;
  }
  try {
    window.tarbiyahSupabase = window.supabase.createClient(url.replace(/\/$/, ""), key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.TARBIYAH_BACKEND_READY = true;
  } catch (error) {
    console.error("[TARBIYAH] Client Supabase gagal dibuat:", error);
  }
})();
