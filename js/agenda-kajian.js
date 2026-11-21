/* ============================================================
   TARBIYAH — PENGELOLAAN AGENDA KAJIAN
   File       : js/agenda-kajian.js
   Database   : kajian_agenda
   Role       : super_admin, admin, mentor
   Timezone   : Asia/Jakarta (WIB)
   ============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_AGENDA_KAJIAN_V2__) {
    console.info("[TARBIYAH AGENDA] Versi 2 sudah aktif.");
    return;
  }
  window.__TARBIYAH_AGENDA_KAJIAN_V2__ = true;

  const TABLE = "kajian_agenda";
  const ROLE_TABLE = "user_roles";
  const TIMEZONE = "Asia/Jakarta";
  const ALLOWED_ROLES = ["super_admin", "admin", "mentor"];
  const CLIENT_WAIT_MS = 12000;

  const $ = (id) => document.getElementById(id);

  const state = {
    client: null,
    user: null,
    role: null,
    agendas: [],
    editingId: null,
    busy: false,
    initialized: false
  };

  /* ============================================================
     1. UTILITAS DASAR
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
    if (!box) return;

    box.textContent = message;
    box.classList.toggle("error", type === "error");
    box.hidden = false;
  }

  function hideNotice() {
    const box = $("agendaNotice");
    if (box) box.hidden = true;
  }

  function setConnection(status, title, description) {
    const indicator = $("connectionIndicator");
    const titleElement = $("connectionTitle");
    const descriptionElement = $("connectionDescription");

    if (indicator) {
      indicator.classList.remove("is-ready", "is-error");
      if (status === "ready") indicator.classList.add("is-ready");
      if (status === "error") indicator.classList.add("is-error");
    }

    if (titleElement) titleElement.textContent = title;
    if (descriptionElement) descriptionElement.textContent = description;
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
    if (!error) return "Terjadi kesalahan yang tidak diketahui.";
    return error.message || error.details || error.hint || String(error);
  }

  /* ============================================================
     2. MENUNGGU SUPABASE CLIENT
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
        state.client = client;
        log("Supabase client ditemukan.");
        return client;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    throw new Error(
      "Supabase client tidak ditemukan. Pastikan js/config.js dan js/supabase-client.js berhasil dimuat."
    );
  }

  /* ============================================================
     3. MEMERIKSA SESI LOGIN
  ============================================================ */

  async function getAuthenticatedUser() {
    const client = state.client;

    // Gunakan sesi dari Auth Guard jika sudah tersedia.
    const guardedUser =
      window.TARBIYAH_SESSION?.user ||
      window.TARBIYAH_AUTH?.user ||
      null;

    if (guardedUser?.id) {
      return guardedUser;
    }

    // Ambil pengguna langsung dari Supabase Auth.
    const { data, error } = await client.auth.getUser();

    if (error) {
      throw new Error(
        "Pemeriksaan sesi login gagal: " + getErrorMessage(error)
      );
    }

    if (!data?.user?.id) {
      throw new Error(
        "Sesi login tidak ditemukan. Silakan masuk kembali melalui halaman login TARBIYAH."
      );
    }

    return data.user;
  }

  /* ============================================================
     4. PEMERIKSAAN HAK AKSES
  ============================================================ */

  async function loadUserRole() {
    const { data, error } = await state.client
      .from(ROLE_TABLE)
      .select("role_id, roles(name)")
      .eq("user_id", state.user.id);

    if (error) {
      throw new Error(
        "Gagal memeriksa hak akses akun: " + getErrorMessage(error)
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

    log("Hak akses terverifikasi.", {
      role: state.role,
      userId: state.user.id
    });
  }

  /* ============================================================
     5. KONVERSI WAKTU WIB
  ============================================================ */

  function jakartaDateTimeToISO(value) {
    if (!value) {
      throw new Error("Tanggal dan waktu agenda wajib diisi.");
    }

    const match = String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
    );

    if (!match) {
      throw new Error("Format tanggal atau waktu tidak valid.");
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    // Validasi kalender untuk mencegah tanggal yang bergeser otomatis.
    const check = new Date(Date.UTC(year, month - 1, day, hour, minute));

    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day ||
      check.getUTCHours() !== hour ||
      check.getUTCMinutes() !== minute
    ) {
      throw new Error("Tanggal atau waktu yang dimasukkan tidak valid.");
    }

    // Asia/Jakarta menggunakan UTC+07:00.
    return new Date(
      `${value}:00+07:00`
    ).toISOString();
  }

  function toJakartaInput(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

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

    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

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
     6. TAUTAN GOOGLE MAPS
  ============================================================ */

  
function getMapURL(address) {
    const value = String(address || "").trim();
    if (!value) return "";

    // 1. Tautan pendek Google Maps
    if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(value)) {
        return value;
    }

    // 2. Tautan Google Maps lengkap
    if (/^https?:\/\/(www\.)?google\.[^/]+\/maps/i.test(value)) {
        return value;
    }

    // 3. Koordinat GPS (latitude, longitude)
    const coordinateMatch = value.match(
        /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/
    );

    if (coordinateMatch) {
        const lat = Number(coordinateMatch[1]);
        const lng = Number(coordinateMatch[2]);

        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return "https://www.google.com/maps/search/?api=1&query=" +
                encodeURIComponent(lat + "," + lng);
        }
    }

    // 4. Nama tempat atau alamat biasa
    return "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(value);
}


  /* ============================================================
     7. MEMUAT AGENDA DARI SUPABASE
  ============================================================ */

  async function loadAgendas() {
    $("agendaList").innerHTML =
        '<div class="agenda-empty">Memuat data agenda...</div>';

    const { data, error } = await state.supabase
        .from(TABLE)
        .select(
            "id, title, description, speaker_name, starts_at, ends_at, location_name, location_address, status"
        )
        .eq("status", state.view)
        .order("starts_at", { ascending: true })
        .limit(200);

    if (error) throw error;

    state.agendas = data || [];
    renderAgendas();
}

  /* ============================================================
     8. MENAMPILKAN DAFTAR AGENDA
  ============================================================ */
async function changeAgendaStatus(id, newStatus) {
    if (state.busy) return;

    const item = state.agendas.find(
        agenda => String(agenda.id) === String(id)
    );

    if (!item) return;

    const isArchive = newStatus === "archived";

    const message = isArchive
        ? `Arsipkan agenda "${item.title}"? Agenda tidak akan dihapus permanen.`
        : `Pulihkan agenda "${item.title}" agar tampil kembali dalam daftar aktif?`;

    if (!window.confirm(message)) return;

    try {
        setBusy(true);

        const { data, error } = await state.supabase
            .from(TABLE)
            .update({ status: newStatus })
            .eq("id", id)
            .select("id")
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            throw new Error(
                "Status agenda tidak berubah. Periksa izin UPDATE dan SELECT RLS."
            );
        }

        await loadAgendas();

        notify(
            isArchive
                ? "Agenda berhasil diarsipkan."
                : "Agenda berhasil dipulihkan."
        );

    } catch (error) {
        console.error("[TARBIYAH AGENDA] Arsip gagal:", error);
        notify(
            error.message || "Status agenda gagal diperbarui.",
            "error"
        );
    } finally {
        setBusy(false);
    }
}
   
  function renderAgendas() {
    const list = $("agendaList");
    const count = $("agendaCount");

    if (!list) return;

    if (count) {
      count.textContent = `${state.agendas.length} agenda`;
    }

    if (!state.agendas.length) {
      list.innerHTML = `
        <div class="agenda-empty">
          <span>☾</span>
          <strong>Belum ada agenda terbit</strong>
          <p>Gunakan formulir untuk membuat agenda kajian pertama.</p>
        </div>`;
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
        ? `<a class="agenda-map-link"
             href="${escapeHTML(mapURL)}"
             target="_blank"
             rel="noopener noreferrer">⌖ Buka Peta</a>`
        : "";

      return `
        <article class="agenda-card">
          <div class="agenda-card-top">
            <div>
              <h3>${escapeHTML(item.title)}</h3>
              <span class="agenda-live-label">TERBIT</span>
            </div>
          </div>

          <p>◷ Mulai: ${escapeHTML(formatDateTime(item.starts_at))}</p>
          <p>◷ Selesai: ${escapeHTML(formatDateTime(item.ends_at))}</p>

          ${
            item.speaker_name
              ? `<p>◉ Pemateri: ${escapeHTML(item.speaker_name)}</p>`
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
    ${
        state.view === "published"
        ? `
            <button type="button"
                data-edit-id="${escapeHTML(item.id)}">
                Ubah Agenda
            </button>

            <button type="button"
                data-archive-id="${escapeHTML(item.id)}">
                Arsipkan Agenda
            </button>
        `
        : `
            <button type="button"
                data-restore-id="${escapeHTML(item.id)}">
                Pulihkan Agenda
            </button>
        `
    }

    ${mapLink}
</div>
        </article>`;
    }).join("");

    list.querySelectorAll("[data-edit-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.agendas.find(
          (agenda) => String(agenda.id) === button.dataset.editId
        );

        if (item) startEdit(item);
      });
    });
  }

  /* ============================================================
     9. FORMULIR UBAH AGENDA
  ============================================================ */

  function startEdit(item) {
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

    $("agendaForm").reset();
    $("agendaId").value = "";

    $("formHeading").textContent = "Buat Agenda Baru";
    $("saveButton").textContent = "Terbitkan Agenda";
    $("cancelEditButton").hidden = true;
  }

  /* ============================================================
     10. STATUS PROSES SIMPAN
  ============================================================ */

  function setBusy(value) {
    state.busy = value;

    $("saveButton").disabled = value;
    $("refreshButton").disabled = value;

    $("saveButton").textContent = value
      ? "Menyimpan..."
      : state.editingId
        ? "Simpan Perubahan"
        : "Terbitkan Agenda";

    $("cancelEditButton").disabled = value;
  }

  /* ============================================================
     11. VALIDASI DAN SIMPAN AGENDA
  ============================================================ */

  async function saveAgenda(event) {
    event.preventDefault();

    if (state.busy) return;

    hideNotice();

    let editingAtStart = state.editingId;

    try {
      const startsAt = jakartaDateTimeToISO($("startsAt").value);
      const endsAt = jakartaDateTimeToISO($("endsAt").value);

      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        throw new Error("Waktu selesai harus setelah waktu mulai.");
      }

      
const payload = {
    title: $("title").value.trim(),
    description: $("description").value.trim() || null,
    speaker_name: $("speakerName").value.trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    location_name: $("locationName").value.trim() || null,
    location_address: $("locationAddress").value.trim() || null,
    status: "published",
    created_by: state.user.id
};


      if (!payload.title) {
        throw new Error("Judul agenda wajib diisi.");
      }

      setBusy(true);

      let result;

      if (editingAtStart) {
        result = await state.client
          .from(TABLE)
          .update(payload)
          .eq("id", editingAtStart)
          .select("id")
          .maybeSingle();
      } else {
        result = await state.client
          .from(TABLE)
          .insert({
            ...payload,
            status: "published"
          })
          .select("id")
          .maybeSingle();
      }

      if (result.error) {
        throw new Error(getErrorMessage(result.error));
      }

      if (editingAtStart && !result.data) {
        throw new Error(
          "Tidak ada agenda yang diperbarui. Periksa izin UPDATE pada kebijakan RLS."
        );
      }

      resetForm();

      await loadAgendas();

      showNotice(
        editingAtStart
          ? "Perubahan agenda berhasil disimpan."
          : "Agenda baru berhasil diterbitkan."
      );

      log(
        editingAtStart
          ? "Agenda berhasil diperbarui."
          : "Agenda baru berhasil diterbitkan."
      );

    } catch (error) {
      console.error("[TARBIYAH AGENDA] Simpan gagal:", error);
      showNotice(getErrorMessage(error), "error");

    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
     12. EVENT TOMBOL
  ============================================================ */

  function bindEvents() {
    $("agendaForm").addEventListener("submit", saveAgenda);

    $("cancelEditButton").addEventListener("click", () => {
      resetForm();
      hideNotice();
    });

    $("refreshButton").addEventListener("click", async () => {
      if (state.busy) return;

      $("refreshButton").disabled = true;

      try {
        await loadAgendas();
        showNotice("Daftar agenda berhasil diperbarui.");
      } catch (error) {
        console.error("[TARBIYAH AGENDA] Refresh gagal:", error);
        showNotice(getErrorMessage(error), "error");
      } finally {
        $("refreshButton").disabled = false;
      }
    });
  }

  /* ============================================================
     13. AKTIFKAN FORMULIR
  ============================================================ */

  function enableForm() {
    $("saveButton").disabled = false;
    $("refreshButton").disabled = false;

    $("agendaForm")
      .querySelectorAll("input, textarea")
      .forEach((element) => {
        element.disabled = false;
      });
  }

  function disableForm() {
    $("saveButton").disabled = true;
    $("refreshButton").disabled = true;

    $("agendaForm")
      .querySelectorAll("input, textarea, button")
      .forEach((element) => {
        element.disabled = true;
      });
  }

  /* ============================================================
     14. INISIALISASI HALAMAN
  ============================================================ */

  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;

    $("currentYear").textContent = String(new Date().getFullYear());

    setConnection(
      "loading",
      "Menyiapkan halaman agenda",
      "Memeriksa koneksi Supabase dan sesi akun."
    );

    disableForm();
    bindEvents();

    try {
      await waitForSupabaseClient();

      setConnection(
        "loading",
        "Memeriksa autentikasi",
        "Memastikan akun sudah masuk ke TARBIYAH."
      );

      state.user = await getAuthenticatedUser();

      setConnection(
        "loading",
        "Memeriksa hak akses",
        "Memastikan akun memiliki izin pengelolaan agenda."
      );

      await loadUserRole();

      setConnection(
        "loading",
        "Memuat agenda kajian",
        "Mengambil daftar agenda dari database."
      );

      enableForm();

      try {
        await loadAgendas();

        setConnection(
          "ready",
          "Terhubung dan siap digunakan",
          `Login sebagai ${state.role.replaceAll("_", " ")}. Data agenda berhasil dimuat.`
        );

      } catch (loadError) {
        console.error("[TARBIYAH AGENDA] Gagal memuat daftar:", loadError);

        setConnection(
          "error",
          "Koneksi tersedia, tetapi data agenda gagal dimuat",
          getErrorMessage(loadError)
        );

        showNotice(getErrorMessage(loadError), "error");

        $("agendaList").innerHTML = `
          <div class="agenda-empty">
            <span>!</span>
            <strong>Data agenda belum dapat ditampilkan</strong>
            <p>Periksa struktur tabel dan izin SELECT pada RLS Supabase, lalu tekan Muat ulang.</p>
          </div>`;
      }

      log("Halaman siap.", {
        userId: state.user.id,
        role: state.role
      });

    } catch (error) {
      console.error("[TARBIYAH AGENDA] Inisialisasi gagal:", error);

      setConnection(
        "error",
        "Halaman belum siap digunakan",
        getErrorMessage(error)
      );

      showNotice(getErrorMessage(error), "error");

      $("agendaList").innerHTML = `
        <div class="agenda-empty">
          <span>!</span>
          <strong>Pengelolaan agenda belum dapat diaktifkan</strong>
          <p>Periksa pesan kesalahan di atas. Halaman tidak akan mengalihkan Anda secara otomatis.</p>
        </div>`;

      disableForm();
    }
  }

  /* ============================================================
     15. JALANKAN
  ============================================================ */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }

})();
