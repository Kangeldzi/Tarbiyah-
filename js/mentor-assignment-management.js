/* =========================================================
   TARBIYAH — MENTOR & ANGGOTA BINAAN MANAGEMENT
   Version: 1.0.0
   Access: Super Admin only
   Database:
   - profiles
   - members
   - roles
   - user_roles
   - mentor_assignments
   ========================================================= */

(() => {
  'use strict';

  const MODULE = 'TARBIYAH_MENTOR_ASSIGNMENT';
  const supabase = window.tarbiyahSupabase;

  const $ = (id) => document.getElementById(id);

  const els = {
    section: $('mentorManagement'),
    nav: $('mentorManagementNav'),
    status: $('mentorManagementStatus'),
    mentor: $('mentorSelect'),
    member: $('menteeSelect'),
    notes: $('mentorAssignmentNotes'),
    assign: $('assignMentorButton'),
    refresh: $('refreshMentorAssignments'),
    summary: $('mentorAssignmentSummary'),
    table: $('mentorAssignmentTableBody'),
    mobile: $('mentorAssignmentMobileList')
  };

  let currentUser = null;
  let mentors = [];
  let members = [];
  let assignments = [];
  let profilesById = new Map();
  let membersById = new Map();
  let busy = false;

  const escapeHTML = (value) => String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]
  );

  const setStatus = (message, type = 'info') => {
    if (!els.status) return;

    els.status.textContent = message;
    els.status.dataset.status = type;
  };

  const setMessage = (message) => {
    if (els.summary) {
      els.summary.textContent = message;
    }
  };

  const setBusy = (value) => {
    busy = value;

    if (els.assign) els.assign.disabled = value;
    if (els.refresh) els.refresh.disabled = value;

    document.querySelectorAll(
      '[data-mentor-action]'
    ).forEach((button) => {
      button.disabled = value;
    });
  };

  const formatDate = (value) => {
    if (!value) return '-';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta'
    }).format(date);
  };

  const showError = (error, context) => {
    console.error(`[${MODULE}] ${context}:`, error);

    const message = error?.message || 'Terjadi kesalahan yang tidak diketahui.';

    setStatus('Terjadi kesalahan', 'error');
    setMessage(`${context}: ${message}`);
  };

  const checkElements = () => {
    const missing = Object.entries(els)
      .filter(([key, value]) => !value && key !== 'nav')
      .map(([key]) => key);

    if (missing.length) {
      console.error(
        `[${MODULE}] Elemen HTML tidak ditemukan:`,
        missing
      );

      return false;
    }

    return true;
  };

  // -------------------------------------------------------
  // 1. AUTENTIKASI & PEMERIKSAAN SUPER ADMIN
  // -------------------------------------------------------

  async function authorizeSuperAdmin() {
    if (!supabase) {
      throw new Error(
        'Supabase client window.tarbiyahSupabase tidak tersedia.'
      );
    }

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) throw authError;

    if (!user) {
      throw new Error('Sesi login tidak ditemukan.');
    }

    currentUser = user;

    const { data, error } = await supabase
      .from('user_roles')
      .select('roles!inner(name)')
      .eq('user_id', user.id);

    if (error) throw error;

    const isSuperAdmin = (data || []).some((item) => {
      const role = item.roles;

      if (Array.isArray(role)) {
        return role.some((r) => r.name === 'super_admin');
      }

      return role?.name === 'super_admin';
    });

    if (!isSuperAdmin) {
      throw new Error(
        'Akses ditolak. Fitur ini hanya dapat digunakan oleh Super Admin.'
      );
    }

    return true;
  }

  // -------------------------------------------------------
  // 2. MEMUAT DAFTAR MENTOR
  // -------------------------------------------------------

  async function loadMentors() {
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, roles!inner(name)')
      .eq('roles.name', 'mentor');

    if (roleError) throw roleError;

    const mentorIds = [
      ...new Set((roleData || []).map((item) => item.user_id))
    ];

    if (!mentorIds.length) {
      mentors = [];
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, phone')
      .in('id', mentorIds)
      .order('full_name');

    if (error) throw error;

    mentors = data || [];

    mentors.forEach((profile) => {
      profilesById.set(profile.id, profile);
    });
  }

  // -------------------------------------------------------
  // 3. MEMUAT ANGGOTA AKTIF
  // -------------------------------------------------------

  async function loadMembers() {
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select(
        'id, user_id, member_number, membership_status'
      )
      .eq('membership_status', 'active')
      .order('member_number');

    if (memberError) throw memberError;

    const rows = memberData || [];
    const userIds = [
      ...new Set(rows.map((item) => item.user_id).filter(Boolean))
    ];

    if (!userIds.length) {
      members = [];
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, username, phone')
      .in('id', userIds);

    if (profileError) throw profileError;

    const profileMap = new Map(
      (profileData || []).map((profile) => [
        profile.id,
        profile
      ])
    );

    members = rows
      .filter((member) => profileMap.has(member.user_id))
      .map((member) => ({
        ...member,
        profile: profileMap.get(member.user_id)
      }));

    members.forEach((member) => {
      membersById.set(member.id, member);
      profilesById.set(member.user_id, member.profile);
    });
  }

  // -------------------------------------------------------
  // 4. MEMUAT RIWAYAT PENUGASAN
  // -------------------------------------------------------

  async function loadAssignments() {
    const { data, error } = await supabase
      .from('mentor_assignments')
      .select(`
        id,
        mentor_user_id,
        member_id,
        assigned_at,
        updated_at,
        notes,
        is_active
      `)
      .order('assigned_at', { ascending: false });

    if (error) throw error;

    assignments = data || [];
  }

  // -------------------------------------------------------
  // 5. DROPDOWN MENTOR & ANGGOTA
  // -------------------------------------------------------

  function renderMentorOptions() {
    if (!els.mentor) return;

    const previous = els.mentor.value;

    els.mentor.innerHTML = [
      '<option value="">-- Pilih Mentor --</option>',
      ...mentors.map((mentor) => `
        <option value="${escapeHTML(mentor.id)}">
          ${escapeHTML(mentor.full_name || mentor.username || 'Mentor')}
        </option>
      `)
    ].join('');

    if (mentors.some((mentor) => mentor.id === previous)) {
      els.mentor.value = previous;
    }

    renderMemberOptions();
  }

  function renderMemberOptions() {
    if (!els.member) return;

    const mentorId = els.mentor.value;
    const previous = els.member.value;

    if (!mentorId) {
      els.member.innerHTML =
        '<option value="">Pilih Mentor terlebih dahulu</option>';
      return;
    }

    const assignedIds = new Set(
      assignments
        .filter((item) =>
          item.is_active &&
          item.mentor_user_id === mentorId
        )
        .map((item) => item.member_id)
    );

    const available = members.filter(
      (member) => !assignedIds.has(member.id)
    );

    els.member.innerHTML = [
      '<option value="">-- Pilih Anggota Aktif --</option>',
      ...available.map((member) => `
        <option value="${escapeHTML(member.id)}">
          ${escapeHTML(member.profile.full_name || 'Anggota')}
          ${member.member_number
            ? ` — ${escapeHTML(member.member_number)}`
            : ''}
        </option>
      `)
    ].join('');

    if (available.some((member) => member.id === previous)) {
      els.member.value = previous;
    }
  }

  // -------------------------------------------------------
  // 6. TAMPILAN TABEL & RIWAYAT
  // -------------------------------------------------------

  function getAssignmentName(assignment) {
    const mentor = profilesById.get(assignment.mentor_user_id);
    const member = membersById.get(assignment.member_id);

    return {
      mentor: mentor?.full_name || 'Profil Mentor tidak tersedia',
      member: member?.profile?.full_name ||
        'Profil Anggota tidak tersedia',
      memberNumber: member?.member_number || '-'
    };
  }

  function renderAssignments() {
    const active = assignments.filter((item) => item.is_active);
    const inactive = assignments.filter((item) => !item.is_active);

    if (els.summary) {
      els.summary.textContent =
        `Total Mentor: ${mentors.length} | ` +
        `Anggota aktif: ${members.length} | ` +
        `Penugasan berjalan: ${active.length} | ` +
        `Riwayat nonaktif: ${inactive.length}`;
    }

    if (!assignments.length) {
      const empty =
        '<tr><td colspan="6" class="member-empty">' +
        'Belum ada riwayat penugasan Mentor.' +
        '</td></tr>';

      els.table.innerHTML = empty;
      els.mobile.innerHTML =
        '<div class="member-empty">Belum ada riwayat penugasan Mentor.</div>';
      return;
    }

    els.table.innerHTML = assignments.map((item) => {
      const names = getAssignmentName(item);
      const activeStatus = item.is_active;

      return `
        <tr>
          <td>${escapeHTML(names.mentor)}</td>
          <td>
            ${escapeHTML(names.member)}
            <small>${escapeHTML(names.memberNumber)}</small>
          </td>
          <td>${escapeHTML(formatDate(item.assigned_at))}</td>
          <td>${escapeHTML(item.notes || '-')}</td>
          <td>
            <span class="assignment-status ${
              activeStatus ? 'is-active' : 'is-inactive'
            }">
              ${activeStatus ? 'Aktif' : 'Nonaktif'}
            </span>
          </td>
          <td>
            ${
              activeStatus
                ? `<button
                    type="button"
                    class="refresh-button"
                    data-mentor-action="deactivate"
                    data-id="${escapeHTML(item.id)}">
                    Nonaktifkan
                  </button>`
                : `<button
                    type="button"
                    class="refresh-button"
                    data-mentor-action="reactivate"
                    data-id="${escapeHTML(item.id)}">
                    Tugaskan Kembali
                  </button>`
            }
          </td>
        </tr>
      `;
    }).join('');

    els.mobile.innerHTML = assignments.map((item) => {
      const names = getAssignmentName(item);
      const activeStatus = item.is_active;

      return `
        <article class="mentor-assignment-item">
          <strong>${escapeHTML(names.member)}</strong>
          <div>Nomor anggota: ${escapeHTML(names.memberNumber)}</div>
          <div>Mentor: ${escapeHTML(names.mentor)}</div>
          <div>Tanggal: ${escapeHTML(formatDate(item.assigned_at))}</div>
          <div>Catatan: ${escapeHTML(item.notes || '-')}</div>
          <div>Status: ${activeStatus ? 'Aktif' : 'Nonaktif'}</div>
          ${
            activeStatus
              ? `<button type="button"
                   class="refresh-button"
                   data-mentor-action="deactivate"
                   data-id="${escapeHTML(item.id)}">
                   Nonaktifkan
                 </button>`
              : `<button type="button"
                   class="refresh-button"
                   data-mentor-action="reactivate"
                   data-id="${escapeHTML(item.id)}">
                   Tugaskan Kembali
                 </button>`
          }
        </article>
      `;
    }).join('');

    renderMemberOptions();
  }

  // -------------------------------------------------------
  // 7. REFRESH SEMUA DATA
  // -------------------------------------------------------

  async function refreshData() {
    if (busy) return;

    setBusy(true);
    setStatus('Memuat data...', 'info');
    setMessage('Mengambil data Mentor dan Anggota...');

    try {
      await authorizeSuperAdmin();

      profilesById = new Map();
      membersById = new Map();

      await Promise.all([
        loadMentors(),
        loadMembers(),
        loadAssignments()
      ]);

      renderMentorOptions();
      renderAssignments();

      setStatus('Data berhasil dimuat', 'success');
    } catch (error) {
      showError(error, 'Gagal memuat data');
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------
  // 8. MENETAPKAN ANGGOTA KEPADA MENTOR
  // -------------------------------------------------------

  async function assignMember() {
    if (busy) return;

    const mentorId = els.mentor.value;
    const memberId = els.member.value;
    const notes = els.notes.value.trim();

    if (!mentorId) {
      alert('Silakan pilih Mentor terlebih dahulu.');
      return;
    }

    if (!memberId) {
      alert('Silakan pilih Anggota Binaan.');
      return;
    }

    const mentorExists = mentors.some(
      (mentor) => mentor.id === mentorId
    );

    const memberExists = members.some(
      (member) => member.id === memberId
    );

    if (!mentorExists || !memberExists) {
      alert('Data Mentor atau Anggota tidak valid. Perbarui data.');
      return;
    }

    const duplicate = assignments.some((item) =>
      item.is_active &&
      item.mentor_user_id === mentorId &&
      item.member_id === memberId
    );

    if (duplicate) {
      alert('Anggota tersebut sudah aktif di bawah Mentor ini.');
      return;
    }

    if (!confirm('Tetapkan anggota ini kepada Mentor yang dipilih?')) {
      return;
    }

    setBusy(true);

    try {
      await authorizeSuperAdmin();

      const { error } = await supabase
        .from('mentor_assignments')
        .insert({
          mentor_user_id: mentorId,
          member_id: memberId,
          notes: notes || null
        });

      if (error) throw error;

      els.notes.value = '';

      await refreshDataAfterAction();

      alert('Penugasan Mentor berhasil disimpan.');
    } catch (error) {
      showError(error, 'Gagal menetapkan anggota');

      if (error?.code === '23505') {
        alert('Penugasan aktif untuk pasangan Mentor dan Anggota ini sudah ada.');
      } else {
        alert(error?.message || 'Penugasan gagal disimpan.');
      }
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------
  // 9. MENONAKTIFKAN PENUGASAN
  // -------------------------------------------------------

  async function deactivateAssignment(id) {
    if (busy) return;

    const assignment = assignments.find(
      (item) => item.id === id && item.is_active
    );

    if (!assignment) {
      alert('Penugasan aktif tidak ditemukan.');
      return;
    }

    if (!confirm(
      'Nonaktifkan penugasan ini? Riwayat penugasan tetap disimpan.'
    )) {
      return;
    }

    setBusy(true);

    try {
      await authorizeSuperAdmin();

      const { data, error } = await supabase
        .from('mentor_assignments')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('is_active', true)
        .select('id');

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          'Tidak ada data yang berubah. Periksa status penugasan.'
        );
      }

      await refreshDataAfterAction();

      alert('Penugasan dinonaktifkan. Riwayat tetap tersimpan.');
    } catch (error) {
      showError(error, 'Gagal menonaktifkan penugasan');
      alert(error?.message || 'Penugasan gagal dinonaktifkan.');
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------
  // 10. MENUGASKAN KEMBALI
  // Membuat baris baru agar riwayat lama tetap utuh.
  // -------------------------------------------------------

  async function reactivateAssignment(id) {
    if (busy) return;

    const oldAssignment = assignments.find(
      (item) => item.id === id && !item.is_active
    );

    if (!oldAssignment) {
      alert('Riwayat penugasan tidak ditemukan.');
      return;
    }

    const mentorExists = mentors.some(
      (mentor) => mentor.id === oldAssignment.mentor_user_id
    );

    const memberExists = members.some(
      (member) => member.id === oldAssignment.member_id
    );

    if (!mentorExists || !memberExists) {
      alert(
        'Mentor atau Anggota tidak lagi memenuhi syarat penugasan aktif.'
      );
      return;
    }

    const alreadyActive = assignments.some((item) =>
      item.is_active &&
      item.mentor_user_id === oldAssignment.mentor_user_id &&
      item.member_id === oldAssignment.member_id
    );

    if (alreadyActive) {
      alert('Pasangan Mentor dan Anggota ini sudah memiliki penugasan aktif.');
      return;
    }

    if (!confirm(
      'Buat penugasan baru berdasarkan riwayat ini? Riwayat lama tidak akan diubah.'
    )) {
      return;
    }

    setBusy(true);

    try {
      await authorizeSuperAdmin();

      const { error } = await supabase
        .from('mentor_assignments')
        .insert({
          mentor_user_id: oldAssignment.mentor_user_id,
          member_id: oldAssignment.member_id,
          notes: oldAssignment.notes || null
        });

      if (error) throw error;

      await refreshDataAfterAction();

      alert('Penugasan baru berhasil dibuat.');
    } catch (error) {
      showError(error, 'Gagal membuat penugasan baru');

      if (error?.code === '23505') {
        alert('Penugasan aktif sudah ada untuk pasangan ini.');
      } else {
        alert(error?.message || 'Penugasan baru gagal dibuat.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function refreshDataAfterAction() {
    profilesById = new Map();
    membersById = new Map();

    await Promise.all([
      loadMentors(),
      loadMembers(),
      loadAssignments()
    ]);

    renderMentorOptions();
    renderAssignments();

    setStatus('Data berhasil diperbarui', 'success');
  }

  // -------------------------------------------------------
  // 11. EVENT LISTENERS
  // -------------------------------------------------------

  function bindEvents() {
    els.mentor.addEventListener('change', renderMemberOptions);

    els.assign.addEventListener('click', assignMember);

    els.refresh.addEventListener('click', refreshData);

    const handleAssignmentAction = (event) => {
      const button = event.target.closest('[data-mentor-action]');

      if (!button) return;

      const action = button.dataset.mentorAction;
      const id = button.dataset.id;

      if (!id) return;

      if (action === 'deactivate') {
        deactivateAssignment(id);
      }

      if (action === 'reactivate') {
        reactivateAssignment(id);
      }
    };

    els.table.addEventListener('click', handleAssignmentAction);
    els.mobile.addEventListener('click', handleAssignmentAction);
  }

  // -------------------------------------------------------
  // 12. INITIALIZATION
  // -------------------------------------------------------

  async function init() {
    if (!checkElements()) return;

    try {
      await authorizeSuperAdmin();

      els.section.hidden = false;

      if (els.nav) {
        els.nav.hidden = false;
      }

      bindEvents();

      await refreshData();

      console.info(`[${MODULE}] v1.0.0 initialized.`);
    } catch (error) {
      console.error(`[${MODULE}] Initialization failed:`, error);

      els.section.hidden = true;

      if (els.nav) {
        els.nav.hidden = true;
      }

      setStatus('Akses tidak tersedia', 'error');

      console.warn(
        `[${MODULE}] Modul hanya tersedia untuk Super Admin.`
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
