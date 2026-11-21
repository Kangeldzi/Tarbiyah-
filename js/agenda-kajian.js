
/* ============================================================
   TARBIYAH — PENGELOLAAN AGENDA KAJIAN
   File       : js/agenda-kajian.js
   Database   : kajian_agenda
   Role       : super_admin, admin, mentor
   Timezone   : Asia/Jakarta (WIB)
   Version    : 3.0 — Unified & Archive
   ============================================================ */

(() => {
  "use strict";

  /* ============================================================
     0. PENCEGAHAN SCRIPT GANDA
  ============================================================ */

  if (window.__TARBIYAH_AGENDA_KAJIAN_V3__) {
    console.info("[TARBIYAH AGENDA] Versi 3 sudah aktif.");
    return;
  }

  window.__TARBIYAH_AGENDA_KAJIAN_V3__ = true;

  /* ============================================================
     1. KONFIGURASI
  ============================================================ */

  const TABLE = "kajian_agenda";
  const ROLE_TABLE = "user_roles";
  const TIMEZONE = "Asia/Jakarta";
  const ALLOWED_ROLES = ["super_admin", "admin", "mentor"];
  const CLIENT_WAIT_MS = 15000;

  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    user: null,
    role: null,
    agendas: [],
    editingId: null,
    busy: false,
    initialized: false,
    eventsBound: false,
    view: "published"
  };

  /* ============================================================
     2. UTILITAS DASAR
  ============================================================ */

  function log(message, data) {
    if (typeof data === "undefined") {
      console.info("[TARBIYAH AGENDA]", message);
    } else {
      console.info("[TARBIYAH AGENDA]", message, data);
    }
  }

  function showNotice(message, type = "success") {
    const box = $("agendaNotice");
    if (!box) {
      console.warn("[TARBIYAH AGENDA]", message);
      return;
    }

    box.textContent = String(message || "");
    box.classList.toggle("error", type === "error");
    box.hidden = false;
  }

  function hideNotice() {
    const box = $("agendaNotice");
    if (box) {
      box.hidden = true;
      box.textContent = "";
      box.classList.remove("error");
    }
  }

  function setConnection(status, title, description) {
    const indicator = $("connectionIndicator");
    const titleElement = $("connectionTitle");
    const descriptionElement = $("connectionDescription");

    if (indicator) {
      indicator.classList.remove("is-ready", "is-error");

      if (status === "ready") {
        indicator.classList.add("is-ready");
      }

      if (status === "error") {
        indicator.classList.add("is-error");
      }
    }

    if (titleElement) {
      titleElement.textContent = title || "";
    }

    if (descriptionElement) {
      descriptionElement.textContent = description || "";
    }
  }

  function normalizeRole(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function getErrorMessage(error) {
    if (!error) {
      return "Terjadi kesalahan yang tidak diketahui.";
    }

    return (
      error.message ||
      error.details ||
      error.hint ||
      String(error)
    );
  }

  /* ============================================================
     3. KONEKSI SUPABASE
  ============================================================ */

  function findSupabaseClient() {
    const candidates = [
      window.tarbiyahSupabase,
      window.supabaseClient,
      window.TARBIYAH_SUPABASE
    ];

    return candidates.find((client) =>
      client &&
      client.auth &&
      typeof client.auth.getUser === "function" &&
      typeof client.from === "function"
    ) || null;
  }

  async function waitForSupabaseClient() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < CLIENT_WAIT_MS) {
      const client = findSupabaseClient();

      if (client) {
        state.supabase = client;

        log("Supabase client berhasil ditemukan.");

        return client;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 250);
      });
    }

    throw new Error(
      "Supabase client tidak ditemukan. Periksa pemuatan js/config.js dan js/supabase-client.js."
    );
  }

  /* ============================================================
     4. PEMERIKSAAN SESI LOGIN
  ============================================================ */

  async function getAuthenticatedUser() {
    if (!state.supabase) {
      throw new Error(
        "Koneksi Supabase belum tersedia."
      );
    }

    // Gunakan sesi yang sudah disediakan aplikasi jika tersedia.
    const guardedUser =
      window.TARBIYAH_SESSION?.user ||
      window.TARBIYAH_AUTH?.user ||
      null;

    if (guardedUser?.id) {
      log("Sesi pengguna diperoleh dari aplikasi.");
      return guardedUser;
    }

    // Jika tidak tersedia, periksa langsung melalui Supabase Auth.
    const { data, error } =
      await state.supabase.auth.getUser();

    if (error) {
      throw new Error(
        "Pemeriksaan sesi login gagal: " +
        getErrorMessage(error)
      );
    }

    if (!data?.user?.id) {
      throw new Error(
        "Sesi login tidak ditemukan. Silakan masuk kembali melalui halaman login TARBIYAH."
      );
    }

    log("Sesi pengguna berhasil diverifikasi.");

    return data.user;
  }

  /* ============================================================
     5. PEMERIKSAAN HAK AKSES
  ============================================================ */

  async function loadUserRole() {
    const { data, error } = await state.supabase
      .from(ROLE_TABLE)
      .select("role_id, roles(name)")
      .eq("user_id", state.user.id);

    if (error) {
      throw new Error(
        "Gagal memeriksa hak akses akun: " +
        getErrorMessage(error)
      );
    }

    const roles = (data || [])
      .map((item) => {
        const relation = Array.isArray(item.roles)
          ? item.roles[0]
          : item.roles;

        return normalizeRole(relation?.name);
      })
      .filter(Boolean);

    const permittedRole = ALLOWED_ROLES.find((role) =>
      roles.includes(role)
    );

    if (!permittedRole) {
      throw new Error(
        "Akun Anda belum memiliki hak akses untuk mengelola agenda kajian. " +
        "Akses tersedia untuk Super Admin, Admin, dan Mentor."
      );
    }

    state.role = permittedRole;

    const roleElement = $("userRole");

    if (roleElement) {
      roleElement.textContent = permittedRole
        .replaceAll("_", " ")
        .toUpperCase();
    }

    log("Hak akses berhasil diverifikasi.", {
      userId: state.user.id,
      role: state.role
    });
  }

  /* ============================================================
     6. KONVERSI DAN VALIDASI WAKTU WIB
  ============================================================ */

  function jakartaDateTimeToISO(value) {
    if (!value) {
      throw new Error(
        "Tanggal dan waktu agenda wajib diisi."
      );
    }

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
    );

    if (!match) {
      throw new Error(
        "Format tanggal atau waktu tidak valid."
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    const check = new Date(
      Date.UTC(year, month - 1, day, hour, minute)
    );

    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day ||
      check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute
    ) {
      throw new Error(
        "Tanggal atau waktu yang dimasukkan tidak valid."
      );
    }

    // WIB = UTC+07:00.
    return new Date(
      `${value}:00+07:00`
    ).toISOString();
  }

  function toJakartaInput(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);

    const part = (type) =>
      parts.find((item) => item.type === type)?.value || "";

    return (
      `${part("year")}-${part("month")}-${part("day")}` +
      `T${part("hour")}:${part("minute")}`
    );
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const formatted = new Intl.DateTimeFormat("id-ID", {
      timeZone: TIMEZONE,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);

    return `${formatted} WIB`;
  }

  /* ============================================================
     7. TAUTAN GOOGLE MAPS
  ============================================================ */

  function getMapURL(address) {
    const value = String(address || "").trim();

    if (!value) return "";

    // Tautan pendek Google Maps.
    if (
      /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(value)
    ) {
      return value;
    }

    // Tautan Google Maps lengkap.
    if (
      /^https?:\/\/(www\.)?google\.[^/]+\/maps/i.test(value)
    ) {
      return value;
    }

    // Koordinat GPS.
    const coordinateMatch = value.match(
      /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/
    );

    if (coordinateMatch) {
      const lat = Number(coordinateMatch[1]);
      const lng = Number(coordinateMatch[2]);

      if (
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        return (
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(`${lat},${lng}`)
        );
      }
    }

    // Nama tempat atau alamat biasa.
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(value)
    );
  }

  /* ============================================================
     8. TAB AGENDA AKTIF DAN ARSIP
  ============================================================ */

  function ensureViewTabs() {
    const list = $("agendaList");

    if (!list) return;

    let tabs = document.querySelector(".agenda-tabs");

    if (!tabs) {
      tabs = document.createElement("div");
      tabs.className = "agenda-tabs";

      tabs.innerHTML = `
        <button
          type="button"
          class="agenda-tab"
          data-agenda-view="published">
          Agenda Aktif
        </button>

        <button
          type="button"
          class="agenda-tab"
          data-agenda-view="archived">
          Arsip Agenda
        </button>
      `;

      list.parentNode.insertBefore(tabs, list);
    }

    updateViewTabs();
  }

  function updateViewTabs() {
    document
      .querySelectorAll("[data-agenda-view]")
      .forEach((button) => {
        const active =
          button.dataset.agendaView === state.view;

        button.classList.toggle("active", active);
        button.setAttribute(
          "aria-pressed",
          active ? "true" : "false"
        );
      });
  }

  async function switchAgendaView(view) {
    if (state.busy) return;

    if (!["published", "archived"].includes(view)) {
      return;
    }

    if (state.view === view) return;

    state.view = view;
    updateViewTabs();
    hideNotice();

    try {
      await loadAgendas();
    } catch (error) {
      console.error(
        "[TARBIYAH AGENDA] Gagal mengganti tampilan:",
        error
      );

      showNotice(
        getErrorMessage(error),
        "error"
      );
    }
  }

  /* ============================================================
     9. MEMUAT AGENDA DARI SUPABASE
  ============================================================ */

  async function loadAgendas() {
    const list = $("agendaList");

    if (list) {
      list.innerHTML = `
        <div class="agenda-empty">
          Memuat data agenda...
        </div>
      `;
    }

    const { data, error } = await state.supabase
      .from(TABLE)
      .select(
        "id, title, description, speaker_name, starts_at, ends_at, location_name, location_address, status"
      )
      .eq("status", state.view)
      .order("starts_at", { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(
        "Gagal memuat agenda: " + getErrorMessage(error)
      );
    }

    state.agendas = data || [];

    renderAgendas();

    log("Daftar agenda berhasil dimuat.", {
      view: state.view,
      count: state.agendas.length
    });
  }

  /* ============================================================
     10. MENAMPILKAN DAFTAR AGENDA
  ============================================================ */

  function renderAgendas() {
    const list = $("agendaList");
    const count = $("agendaCount");

    if (!list) return;

    if (count) {
      count.textContent = `${state.agendas.length} agenda`;
    }

    updateViewTabs();

    if (!state.agendas.length) {
      const emptyTitle =
        state.view === "archived"
          ? "Belum ada agenda yang diarsipkan"
          : "Belum ada agenda terbit";

      const emptyDescription =
        state.view === "archived"
          ? "Agenda yang diarsipkan akan ditampilkan di sini."
          : "Gunakan formulir untuk membuat agenda kajian pertama.";

      list.innerHTML = `
        <div class="agenda-empty">
          <span>☾</span>
          <strong>${emptyTitle}</strong>
          <p>${emptyDescription}</p>
        </div>
      `;

      return;
    }

    list.innerHTML = state.agendas.map((item) => {
      const location =
        item.location_name ||
        item.location_address ||
        "";

      const mapURL = getMapURL(
        item.location_address || item.location_name
      );

      const mapLink = mapURL
        ? `
          <a
            class="agenda-map-link"
            href="${escapeHTML(mapURL)}"
            target="_blank"
            rel="noopener noreferrer">
            ⌖ Buka Peta
          </a>
        `
        : "";

      const actionButtons =
        state.view === "published"
          ? `
            <button
              type="button"
              data-edit-id="${escapeHTML(item.id)}">
              Ubah Agenda
            </button>

            <button
              type="button"
              data-archive-id="${escapeHTML(item.id)}">
              Arsipkan Agenda
            </button>
          `
          : `
            <button
              type="button"
              data-restore-id="${escapeHTML(item.id)}">
              Pulihkan Agenda
            </button>
          `;

      const statusLabel =
        state.view === "archived"
          ? "DIARSIPKAN"
          : "TERBIT";

      return `
        <article class="agenda-card">
          <div class="agenda-card-top">
            <div>
              <h3>${escapeHTML(item.title)}</h3>
              <span class="agenda-live-label">
                ${statusLabel}
              </span>
            </div>
          </div>

          <p>
            ◷ Mulai:
            ${escapeHTML(formatDateTime(item.starts_at))}
          </p>

          <p>
            ◷ Selesai:
            ${escapeHTML(formatDateTime(item.ends_at))}
          </p>

          ${
            item.speaker_name
              ? `
                <p>
                  ◉ Pemateri:
                  ${escapeHTML(item.speaker_name)}
                </p>
              `
              : ""
          }

          ${
            location
              ? `<p>⌖ ${escapeHTML(location)}</p>`
              : ""
          }

          ${
            item.description
              ? `<p>${escapeHTML(item.description)}</p>`
              : ""
          }

          <div class="agenda-card-actions">
            ${actionButtons}
            ${mapLink}
          </div>
        </article>
      `;
    }).join("");

    bindCardEvents();
  }

  /* ============================================================
     11. EVENT TOMBOL PADA KARTU AGENDA
  ============================================================ */

  function bindCardEvents() {
    const list = $("agendaList");

    if (!list) return;

    list.querySelectorAll("[data-edit-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.agendas.find(
          (agenda) =>
            String(agenda.id) === button.dataset.editId
        );

        if (item) {
          startEdit(item);
        }
      });
    });

    list.querySelectorAll("[data-archive-id]").forEach((button) => {
      button.addEventListener("click", () => {
        changeAgendaStatus(
          button.dataset.archiveId,
          "archived"
        );
      });
    });

    list.querySelectorAll("[data-restore-id]").forEach((button) => {
      button.addEventListener("click", () => {
        changeAgendaStatus(
          button.dataset.restoreId,
          "published"
        );
      });
    });
  }

  /* ============================================================
     12. ARSIP DAN PEMULIHAN AGENDA
  ============================================================ */

  async function changeAgendaStatus(id, newStatus) {
    if (state.busy) return;

    if (!["published", "archived"].includes(newStatus)) {
      showNotice("Status agenda tidak valid.", "error");
      return;
    }

    const item = state.agendas.find(
      (agenda) => String(agenda.id) === String(id)
    );

    if (!item) {
      showNotice("Agenda tidak ditemukan.", "error");
      return;
    }

    const isArchive = newStatus === "archived";

    const confirmation = isArchive
      ? `Arsipkan agenda "${item.title}"? Agenda tidak akan dihapus permanen.`
      : `Pulihkan agenda "${item.title}" agar tampil kembali dalam daftar aktif?`;

    if (!window.confirm(confirmation)) {
      return;
    }

    try {
      setBusy(true);
      hideNotice();

      const { data, error } = await state.supabase
        .from(TABLE)
        .update({ status: newStatus })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error(getErrorMessage(error));
      }

      if (!data) {
        throw new Error(
          "Status agenda tidak berubah. Periksa izin UPDATE dan SELECT pada kebijakan RLS."
        );
      }

      await loadAgendas();

      showNotice(
        isArchive
          ? "Agenda berhasil diarsipkan."
          : "Agenda berhasil dipulihkan."
      );

      log(
        isArchive
          ? "Agenda berhasil diarsipkan."
          : "Agenda berhasil dipulihkan.",
        { id }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH AGENDA] Perubahan status gagal:",
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
     13. FORMULIR UBAH AGENDA
  ============================================================ */

  function startEdit(item) {
    if (state.busy) return;

    state.editingId = item.id;

    $("agendaId").value = item.id;
    $("title").value = item.title || "";
    $("description").value = item.description || "";
    $("speakerName").value = item.speaker_name || "";
    $("startsAt").value = toJakartaInput(item.starts_at);
    $("endsAt").value = toJakartaInput(item.ends_at);
    $("locationName").value = item.location_name || "";
    $("locationAddress").value = item.location_address || "";

    $("formHeading").textContent = "Ubah Agenda";
    $("saveButton").textContent = "Simpan Perubahan";
    $("cancelEditButton").hidden = false;

    hideNotice();

    $("agendaForm").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function resetForm() {
    state.editingId = null;

    const form = $("agendaForm");

    if (form) {
      form.reset();
    }

    if ($("agendaId")) {
      $("agendaId").value = "";
    }

    if ($("formHeading")) {
      $("formHeading").textContent = "Buat Agenda Baru";
    }

    if ($("saveButton")) {
      $("saveButton").textContent = "Terbitkan Agenda";
    }

    if ($("cancelEditButton")) {
      $("cancelEditButton").hidden = true;
    }
  }

  /* ============================================================
     14. PENGENDALIAN PROSES
  ============================================================ */

  function setBusy(value) {
    state.busy = Boolean(value);

    const saveButton = $("saveButton");
    const refreshButton = $("refreshButton");
    const cancelButton = $("cancelEditButton");

    if (saveButton) {
      saveButton.disabled = state.busy;

      saveButton.textContent = state.busy
        ? "Memproses..."
        : state.editingId
          ? "Simpan Perubahan"
          : "Terbitkan Agenda";
    }

    if (refreshButton) {
      refreshButton.disabled = state.busy;
    }

    if (cancelButton) {
      cancelButton.disabled = state.busy;
    }

    document
      .querySelectorAll(
        "#agendaList button[data-edit-id], " +
        "#agendaList button[data-archive-id], " +
        "#agendaList button[data-restore-id]"
      )
      .forEach((button) => {
        button.disabled = state.busy;
      });

    document
      .querySelectorAll("[data-agenda-view]")
      .forEach((button) => {
        button.disabled = state.busy;
      });
  }

  /* ============================================================
     15. SIMPAN AGENDA BARU DAN PERUBAHAN
  ============================================================ */

  async function saveAgenda(event) {
    event.preventDefault();

    if (state.busy) return;

    hideNotice();

    // Simpan status edit sebelum resetForm mengosongkannya.
    const editingAtStart = state.editingId;

    try {
      const title = $("title").value.trim();

      if (!title) {
        throw new Error("Judul agenda wajib diisi.");
      }

      const startsAt = jakartaDateTimeToISO(
        $("startsAt").value
      );

      const endsAt = jakartaDateTimeToISO(
        $("endsAt").value
      );

      if (
        new Date(endsAt).getTime() <=
        new Date(startsAt).getTime()
      ) {
        throw new Error(
          "Waktu selesai harus setelah waktu mulai."
        );
      }

      const payload = {
        title,
        description:
          $("description").value.trim() || null,
        speaker_name:
          $("speakerName").value.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        location_name:
          $("locationName").value.trim() || null,
        location_address:
          $("locationAddress").value.trim() || null,
        status: "published"
      };

      setBusy(true);

      let result;

      if (editingAtStart) {
        // Perbarui agenda yang sudah ada.
        result = await state.supabase
          .from(TABLE)
          .update(payload)
          .eq("id", editingAtStart)
          .select("id")
          .maybeSingle();

      } else {
        // Buat agenda baru.
        result = await state.supabase
          .from(TABLE)
          .insert({
            ...payload,
            created_by: state.user.id
          })
          .select("id")
          .maybeSingle();
      }

      if (result.error) {
        throw new Error(
          getErrorMessage(result.error)
        );
      }

      if (!result.data) {
        throw new Error(
          editingAtStart
            ? "Tidak ada agenda yang diperbarui. Periksa izin UPDATE dan SELECT pada RLS."
            : "Agenda belum berhasil disimpan. Periksa izin INSERT dan SELECT pada RLS."
        );
      }

      resetForm();

      // Setelah simpan, tampilkan daftar agenda aktif.
      state.view = "published";
      updateViewTabs();

      await loadAgendas();

      showNotice(
        editingAtStart
          ? "Perubahan agenda berhasil disimpan."
          : "Agenda baru berhasil diterbitkan."
      );

      log(
        editingAtStart
          ? "Agenda berhasil diperbarui."
          : "Agenda baru berhasil diterbitkan.",
        { id: result.data.id }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH AGENDA] Simpan agenda gagal:",
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
     16. EVENT LISTENER HALAMAN
  ============================================================ */

  function bindEvents() {
    if (state.eventsBound) return;

    const form = $("agendaForm");
    const cancelButton = $("cancelEditButton");
    const refreshButton = $("refreshButton");

    if (!form || !refreshButton) {
      throw new Error(
        "Formulir atau tombol muat ulang tidak ditemukan pada halaman."
      );
    }

    form.addEventListener("submit", saveAgenda);

    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        resetForm();
        hideNotice();
      });
    }

    refreshButton.addEventListener("click", async () => {
      if (state.busy) return;

      try {
        hideNotice();
        setBusy(true);

        await loadAgendas();

        showNotice(
          "Daftar agenda berhasil diperbarui."
        );

      } catch (error) {
        console.error(
          "[TARBIYAH AGENDA] Refresh gagal:",
          error
        );

        showNotice(
          getErrorMessage(error),
          "error"
        );

      } finally {
        setBusy(false);
      }
    });

    // Event tab aktif dan arsip.
    document
      .querySelectorAll("[data-agenda-view]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          switchAgendaView(
            button.dataset.agendaView
          );
        });
      });

    state.eventsBound = true;
  }

  /* ============================================================
     17. AKTIFKAN / NONAKTIFKAN FORMULIR
  ============================================================ */

  function enableForm() {
    const form = $("agendaForm");

    if (!form) return;

    form
      .querySelectorAll(
        "input, textarea, select, button"
      )
      .forEach((element) => {
        element.disabled = false;
      });

    const saveButton = $("saveButton");
    const refreshButton = $("refreshButton");

    if (saveButton) saveButton.disabled = false;
    if (refreshButton) refreshButton.disabled = false;
  }

  function disableForm() {
    const form = $("agendaForm");

    if (form) {
      form
        .querySelectorAll(
          "input, textarea, select, button"
        )
        .forEach((element) => {
          element.disabled = true;
        });
    }

    const refreshButton = $("refreshButton");

    if (refreshButton) {
      refreshButton.disabled = true;
    }
  }

  /* ============================================================
     18. INISIALISASI HALAMAN
  ============================================================ */

  async function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    const agendaList = $("agendaList");
    const agendaForm = $("agendaForm");

    try {
      setConnection(
        "loading",
        "Menghubungkan ke layanan...",
        "Memeriksa sesi dan koneksi aplikasi."
      );

      if (!agendaList || !agendaForm) {
        throw new Error(
          "Elemen halaman agenda tidak ditemukan. Periksa agenda-kajian.html."
        );
      }

      // 1. Tunggu Supabase tersedia.
      await waitForSupabaseClient();

      // 2. Periksa sesi pengguna.
      state.user = await getAuthenticatedUser();

      // 3. Periksa hak akses.
      await loadUserRole();

      // 4. Siapkan tab agenda aktif dan arsip.
      ensureViewTabs();

      // 5. Pasang event listener satu kali.
      bindEvents();

      // 6. Aktifkan formulir.
      enableForm();

      // 7. Ambil data agenda dari database.
      await loadAgendas();

      setConnection(
        "ready",
        "Terhubung",
        "Sesi login dan hak akses berhasil diverifikasi."
      );

      log("Modul agenda siap digunakan.", {
        userId: state.user.id,
        role: state.role,
        agendaCount: state.agendas.length,
        view: state.view
      });

    } catch (error) {
      console.error(
        "[TARBIYAH AGENDA] Inisialisasi gagal:",
        error
      );

      state.initialized = false;

      setConnection(
        "error",
        "Koneksi atau akses bermasalah",
        getErrorMessage(error)
      );

      showNotice(
        getErrorMessage(error),
        "error"
      );

      if (agendaList) {
        agendaList.innerHTML = `
          <div class="agenda-empty">
            <span>!</span>
            <strong>Pengelolaan agenda belum dapat diaktifkan</strong>
            <p>
              Periksa koneksi Supabase, sesi login,
              hak akses pengguna, dan pesan kesalahan.
            </p>
          </div>
        `;
      }

      disableForm();
    }
  }

  /* ============================================================
     19. JALANKAN MODUL
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
