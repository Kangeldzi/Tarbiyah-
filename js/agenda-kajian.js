
/* =========================================================
   TARBIYAH — PENGELOLAAN AGENDA KAJIAN
   File: js/agenda-kajian.js
   Table: kajian_agenda
   Timezone: Asia/Jakarta
   ========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_AGENDA_KAJIAN_V1__) return;
  window.__TARBIYAH_AGENDA_KAJIAN_V1__ = true;

  const TABLE = "kajian_agenda";
  const TIMEZONE = "Asia/Jakarta";
  const ALLOWED_ROLES = ["super_admin", "admin", "mentor"];

  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    user: null,
    role: null,
    agendas: [],
    editingId: null,
    busy: false
  };

  function notify(message, type = "success") {
    const box = $("agendaNotice");
    if (!box) return;

    box.textContent = message;
    box.className = "agenda-notice" + (type === "error" ? " error" : "");
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideNotice() {
    const box = $("agendaNotice");
    if (box) box.hidden = true;
  }

  function getClient() {
    const client = window.tarbiyahSupabase ||
      window.supabaseClient ||
      window.TARBIYAH_SUPABASE;

    if (!client?.auth || !client?.from) {
      throw new Error("Koneksi Supabase belum siap. Periksa config.js dan supabase-client.js.");
    }

    if (window.TARBIYAH_BACKEND_READY === false) {
      throw new Error("Backend TARBIYAH belum siap.");
    }

    return client;
  }

  function normalizeRole(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  async function waitForGuard() {
    if (window.TARBIYAH_SESSION?.ready) {
      return window.TARBIYAH_SESSION;
    }

    if (window.TARBIYAH_AUTH_GUARD?.initialize) {
      await window.TARBIYAH_AUTH_GUARD.initialize();
    }

    if (window.TARBIYAH_SESSION?.ready) {
      return window.TARBIYAH_SESSION;
    }

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        resolve(window.TARBIYAH_SESSION || null);
      }, 10000);

      document.addEventListener("tarbiyah:session-ready", (event) => {
        window.clearTimeout(timeout);
        resolve({
          ready: true,
          user: event.detail?.user || null,
          session: event.detail?.session || null
        });
      }, { once: true });
    });
  }

  async function loadUserRole() {
    const { data, error } = await state.supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", state.user.id);

    if (error) throw error;

    const roles = (data || []).map((item) => {
      const relation = Array.isArray(item.roles)
        ? item.roles[0]
        : item.roles;

      return normalizeRole(relation?.name);
    }).filter(Boolean);

    const role = ALLOWED_ROLES.find((name) => roles.includes(name));

    if (!role) {
      throw new Error(
        "Akun ini tidak memiliki akses pengelolaan agenda. " +
        "Akses hanya tersedia untuk Super Admin, Admin, dan Mentor."
      );
    }

    state.role = role;
    $("userRole").textContent = role.replaceAll("_", " ").toUpperCase();
  }

  function jakartaDateTimeToISO(value) {
    if (!value) return null;

    // datetime-local diperlakukan sebagai waktu WIB,
    // bukan zona waktu perangkat.
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
    );

    if (!match) throw new Error("Format tanggal atau waktu tidak valid.");

    const [, year, month, day, hour, minute] = match;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:00+07:00`;
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
      throw new Error("Tanggal atau waktu agenda tidak valid.");
    }

    return date.toISOString();
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

    const get = (type) => parts.find((part) => part.type === type)?.value || "";

    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }

  function formatDateTime(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: TIMEZONE,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date) + " WIB";
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function mapURL(address) {
    const value = String(address || "").trim();
    if (!value) return "";

    if (/^https:\/\/(www\.)?google\.[^/]+\/maps/i.test(value)) {
      return value;
    }

    return "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(value);
  }

  async function loadAgendas() {
    $("agendaList").innerHTML =
      '<div class="agenda-empty">Memuat data agenda...</div>';

    const { data, error } = await state.supabase
      .from(TABLE)
      .select(
        "id, title, description, speaker_name, starts_at, ends_at, location_name, location_address, status"
      )
      .eq("status", "published")
      .order("starts_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    state.agendas = data || [];
    renderAgendas();
  }

  function renderAgendas() {
    const list = $("agendaList");
    $("agendaCount").textContent =
      `${state.agendas.length} agenda terbit`;

    if (!state.agendas.length) {
      list.innerHTML = `
        <div class="agenda-empty">
          Belum ada agenda yang diterbitkan.<br>
          Gunakan formulir untuk membuat agenda pertama.
        </div>`;
      return;
    }

    list.innerHTML = state.agendas.map((item) => {
      const location = item.location_name || item.location_address || "";
      const map = mapURL(item.location_address || item.location_name);
      const mapLink = map
        ? `<a class="agenda-map-link" href="${escapeHTML(map)}"
             target="_blank" rel="noopener noreferrer">Buka Peta ↗</a>`
        : "";

      return `
        <article class="agenda-card">
          <div class="agenda-card-top">
            <div>
              <h3>${escapeHTML(item.title)}</h3>
              <span class="agenda-live-label">TERBIT</span>
            </div>
          </div>
          <p>◷ ${escapeHTML(formatDateTime(item.starts_at))}</p>
          <p>◷ Selesai: ${escapeHTML(formatDateTime(item.ends_at))}</p>
          ${item.speaker_name
            ? `<p>◉ ${escapeHTML(item.speaker_name)}</p>` : ""}
          ${location ? `<p>⌖ ${escapeHTML(location)}</p>` : ""}
          ${item.description
            ? `<p>${escapeHTML(item.description)}</p>` : ""}
          <div class="agenda-card-actions">
            <button type="button" data-edit-id="${escapeHTML(item.id)}">
              Ubah Agenda
            </button>
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

  function setBusy(value) {
    state.busy = value;
    $("saveButton").disabled = value;
    $("refreshButton").disabled = value;
    $("saveButton").textContent = value
      ? "Menyimpan..."
      : state.editingId ? "Simpan Perubahan" : "Terbitkan Agenda";
  }

  async function saveAgenda(event) {
    event.preventDefault();
    if (state.busy) return;

    hideNotice();

    try {
      const startsAt = jakartaDateTimeToISO($("startsAt").value);
      const endsAt = jakartaDateTimeToISO($("endsAt").value);

      if (new Date(endsAt) <= new Date(startsAt)) {
        throw new Error("Waktu selesai harus setelah waktu mulai.");
      }

      const payload = {
        title: $("title").value.trim(),
        description: $("description").value.trim() || null,
        speaker_name: $("speakerName").value.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        location_name: $("locationName").value.trim() || null,
        location_address: $("locationAddress").value.trim() || null
      };

      if (!payload.title) {
        throw new Error("Judul agenda wajib diisi.");
      }

      setBusy(true);

      let result;

      if (state.editingId) {
        result = await state.supabase
          .from(TABLE)
          .update(payload)
          .eq("id", state.editingId)
          .select("id")
          .maybeSingle();
      } else {
        result = await state.supabase
          .from(TABLE)
          .insert({
            ...payload,
            status: "published"
          })
          .select("id")
          .maybeSingle();
      }

      if (result.error) throw result.error;

      if (state.editingId && !result.data) {
        throw new Error(
          "Tidak ada data yang diperbarui. Periksa izin UPDATE pada RLS."
        );
      }

      resetForm();
      await loadAgendas();

      notify(
        state.editingId
          ? "Perubahan agenda berhasil disimpan."
          : "Agenda berhasil diterbitkan."
      );

    } catch (error) {
      console.error("[TARBIYAH AGENDA] Simpan gagal:", error);
      notify(
        error?.message ||
        "Agenda gagal disimpan. Periksa koneksi dan izin database.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function initialize() {
    try {
      state.supabase = getClient();

      const guarded = await waitForGuard();
      const user = guarded?.user;

      if (!user?.id) {
        throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
      }

      state.user = user;

      await loadUserRole();
      await loadAgendas();

      $("agendaForm").addEventListener("submit", saveAgenda);
      $("cancelEditButton").addEventListener("click", resetForm);

      $("refreshButton").addEventListener("click", async () => {
        try {
          await loadAgendas();
          notify("Daftar agenda berhasil diperbarui.");
        } catch (error) {
          notify(error.message || "Gagal memuat ulang agenda.", "error");
        }
      });

      console.info("[TARBIYAH AGENDA] Modul siap.", {
        role: state.role,
        userId: state.user.id
      });

    } catch (error) {
      console.error("[TARBIYAH AGENDA] Inisialisasi gagal:", error);
      notify(error?.message || "Halaman agenda gagal dimuat.", "error");

      $("agendaList").innerHTML =
        '<div class="agenda-empty">Agenda tidak dapat dimuat. Periksa pesan kesalahan di atas.</div>';

      $("agendaForm").querySelectorAll("input, textarea, button")
        .forEach((element) => {
          element.disabled = true;
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

})();
