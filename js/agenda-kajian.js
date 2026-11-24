```javascript
/* ============================================================
   TARBIYAH — AGENDA KAJIAN
   Version 3.2 — Unified Agenda & Role-Based Access
   Timezone: Asia/Jakarta

   Fitur:
   - Agenda aktif dan arsip dalam satu halaman
   - Hak akses Anggota, Mentor, Admin, Super Admin
   - Tambah, ubah, arsipkan, pulihkan agenda
   - Hapus permanen khusus Super Admin
   - Integrasi Supabase
   - Google Maps
   - Validasi tanggal dan waktu WIB
   ============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_AGENDA_KAJIAN_V32__) return;
  window.__TARBIYAH_AGENDA_KAJIAN_V32__ = true;

  /* ============================================================
     1. KONFIGURASI
     ============================================================ */

  const CONFIG = {
    TABLE: "kajian_agenda",
    ATTENDANCE_TABLE: "kajian_attendance",
    ROLE_TABLE: "user_roles",
    TIMEZONE: "Asia/Jakarta",
    CLIENT_WAIT_MS: 15000,
    MAX_AGENDAS: 200
  };

  const PERMISSIONS = {
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
  };

  const state = {
    supabase: null,
    user: null,
    role: "member",
    roleLookupWarning: "",
    agendas: [],
    editingId: null,
    busy: false,
    initialized: false,
    eventsBound: false,
    view: "published"
  };

  /* ============================================================
     2. ELEMEN DOM
     ============================================================ */

  const $ = (id) => document.getElementById(id);

  const elements = {
    form: $("agendaForm"),
    formPanel: $("agendaFormPanel"),
    formHeading: $("formHeading"),
    agendaId: $("agendaId"),

    title: $("title"),
    description: $("description"),
    speakerName: $("speakerName"),
    startsAt: $("startsAt"),
    endsAt: $("endsAt"),
    locationName: $("locationName"),
    locationAddress: $("locationAddress"),

    saveButton: $("saveButton"),
    cancelEditButton: $("cancelEditButton"),

    agendaList: $("agendaList"),
    agendaCount: $("agendaCount"),

    notice: $("agendaNotice"),

    connectionIndicator: $("connectionIndicator"),
    connectionTitle: $("connectionTitle"),
    connectionDescription: $("connectionDescription"),

    refreshButton: $("refreshButton"),
    userRole: $("userRole"),
    currentYear: $("currentYear"),

    accessInformation: $("agendaAccessInformation"),
    accessMessage: $("agendaAccessMessage")
  };

  /* ============================================================
     3. UTILITAS
     ============================================================ */

  function normalizeRole(value) {
    const role = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    if ([
      "super_admin",
      "superadmin",
      "superadministrator"
    ].includes(role)) {
      return "super_admin";
    }

    if ([
      "admin",
      "administrator"
    ].includes(role)) {
      return "admin";
    }

    if ([
      "mentor",
      "ustadz",
      "pengajar"
    ].includes(role)) {
      return "mentor";
    }

    return "member";
  }

  function getPermissions() {
    return PERMISSIONS[state.role] || PERMISSIONS.member;
  }

  function can(permission) {
    return getPermissions()[permission] === true;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return map[char];
    });
  }

  function showNotice(message, type = "info") {
    if (!elements.notice) return;

    elements.notice.textContent = message;
    elements.notice.className = `agenda-notice is-${type}`;
    elements.notice.hidden = false;

    if (state.noticeTimer) {
      clearTimeout(state.noticeTimer);
    }

    state.noticeTimer = setTimeout(() => {
      if (elements.notice) {
        elements.notice.hidden = true;
      }
    }, 6000);
  }

  function hideNotice() {
    if (!elements.notice) return;

    elements.notice.hidden = true;
    elements.notice.textContent = "";
  }

  function setConnection(status, title, description) {
    if (elements.connectionTitle) {
      elements.connectionTitle.textContent = title;
    }

    if (elements.connectionDescription) {
      elements.connectionDescription.textContent = description;
    }

    if (elements.connectionIndicator) {
      elements.connectionIndicator.dataset.status = status;
    }
  }

  function getErrorMessage(error) {
    if (!error) return "Terjadi kesalahan yang tidak diketahui.";

    return (
      error.message ||
      error.details ||
      error.hint ||
      String(error)
    );
  }

  /* ============================================================
     4. SUPABASE CLIENT
     ============================================================ */

  function findSupabaseClient() {
    const candidates = [
      window.tarbiyahSupabase,
      window.supabaseClient,
      window.TARBIYAH_SUPABASE
    ];

    return candidates.find((client) => {
      return (
        client &&
        client.auth &&
        typeof client.auth.getUser === "function" &&
        typeof client.from === "function"
      );
    }) || null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForSupabaseClient() {
    const started = Date.now();

    while (Date.now() - started < CONFIG.CLIENT_WAIT_MS) {
      const client = findSupabaseClient();

      if (client) {
        state.supabase = client;
        return client;
      }

      await sleep(250);
    }

    throw new Error(
      "Supabase belum tersedia. Periksa urutan pemuatan config.js dan supabase-client.js."
    );
  }

  /* ============================================================
     5. AUTENTIKASI
     ============================================================ */

  async function getAuthenticatedUser() {
    if (!state.supabase) {
      throw new Error("Koneksi Supabase belum tersedia.");
    }

    const {
      data,
      error
    } = await state.supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!data || !data.user) {
      throw new Error(
        "Sesi pengguna tidak ditemukan. Silakan masuk kembali."
      );
    }

    return data.user;
  }

  /* ============================================================
     6. PEMBACAAN ROLE
     ============================================================ */

  async function loadUserRole() {
    const {
      data,
      error
    } = await state.supabase
      .from(CONFIG.ROLE_TABLE)
      .select("role_id, roles(name)")
      .eq("user_id", state.user.id);

    if (error) {
      state.role = "member";
      state.roleLookupWarning =
        "Hak akses tidak dapat diverifikasi. Mode baca saja diaktifkan.";

      console.warn(
        "[TARBIYAH] Gagal membaca role pengguna:",
        error
      );

      return;
    }

    state.roleLookupWarning = "";

    const rows = Array.isArray(data) ? data : [];

    const roleNames = rows
      .map((row) => {
        const relation = row.roles;

        if (Array.isArray(relation)) {
          return relation[0]?.name || "";
        }

        return relation?.name || "";
      })
      .filter(Boolean);

    const normalizedRoles = roleNames.map(normalizeRole);

    if (normalizedRoles.includes("super_admin")) {
      state.role = "super_admin";
    } else if (normalizedRoles.includes("admin")) {
      state.role = "admin";
    } else if (normalizedRoles.includes("mentor")) {
      state.role = "mentor";
    } else {
      state.role = "member";
    }
  }

  /* ============================================================
     7. TAMPILAN BERDASARKAN ROLE
     ============================================================ */

  function updateRoleInterface() {
    const permissions = getPermissions();

    if (elements.userRole) {
      const labels = {
        member: "Anggota",
        mentor: "Mentor",
        admin: "Admin",
        super_admin: "Super Admin"
      };

      elements.userRole.textContent =
        labels[state.role] || "Anggota";
    }

    // Form hanya untuk pengguna yang berhak mengelola agenda.
    if (elements.formPanel) {
      elements.formPanel.hidden = !permissions.create;
    }

    // Anggota hanya dapat melihat agenda aktif.
    const archivedTab = document.querySelector(
      '[data-agenda-view="archived"]'
    );

    if (archivedTab) {
      archivedTab.hidden = !permissions.viewArchived;
    }

    if (!permissions.viewArchived && state.view === "archived") {
      state.view = "published";
    }

    updateViewTabs();

    if (elements.accessInformation && elements.accessMessage) {
      elements.accessInformation.hidden = false;

      if (state.roleLookupWarning) {
        elements.accessMessage.textContent =
          state.roleLookupWarning;
      } else if (state.role === "member") {
        elements.accessMessage.textContent =
          "Anda dapat melihat agenda kajian aktif. Fitur pengelolaan agenda hanya tersedia bagi Mentor, Admin, dan Super Admin.";
      } else if (state.role === "super_admin") {
        elements.accessMessage.textContent =
          "Anda masuk sebagai Super Admin dan memiliki akses penuh untuk mengelola agenda kajian.";
      } else {
        elements.accessMessage.textContent =
          "Anda dapat mengelola agenda kajian sesuai hak akses akun Anda.";
      }
    }

    if (!permissions.create) {
      resetForm();
    }
  }

  /* ============================================================
     8. TANGGAL DAN WAKTU WIB
     ============================================================ */

  function jakartaDateTimeToISO(value) {
    if (!value) {
      throw new Error("Tanggal dan waktu wajib diisi.");
    }

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
    );

    if (!match) {
      throw new Error("Format tanggal dan waktu tidak valid.");
    }

    const [
      ,
      year,
      month,
      day,
      hour,
      minute
    ] = match;

    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const h = Number(hour);
    const min = Number(minute);

    const check = new Date(Date.UTC(y, m - 1, d));

    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== m - 1 ||
      check.getUTCDate() !== d ||
      h > 23 ||
      min > 59
    ) {
      throw new Error("Tanggal atau waktu tidak valid.");
    }

    // WIB = UTC+07:00
    return `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
  }

  function toJakartaInput(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: CONFIG.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });

    const parts = {};

    formatter.formatToParts(date).forEach((part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
    });

    return (
      `${parts.year}-${parts.month}-${parts.day}` +
      `T${parts.hour}:${parts.minute}`
    );
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

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

  /* ============================================================
     9. GOOGLE MAPS
     ============================================================ */

  function getMapURL(locationAddress, locationName) {
    const address = String(locationAddress || "").trim();

    if (address) {
      if (/^https?:\/\//i.test(address)) {
        try {
          const url = new URL(address);

          const allowedHosts = [
            "maps.app.goo.gl",
            "goo.gl",
            "google.com",
            "www.google.com",
            "maps.google.com"
          ];

          if (
            allowedHosts.includes(url.hostname) ||
            url.hostname.endsWith(".google.com")
          ) {
            return url.href;
          }
        } catch (_) {
          // Lanjutkan sebagai alamat pencarian.
        }
      }

      if (
        /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(address)
      ) {
        return (
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(address)
        );
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

  /* ============================================================
     10. TAB AGENDA AKTIF DAN ARSIP
     ============================================================ */

  function updateViewTabs() {
    document.querySelectorAll("[data-agenda-view]").forEach((tab) => {
      const selected = tab.dataset.agendaView === state.view;

      tab.classList.toggle("active", selected);
      tab.setAttribute(
        "aria-selected",
        selected ? "true" : "false"
      );
    });
  }

  async function switchAgendaView(view) {
    if (state.busy) return;

    if (view !== "published" && view !== "archived") {
      return;
    }

    if (view === "archived" && !can("viewArchived")) {
      showNotice(
        "Akses arsip agenda tidak tersedia untuk akun Anda.",
        "warning"
      );
      return;
    }

    state.view = view;
    updateViewTabs();

    resetForm();
    await loadAgendas();
  }

  /* ============================================================
     11. MEMUAT DATA AGENDA
     ============================================================ */

  async function loadAgendas() {
    if (!state.supabase || !state.user) return;

    if (
      state.view === "archived" &&
      !can("viewArchived")
    ) {
      state.view = "published";
    }

    if (elements.agendaList) {
      elements.agendaList.innerHTML =
        '<div class="agenda-loading">Memuat agenda kajian...</div>';
    }

    try {
      let query = state.supabase
        .from(CONFIG.TABLE)
        .select(
          "id, title, description, speaker_name, starts_at, ends_at, location_name, location_address, status"
        )
        .eq("status", state.view)
        .order("starts_at", { ascending: true })
        .limit(CONFIG.MAX_AGENDAS);

      // Pengguna anggota tidak pernah meminta data arsip.
      if (state.role === "member") {
        query = query.eq("status", "published");
      }

      const {
        data,
        error
      } = await query;

      if (error) throw error;

      state.agendas = Array.isArray(data) ? data : [];

      renderAgendas();

      setConnection(
        "connected",
        "Terhubung",
        "Data agenda kajian berhasil dimuat dari Supabase."
      );

      if (elements.refreshButton) {
        elements.refreshButton.disabled = false;
      }

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal memuat agenda:",
        error
      );

      state.agendas = [];

      if (elements.agendaList) {
        elements.agendaList.innerHTML = `
          <div class="agenda-empty">
            <strong>Agenda belum dapat dimuat.</strong>
            <p>${escapeHTML(getErrorMessage(error))}</p>
            <p>Periksa koneksi Supabase dan kebijakan RLS tabel kajian_agenda.</p>
          </div>
        `;
      }

      if (elements.agendaCount) {
        elements.agendaCount.textContent = "0";
      }

      setConnection(
        "error",
        "Gagal memuat data",
        getErrorMessage(error)
      );
    }
  }

  /* ============================================================
     12. RENDER AGENDA
     ============================================================ */

  function renderAgendas() {
    if (!elements.agendaList) return;

    if (elements.agendaCount) {
      elements.agendaCount.textContent =
        String(state.agendas.length);
    }

    if (!state.agendas.length) {
      elements.agendaList.innerHTML = `
        <div class="agenda-empty">
          <strong>
            ${state.view === "published"
              ? "Belum ada agenda kajian aktif."
              : "Belum ada agenda dalam arsip."}
          </strong>
          <p>
            ${state.view === "published"
              ? "Agenda kajian yang diterbitkan akan tampil di sini."
              : "Agenda yang diarsipkan akan tampil di sini."}
          </p>
        </div>
      `;

      return;
    }

    elements.agendaList.innerHTML = state.agendas
      .map((agenda) => renderAgendaCard(agenda))
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

    const mapURL = getMapURL(
      agenda.location_address,
      agenda.location_name
    );

    let actions = "";

    if (state.view === "published") {
      if (can("edit")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-edit"
            data-action="edit"
            data-id="${id}">
            Ubah
          </button>
        `;
      }

      if (can("archive")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-archive"
            data-action="archive"
            data-id="${id}">
            Arsipkan
          </button>
        `;
      }

    } else {
      if (can("restore")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-restore"
            data-action="restore"
            data-id="${id}">
            Pulihkan
          </button>
        `;
      }

      if (can("delete")) {
        actions += `
          <button
            type="button"
            class="agenda-action agenda-delete"
            data-action="delete"
            data-id="${id}">
            Hapus Permanen
          </button>
        `;
      }
    }

    const mapButton = mapURL
      ? `
        <a
          class="agenda-map-link"
          href="${escapeHTML(mapURL)}"
          target="_blank"
          rel="noopener noreferrer">
          Lihat Lokasi di Google Maps
        </a>
      `
      : "";

    return `
      <article class="agenda-card" data-agenda-id="${id}">

        <div class="agenda-card-header">
          <h3>${title}</h3>

          <span class="agenda-status ${
            state.view === "published"
              ? "status-active"
              : "status-archived"
          }">
            ${
              state.view === "published"
                ? "Agenda Aktif"
                : "Agenda Diarsipkan"
            }
          </span>
        </div>

        <div class="agenda-card-body">

          <p class="agenda-description">
            ${description}
          </p>

          <div class="agenda-detail">
            <span>Pemateri</span>
            <strong>${speaker}</strong>
          </div>

          <div class="agenda-detail">
            <span>Mulai</span>
            <strong>${escapeHTML(formatDateTime(agenda.starts_at))}</strong>
          </div>

          <div class="agenda-detail">
            <span>Selesai</span>
            <strong>${escapeHTML(formatDateTime(agenda.ends_at))}</strong>
          </div>

          <div class="agenda-detail">
            <span>Lokasi</span>
            <strong>${location}</strong>
          </div>

          ${
            address
              ? `<div class="agenda-address">${address}</div>`
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

  /* ============================================================
     13. MENCARI AGENDA
     ============================================================ */

  function findAgenda(id) {
    return state.agendas.find(
      (agenda) => String(agenda.id) === String(id)
    );
  }

  /* ============================================================
     14. EDIT AGENDA
     ============================================================ */

  function startEdit(id) {
    if (!can("edit")) {
      showNotice(
        "Anda tidak memiliki izin untuk mengubah agenda.",
        "warning"
      );
      return;
    }

    const agenda = findAgenda(id);

    if (!agenda) {
      showNotice("Agenda tidak ditemukan.", "error");
      return;
    }

    if (!elements.form) return;

    state.editingId = agenda.id;

    if (elements.agendaId) {
      elements.agendaId.value = agenda.id;
    }

    elements.title.value = agenda.title || "";
    elements.description.value = agenda.description || "";
    elements.speakerName.value = agenda.speaker_name || "";
    elements.startsAt.value = toJakartaInput(agenda.starts_at);
    elements.endsAt.value = toJakartaInput(agenda.ends_at);
    elements.locationName.value = agenda.location_name || "";
    elements.locationAddress.value = agenda.location_address || "";

    if (elements.formHeading) {
      elements.formHeading.textContent = "Ubah Agenda Kajian";
    }

    if (elements.saveButton) {
      elements.saveButton.textContent = "Simpan Perubahan";
    }

    if (elements.cancelEditButton) {
      elements.cancelEditButton.hidden = false;
    }

    elements.form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /* ============================================================
     15. RESET FORM
     ============================================================ */

  function resetForm() {
    if (elements.form) {
      elements.form.reset();
    }

    state.editingId = null;

    if (elements.agendaId) {
      elements.agendaId.value = "";
    }

    if (elements.formHeading) {
      elements.formHeading.textContent = "Tambah Agenda Kajian";
    }

    if (elements.saveButton) {
      elements.saveButton.textContent = "Simpan Agenda";
    }

    if (elements.cancelEditButton) {
      elements.cancelEditButton.hidden = true;
    }
  }

  /* ============================================================
     16. STATUS BUSY
     ============================================================ */

  function setBusy(busy) {
    state.busy = Boolean(busy);

    if (elements.form) {
      elements.form
        .querySelectorAll("input, textarea, select, button")
        .forEach((element) => {
          element.disabled =
            state.busy || !can("create");
        });
    }

    if (elements.refreshButton) {
      elements.refreshButton.disabled = state.busy;
    }

    document.querySelectorAll(
      ".agenda-action, [data-agenda-view]"
    ).forEach((element) => {
      element.disabled = state.busy;
    });
  }

  /* ============================================================
     17. SIMPAN AGENDA
     ============================================================ */

  async function saveAgenda(event) {
    event.preventDefault();

    if (state.busy) return;

    if (!can("create")) {
      showNotice(
        "Anda tidak memiliki izin untuk menambah agenda.",
        "warning"
      );
      return;
    }

    if (state.editingId && !can("edit")) {
      showNotice(
        "Anda tidak memiliki izin untuk mengubah agenda.",
        "warning"
      );
      return;
    }

    try {
      const title = elements.title.value.trim();
      const description = elements.description.value.trim();
      const speakerName = elements.speakerName.value.trim();
      const startsAt = elements.startsAt.value;
      const endsAt = elements.endsAt.value;
      const locationName = elements.locationName.value.trim();
      const locationAddress = elements.locationAddress.value.trim();

      if (!title) {
        throw new Error("Judul kajian wajib diisi.");
      }

      if (!startsAt || !endsAt) {
        throw new Error(
          "Tanggal dan waktu mulai serta selesai wajib diisi."
        );
      }

      const startISO = jakartaDateTimeToISO(startsAt);
      const endISO = jakartaDateTimeToISO(endsAt);

      if (new Date(endISO) <= new Date(startISO)) {
        throw new Error(
          "Waktu selesai harus setelah waktu mulai."
        );
      }

      const payload = {
        title,
        description,
        speaker_name: speakerName,
        starts_at: startISO,
        ends_at: endISO,
        location_name: locationName,
        location_address: locationAddress,
        status: "published"
      };

      setBusy(true);

      let result;

      if (state.editingId) {
        result = await state.supabase
          .from(CONFIG.TABLE)
          .update(payload)
          .eq("id", state.editingId)
          .select("id")
          .maybeSingle();

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

      if (!result.data) {
        throw new Error(
          "Tidak ada data yang tersimpan. Periksa izin database atau kebijakan RLS."
        );
      }

      const wasEditing = Boolean(state.editingId);

      resetForm();

      showNotice(
        wasEditing
          ? "Agenda kajian berhasil diperbarui."
          : "Agenda kajian berhasil ditambahkan.",
        "success"
      );

      state.view = "published";
      updateViewTabs();

      await loadAgendas();

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal menyimpan agenda:",
        error
      );

      showNotice(
        getErrorMessage(error),
        "error"
      );

    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
     18. ARSIPKAN DAN PULIHKAN
     ============================================================ */

  async function changeAgendaStatus(id, newStatus) {
    const isArchive = newStatus === "archived";

    if (isArchive && !can("archive")) {
      showNotice(
        "Anda tidak memiliki izin untuk mengarsipkan agenda.",
        "warning"
      );
      return;
    }

    if (!isArchive && !can("restore")) {
      showNotice(
        "Anda tidak memiliki izin untuk memulihkan agenda.",
        "warning"
      );
      return;
    }

    const agenda = findAgenda(id);

    if (!agenda) {
      showNotice("Agenda tidak ditemukan.", "error");
      return;
    }

    const confirmed = window.confirm(
      isArchive
        ? `Arsipkan agenda "${agenda.title}"?`
        : `Pulihkan agenda "${agenda.title}" ke daftar agenda aktif?`
    );

    if (!confirmed) return;

    try {
      setBusy(true);

      const {
        data,
        error
      } = await state.supabase
        .from(CONFIG.TABLE)
        .update({
          status: newStatus
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Perubahan tidak berhasil. Periksa izin database atau RLS."
        );
      }

      showNotice(
        isArchive
          ? "Agenda berhasil diarsipkan."
          : "Agenda berhasil dipulihkan.",
        "success"
      );

      await loadAgendas();

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal mengubah status agenda:",
        error
      );

      showNotice(
        getErrorMessage(error),
        "error"
      );

    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
     19. HAPUS PERMANEN — SUPER ADMIN
     ============================================================ */

  async function deleteAgendaPermanently(id) {
    if (!can("delete")) {
      showNotice(
        "Hanya Super Admin yang dapat menghapus agenda permanen.",
        "warning"
      );
      return;
    }

    const agenda = findAgenda(id);

    if (!agenda) {
      showNotice("Agenda tidak ditemukan.", "error");
      return;
    }

    const confirmed = window.confirm(
      `PERINGATAN!\n\n` +
      `Anda akan menghapus agenda "${agenda.title}" secara permanen.\n\n` +
      `Penghapusan hanya diizinkan jika belum ada catatan kehadiran yang terkait.\n\n` +
      `Lanjutkan?`
    );

    if (!confirmed) return;

    try {
      setBusy(true);

      // Pemeriksaan kehadiran dilakukan sebelum penghapusan.
      // Jika pemeriksaan gagal, penghapusan dibatalkan.
      const attendanceCheck = await state.supabase
        .from(CONFIG.ATTENDANCE_TABLE)
        .select("id", {
          count: "exact",
          head: true
        })
        .eq("agenda_id", id);

      if (attendanceCheck.error) {
        throw new Error(
          "Pemeriksaan riwayat kehadiran gagal. Agenda tidak dihapus demi keamanan. " +
          getErrorMessage(attendanceCheck.error)
        );
      }

      if ((attendanceCheck.count ?? 0) > 0) {
        throw new Error(
          "Agenda tidak dapat dihapus karena sudah memiliki riwayat kehadiran."
        );
      }

      const {
        data,
        error
      } = await state.supabase
        .from(CONFIG.TABLE)
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Agenda tidak terhapus. Periksa izin DELETE pada kebijakan RLS."
        );
      }

      showNotice(
        "Agenda berhasil dihapus secara permanen.",
        "success"
      );

      await loadAgendas();

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal menghapus agenda:",
        error
      );

      showNotice(
        getErrorMessage(error),
        "error"
      );

    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
     20. EVENT DELEGATION KARTU AGENDA
     ============================================================ */

  function bindCardEvents() {
    if (!elements.agendaList) return;

    elements.agendaList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");

      if (!button || state.busy) return;

      const action = button.dataset.action;
      const id = button.dataset.id;

      if (!id) return;

      switch (action) {
        case "edit":
          startEdit(id);
          break;

        case "archive":
          await changeAgendaStatus(id, "archived");
          break;

        case "restore":
          await changeAgendaStatus(id, "published");
          break;

        case "delete":
          await deleteAgendaPermanently(id);
          break;

        default:
          break;
      }
    });
  }

  /* ============================================================
     21. EVENT LISTENERS
     ============================================================ */

  function bindEvents() {
    if (state.eventsBound) return;

    state.eventsBound = true;

    if (elements.form) {
      elements.form.addEventListener("submit", saveAgenda);
    }

    if (elements.cancelEditButton) {
      elements.cancelEditButton.addEventListener("click", resetForm);
    }

    if (elements.refreshButton) {
      elements.refreshButton.addEventListener("click", async () => {
        if (!state.busy) {
          await loadAgendas();
          showNotice("Data agenda diperbarui.", "success");
        }
      });
    }

    document.querySelectorAll("[data-agenda-view]").forEach((tab) => {
      tab.addEventListener("click", async () => {
        await switchAgendaView(tab.dataset.agendaView);
      });
    });

    bindCardEvents();
  }

  /* ============================================================
     22. INISIALISASI
     ============================================================ */

  async function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    try {
      setConnection(
        "loading",
        "Menghubungkan...",
        "Memeriksa sesi pengguna dan koneksi database."
      );

      await waitForSupabaseClient();

      state.user = await getAuthenticatedUser();

      await loadUserRole();

      updateRoleInterface();

      bindEvents();

      if (elements.currentYear) {
        elements.currentYear.textContent =
          new Date().getFullYear();
      }

      await loadAgendas();

      if (state.roleLookupWarning) {
        showNotice(
          state.roleLookupWarning,
          "warning"
        );
      }

      console.info(
        "[TARBIYAH] Agenda Kajian v3.2 berhasil diinisialisasi.",
        {
          role: state.role,
          userId: state.user.id
        }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Inisialisasi Agenda Kajian gagal:",
        error
      );

      setConnection(
        "error",
        "Gagal menginisialisasi",
        getErrorMessage(error)
      );

      if (elements.agendaList) {
        elements.agendaList.innerHTML = `
          <div class="agenda-empty">
            <strong>Halaman belum dapat digunakan.</strong>
            <p>${escapeHTML(getErrorMessage(error))}</p>
            <p>Silakan masuk kembali atau periksa koneksi aplikasi.</p>
          </div>
        `;
      }

      if (elements.formPanel) {
        elements.formPanel.hidden = true;
      }
    }
  }

  /* ============================================================
     23. API PUBLIK
     ============================================================ */

  window.TARBIYAH_AGENDA_KAJIAN = {
    refresh: loadAgendas,

    getRole() {
      return state.role;
    },

    getView() {
      return state.view;
    },

    getPermissions() {
      return { ...getPermissions() };
    },

    getAgendas() {
      return [...state.agendas];
    }
  };

  /* ============================================================
     24. START
     ============================================================ */

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
```
