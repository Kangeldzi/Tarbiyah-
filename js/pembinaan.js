
/* =========================================================
   TARBIYAH — PEMBINAAN MENTOR
   Versi 1.0.0
   Penyimpanan: Supabase public.mentor_guidance_notes
========================================================= */
(() => {
  "use strict";

  if (window.__TARBIYAH_PEMBINAAN_V1__) return;
  window.__TARBIYAH_PEMBINAAN_V1__ = true;

  const $ = id => document.getElementById(id);
  const supabase = window.tarbiyahSupabase;

  const state = {
    user: null,
    role: null,
    members: [],
    notes: [],
    saving: false
  };

  const statusLabels = {
    belum_dimulai: "Belum dimulai",
    berjalan: "Berjalan",
    selesai: "Selesai"
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
    const box = $("guidanceMessage");
    box.textContent = message;
    box.className = `guidance-message show ${type}`;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      box.className = "guidance-message";
    }, 4500);
  }

  function formatDate(value, withTime = false) {
    if (!value) return "Belum ditentukan";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function getStatusClass(status) {
    if (status === "selesai") return "done";
    if (status === "belum_dimulai") return "pending";
    return "";
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
        .map(row => row.roles?.name)
        .filter(Boolean);

      state.role = roles.includes("super_admin")
        ? "super_admin"
        : roles.includes("admin")
          ? "admin"
          : roles.includes("mentor")
            ? "mentor"
            : null;

      if (!state.role) {
        throw new Error("Halaman Pembinaan hanya dapat diakses Mentor, Admin, dan Super Admin.");
      }

      bindEvents();
      await loadMembers();
      await loadNotes();

    } catch (error) {
      console.error("[TARBIYAH PEMBINAAN]", error);
      notify(error.message || "Gagal memuat halaman Pembinaan.", "error");
      $("guidanceList").innerHTML =
        '<div class="guidance-empty">Data belum dapat dimuat. Periksa koneksi dan hak akses akun.</div>';
    }
  }

  async function loadMembers() {
    let assignmentQuery = supabase
      .from("mentor_assignments")
      .select("id, mentor_user_id, member_id, assigned_at")
      .eq("is_active", true);

    if (state.role === "mentor") {
      assignmentQuery = assignmentQuery.eq("mentor_user_id", state.user.id);
    }

    const { data: assignments, error: assignmentError } =
      await assignmentQuery;

    if (assignmentError) throw assignmentError;

    const memberIds = [...new Set(
      (assignments || []).map(row => row.member_id).filter(Boolean)
    )];

    if (!memberIds.length) {
      state.members = [];
      renderMemberOptions();
      renderStats();
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, phone, city")
        .in("id", userIds);

      if (error) throw error;
      profiles = data || [];
    }

    const profileMap = new Map(profiles.map(row => [row.id, row]));

    state.members = (members || []).map(member => ({
      ...member,
      profile: profileMap.get(member.user_id) || {}
    }));

    renderMemberOptions();
    renderStats();
  }

  function renderMemberOptions() {
    const select = $("memberSelect");

    if (!state.members.length) {
      select.innerHTML = '<option value="">Belum ada anggota binaan aktif</option>';
      select.disabled = true;
      $("saveNoteBtn").disabled = true;
      return;
    }

    select.disabled = false;
    $("saveNoteBtn").disabled = false;

    select.innerHTML =
      '<option value="">Pilih anggota binaan</option>' +
      state.members.map(member => {
        const name = member.profile.full_name || "Anggota TARBIYAH";
        const number = member.member_number
          ? ` — ${member.member_number}`
          : "";

        return `<option value="${escapeHTML(member.id)}">${escapeHTML(name + number)}</option>`;
      }).join("");
  }

  async function loadNotes() {
    if (!state.members.length) {
      state.notes = [];
      renderNotes();
      renderStats();
      return;
    }

    const memberIds = state.members.map(member => member.id);

    const { data, error } = await supabase
      .from("mentor_guidance_notes")
      .select("id, mentor_user_id, member_id, title, note, progress_status, follow_up_at, created_at, updated_at")
      .in("member_id", memberIds)
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.notes = data || [];
    renderNotes();
    renderStats();
  }

  function getMemberName(memberId) {
    const member = state.members.find(item => item.id === memberId);
    return member?.profile?.full_name || "Anggota TARBIYAH";
  }

  function renderStats() {
    $("statMembers").textContent = state.members.length;
    $("statNotes").textContent = state.notes.length;
    $("statProgress").textContent =
      state.notes.filter(note => note.progress_status === "berjalan").length;
  }

  function renderNotes() {
    const list = $("guidanceList");

    if (!state.notes.length) {
      list.innerHTML =
        '<div class="guidance-empty">Belum ada catatan pembinaan. Silakan buat catatan pertama.</div>';
      return;
    }

    list.innerHTML = state.notes.map(note => {
      const status = statusLabels[note.progress_status] || "Berjalan";

      return `
        <article class="guidance-item">
          <h3>${escapeHTML(note.title)}</h3>
          <div class="guidance-meta">
            <span>♙ ${escapeHTML(getMemberName(note.member_id))}</span>
            <span>◷ ${escapeHTML(formatDate(note.created_at, true))}</span>
          </div>
          <p>${escapeHTML(note.note)}</p>
          <div class="guidance-meta">
            <span class="guidance-status ${getStatusClass(note.progress_status)}">
              ${escapeHTML(status)}
            </span>
            <span>↻ Tindak lanjut: ${escapeHTML(formatDate(note.follow_up_at, true))}</span>
          </div>
          <div class="guidance-item-actions">
            <button type="button" class="guidance-btn guidance-secondary"
              data-edit-note="${escapeHTML(note.id)}">Edit</button>
            <button type="button" class="guidance-btn guidance-secondary"
              data-delete-note="${escapeHTML(note.id)}">Hapus</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function resetForm() {
    $("guidanceForm").reset();
    $("noteId").value = "";
    $("formHeading").textContent = "Tambah Catatan Pembinaan";
    $("saveNoteBtn").textContent = "Simpan Catatan";
    $("cancelEditBtn").hidden = true;
  }

  function editNote(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) return;

    $("noteId").value = note.id;
    $("memberSelect").value = note.member_id;
    $("noteTitle").value = note.title;
    $("noteContent").value = note.note;
    $("progressStatus").value = note.progress_status;

    if (note.follow_up_at) {
      const date = new Date(note.follow_up_at);
      const local = new Date(
        date.getTime() - date.getTimezoneOffset() * 60000
      );
      $("followUpAt").value = local.toISOString().slice(0, 16);
    } else {
      $("followUpAt").value = "";
    }

    $("formHeading").textContent = "Edit Catatan Pembinaan";
    $("saveNoteBtn").textContent = "Simpan Perubahan";
    $("cancelEditBtn").hidden = false;

    $("guidanceForm").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function saveNote(event) {
    event.preventDefault();
    if (state.saving) return;

    const id = $("noteId").value;
    const memberId = $("memberSelect").value;
    const title = $("noteTitle").value.trim();
    const noteText = $("noteContent").value.trim();
    const progressStatus = $("progressStatus").value;
    const followUpValue = $("followUpAt").value;

    if (!memberId || !title || !noteText) {
      notify("Lengkapi anggota, judul, dan catatan pembinaan.", "error");
      return;
    }

    const memberExists = state.members.some(member => member.id === memberId);
    if (!memberExists) {
      notify("Anggota tersebut tidak termasuk dalam daftar binaan yang dapat Anda kelola.", "error");
      return;
    }

    const payload = {
      member_id: memberId,
      title,
      note: noteText,
      progress_status: progressStatus,
      follow_up_at: followUpValue
        ? new Date(followUpValue).toISOString()
        : null
    };

    state.saving = true;
    $("saveNoteBtn").disabled = true;

    try {
      let result;

      if (id) {
        result = await supabase
          .from("mentor_guidance_notes")
          .update(payload)
          .eq("id", id)
          .select("id")
          .single();
      } else {
        payload.mentor_user_id = state.user.id;

        result = await supabase
          .from("mentor_guidance_notes")
          .insert(payload)
          .select("id")
          .single();
      }

      if (result.error) throw result.error;
      if (!result.data) {
        throw new Error("Catatan tidak tersimpan. Periksa hak akses akun.");
      }

      resetForm();
      await loadNotes();
      notify(id ? "Catatan pembinaan berhasil diperbarui." : "Catatan pembinaan berhasil disimpan.");

    } catch (error) {
      console.error("[SIMPAN PEMBINAAN]", error);
      notify(error.message || "Gagal menyimpan catatan.", "error");
    } finally {
      state.saving = false;
      $("saveNoteBtn").disabled = !state.members.length;
    }
  }

  async function deleteNote(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) return;

    if (!window.confirm(`Hapus catatan "${note.title}"?`)) return;

    try {
      const { error } = await supabase
        .from("mentor_guidance_notes")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await loadNotes();
      notify("Catatan pembinaan berhasil dihapus.");

    } catch (error) {
      console.error("[HAPUS PEMBINAAN]", error);
      notify(error.message || "Gagal menghapus catatan.", "error");
    }
  }

  function bindEvents() {
    $("guidanceForm").addEventListener("submit", saveNote);
    $("cancelEditBtn").addEventListener("click", resetForm);

    $("guidanceList").addEventListener("click", event => {
      const editButton = event.target.closest("[data-edit-note]");
      const deleteButton = event.target.closest("[data-delete-note]");

      if (editButton) editNote(editButton.dataset.editNote);
      if (deleteButton) deleteNote(deleteButton.dataset.deleteNote);
    });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
