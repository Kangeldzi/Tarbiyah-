/* =========================================================
   TARBIYAH — AGENDA KAJIAN
   Versi 3.3.1 — Unified Agenda & Role-Based Access
   Zona waktu: Asia/Jakarta (WIB)

   Tabel:
   - kajian_agenda
   - kajian_attendance
   - user_roles (role_id -> roles.id)

   Hak akses:
   - member      : melihat kajian terbit
   - mentor      : tambah, edit, arsip, pulihkan
   - admin       : tambah, edit, arsip, pulihkan
   - super_admin : seluruh akses termasuk hapus permanen

   Catatan:
   - Tidak mengubah RLS Supabase.
   - Hapus permanen hanya untuk super_admin.
   - Status agenda ditentukan dari data database,
     bukan dari tab yang sedang dibuka.
   ========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_AGENDA_KAJIAN_V331__) return;
  window.__TARBIYAH_AGENDA_KAJIAN_V331__ = true;

  const CONFIG = Object.freeze({
    TABLE: "kajian_agenda",
    ATTENDANCE_TABLE: "kajian_attendance",
    ROLE_TABLE: "user_roles",
    ROLES_TABLE: "roles",
    TIMEZONE: "Asia/Jakarta",
    CLIENT_WAIT_MS: 15000,
    MAX_AGENDAS: 200
  });

  const PERMISSIONS = Object.freeze({
    member: {
      viewPublished: true,
      viewArchived: false,
      create: false,
      edit: false,
      archive: false,
      restore: false,
      delete: false
    },
    mentor: {
      viewPublished: true,
      viewArchived: true,
      create: true,
      edit: true,
      archive: true,
      restore: true,
      delete: false
    },
    admin: {
      viewPublished: true,
      viewArchived: true,
      create: true,
      edit: true,
      archive: true,
      restore: true,
      delete: false
    },
    super_admin: {
      viewPublished: true,
      viewArchived: true,
      create: true,
      edit: true,
      archive: true,
      restore: true,
      delete: true
    }
  });

  const state = {
    supabase: null,
    user: null,
    role: "member",
    roleLookupWarning: false,
    agendas: [],
    editingId: null,
    busy: false,
    initialized: false,
    eventsBound: false,
    view: "published",
    noticeTimer: null
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const elements = {
    form: $("#agendaForm"),
    formPanel: $("#agendaFormPanel"),
    formHeading: $("#formHeading"),
    agendaId: $("#agendaId"),
    title: $("#title"),
    description: $("#description"),
    speakerName: $("#speakerName"),
    startsAt: $("#startsAt"),
    endsAt: $("#endsAt"),
    locationName: $("#locationName"),
    locationAddress: $("#locationAddress"),
    saveButton: $("#saveButton"),
    cancelEditButton: $("#cancelEditButton"),
    agendaList: $("#agendaList"),
    agendaCount: $("#agendaCount"),
    notice: $("#agendaNotice"),
    connectionIndicator: $("#connectionIndicator"),
    connectionTitle: $("#connectionTitle"),
    connectionDescription: $("#connectionDescription"),
    refreshButton: $("#refreshButton"),
    userRole: $("#userRole"),
    currentYear: $("#currentYear"),
    accessInformation: $("#agendaAccessInformation"),
    accessMessage: $("#agendaAccessMessage"),
    tabs: Array.from(
      document.querySelectorAll("[data-agenda-view]")
    ),
    sidebar: $("#agendaSidebar"),
    sidebarOverlay: $("#agendaSidebarOverlay"),
    menuButton: $("#agendaMenuButton"),
    menuCloseButton: $("#agendaMenuClose")
  };

  /* =======================================================
     UTILITAS
     ======================================================= */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function normalizeRole(value) {
    const role = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    if (
      role === "superadmin" ||
      role === "super_admin"
    ) {
      return "super_admin";
    }

    if (role === "admin") return "admin";
    if (role === "mentor") return "mentor";

    if (
      role === "member" ||
      role === "anggota"
    ) {
      return "member";
    }

    // Role tidak dikenal tidak boleh otomatis dianggap Member.
    return null;
  }

  function resolveHighestRole(roleNames) {
    const roles = roleNames
      .map(normalizeRole)
      .filter(Boolean);

    if (roles.includes("super_admin")) return "super_admin";
    if (roles.includes("admin")) return "admin";
    if (roles.includes("mentor")) return "mentor";
    if (roles.includes("member")) return "member";

    return null;
  }

  function can(permission) {
    return Boolean(
      PERMISSIONS[state.role]?.[permission]
    );
  }

  function setConnection(status, title, description) {
    if (elements.connectionIndicator) {
      elements.connectionIndicator.dataset.status = status;
    }

    if (elements.connectionTitle) {
      elements.connectionTitle.textContent = title;
    }

    if (elements.connectionDescription) {
      elements.connectionDescription.textContent = description;
    }
  }

  function showNotice(message, type = "info") {
    if (!elements.notice) return;

    window.clearTimeout(state.noticeTimer);

    elements.notice.textContent = message;
    elements.notice.className = `agenda-notice is-${type}`;
    elements.notice.hidden = false;

    state.noticeTimer = window.setTimeout(() => {
      elements.notice.hidden = true;
      elements.notice.textContent = "";
    }, 6500);
  }

  /* =======================================================
     KONEKSI SUPABASE DAN AUTENTIKASI
     ======================================================= */

  function getSupabaseClient() {
    const candidates = [
      window.tarbiyahSupabase,
      window.supabaseClient,
      window.TARBIYAH_SUPABASE
    ];

    return candidates.find(candidate =>
      candidate &&
      typeof candidate.from === "function" &&
      candidate.auth
    ) || null;
  }

  async function waitForSupabaseClient() {
    const startedAt = Date.now();

    while (
      Date.now() - startedAt <
      CONFIG.CLIENT_WAIT_MS
    ) {
      const client = getSupabaseClient();

      if (client) return client;

      await new Promise(resolve =>
        window.setTimeout(resolve, 250)
      );
    }

    throw new Error(
      "Koneksi Supabase belum tersedia. Periksa supabase-client.js dan config.js."
    );
  }

  async function getAuthenticatedUser() {
    const { data, error } =
      await state.supabase.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error(
        "Sesi login tidak ditemukan. Silakan masuk kembali."
      );
    }

    return data.user;
  }

  /* =======================================================
     PEMBACAAN ROLE
     ======================================================= */

  async function loadUserRole() {
    state.roleLookupWarning = false;
    state.role = "member";

    /*
     * LANGKAH 1:
     * Coba membaca relasi langsung user_roles -> roles.
     */
    let relationError = null;

    const relationResult = await state.supabase
      .from(CONFIG.ROLE_TABLE)
      .select("role_id, roles(name)")
      .eq("user_id", state.user.id);

    if (!relationResult.error) {
      const rows = Array.isArray(relationResult.data)
        ? relationResult.data
        : [];

      // Tidak ada penugasan role berarti akun Member.
      if (rows.length === 0) {
        state.role = "member";
        return;
      }

      const names = rows
        .map(row => {
          const relation = row?.roles;

          if (Array.isArray(relation)) {
            return relation[0]?.name;
          }

          return relation?.name;
        })
        .filter(Boolean);

      const resolvedRole = resolveHighestRole(names);

      if (resolvedRole) {
        state.role = resolvedRole;
        return;
      }
    } else {
      relationError = relationResult.error;
    }

    /*
     * LANGKAH 2:
     * Jika relasi embedded gagal atau tidak menghasilkan
     * nama role yang dikenali, baca role_id secara langsung.
     */
    console.warn(
      "[TARBIYAH Agenda] Relasi role belum berhasil dibaca. Mencoba fallback.",
      relationError || "Nama role tidak ditemukan pada relasi."
    );

    const assignmentResult = await state.supabase
      .from(CONFIG.ROLE_TABLE)
      .select("role_id")
      .eq("user_id", state.user.id);

    if (assignmentResult.error) {
      state.roleLookupWarning = true;
      state.role = "member";

      console.error(
        "[TARBIYAH Agenda] Fallback user_roles gagal:",
        assignmentResult.error
      );

      return;
    }

    const assignments = Array.isArray(assignmentResult.data)
      ? assignmentResult.data
      : [];

    if (assignments.length === 0) {
      state.role = "member";
      return;
    }

    const roleIds = [
      ...new Set(
        assignments
          .map(item => item?.role_id)
          .filter(id => id !== null && id !== undefined)
      )
    ];

    if (roleIds.length === 0) {
      state.roleLookupWarning = true;
      state.role = "member";

      console.error(
        "[TARBIYAH Agenda] Penugasan role ditemukan tetapi role_id kosong."
      );

      return;
    }

    /*
     * LANGKAH 3:
     * Ambil nama role berdasarkan roles.id.
     */
    const rolesResult = await state.supabase
      .from(CONFIG.ROLES_TABLE)
      .select("name")
      .in("id", roleIds);

    if (rolesResult.error) {
      state.roleLookupWarning = true;
      state.role = "member";

      console.error(
        "[TARBIYAH Agenda] Gagal membaca tabel roles:",
        rolesResult.error
      );

      return;
    }

    const roleRows = Array.isArray(rolesResult.data)
      ? rolesResult.data
      : [];

    const roleNames = roleRows
      .map(item => item?.name)
      .filter(Boolean);

    const resolvedRole = resolveHighestRole(roleNames);

    if (resolvedRole) {
      state.role = resolvedRole;
      return;
    }

    state.roleLookupWarning = true;
    state.role = "member";

    console.error(
      "[TARBIYAH Agenda] Role tidak dapat dikenali.",
      {
        userId: state.user.id,
        roleIds,
        roleNames
      }
    );
  }

  function roleLabel(role = state.role) {
    return ({
      member: "Anggota",
      mentor: "Mentor",
      admin: "Admin",
      super_admin: "Super Admin"
    })[role] || "Anggota";
  }

  /* =======================================================
     ANTARMUKA ROLE DAN HAK AKSES
     ======================================================= */

  function updateRoleInterface() {
    if (elements.userRole) {
      elements.userRole.textContent =
        `Hak akses akun: ${roleLabel()}`;
    }

    if (elements.formPanel) {
      elements.formPanel.hidden = !can("create");
    }

    const archivedTab =
      $('[data-agenda-view="archived"]');

    if (archivedTab) {
      archivedTab.hidden = !can("viewArchived");
    }

    if (
      !can("viewArchived") &&
      state.view === "archived"
    ) {
      state.view = "published";
    }

    if (
      elements.accessInformation &&
      elements.accessMessage
    ) {
      elements.accessInformation.hidden = false;

      if (state.roleLookupWarning) {
        elements.accessMessage.textContent =
          "Role akun belum dapat diverifikasi. Halaman menggunakan akses Anggota sementara. Periksa tabel user_roles, roles, dan relasi role_id.";
      } else if (state.role === "member") {
        elements.accessMessage.textContent =
          "Anggota dapat melihat kajian yang sudah diterbitkan. Pengelolaan agenda hanya tersedia bagi Mentor, Admin, dan Super Admin.";
      } else if (state.role === "mentor") {
        elements.accessMessage.textContent =
          "Mentor dapat membuat, mengubah, mengarsipkan, dan memulihkan agenda kajian. Mentor tidak memiliki akses hapus permanen.";
      } else if (state.role === "admin") {
        elements.accessMessage.textContent =
          "Admin dapat mengelola agenda dan arsip. Hapus permanen hanya tersedia bagi Super Admin.";
      } else {
        elements.accessMessage.textContent =
          "Super Admin memiliki akses penuh untuk mengelola agenda, memulihkan arsip, dan menghapus agenda secara permanen.";
      }
    }

    if (!can("create")) {
      resetForm();
    }

    updateViewTabs();
  }

  function updateViewTabs() {
    elements.tabs.forEach(tab => {
      const view = tab.dataset.agendaView;
      const active = view === state.view;

      tab.classList.toggle("is-active", active);
      tab.setAttribute(
        "aria-selected",
        String(active)
      );
      tab.setAttribute(
        "tabindex",
        active ? "0" : "-1"
      );
    });
  }

  async function switchAgendaView(view) {
    if (
      !["published", "archived", "latest"].includes(view)
    ) {
      return;
    }

    if (
      view === "archived" &&
      !can("viewArchived")
    ) {
      showNotice(
        "Kamu tidak memiliki akses untuk melihat arsip.",
        "warning"
      );
      return;
    }

    state.view = view;

    updateViewTabs();
    resetForm();

    await loadAgendas();
  }

  /* =======================================================
     WAKTU ASIA/JAKARTA
     ======================================================= */

  function jakartaDateTimeToISO(value) {
    if (!value) return null;

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
    );

    if (!match) return null;

    const [, year, month, day, hour, minute] = match;

    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    );

    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day) ||
      date.getHours() !== Number(hour) ||
      date.getMinutes() !== Number(minute)
    ) {
      return null;
    }

    return `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
  }

  function toJakartaInput(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);

    const part = key =>
      parts.find(item => item.type === key)?.value || "";

    return (
      `${part("year")}-${part("month")}-${part("day")}` +
      `T${part("hour")}:${part("minute")}`
    );
  }

  function formatDateTime(value) {
    if (!value) {
      return "Waktu belum ditentukan";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Waktu tidak valid";
    }

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: CONFIG.TIMEZONE,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date) + " WIB";
  }

  /* =======================================================
     GOOGLE MAPS
     ======================================================= */

  function getMapURL(locationAddress, locationName) {
    const address = String(
      locationAddress || ""
    ).trim();

    if (address) {
      if (/^https?:\/\//i.test(address)) {
        try {
          const url = new URL(address);

          if (
            url.hostname.includes("google") ||
            url.hostname.includes("goo.gl")
          ) {
            return url.href;
          }
        } catch (_) {}
      }

      return (
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(address)
      );
    }

    if (locationName) {
      return (
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(locationName)
      );
    }

    return "";
  }

  function getAgendaViewLabel() {
    if (state.view === "archived") {
      return "Arsip Historis";
    }

    if (state.view === "latest") {
      return "Kajian Terbaru";
    }

    return "Semua Kajian";
  }

  /* =======================================================
     MEMUAT AGENDA
     ======================================================= */

  async function loadAgendas() {
    if (!state.supabase) return;

    if (elements.agendaList) {
      elements.agendaList.innerHTML =
        '<div class="agenda-loading">Memuat data agenda kajian...</div>';
    }

    if (elements.refreshButton) {
      elements.refreshButton.disabled = true;
      elements.refreshButton.setAttribute(
        "aria-busy",
        "true"
      );
    }

    try {
      const selectedStatus =
        state.view === "archived"
          ? "archived"
          : "published";

      const sortDescending =
        state.view === "latest";

      let query = state.supabase
        .from(CONFIG.TABLE)
        .select(
          "id,title,description,speaker_name,starts_at,ends_at,location_name,location_address,status"
        )
        .eq("status", selectedStatus)
        .order("starts_at", {
          ascending: !sortDescending
        })
        .limit(CONFIG.MAX_AGENDAS);

      if (!can("viewArchived")) {
        query = query.eq("status", "published");
      }

      const { data, error } = await query;

      if (error) throw error;

      state.agendas = Array.isArray(data)
        ? data
        : [];

      renderAgendas();

      setConnection(
        "connected",
        "Terhubung ke Supabase",
        `Data ${getAgendaViewLabel().toLowerCase()} berhasil dimuat.`
      );
    } catch (error) {
      console.error(
        "[TARBIYAH Agenda] Gagal memuat agenda:",
        error
      );

      state.agendas = [];

      renderAgendas();

      setConnection(
        "error",
        "Gagal memuat agenda",
        error.message ||
          "Periksa koneksi dan kebijakan akses database."
      );

      showNotice(
        error.message || "Data agenda gagal dimuat.",
        "error"
      );
    } finally {
      if (elements.refreshButton) {
        elements.refreshButton.disabled = false;
        elements.refreshButton.removeAttribute(
          "aria-busy"
        );
      }
    }
  }

  /* =======================================================
     RENDER DAFTAR AGENDA
     ======================================================= */

  function renderAgendas() {
    if (!elements.agendaList) return;

    if (elements.agendaCount) {
      elements.agendaCount.textContent =
        String(state.agendas.length);
    }

    if (!state.agendas.length) {
      const message =
        state.view === "archived"
          ? "Belum ada agenda yang diarsipkan."
          : state.view === "latest"
            ? "Belum ada kajian terbaru yang diterbitkan."
            : "Belum ada agenda kajian yang diterbitkan.";

      elements.agendaList.innerHTML = `
        <div class="agenda-empty">
          <span class="agenda-empty-icon" aria-hidden="true">📚</span>
          <strong>Belum ada agenda</strong>
          <p>${escapeHTML(message)}</p>
        </div>
      `;

      return;
    }

    elements.agendaList.innerHTML = state.agendas
      .map(renderAgendaCard)
      .join("");
  }

  function renderAgendaCard(agenda) {
    const id = escapeHTML(agenda.id);
    const title = escapeHTML(agenda.title);
    const description = escapeHTML(
      agenda.description || "Tidak ada deskripsi."
    );
    const speaker = escapeHTML(
      agenda.speaker_name || "Belum ditentukan"
    );
    const location = escapeHTML(
      agenda.location_name || "Lokasi belum ditentukan"
    );
    const address = escapeHTML(
      agenda.location_address || ""
    );

    const actualStatus =
      agenda.status === "archived"
        ? "archived"
        : "published";

    const isPublished =
      actualStatus === "published";

    const mapURL = getMapURL(
      agenda.location_address,
      agenda.location_name
    );

    /*
     * PERBAIKAN UTAMA:
     * Aksi mengikuti status asli agenda.
     * Bukan state.view.
     *
     * Tab latest berisi agenda published,
     * sehingga tetap menampilkan Edit dan Arsipkan.
     */
    let actions = "";

    if (isPublished) {
      if (can("edit")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-edit"
            data-action="edit"
            data-id="${id}"
          >Edit</button>
        `;
      }

      if (can("archive")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-archive"
            data-action="archive"
            data-id="${id}"
          >Arsipkan</button>
        `;
      }
    } else {
      if (can("restore")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-restore"
            data-action="restore"
            data-id="${id}"
          >Pulihkan</button>
        `;
      }

      if (can("delete")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-delete"
            data-action="delete"
            data-id="${id}"
          >Hapus Permanen</button>
        `;
      }
    }

    const mapButton = mapURL
      ? `
        <a
          class="agenda-map-link"
          href="${escapeHTML(mapURL)}"
          target="_blank"
          rel="noopener noreferrer"
        >↗ Buka Lokasi di Google Maps</a>
      `
      : "";

    const statusLabel = isPublished
      ? "Diterbitkan"
      : "Diarsipkan";

    const statusClass = isPublished
      ? "status-active"
      : "status-archived";

    return `
      <article
        class="agenda-card"
        data-agenda-id="${id}"
      >
        <div class="agenda-card-header">
          <h3 class="agenda-card-title">${title}</h3>

          <span class="agenda-status ${statusClass}">
            ${statusLabel}
          </span>
        </div>

        <div class="agenda-card-body">
          <div style="
            font-size:11px;
            color:var(--agenda-muted);
            margin-bottom:10px;
          ">
            <strong>
              ${escapeHTML(formatDateTime(agenda.starts_at))}
            </strong>
          </div>

          <p
            class="agenda-description"
            style="
              margin-bottom:12px;
              white-space:pre-wrap;
              font-size:12px;
              line-height:1.6;
            "
          >${description}</p>

          <div style="
            font-size:11px;
            line-height:1.8;
            color:var(--agenda-text);
          ">
            <div>
              🎙️ <strong>Pemateri:</strong> ${speaker}
            </div>

            <div>
              ⏱️ <strong>Selesai:</strong>
              ${escapeHTML(formatDateTime(agenda.ends_at))}
            </div>

            <div>
              📍 <strong>Lokasi:</strong> ${location}
            </div>
          </div>

          ${
            address
              ? `<div class="agenda-address">🔗 ${address}</div>`
              : ""
          }

          ${mapButton}
        </div>

        ${
          actions
            ? `<div class="agenda-card-actions">${actions}</div>`
            : ""
        }
      </article>
    `;
  }

  /* =======================================================
     EDIT AGENDA
     ======================================================= */

  function startEdit(id) {
    if (!can("edit")) {
      showNotice(
        "Kamu tidak memiliki izin untuk mengedit agenda.",
        "warning"
      );
      return;
    }

    const agenda = state.agendas.find(
      item => String(item.id) === String(id)
    );

    if (!agenda) {
      showNotice(
        "Data agenda tidak ditemukan. Muat ulang daftar agenda.",
        "error"
      );
      return;
    }

    if (agenda.status !== "published") {
      showNotice(
        "Hanya agenda yang diterbitkan yang dapat diedit.",
        "warning"
      );
      return;
    }

    state.editingId = agenda.id;

    elements.agendaId.value = agenda.id;
    elements.title.value = agenda.title || "";
    elements.description.value =
      agenda.description || "";
    elements.speakerName.value =
      agenda.speaker_name || "";
    elements.startsAt.value =
      toJakartaInput(agenda.starts_at);
    elements.endsAt.value =
      toJakartaInput(agenda.ends_at);
    elements.locationName.value =
      agenda.location_name || "";
    elements.locationAddress.value =
      agenda.location_address || "";

    if (elements.formHeading) {
      elements.formHeading.textContent =
        "Edit Agenda Kajian";
    }

    if (elements.saveButton) {
      elements.saveButton.textContent =
        "Simpan Perubahan";
    }

    if (elements.cancelEditButton) {
      elements.cancelEditButton.hidden = false;
    }

    if (elements.formPanel) {
      elements.formPanel.hidden = false;

      elements.formPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }

  function resetForm() {
    state.editingId = null;

    if (elements.form) {
      elements.form.reset();
    }

    if (elements.agendaId) {
      elements.agendaId.value = "";
    }

    if (elements.formHeading) {
      elements.formHeading.textContent =
        "Tambah Agenda Kajian";
    }

    if (elements.saveButton) {
      elements.saveButton.textContent =
        "Simpan Agenda";
    }

    if (elements.cancelEditButton) {
      elements.cancelEditButton.hidden = true;
    }
  }

  /* =======================================================
     STATUS BUSY
     ======================================================= */

  function setBusy(busy) {
    state.busy = busy;

    const controls = [
      elements.title,
      elements.description,
      elements.speakerName,
      elements.startsAt,
      elements.endsAt,
      elements.locationName,
      elements.locationAddress,
      elements.saveButton,
      elements.cancelEditButton
    ];

    controls.forEach(control => {
      if (control) {
        control.disabled = busy || !can("create");
      }
    });

    if (elements.saveButton && busy) {
      elements.saveButton.textContent = "Menyimpan...";
    } else if (
      elements.saveButton &&
      !state.editingId
    ) {
      elements.saveButton.textContent =
        "Simpan Agenda";
    } else if (
      elements.saveButton &&
      state.editingId
    ) {
      elements.saveButton.textContent =
        "Simpan Perubahan";
    }
  }

  /* =======================================================
     SIMPAN DAN PERBARUI AGENDA
     ======================================================= */

  async function saveAgenda(event) {
    event.preventDefault();

    if (state.busy) return;

    const editing = Boolean(state.editingId);

    if (
      !can("create") ||
      (editing && !can("edit"))
    ) {
      showNotice(
        "Akun kamu tidak memiliki izin untuk tindakan ini.",
        "warning"
      );
      return;
    }

    const title = elements.title.value.trim();

    const startsAt = jakartaDateTimeToISO(
      elements.startsAt.value
    );

    const endsAt = jakartaDateTimeToISO(
      elements.endsAt.value
    );

    if (!title) {
      showNotice(
        "Judul kajian wajib diisi.",
        "warning"
      );

      elements.title.focus();
      return;
    }

    if (!startsAt || !endsAt) {
      showNotice(
        "Tanggal dan waktu mulai serta selesai wajib diisi dengan benar.",
        "warning"
      );
      return;
    }

    if (
      new Date(endsAt).getTime() <=
      new Date(startsAt).getTime()
    ) {
      showNotice(
        "Waktu selesai harus lebih akhir daripada waktu mulai.",
        "warning"
      );

      elements.endsAt.focus();
      return;
    }

    const payload = {
      title,
      description:
        elements.description.value.trim() || null,
      speaker_name:
        elements.speakerName.value.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      location_name:
        elements.locationName.value.trim() || null,
      location_address:
        elements.locationAddress.value.trim() || null,
      status: "published"
    };

    setBusy(true);

    try {
      let result;

      if (editing) {
        result = await state.supabase
          .from(CONFIG.TABLE)
          .update(payload)
          .eq("id", state.editingId)
          .select("id")
          .single();
      } else {
        result = await state.supabase
          .from(CONFIG.TABLE)
          .insert({
            ...payload,
            created_by: state.user.id
          })
          .select("id")
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      resetForm();

      showNotice(
        editing
          ? "Agenda kajian berhasil diperbarui."
          : "Agenda kajian berhasil ditambahkan.",
        "success"
      );

      state.view = "published";

      updateViewTabs();

      await loadAgendas();
    } catch (error) {
      console.error(
        "[TARBIYAH Agenda] Gagal menyimpan:",
        error
      );

      showNotice(
        error.message ||
          "Agenda gagal disimpan. Periksa koneksi dan izin database.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  /* =======================================================
     ARSIP DAN PULIHKAN AGENDA
     ======================================================= */

async function changeAgendaStatus(id, nextStatus) {
  const allowed =
    (nextStatus === "archived" && can("archive")) ||
    (nextStatus === "published" && can("restore"));

  if (!allowed) {
    showNotice("Kamu tidak memiliki izin untuk tindakan ini.", "warning");
    return;
  }

  const agenda = state.agendas.find(
    item => String(item.id) === String(id)
  );

  if (!agenda) {
    showNotice(
      "Data agenda tidak ditemukan. Muat ulang daftar agenda.",
      "error"
    );
    return;
  }

  const confirmation = nextStatus === "archived"
    ? `Arsipkan agenda "${agenda.title}"?`
    : `Pulihkan agenda "${agenda.title}" ke daftar kajian?`;

  if (!window.confirm(confirmation)) return;

  let timeoutId = null;

  try {
    showNotice(
      nextStatus === "archived"
        ? "Sedang memindahkan agenda ke arsip..."
        : "Sedang memulihkan agenda...",
      "info"
    );

    const updateRequest = state.supabase
      .from(CONFIG.TABLE)
      .update({ status: nextStatus })
      .eq("id", id)
      .select("id, status")
      .single();

    const result = await Promise.race([
      updateRequest,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(
            "Permintaan ke Supabase melewati batas waktu 15 detik. Periksa koneksi dan kebijakan database."
          ));
        }, 15000);
      })
    ]);

    if (result.error) throw result.error;

    if (
      !result.data ||
      String(result.data.id) !== String(id) ||
      result.data.status !== nextStatus
    ) {
      throw new Error(
        "Perubahan status tidak terkonfirmasi oleh database."
      );
    }

    showNotice(
      nextStatus === "archived"
        ? "Agenda berhasil dipindahkan ke arsip."
        : "Agenda berhasil dipulihkan.",
      "success"
    );

    await loadAgendas();

  } catch (error) {
    console.error(
      "[TARBIYAH Agenda] Gagal mengubah status:",
      error
    );

    showNotice(
      error.message || "Status agenda gagal diperbarui.",
      "error"
    );

  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}


  /* =======================================================
     HAPUS PERMANEN
     KHUSUS SUPER ADMIN
     ======================================================= */

  async function deleteAgendaPermanently(id) {
    if (
      !can("delete") ||
      state.role !== "super_admin"
    ) {
      showNotice(
        "Hapus permanen hanya tersedia bagi Super Admin.",
        "warning"
      );
      return;
    }

    const agenda = state.agendas.find(
      item => String(item.id) === String(id)
    );

    if (!agenda) return;

    const confirmation = window.confirm(
      `PERINGATAN!\n\nAgenda "${agenda.title}" akan dihapus permanen dan tidak dapat dipulihkan.\n\nLanjutkan?`
    );

    if (!confirmation) return;

    try {
      /*
       * Periksa data presensi terlebih dahulu.
       * Agenda yang sudah memiliki presensi tidak dihapus.
       */
      const attendanceResult = await state.supabase
        .from(CONFIG.ATTENDANCE_TABLE)
        .select("id")
        .eq("agenda_id", id)
        .limit(1);

      if (attendanceResult.error) {
        throw attendanceResult.error;
      }

      if (attendanceResult.data?.length) {
        showNotice(
          "Agenda tidak dapat dihapus karena sudah memiliki data presensi. Hapus atau kelola data presensinya terlebih dahulu sesuai kebijakan sistem.",
          "warning"
        );

        return;
      }

      const { error } = await state.supabase
        .from(CONFIG.TABLE)
        .delete()
        .eq("id", id);

      if (error) throw error;

      showNotice(
        "Agenda berhasil dihapus permanen.",
        "success"
      );

      await loadAgendas();
    } catch (error) {
      console.error(
        "[TARBIYAH Agenda] Gagal menghapus:",
        error
      );

      showNotice(
        error.message ||
          "Agenda gagal dihapus. Periksa relasi data dan izin database.",
        "error"
      );
    }
  }

  /* =======================================================
     EVENT KARTU AGENDA
     ======================================================= */

  function bindCardEvents() {
    if (!elements.agendaList) return;

    elements.agendaList.addEventListener(
      "click",
      event => {
        const button = event.target.closest(
          "[data-action][data-id]"
        );

        if (
          !button ||
          !elements.agendaList.contains(button)
        ) {
          return;
        }

        const { action, id } = button.dataset;

        if (!id || button.disabled) return;

        if (action === "edit") {
          startEdit(id);
        }

        if (action === "archive") {
          changeAgendaStatus(id, "archived");
        }

        if (action === "restore") {
          changeAgendaStatus(id, "published");
        }

        if (action === "delete") {
          deleteAgendaPermanently(id);
        }
      }
    );
  }

  /* =======================================================
     SIDEBAR
     ======================================================= */

  function openSidebar() {
    if (!elements.sidebar) return;

    elements.sidebar.classList.add("is-open");

    elements.sidebarOverlay?.classList.add(
      "is-visible"
    );

    elements.sidebar.setAttribute(
      "aria-hidden",
      "false"
    );

    elements.menuButton?.setAttribute(
      "aria-expanded",
      "true"
    );

    document.body.classList.add(
      "agenda-menu-open"
    );
  }

  function closeSidebar() {
    elements.sidebar?.classList.remove("is-open");

    elements.sidebarOverlay?.classList.remove(
      "is-visible"
    );

    elements.sidebar?.setAttribute(
      "aria-hidden",
      "true"
    );

    elements.menuButton?.setAttribute(
      "aria-expanded",
      "false"
    );

    document.body.classList.remove(
      "agenda-menu-open"
    );
  }

  /* =======================================================
     BIND EVENT HALAMAN
     ======================================================= */

  function bindEvents() {
    if (state.eventsBound) return;

    state.eventsBound = true;

    elements.form?.addEventListener(
      "submit",
      saveAgenda
    );

    elements.cancelEditButton?.addEventListener(
      "click",
      resetForm
    );

    elements.refreshButton?.addEventListener(
      "click",
      loadAgendas
    );

    elements.tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        switchAgendaView(
          tab.dataset.agendaView
        );
      });
    });

    bindCardEvents();

    elements.menuButton?.addEventListener(
      "click",
      openSidebar
    );

    elements.menuCloseButton?.addEventListener(
      "click",
      closeSidebar
    );

    elements.sidebarOverlay?.addEventListener(
      "click",
      closeSidebar
    );

    document.addEventListener(
      "keydown",
      event => {
        if (event.key === "Escape") {
          closeSidebar();
        }
      }
    );

    elements.sidebar
      ?.querySelectorAll("a")
      .forEach(link => {
        link.addEventListener(
          "click",
          closeSidebar
        );
      });
  }

  /* =======================================================
     INISIALISASI
     ======================================================= */

  async function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    bindEvents();

    if (elements.currentYear) {
      elements.currentYear.textContent =
        String(new Date().getFullYear());
    }

    setConnection(
      "loading",
      "Menghubungkan...",
      "Sedang memeriksa sesi dan koneksi database."
    );

    try {
      state.supabase =
        await waitForSupabaseClient();

      state.user =
        await getAuthenticatedUser();

      await loadUserRole();

      updateRoleInterface();

      await loadAgendas();

      console.info(
        "[TARBIYAH Agenda] Versi 3.3.1 siap.",
        {
          role: state.role,
          userId: state.user.id,
          view: state.view,
          permissions: {
            ...PERMISSIONS[state.role]
          }
        }
      );
    } catch (error) {
      console.error(
        "[TARBIYAH Agenda] Inisialisasi gagal:",
        error
      );

      setConnection(
        "error",
        "Halaman belum siap",
        error.message ||
          "Terjadi kesalahan saat memulai halaman."
      );

      showNotice(
        error.message ||
          "Gagal menginisialisasi halaman agenda.",
        "error"
      );

      if (elements.formPanel) {
        elements.formPanel.hidden = true;
      }

      state.initialized = false;
    }
  }

  /* =======================================================
     API GLOBAL
     ======================================================= */

  window.TARBIYAH_AGENDA_KAJIAN =
    Object.freeze({
      refresh: loadAgendas,

      getRole: () => state.role,

      getView: () => state.view,

      getPermissions: () => ({
        ...PERMISSIONS[state.role]
      }),

      getAgendas: () =>
        state.agendas.map(item => ({
          ...item
        }))
    });

  /* =======================================================
     DOM READY
     ======================================================= */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
