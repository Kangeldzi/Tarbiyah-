
/* =========================================================
   TARBIYAH — PRESENSI MENTOR
   Versi 1.0.0
   Menggunakan kajian_agenda dan kajian_attendance
========================================================= */
(() => {
  "use strict";

  if (window.__TARBIYAH_PRESENSI_MENTOR_V1__) return;
  window.__TARBIYAH_PRESENSI_MENTOR_V1__ = true;

  const $ = id => document.getElementById(id);
  const supabase = window.tarbiyahSupabase;

  const state = {
    user: null,
    role: null,
    members: [],
    agendas: [],
    attendance: [],
    selectedAgendaId: "",
    loading: false,
    saving: new Set()
  };

  const STATUS_LABELS = {
    hadir: "Hadir",
    izin: "Izin",
    sakit: "Sakit",
    alpa: "Alpa"
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function notify(message, type = "success") {
    const box = $("pageMessage");
    box.textContent = message;
    box.className = `message show ${type}`;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      box.className = "message";
    }, 5000);
  }

  function formatDate(value, withTime = true) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function getMemberName(member) {
    return member.profile?.full_name || "Anggota TARBIYAH";
  }

  async function initialize() {
    try {
      if (!supabase) {
        throw new Error("Koneksi Supabase belum tersedia.");
      }

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData?.user) {
        location.replace("./login-register.html");
        return;
      }

      state.user = authData.user;

      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role_id, roles(name)")
        .eq("user_id", state.user.id);

      if (roleError) throw roleError;

      const roles = (roleRows || [])
        .map(row => {
          const relation = Array.isArray(row.roles)
            ? row.roles[0]
            : row.roles;
          return relation?.name;
        })
        .filter(Boolean);

      state.role = roles.includes("super_admin")
        ? "super_admin"
        : roles.includes("admin")
          ? "admin"
          : roles.includes("mentor")
            ? "mentor"
            : null;

      if (!state.role) {
        throw new Error("Menu ini hanya dapat diakses Mentor, Admin, dan Super Admin.");
      }

      document.body.classList.remove("auth-pending");

      bindEvents();
      await loadMembers();
      await loadAgendas();

    } catch (error) {
      console.error("[TARBIYAH PRESENSI MENTOR]", error);
      notify(error.message || "Gagal membuka halaman Presensi.", "error");
      $("memberList").innerHTML =
        '<div class="empty">Data belum dapat dimuat. Periksa koneksi atau hak akses akun.</div>';
    }
  }

  async function loadMembers() {
    let query = supabase
      .from("mentor_assignments")
      .select("id, mentor_user_id, member_id")
      .eq("is_active", true);

    if (state.role === "mentor") {
      query = query.eq("mentor_user_id", state.user.id);
    }

    const { data: assignments, error } = await query;
    if (error) throw error;

    const memberIds = [...new Set(
      (assignments || []).map(row => row.member_id).filter(Boolean)
    )];

    if (!memberIds.length) {
      state.members = [];
      renderMembers();
      updateStats();
      return;
    }

    const { data: members, error: memberError } = await supabase
      .from("members")
      .select("id, user_id, member_number, membership_status")
      .in("id", memberIds);

    if (memberError) throw memberError;

    const userIds = [...new Set(
      (members || []).map(row => row.user_id).filter(Boolean)
    )];

    let profiles = [];

    if (userIds.length) {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", userIds);

      if (profileError) throw profileError;
      profiles = data || [];
    }

    const profileMap = new Map(profiles.map(row => [row.id, row]));

    state.members = (members || []).map(member => ({
      ...member,
      profile: profileMap.get(member.user_id) || {}
    }));

    state.members.sort((a, b) =>
      getMemberName(a).localeCompare(getMemberName(b), "id")
    );
  }

  async function loadAgendas() {
    const { data, error } = await supabase
      .from("kajian_agenda")
      .select("id, title, description, speaker_name, starts_at, ends_at, location_name, location_address, status")
      .eq("status", "published")
      .order("starts_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    state.agendas = data || [];
    renderAgendaOptions();

    if (!state.agendas.length) {
      $("memberList").innerHTML =
        '<div class="empty">Belum ada agenda kajian berstatus Published. Agenda harus diterbitkan oleh Admin terlebih dahulu.</div>';
      $("agendaInfo").hidden = true;
      return;
    }

    const firstAgenda = state.agendas[0];
    $("agendaSelect").value = firstAgenda.id;
    await selectAgenda(firstAgenda.id);
  }

  function renderAgendaOptions() {
    const select = $("agendaSelect");

    if (!state.agendas.length) {
      select.innerHTML = '<option value="">Belum ada agenda kajian</option>';
      select.disabled = true;
      return;
    }

    select.disabled = false;
    select.innerHTML =
      '<option value="">Pilih agenda kajian</option>' +
      state.agendas.map(agenda => {
        const label = `${agenda.title} — ${formatDate(agenda.starts_at)}`;
        return `<option value="${escapeHTML(agenda.id)}">${escapeHTML(label)}</option>`;
      }).join("");
  }

  function renderAgendaInfo(agenda) {
    const info = $("agendaInfo");

    if (!agenda) {
      info.hidden = true;
      info.textContent = "";
      return;
    }

    const location = agenda.location_name ||
      agenda.location_address || "Lokasi belum ditentukan";

    info.innerHTML = `
      <strong>${escapeHTML(agenda.title)}</strong><br>
      📅 ${escapeHTML(formatDate(agenda.starts_at))}<br>
      🕒 Selesai: ${escapeHTML(formatDate(agenda.ends_at))}<br>
      📍 ${escapeHTML(location)}
      ${agenda.speaker_name
        ? `<br>🎙️ Pemateri: ${escapeHTML(agenda.speaker_name)}`
        : ""}
    `;

    info.hidden = false;
  }

  async function selectAgenda(agendaId) {
    state.selectedAgendaId = agendaId;
    const agenda = state.agendas.find(item => item.id === agendaId);
    renderAgendaInfo(agenda);

    if (!agenda) {
      state.attendance = [];
      renderMembers();
      updateStats();
      return;
    }

    if (!state.members.length) {
      renderMembers();
      updateStats();
      return;
    }

    $("memberList").innerHTML =
      '<div class="empty">Memuat data kehadiran...</div>';

    const memberIds = state.members.map(member => member.id);

    const { data, error } = await supabase
      .from("kajian_attendance")
      .select("id, agenda_id, member_id, token_id, scanned_by, attended_at, attendance_method, manual_reason, attendance_status")
      .eq("agenda_id", agendaId)
      .in("member_id", memberIds);

    if (error) throw error;

    state.attendance = data || [];
    renderMembers();
    updateStats();
  }

  function getAttendance(memberId) {
    return state.attendance.find(row => row.member_id === memberId) || null;
  }

  function renderMembers() {
    const list = $("memberList");

    if (!state.members.length) {
      list.innerHTML =
        '<div class="empty">Belum ada anggota binaan aktif yang ditugaskan kepada akun ini.</div>';
      return;
    }

    if (!state.selectedAgendaId) {
      list.innerHTML =
        '<div class="empty">Pilih agenda kajian untuk menampilkan daftar presensi.</div>';
      return;
    }

    list.innerHTML = state.members.map(member => {
      const record = getAttendance(member.id);
      const isQR = record?.attendance_method === "qr" || Boolean(record?.token_id);
      const isLocked = isQR;
      const status = record?.attendance_status || "hadir";
      const badge = !record
        ? '<span class="record-badge locked">Belum diabsen</span>'
        : isQR
          ? '<span class="record-badge qr">Presensi QR</span>'
          : '<span class="record-badge">Presensi Manual</span>';

      const note = record?.manual_reason || "";

      return `
        <article class="member-card" data-member-card="${escapeHTML(member.id)}">
          <div class="member-name">${escapeHTML(getMemberName(member))}</div>
          <div class="member-number">
            Nomor Anggota: ${escapeHTML(member.member_number || "Belum tersedia")}
          </div>

          ${badge}

          <label class="field">
            <span>Status Kehadiran</span>
            <select data-status="${escapeHTML(member.id)}" ${isLocked ? "disabled" : ""}>
              ${Object.entries(STATUS_LABELS).map(([value, label]) =>
                `<option value="${value}" ${status === value ? "selected" : ""}>${label}</option>`
              ).join("")}
            </select>
          </label>

          <label class="field">
            <span>Keterangan Presensi Manual (wajib)</span>
            <textarea
              data-reason="${escapeHTML(member.id)}"
              maxlength="1000"
              placeholder="Contoh: Presensi manual oleh Mentor."
              ${isLocked ? "disabled" : ""}
            >${escapeHTML(note)}</textarea>
          </label>

          <div class="member-actions">
            <button
              type="button"
              class="btn btn-save"
              data-save-attendance="${escapeHTML(member.id)}"
              ${isLocked ? "disabled" : ""}
            >Simpan Presensi</button>
            ${record?.attended_at
              ? `<span class="locked-note">Tercatat: ${escapeHTML(formatDate(record.attended_at))}</span>`
              : ""}
          </div>

          ${isLocked
            ? '<div class="locked-note">Presensi ini berasal dari QR dan dikunci agar catatan QR tidak diubah melalui presensi manual.</div>'
            : ""}
        </article>
      `;
    }).join("");
  }

  function updateStats() {
    const total = state.members.length;
    let present = 0;
    let excused = 0;
    let pending = 0;

    state.members.forEach(member => {
      const record = getAttendance(member.id);
      const status = record?.attendance_status;

      if (!record) pending++;
      else if (status === "hadir") present++;
      else if (status === "izin" || status === "sakit") excused++;
    });

    $("statMembers").textContent = total;
    $("statPresent").textContent = present;
    $("statExcused").textContent = excused;
    $("statPending").textContent = pending;
  }

  async function saveAttendance(memberId, button) {
    if (!state.selectedAgendaId) {
      notify("Pilih agenda kajian terlebih dahulu.", "error");
      return;
    }

    if (state.saving.has(memberId)) return;

    const record = getAttendance(memberId);

    if (record && (
      record.attendance_method === "qr" ||
      record.token_id
    )) {
      notify("Catatan presensi QR tidak dapat diubah melalui menu manual.", "error");
      return;
    }

    const statusElement = document.querySelector(
      `[data-status="${CSS.escape(memberId)}"]`
    );
    const reasonElement = document.querySelector(
      `[data-reason="${CSS.escape(memberId)}"]`
    );

    const attendanceStatus = statusElement?.value;
    const manualReason = reasonElement?.value.trim();

    if (!["hadir", "izin", "sakit", "alpa"].includes(attendanceStatus)) {
      notify("Pilih status kehadiran yang valid.", "error");
      return;
    }

    if (!manualReason) {
      notify("Keterangan presensi manual wajib diisi.", "error");
      reasonElement?.focus();
      return;
    }

    state.saving.add(memberId);
    if (button) button.disabled = true;

    try {
      let result;

      if (record) {
        result = await supabase
          .from("kajian_attendance")
          .update({
            attendance_status: attendanceStatus,
            manual_reason: manualReason
          })
          .eq("id", record.id)
          .eq("member_id", memberId)
          .select("id")
          .maybeSingle();
      } else {
        result = await supabase
          .from("kajian_attendance")
          .insert({
            agenda_id: state.selectedAgendaId,
            member_id: memberId,
            scanned_by: state.user.id,
            token_id: null,
            attendance_method: "manual",
            manual_reason: manualReason,
            attendance_status: attendanceStatus
          })
          .select("id")
          .single();
      }

      if (result.error) throw result.error;

      if (!result.data?.id) {
        throw new Error("Data tidak tersimpan. Periksa hak akses Mentor pada anggota ini.");
      }

      await selectAgenda(state.selectedAgendaId);
      notify(`Presensi ${getMemberName(
        state.members.find(member => member.id === memberId)
      )} berhasil disimpan.`);

    } catch (error) {
      console.error("[SIMPAN PRESENSI]", error);
      notify(error.message || "Gagal menyimpan presensi.", "error");
    } finally {
      state.saving.delete(memberId);
      if (button) button.disabled = false;
    }
  }

  function bindEvents() {
    $("agendaSelect").addEventListener("change", async event => {
      try {
        await selectAgenda(event.target.value);
      } catch (error) {
        console.error("[PILIH AGENDA]", error);
        notify(error.message || "Gagal memuat presensi agenda.", "error");
      }
    });

    $("memberList").addEventListener("click", event => {
      const button = event.target.closest("[data-save-attendance]");
      if (!button) return;

      saveAttendance(button.dataset.saveAttendance, button);
    });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
