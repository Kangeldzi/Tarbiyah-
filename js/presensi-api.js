
/**
 * ============================================================
 * TARBIYAH — PRESENSI API
 * File   : js/presensi-api.js
 * Versi  : 1.0.0
 *
 * Fungsi:
 * - Menghubungkan modul presensi dengan Supabase
 * - Membaca agenda kajian
 * - Memeriksa role pengguna
 * - Verifikasi QR anggota
 * - Presensi manual oleh Admin / Super Admin
 * - Membaca riwayat presensi
 *
 * Keamanan:
 * - Tidak menyimpan token QR ke localStorage.
 * - Tidak mencatat token QR ke console.
 * - Verifikasi dan otorisasi akhir dilakukan backend.
 * - Mengikuti kebijakan RLS Supabase.
 * ============================================================
 */

(function (window) {
  "use strict";

  // Hindari inisialisasi ganda.
  if (window.TARBIYAH_PRESENSI_API) {
    console.info("[TARBIYAH PRESENSI] API sudah aktif.");
    return;
  }

  const VERSION = "1.0.0";

  const EDGE_FUNCTIONS = {
    verifyQR: "member-qr-verify",
    manualAttendance: "member-attendance-manual"
  };

  const ALLOWED_ROLES = [
    "admin",
    "super_admin"
  ];

  /* ==========================================================
     1. PEMERIKSAAN BACKEND
  ========================================================== */

  function getSupabase() {
    if (
      !window.TARBIYAH_BACKEND_READY ||
      !window.tarbiyahSupabase
    ) {
      throw new Error(
        "Koneksi Supabase belum siap. Periksa js/config.js dan js/supabase-client.js."
      );
    }

    return window.tarbiyahSupabase;
  }

  async function getCurrentUser() {
    const auth = window.TARBIYAH_AUTH;

    if (!auth || typeof auth.getSession !== "function") {
      throw new Error(
        "Modul autentikasi TARBIYAH belum tersedia."
      );
    }

    const result = await auth.getSession();

    if (!result.configured || !result.session?.user) {
      throw new Error(
        "Sesi pengguna tidak ditemukan. Silakan masuk kembali."
      );
    }

    return result.session.user;
  }

  /* ==========================================================
     2. UTILITAS
  ========================================================== */

  function normalizeError(error, fallback) {
    if (!error) {
      return new Error(fallback || "Terjadi kesalahan.");
    }

    const message =
      error.message ||
      error.msg ||
      error.error_description ||
      fallback ||
      "Terjadi kesalahan.";

    return new Error(String(message));
  }

  function isUUID(value) {
    return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function cleanText(value) {
    return typeof value === "string"
      ? value.trim()
      : "";
  }

  function unwrapFunctionData(data) {
    // Mendukung respons Edge Function langsung
    // maupun respons yang dibungkus dalam properti data.
    if (
      data &&
      typeof data === "object" &&
      data.data &&
      typeof data.data === "object" &&
      !("success" in data) &&
      !("code" in data)
    ) {
      return data.data;
    }

    return data;
  }

  /* ==========================================================
     3. PEMERIKSAAN ROLE PENGGUNA
  ========================================================== */

  async function getCurrentRoles() {
    const supabase = getSupabase();
    const user = await getCurrentUser();

    const { data, error } = await supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", user.id);

    if (error) {
      throw normalizeError(
        error,
        "Tidak dapat memeriksa hak akses pengguna."
      );
    }

    const roles = (data || [])
      .map(item => {
        const roleData = item.roles;

        if (Array.isArray(roleData)) {
          return roleData[0]?.name;
        }

        return roleData?.name;
      })
      .filter(Boolean)
      .map(role => String(role).toLowerCase());

    return [...new Set(roles)];
  }

  async function isAttendanceAdmin() {
    const roles = await getCurrentRoles();

    return roles.some(role =>
      ALLOWED_ROLES.includes(role)
    );
  }

  /* ==========================================================
     4. MENGAMBIL AGENDA KAJIAN
  ========================================================== */

  async function getAgendas(options) {
    const supabase = getSupabase();

    const settings = options || {};

    const includeCompleted =
      settings.includeCompleted !== false;

    let query = supabase
      .from("kajian_agenda")
      .select(`
        id,
        title,
        description,
        speaker_name,
        starts_at,
        ends_at,
        location_name,
        location_address,
        latitude,
        longitude,
        status
      `)
      .eq("status", "published")
      .order("starts_at", {
        ascending: false
      });

    if (includeCompleted) {
      query = supabase
        .from("kajian_agenda")
        .select(`
          id,
          title,
          description,
          speaker_name,
          starts_at,
          ends_at,
          location_name,
          location_address,
          latitude,
          longitude,
          status
        `)
        .in("status", [
          "published",
          "completed"
        ])
        .order("starts_at", {
          ascending: false
        });
    }

    const { data, error } = await query;

    if (error) {
      throw normalizeError(
        error,
        "Gagal mengambil agenda kajian."
      );
    }

    return data || [];
  }

  /* ==========================================================
     5. VERIFIKASI QR ANGGOTA
  ========================================================== */

  async function verifyMemberQR(token, agendaId) {
    const supabase = getSupabase();

    await getCurrentUser();

    const qrToken = cleanText(token);

    if (!qrToken || qrToken.length > 1024) {
      throw new Error(
        "Token QR tidak valid atau kosong."
      );
    }

    if (!isUUID(agendaId)) {
      throw new Error(
        "Agenda kajian belum dipilih atau ID agenda tidak valid."
      );
    }

    const { data, error } = await supabase.functions.invoke(
      EDGE_FUNCTIONS.verifyQR,
      {
        body: {
          token: qrToken,
          agenda_id: agendaId
        }
      }
    );

    if (error) {
      throw normalizeError(
        error,
        "Verifikasi QR gagal. Periksa koneksi internet."
      );
    }

    const result = unwrapFunctionData(data);

    if (!result || typeof result !== "object") {
      throw new Error(
        "Backend memberikan respons yang tidak dikenali."
      );
    }

    return result;
  }

  /* ==========================================================
     6. PRESENSI MANUAL
  ========================================================== */

  async function submitManualAttendance(payload) {
    const supabase = getSupabase();

    await getCurrentUser();

    if (!payload || typeof payload !== "object") {
      throw new Error(
        "Data presensi manual tidak lengkap."
      );
    }

    const agendaId = cleanText(payload.agenda_id);
    const memberId = cleanText(payload.member_id);
    const attendedAt = cleanText(payload.attended_at);
    const reason = cleanText(payload.manual_reason);

    if (!isUUID(agendaId)) {
      throw new Error(
        "Agenda kajian tidak valid."
      );
    }

    if (!isUUID(memberId)) {
      throw new Error(
        "Anggota yang dipilih tidak valid."
      );
    }

    if (!attendedAt || Number.isNaN(Date.parse(attendedAt))) {
      throw new Error(
        "Waktu kehadiran tidak valid."
      );
    }

    if (!reason) {
      throw new Error(
        "Alasan presensi manual wajib diisi."
      );
    }

    if (reason.length > 1000) {
      throw new Error(
        "Alasan presensi maksimal 1000 karakter."
      );
    }

    const { data, error } = await supabase.functions.invoke(
      EDGE_FUNCTIONS.manualAttendance,
      {
        body: {
          agenda_id: agendaId,
          member_id: memberId,
          attended_at: attendedAt,
          manual_reason: reason
        }
      }
    );

    if (error) {
      throw normalizeError(
        error,
        "Presensi manual gagal dikirim."
      );
    }

    const result = unwrapFunctionData(data);

    if (!result || typeof result !== "object") {
      throw new Error(
        "Respons presensi manual tidak dikenali."
      );
    }

    return result;
  }

  /* ==========================================================
     7. RIWAYAT PRESENSI
  ========================================================== */

  async function getAttendanceHistory(options) {
    const supabase = getSupabase();

    await getCurrentUser();

    const settings = options || {};

    const limit = Math.min(
      Math.max(Number(settings.limit) || 100, 1),
      500
    );

    let query = supabase
      .from("kajian_attendance")
      .select(`
        id,
        agenda_id,
        member_id,
        token_id,
        scanned_by,
        attended_at,
        created_at,
        attendance_method,
        manual_reason
      `)
      .order("attended_at", {
        ascending: false
      })
      .limit(limit);

    if (settings.memberId) {
      if (!isUUID(settings.memberId)) {
        throw new Error(
          "ID anggota untuk riwayat tidak valid."
        );
      }

      query = query.eq(
        "member_id",
        settings.memberId
      );
    }

    const { data, error } = await query;

    if (error) {
      throw normalizeError(
        error,
        "Gagal mengambil riwayat presensi."
      );
    }

    const records = data || [];

    if (records.length === 0) {
      return [];
    }

    // Ambil informasi agenda secara terpisah.
    // Tidak mengasumsikan struktur relasi JOIN tertentu.

    const agendaIds = [
      ...new Set(records.map(item => item.agenda_id))
    ];

    const { data: agendas, error: agendaError } =
      await supabase
        .from("kajian_agenda")
        .select(`
          id,
          title,
          starts_at,
          ends_at,
          location_name
        `)
        .in("id", agendaIds);

    if (agendaError) {
      throw normalizeError(
        agendaError,
        "Gagal membaca informasi agenda presensi."
      );
    }

    const agendaMap = new Map(
      (agendas || []).map(item => [
        item.id,
        item
      ])
    );

    return records.map(record => ({
      ...record,
      agenda: agendaMap.get(record.agenda_id) || null
    }));
  }

  /* ==========================================================
     8. RINGKASAN PRESENSI
  ========================================================== */

  async function getAttendanceSummary(options) {
    const records = await getAttendanceHistory({
      ...(options || {}),
      limit: 500
    });

    const now = new Date();

    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyRecords = records.filter(record => {
      const date = new Date(record.attended_at);

      return (
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    });

    const qrCount = records.filter(
      item => item.attendance_method === "qr"
    ).length;

    const manualCount = records.filter(
      item => item.attendance_method === "manual"
    ).length;

    return {
      total: records.length,
      monthly: monthlyRecords.length,
      qr: qrCount,
      manual: manualCount,
      records
    };
  }

  /* ==========================================================
     9. API PUBLIK
  ========================================================== */

  const API = Object.freeze({
    version: VERSION,

    getCurrentUser,
    getCurrentRoles,
    isAttendanceAdmin,

    getAgendas,

    verifyMemberQR,
    submitManualAttendance,

    getAttendanceHistory,
    getAttendanceSummary
  });

  window.TARBIYAH_PRESENSI_API = API;

  console.info(
    `[TARBIYAH PRESENSI] API aktif — v${VERSION}`
  );

})(window);
