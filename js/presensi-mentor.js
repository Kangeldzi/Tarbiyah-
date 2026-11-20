/* ============================================================
   TARBIYAH — PRESENSI ANGGOTA BINAAN
   File    : js/presensi-mentor.js
   Versi   : 2.0.0 FINAL

   Fitur:
   - Pemeriksaan sesi login dan role pengguna
   - Mentor hanya melihat anggota binaannya sendiri
   - Admin dan Super Admin dapat melihat anggota sesuai RLS
   - Memuat agenda kajian yang sudah dipublikasikan
   - Menampilkan data presensi anggota
   - Input presensi manual: hadir, izin, sakit, alpa
   - Mengubah catatan presensi manual
   - Mengunci catatan presensi QR
   - Statistik presensi sesuai agenda yang dipilih

   Tabel:
   - user_roles
   - mentor_assignments
   - members
   - profiles
   - kajian_agenda
   - kajian_attendance

   Supabase client:
   window.tarbiyahSupabase

   Zona waktu tampilan:
   Asia/Jakarta

   Tidak mengubah:
   - Struktur database
   - RLS
   - Role pengguna
   - Penugasan Mentor
============================================================ */

(() => {
  "use strict";

  /* ==========================================================
     01. PENCEGAHAN INISIALISASI GANDA
  ========================================================== */

  if (window.__TARBIYAH_PRESENSI_MENTOR_V2__) {
    console.info(
      "[TARBIYAH PRESENSI MENTOR] Sudah diinisialisasi."
    );
    return;
  }

  window.__TARBIYAH_PRESENSI_MENTOR_V2__ = true;


  /* ==========================================================
     02. KONFIGURASI
  ========================================================== */

  const CONFIG = {
    timezone: "Asia/Jakarta",

    roleTable: "user_roles",

    assignmentTable: "mentor_assignments",

    memberTable: "members",

    profileTable: "profiles",

    agendaTable: "kajian_agenda",

    attendanceTable: "kajian_attendance",

    allowedRoles: [
      "super_admin",
      "admin",
      "mentor"
    ],

    attendanceStatuses: [
      "hadir",
      "izin",
      "sakit",
      "alpa"
    ]
  };


  /* ==========================================================
     03. STATE
  ========================================================== */

  const state = {
    supabase: null,

    user: null,

    roles: [],

    primaryRole: null,

    assignments: [],

    members: [],

    agendas: [],

    attendance: [],

    selectedAgendaId: null,

    isLoading: false,

    savingMembers: new Set()
  };


  /* ==========================================================
     04. HELPER ELEMENT HTML
  ========================================================== */

  const $ = (selector, root = document) => {
    return root.querySelector(selector);
  };

  const byId = id => {
    return document.getElementById(id);
  };

  function getElement(...selectors) {
    for (const selector of selectors) {
      const element = selector.startsWith("#")
        ? document.getElementById(selector.slice(1))
        : document.querySelector(selector);

      if (element) return element;
    }

    return null;
  }


  /* ==========================================================
     05. HELPER TEKS DAN HTML
  ========================================================== */

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }


  function normalizeRole(role) {
    return String(role ?? "")
      .trim()
      .toLowerCase()
      .replaceAll("-", "_")
      .replaceAll(" ", "_");
  }


  function getRoleName(roleRow) {
    const relation = roleRow?.roles;

    if (Array.isArray(relation)) {
      return normalizeRole(relation[0]?.name);
    }

    return normalizeRole(relation?.name);
  }


  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: CONFIG.timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }


  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: CONFIG.timezone,
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }


  function getInitial(name) {
    const text = String(name || "").trim();

    if (!text) return "A";

    return text
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }


  /* ==========================================================
     06. NOTIFIKASI
  ========================================================== */

  function notify(message, type = "info") {
    if (typeof window.TARBIYAH_NOTIFY === "function") {
      window.TARBIYAH_NOTIFY(message, type);
      return;
    }

    const region =
      getElement(
        "#toastRegion",
        "#toastContainer",
        "[data-toast-region]"
      );

    if (region) {
      const item = document.createElement("div");

      item.className = "toast";
      item.dataset.type = type;
      item.setAttribute("role", "status");
      item.textContent = String(message);

      region.appendChild(item);

      window.setTimeout(() => {
        item.remove();
      }, 4000);

      return;
    }

    console.info("[TARBIYAH]", message);
  }


  /* ==========================================================
     07. PESAN HALAMAN
  ========================================================== */

  function setPageMessage(message, type = "info") {
    const element = getElement(
      "#pageMessage",
      "[data-page-message]"
    );

    if (!element) return;

    element.textContent = message;

    element.className = "page-message";
    element.dataset.type = type;

    element.hidden = !message;
  }


  function clearPageMessage() {
    const element = getElement(
      "#pageMessage",
      "[data-page-message]"
    );

    if (!element) return;

    element.textContent = "";
    element.hidden = true;
  }


  /* ==========================================================
     08. VALIDASI SUPABASE
  ========================================================== */

  function getSupabaseClient() {
    return (
      window.tarbiyahSupabase ||
      window.supabaseClient ||
      window.TARBIYAH_SUPABASE ||
      null
    );
  }


  function validateSupabase() {
    state.supabase = getSupabaseClient();

    if (!state.supabase) {
      throw new Error(
        "Koneksi Supabase belum tersedia. Periksa js/supabase-client.js."
      );
    }

    if (
      !state.supabase.auth ||
      typeof state.supabase.from !== "function"
    ) {
      throw new Error(
        "Supabase client belum siap digunakan."
      );
    }

    return state.supabase;
  }


  /* ==========================================================
     09. PEMERIKSAAN LOGIN
  ========================================================== */

  async function loadCurrentUser() {
    const supabase = validateSupabase();

    const {
      data,
      error
    } = await supabase.auth.getSession();

    if (error) throw error;

    const session = data?.session;

    if (!session?.user) {
      window.location.replace("./login-register.html");
      return false;
    }

    state.user = session.user;

    return true;
  }


  /* ==========================================================
     10. PEMERIKSAAN ROLE
  ========================================================== */

  async function loadUserRoles() {
    const supabase = state.supabase;

    const {
      data,
      error
    } = await supabase
      .from(CONFIG.roleTable)
      .select("role_id, roles(name)")
      .eq("user_id", state.user.id);

    if (error) throw error;

    state.roles = (data || [])
      .map(getRoleName)
      .filter(Boolean);

    state.primaryRole =
      state.roles.includes("super_admin")
        ? "super_admin"
        : state.roles.includes("admin")
          ? "admin"
          : state.roles.includes("mentor")
            ? "mentor"
            : null;

    const hasPermission = state.roles.some(role =>
      CONFIG.allowedRoles.includes(role)
    );

    if (!hasPermission) {
      throw new Error(
        "Akses ditolak. Halaman ini hanya dapat digunakan oleh Mentor, Admin, atau Super Admin."
      );
    }

    return true;
  }


  /* ==========================================================
     11. MEMUAT PENUGASAN MENTOR
  ========================================================== */

async function loadAssignments() {
  const supabase = state.supabase;

  let query = supabase
    .from(CONFIG.assignmentTable)
    .select(`
      id,
      mentor_user_id,
      member_id,
      is_active,
      notes
    `)
    .eq("is_active", true);

  // Mentor hanya melihat anggota binaannya sendiri.
  if (state.primaryRole === "mentor") {
    query = query.eq(
      "mentor_user_id",
      state.user.id
    );
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    console.error(
      "[PRESENSI BINAAN] Gagal memuat penugasan:",
      error
    );

    throw error;
  }

  state.assignments = data || [];

  console.info(
    "[PRESENSI BINAAN] Penugasan berhasil dimuat:",
    state.assignments.length
  );

  return state.assignments;
}


  /* ==========================================================
     12. MEMUAT DATA ANGGOTA BINAAN
  ========================================================== */

  async function loadMembers() {
    const supabase = state.supabase;

    const memberIds = [
      ...new Set(
        state.assignments
          .map(item => item.member_id)
          .filter(Boolean)
      )
    ];

    state.members = [];

    if (!memberIds.length) {
      return [];
    }

    const {
      data: memberRows,
      error: memberError
    } = await supabase
      .from(CONFIG.memberTable)
      .select(
        "id, user_id, member_number, membership_status"
      )
      .in("id", memberIds);

    if (memberError) throw memberError;

    const members = memberRows || [];

    const userIds = [
      ...new Set(
        members
          .map(member => member.user_id)
          .filter(Boolean)
      )
    ];

    let profileRows = [];

    if (userIds.length) {
      const {
        data,
        error
      } = await supabase
        .from(CONFIG.profileTable)
        .select(
          "id, full_name, username"
        )
        .in("id", userIds);

      if (error) throw error;

      profileRows = data || [];
    }

    const profileMap = new Map(
      profileRows.map(profile => [
        profile.id,
        profile
      ])
    );

    state.members = members.map(member => {
      const profile = profileMap.get(member.user_id);

      return {
        id: member.id,

        user_id: member.user_id,

        member_number:
          member.member_number || "",

        membership_status:
          member.membership_status || "",

        full_name:
          profile?.full_name ||
          profile?.username ||
          "Anggota TARBIYAH",

        username:
          profile?.username || ""
      };
    });

    state.members.sort((a, b) =>
      a.full_name.localeCompare(
        b.full_name,
        "id"
      )
    );

    return state.members;
  }


  /* ==========================================================
     13. MEMUAT AGENDA KAJIAN
  ========================================================== */

  async function loadAgendas() {
    const supabase = state.supabase;

    const {
      data,
      error
    } = await supabase
      .from(CONFIG.agendaTable)
      .select(
        "id, title, description, speaker_name, starts_at, ends_at, location_name, location_address, status"
      )
      .eq("status", "published")
      .order("starts_at", {
        ascending: false
      })
      .limit(100);

    if (error) throw error;

    state.agendas = data || [];

    return state.agendas;
  }


  /* ==========================================================
     14. MENAMPILKAN PILIHAN AGENDA
  ========================================================== */

  function renderAgendaOptions() {
    const select = getElement(
      "#agendaSelect",
      "[data-agenda-select]"
    );

    if (!select) {
      throw new Error(
        "Elemen agendaSelect tidak ditemukan pada presensi-mentor.html."
      );
    }

    const previousValue = state.selectedAgendaId;

    select.replaceChildren();

    const defaultOption = document.createElement("option");

    defaultOption.value = "";
    defaultOption.textContent = state.agendas.length
      ? "Pilih agenda kajian"
      : "Belum ada agenda yang dipublikasikan";

    select.appendChild(defaultOption);

    state.agendas.forEach(agenda => {
      const option = document.createElement("option");

      option.value = agenda.id;

      option.textContent =
        `${agenda.title || "Agenda Kajian"} — ${formatDate(agenda.starts_at)}`;

      select.appendChild(option);
    });

    const previousExists = state.agendas.some(
      agenda => agenda.id === previousValue
    );

    if (previousExists) {
      select.value = previousValue;
    } else if (state.agendas.length) {
      select.value = state.agendas[0].id;
    } else {
      select.value = "";
    }

    state.selectedAgendaId = select.value || null;

    select.disabled = state.agendas.length === 0;
  }


  /* ==========================================================
     15. INFORMASI AGENDA TERPILIH
  ========================================================== */

  function renderAgendaInfo() {
    const container = getElement(
      "#agendaInfo",
      "[data-agenda-info]"
    );

    if (!container) return;

    const agenda = state.agendas.find(
      item => item.id === state.selectedAgendaId
    );

    if (!agenda) {
      container.innerHTML = `
        <div class="agenda-info-empty">
          Belum ada agenda kajian yang dipilih.
        </div>
      `;

      return;
    }

    container.innerHTML = `
      <div class="agenda-info-card">

        <div class="agenda-info-title">
          ${escapeHTML(agenda.title || "Agenda Kajian")}
        </div>

        <div class="agenda-info-row">
          <span>📅</span>
          <span>${escapeHTML(formatDateTime(agenda.starts_at))}</span>
        </div>

        ${
          agenda.ends_at
            ? `
              <div class="agenda-info-row">
                <span>⏰</span>
                <span>Selesai: ${escapeHTML(formatDateTime(agenda.ends_at))}</span>
              </div>
            `
            : ""
        }

        ${
          agenda.speaker_name
            ? `
              <div class="agenda-info-row">
                <span>🎙️</span>
                <span>${escapeHTML(agenda.speaker_name)}</span>
              </div>
            `
            : ""
        }

        ${
          agenda.location_name
            ? `
              <div class="agenda-info-row">
                <span>📍</span>
                <span>${escapeHTML(agenda.location_name)}</span>
              </div>
            `
            : ""
        }

        ${
          agenda.description
            ? `
              <div class="agenda-info-description">
                ${escapeHTML(agenda.description)}
              </div>
            `
            : ""
        }

      </div>
    `;
  }


  /* ==========================================================
     16. MEMUAT DATA PRESENSI AGENDA
  ========================================================== */

  async function loadAttendance() {
    const supabase = state.supabase;

    state.attendance = [];

    if (
      !state.selectedAgendaId ||
      !state.members.length
    ) {
      return [];
    }

    const memberIds = state.members.map(
      member => member.id
    );

    const {
      data,
      error
    } = await supabase
      .from(CONFIG.attendanceTable)
      .select(
        "id, agenda_id, member_id, token_id, scanned_by, attended_at, attendance_method, manual_reason, attendance_status"
      )
      .eq("agenda_id", state.selectedAgendaId)
      .in("member_id", memberIds);

    if (error) throw error;

    state.attendance = data || [];

    return state.attendance;
  }


  /* ==========================================================
     17. MENCARI CATATAN PRESENSI ANGGOTA
  ========================================================== */

  function getAttendanceForMember(memberId) {
    return state.attendance.find(
      record => record.member_id === memberId
    ) || null;
  }


  /* ==========================================================
     18. STATUS PRESENSI
  ========================================================== */

  function getStatusLabel(status) {
    const labels = {
      hadir: "Hadir",
      izin: "Izin",
      sakit: "Sakit",
      alpa: "Alpa"
    };

    return labels[status] || "Belum diabsen";
  }


  function getStatusClass(status) {
    const classes = {
      hadir: "status-hadir",
      izin: "status-izin",
      sakit: "status-sakit",
      alpa: "status-alpa"
    };

    return classes[status] || "status-empty";
  }


  function getStatusOptions(selectedStatus) {
    return CONFIG.attendanceStatuses
      .map(status => `
        <option
          value="${status}"
          ${selectedStatus === status ? "selected" : ""}
        >
          ${getStatusLabel(status)}
        </option>
      `)
      .join("");
  }


  /* ==========================================================
     19. MENAMPILKAN KARTU ANGGOTA
  ========================================================== */

  function renderMemberCard(member) {
    const record = getAttendanceForMember(member.id);

    /*
      Catatan hanya dianggap dapat diedit jika:
      attendance_method = manual
      DAN token_id kosong.

      Catatan QR atau catatan lain dikunci.
    */

    const isManual =
      record?.attendance_method === "manual" &&
      !record?.token_id;

    const isLocked =
      Boolean(record) && !isManual;

    const status = record?.attendance_status || "";

    const badge = !record
      ? `
        <span class="record-badge locked">
          Belum diabsen
        </span>
      `
      : isManual
        ? `
          <span class="record-badge">
            Presensi Manual
          </span>
        `
        : `
          <span class="record-badge qr">
            Presensi Terkunci
          </span>
        `;

    const disabledAttribute = isLocked
      ? "disabled"
      : "";

    const reasonValue = record?.manual_reason || "";

    const attendedAt = record?.attended_at
      ? formatDateTime(record.attended_at)
      : "";

    return `
      <article
        class="mentor-member-card"
        data-member-id="${escapeHTML(member.id)}"
      >

        <div class="member-card-header">

          <div class="member-avatar">
            ${escapeHTML(getInitial(member.full_name))}
          </div>

          <div class="member-identity">

            <h3>
              ${escapeHTML(member.full_name)}
            </h3>

            <p>
              ${
                member.member_number
                  ? `No. Anggota: ${escapeHTML(member.member_number)}`
                  : "Anggota TARBIYAH"
              }
            </p>

            ${
              member.username
                ? `
                  <small>
                    @${escapeHTML(member.username)}
                  </small>
                `
                : ""
            }

          </div>

          <div class="member-record-badge">
            ${badge}
          </div>

        </div>


        <div class="member-attendance-form">

          <label class="attendance-field">

            <span>Status Kehadiran</span>

            <select
              class="attendance-status"
              ${disabledAttribute}
            >
              <option value="">
                Pilih status kehadiran
              </option>

              ${getStatusOptions(status)}

            </select>

          </label>


          <label class="attendance-field">

            <span>Keterangan / Alasan Presensi Manual</span>

            <textarea
              class="manual-reason"
              rows="2"
              maxlength="1000"
              placeholder="Contoh: Presensi manual oleh Mentor."
              ${disabledAttribute}
            >${escapeHTML(reasonValue)}</textarea>

          </label>


          ${
            isLocked
              ? `
                <div class="attendance-locked-message">
                  🔒 Catatan ini tidak dapat diubah melalui
                  Presensi Mentor karena bukan catatan presensi manual.
                </div>
              `
              : `
                <button
                  type="button"
                  class="btn-save-attendance"
                  data-save-attendance
                >
                  Simpan Presensi
                </button>
              `
          }


          ${
            attendedAt
              ? `
                <div class="attendance-time">
                  Terakhir tercatat: ${escapeHTML(attendedAt)}
                </div>
              `
              : ""
          }

        </div>

      </article>
    `;
  }


  /* ==========================================================
     20. MENAMPILKAN SELURUH ANGGOTA
  ========================================================== */

  function renderMembers() {
    const container = getElement(
      "#memberList",
      "[data-member-list]"
    );

    if (!container) {
      throw new Error(
        "Elemen memberList tidak ditemukan pada presensi-mentor.html."
      );
    }

    if (!state.selectedAgendaId) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <h3>Pilih Agenda Kajian</h3>
          <p>
            Silakan pilih agenda kajian untuk melihat
            daftar presensi anggota binaan.
          </p>
        </div>
      `;

      updateStatistics();

      return;
    }

    if (!state.members.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">♙</div>
          <h3>Belum Ada Anggota Binaan</h3>
          <p>
            Belum ada anggota yang ditugaskan
            kepada Mentor ini.
          </p>
        </div>
      `;

      updateStatistics();

      return;
    }

    container.innerHTML = state.members
      .map(renderMemberCard)
      .join("");

    updateStatistics();
  }


  /* ==========================================================
     21. STATISTIK PRESENSI
  ========================================================== */

  function updateStatisticElement(selectors, value) {
    const element = getElement(...selectors);

    if (element) {
      element.textContent = String(value);
    }
  }


  function updateStatistics() {
    const total = state.members.length;

    const counts = {
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0
    };

    state.attendance.forEach(record => {
      const status = record.attendance_status;

      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status]++;
      }
    });

    const recorded =
      counts.hadir +
      counts.izin +
      counts.sakit +
      counts.alpa;

    const percentage = total
      ? Math.round((counts.hadir / total) * 100)
      : 0;

    updateStatisticElement(
      ["#statTotal", "#totalMembers", "[data-stat-total]"],
      total
    );

    updateStatisticElement(
      ["#statHadir", "#totalHadir", "[data-stat-hadir]"],
      counts.hadir
    );

    updateStatisticElement(
      ["#statIzin", "#totalIzin", "[data-stat-izin]"],
      counts.izin
    );

    updateStatisticElement(
      ["#statSakit", "#totalSakit", "[data-stat-sakit]"],
      counts.sakit
    );

    updateStatisticElement(
      ["#statAlpa", "#totalAlpa", "[data-stat-alpa]"],
      counts.alpa
    );

    updateStatisticElement(
      ["#statBelum", "#totalBelum", "[data-stat-belum]"],
      Math.max(0, total - recorded)
    );

    updateStatisticElement(
      ["#statPersentase", "[data-stat-persentase]"],
      `${percentage}%`
    );
  }


  /* ==========================================================
     22. MENYIMPAN PRESENSI MANUAL
  ========================================================== */

  async function saveManualAttendance(memberId, card) {
    const supabase = state.supabase;

    if (!state.user?.id) {
      throw new Error(
        "Sesi pengguna tidak ditemukan. Silakan login kembali."
      );
    }

    if (!state.selectedAgendaId) {
      throw new Error(
        "Silakan pilih agenda kajian terlebih dahulu."
      );
    }

    const member = state.members.find(
      item => item.id === memberId
    );

    if (!member) {
      throw new Error(
        "Data anggota tidak ditemukan."
      );
    }

    const statusInput = $(".attendance-status", card);

    const reasonInput = $(".manual-reason", card);

    if (!statusInput || !reasonInput) {
      throw new Error(
        "Form presensi tidak ditemukan."
      );
    }

    const attendanceStatus = statusInput.value;

    const manualReason = reasonInput.value.trim();

    if (!CONFIG.attendanceStatuses.includes(attendanceStatus)) {
      throw new Error(
        "Silakan pilih status kehadiran yang valid."
      );
    }

    if (!manualReason) {
      throw new Error(
        "Keterangan atau alasan presensi manual wajib diisi."
      );
    }

    const existingRecord =
      getAttendanceForMember(memberId);

    /*
      Pengamanan tambahan:
      Catatan QR tidak boleh diperbarui melalui halaman ini.
    */

    if (
      existingRecord &&
      !(
        existingRecord.attendance_method === "manual" &&
        !existingRecord.token_id
      )
    ) {
      throw new Error(
        "Catatan presensi ini terkunci dan tidak dapat diubah melalui Presensi Mentor."
      );
    }

    if (existingRecord) {

      /*
        UPDATE:
        Hanya memperbarui dua kolom yang diizinkan
        oleh aturan keamanan Mentor.
      */

      const {
        error
      } = await supabase
        .from(CONFIG.attendanceTable)
        .update({
          attendance_status: attendanceStatus,
          manual_reason: manualReason
        })
        .eq("id", existingRecord.id)
        .eq("agenda_id", state.selectedAgendaId)
        .eq("member_id", memberId);

      if (error) throw error;

    } else {

      /*
        INSERT:
        Presensi baru selalu menggunakan metode manual.
        token_id harus NULL.
        manual_reason wajib terisi.
      */

      const {
        error
      } = await supabase
        .from(CONFIG.attendanceTable)
        .insert({
          agenda_id: state.selectedAgendaId,

          member_id: memberId,

          scanned_by: state.user.id,

          attended_at: new Date().toISOString(),

          token_id: null,

          attendance_method: "manual",

          manual_reason: manualReason,

          attendance_status: attendanceStatus
        });

      if (error) throw error;
    }

    return true;
  }


  /* ==========================================================
     23. EVENT SIMPAN PRESENSI
  ========================================================== */

  function setupAttendanceEvents() {
    const container = getElement(
      "#memberList",
      "[data-member-list]"
    );

    if (!container) return;

    if (container.dataset.eventsReady === "true") {
      return;
    }

    container.dataset.eventsReady = "true";

    container.addEventListener("click", async event => {
      const button = event.target.closest(
        "[data-save-attendance]"
      );

      if (!button) return;

      const card = button.closest(
        "[data-member-id]"
      );

      if (!card) return;

      const memberId = card.dataset.memberId;

      if (!memberId) return;

      if (state.savingMembers.has(memberId)) {
        return;
      }

      state.savingMembers.add(memberId);

      const originalText = button.textContent;

      button.disabled = true;
      button.textContent = "Menyimpan...";

      try {
        await saveManualAttendance(
          memberId,
          card
        );

        notify(
          "Presensi anggota berhasil disimpan.",
          "success"
        );

        /*
          Muat ulang catatan dari database
          setelah proses penyimpanan berhasil.
        */

        await loadAttendance();

        renderMembers();

      } catch (error) {
        console.error(
          "[TARBIYAH PRESENSI MENTOR] Gagal menyimpan:",
          error
        );

        notify(
          error?.message ||
          "Presensi gagal disimpan.",
          "error"
        );

        button.disabled = false;
        button.textContent = originalText;

      } finally {
        state.savingMembers.delete(memberId);
      }
    });
  }


  /* ==========================================================
     24. EVENT PERUBAHAN AGENDA
  ========================================================== */

  function setupAgendaEvents() {
    const select = getElement(
      "#agendaSelect",
      "[data-agenda-select]"
    );

    if (!select) return;

    if (select.dataset.eventsReady === "true") {
      return;
    }

    select.dataset.eventsReady = "true";

    select.addEventListener("change", async () => {
      state.selectedAgendaId = select.value || null;

      setPageMessage(
        "Memuat data presensi agenda...",
        "info"
      );

      try {
        renderAgendaInfo();

        await loadAttendance();

        renderMembers();

        clearPageMessage();

      } catch (error) {
        console.error(
          "[TARBIYAH PRESENSI MENTOR] Gagal mengganti agenda:",
          error
        );

        setPageMessage(
          error?.message ||
          "Gagal memuat data presensi agenda.",
          "error"
        );
      }
    });
  }


  /* ==========================================================
     25. MEMUAT ULANG DATA
  ========================================================== */

  async function refreshAttendance() {
    if (!state.selectedAgendaId) {
      return;
    }

    await loadAttendance();

    renderMembers();
  }


  /* ==========================================================
     26. TOMBOL REFRESH
  ========================================================== */

  function setupRefreshButton() {
    const button = getElement(
      "#btnRefreshAttendance",
      "#refreshAttendance",
      "[data-refresh-attendance]"
    );

    if (!button) return;

    if (button.dataset.eventsReady === "true") {
      return;
    }

    button.dataset.eventsReady = "true";

    button.addEventListener("click", async () => {
      const originalText = button.textContent;

      button.disabled = true;
      button.textContent = "Memuat...";

      try {
        await refreshAttendance();

        notify(
          "Data presensi berhasil diperbarui.",
          "success"
        );

      } catch (error) {
        console.error(error);

        notify(
          error?.message ||
          "Gagal memperbarui data presensi.",
          "error"
        );

      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  }


  /* ==========================================================
     27. TAMPILAN KETIKA TIDAK ADA AGENDA
  ========================================================== */

  function renderNoAgenda() {
    const container = getElement(
      "#memberList",
      "[data-member-list]"
    );

    if (container) {
      container.innerHTML = `
        <div class="empty-state">

          <div class="empty-state-icon">📅</div>

          <h3>Belum Ada Agenda Kajian</h3>

          <p>
            Belum ditemukan agenda kajian dengan status
            dipublikasikan. Admin perlu mempublikasikan
            agenda terlebih dahulu.
          </p>

        </div>
      `;
    }

    updateStatistics();
  }


  /* ==========================================================
     28. PROSES UTAMA
  ========================================================== */

  async function initialize() {
    if (state.isLoading) return;

    state.isLoading = true;

    setPageMessage(
      "Menghubungkan ke TARBIYAH...",
      "info"
    );

    try {

      /* A. Validasi sesi login */

      const loggedIn = await loadCurrentUser();

      if (!loggedIn) return;


      /* B. Validasi role */

      setPageMessage(
        "Memeriksa hak akses pengguna...",
        "info"
      );

      await loadUserRoles();


      /* C. Memuat penugasan Mentor */

      setPageMessage(
        "Memuat data anggota binaan...",
        "info"
      );

      await loadAssignments();


      /* D. Memuat anggota */

      await loadMembers();


      /* E. Memuat agenda kajian */

      setPageMessage(
        "Memuat agenda kajian...",
        "info"
      );

      await loadAgendas();


      /* F. Menampilkan agenda */

      renderAgendaOptions();

      renderAgendaInfo();


      /* G. Memuat presensi agenda terpilih */

      if (state.selectedAgendaId) {
        setPageMessage(
          "Memuat catatan presensi anggota...",
          "info"
        );

        await loadAttendance();

        renderMembers();

      } else {
        state.attendance = [];

        renderNoAgenda();
      }


      /* H. Menyiapkan event */

      setupAttendanceEvents();

      setupAgendaEvents();

      setupRefreshButton();


      /* I. Informasi halaman */

      clearPageMessage();

      console.info(
        "[TARBIYAH PRESENSI MENTOR] Berhasil diinisialisasi.",
        {
          role: state.roles,
          jumlahPenugasan: state.assignments.length,
          jumlahAnggota: state.members.length,
          jumlahAgenda: state.agendas.length,
          agendaTerpilih: state.selectedAgendaId
        }
      );

    } catch (error) {

      console.error(
        "[TARBIYAH PRESENSI MENTOR] Inisialisasi gagal:",
        error
      );

      setPageMessage(
        error?.message ||
        "Terjadi kesalahan saat memuat halaman Presensi Mentor.",
        "error"
      );

      notify(
        error?.message ||
        "Halaman Presensi Mentor gagal dimuat.",
        "error"
      );

    } finally {
      state.isLoading = false;
    }
  }


  /* ==========================================================
     29. EVENT KETIKA HALAMAN SIAP
  ========================================================== */

  function start() {
    initialize();
  }


  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }


  /* ==========================================================
     30. API INTERNAL UNTUK DEBUGGING
  ========================================================== */

  window.TARBIYAH_PRESENSI_MENTOR = {
    version: "2.0.0",

    refresh: refreshAttendance,

    getState() {
      return {
        roles: [...state.roles],

        jumlahPenugasan:
          state.assignments.length,

        jumlahAnggota:
          state.members.length,

        jumlahAgenda:
          state.agendas.length,

        agendaTerpilih:
          state.selectedAgendaId,

        jumlahPresensi:
          state.attendance.length
      };
    }
  };

})();
