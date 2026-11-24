
/* ============================================================
   TARBIYAH — AGENDA KAJIAN MODULE RENDERER
   File    : js/agenda-kajian-module.js
   Fungsi  : Menampilkan Agenda Kajian di data-module-content
   Engine  : Menggunakan js/agenda-kajian.js yang sudah ada
   ============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_AGENDA_MODULE_RENDERER__) return;
  window.__TARBIYAH_AGENDA_MODULE_RENDERER__ = true;

  const MODULE_KEYS = [
    "agenda-kajian",
    "agenda-kajian-manage",
    "kelola-agenda-kajian"
  ];

  function getModuleKey() {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("module") ||
      params.get("modul") ||
      params.get("page") ||
      document.body.dataset.module ||
      ""
    ).trim().toLowerCase();
  }

  function addAgendaStyles() {
    if (document.getElementById("tarbiyahAgendaModuleStyles")) return;

    const style = document.createElement("style");
    style.id = "tarbiyahAgendaModuleStyles";

    style.textContent = `
      .agenda-module {
        display: grid;
        gap: 22px;
        width: 100%;
      }

      .agenda-module-status {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 15px 17px;
        border: 1px solid var(--border-color, rgba(120,160,140,.2));
        border-radius: 16px;
        background: var(--surface-color, rgba(255,255,255,.04));
      }

      .agenda-module-status-indicator {
        width: 11px;
        height: 11px;
        flex: 0 0 11px;
        border-radius: 50%;
        background: #d69e36;
        box-shadow: 0 0 12px currentColor;
      }

      .agenda-module-status-indicator.is-ready {
        background: #16a36a;
      }

      .agenda-module-status-indicator.is-error {
        background: #dc5555;
      }

      .agenda-module-status-copy {
        min-width: 0;
      }

      .agenda-module-status-copy strong {
        display: block;
        color: var(--text-color, inherit);
        font-size: 14px;
      }

      .agenda-module-status-copy p {
        margin: 3px 0 0;
        color: var(--muted-color, #89968f);
        font-size: 12px;
        line-height: 1.5;
      }

      .agenda-module-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
        gap: 20px;
        align-items: start;
      }

      .agenda-module-panel {
        min-width: 0;
        padding: 20px;
        border: 1px solid var(--border-color, rgba(120,160,140,.2));
        border-radius: 18px;
        background: var(--surface-color, rgba(255,255,255,.04));
        box-shadow: 0 8px 28px rgba(0,0,0,.06);
      }

      .agenda-module-panel h2 {
        margin: 0 0 7px;
        color: var(--text-color, inherit);
        font-size: 18px;
      }

      .agenda-module-description {
        margin: 0 0 18px;
        color: var(--muted-color, #89968f);
        font-size: 13px;
        line-height: 1.6;
      }

      .agenda-module-form {
        display: grid;
        gap: 14px;
      }

      .agenda-module-field {
        display: grid;
        gap: 7px;
      }

      .agenda-module-field label {
        color: var(--text-color, inherit);
        font-size: 13px;
        font-weight: 600;
      }

      .agenda-module-field input,
      .agenda-module-field textarea {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        padding: 12px 13px;
        border: 1px solid var(--border-color, #d5ded8);
        border-radius: 11px;
        outline: none;
        background: var(--input-background, rgba(255,255,255,.06));
        color: var(--text-color, inherit);
        font: inherit;
        font-size: 14px;
      }

      .agenda-module-field input:focus,
      .agenda-module-field textarea:focus {
        border-color: #15966a;
        box-shadow: 0 0 0 3px rgba(21,150,106,.12);
      }

      .agenda-module-field textarea {
        min-height: 90px;
        resize: vertical;
      }

      .agenda-module-field input:disabled,
      .agenda-module-field textarea:disabled,
      .agenda-module-form button:disabled {
        cursor: not-allowed;
        opacity: .6;
      }

      .agenda-module-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 4px;
      }

      .agenda-module-button {
        min-height: 42px;
        padding: 10px 15px;
        border: 1px solid transparent;
        border-radius: 11px;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
      }

      .agenda-module-button.primary {
        background: #087c55;
        color: #fff;
      }

      .agenda-module-button.secondary {
        border-color: var(--border-color, #d5ded8);
        background: transparent;
        color: var(--text-color, inherit);
      }

      .agenda-module-notice {
        padding: 12px 14px;
        border: 1px solid rgba(22,163,106,.25);
        border-radius: 12px;
        background: rgba(22,163,106,.08);
        color: var(--text-color, inherit);
        font-size: 13px;
        line-height: 1.5;
      }

      .agenda-module-notice.error {
        border-color: rgba(220,85,85,.3);
        background: rgba(220,85,85,.08);
      }

      .agenda-module-list-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;
      }

      .agenda-module-list-heading h2 {
        margin: 0;
      }

      .agenda-module-count {
        color: var(--muted-color, #89968f);
        font-size: 12px;
      }

      .agenda-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0 0 14px;
      }

      .agenda-tab {
        padding: 9px 13px;
        border: 1px solid var(--border-color, #d5ded8);
        border-radius: 999px;
        background: transparent;
        color: var(--text-color, inherit);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
      }

      .agenda-tab.active {
        border-color: #087c55;
        background: #087c55;
        color: #fff;
      }

      .agenda-list {
        display: grid;
        gap: 13px;
      }

      .agenda-card {
        padding: 16px;
        border: 1px solid var(--border-color, rgba(120,160,140,.2));
        border-radius: 15px;
        background: var(--card-background, rgba(255,255,255,.035));
        overflow-wrap: anywhere;
      }

      .agenda-card h3 {
        margin: 0 0 8px;
        color: var(--text-color, inherit);
        font-size: 16px;
      }

      .agenda-card p {
        margin: 7px 0;
        color: var(--muted-color, #89968f);
        font-size: 13px;
        line-height: 1.6;
      }

      .agenda-live-label {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(22,163,106,.12);
        color: #16a36a;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .04em;
      }

      .agenda-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 13px;
      }

      .agenda-card-actions button,
      .agenda-map-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 8px 11px;
        border: 1px solid var(--border-color, #d5ded8);
        border-radius: 9px;
        background: transparent;
        color: var(--text-color, inherit);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        text-decoration: none;
      }

      .agenda-empty {
        padding: 25px 15px;
        border: 1px dashed var(--border-color, #d5ded8);
        border-radius: 14px;
        color: var(--muted-color, #89968f);
        text-align: center;
        font-size: 13px;
        line-height: 1.6;
      }

      @media (max-width: 900px) {
        .agenda-module-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      @media (max-width: 480px) {
        .agenda-module-panel {
          padding: 15px;
        }

        .agenda-module-actions,
        .agenda-card-actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .agenda-module-button,
        .agenda-card-actions button,
        .agenda-map-link {
          width: 100%;
          box-sizing: border-box;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renderAgendaContent(container) {
    container.innerHTML = `
      <div class="agenda-module">

        <section class="agenda-module-status" aria-live="polite">
          <span
            class="agenda-module-status-indicator"
            id="connectionIndicator"
          ></span>

          <div class="agenda-module-status-copy">
            <strong id="connectionTitle">Menyiapkan Agenda Kajian...</strong>
            <p id="connectionDescription">
              Memeriksa koneksi aplikasi dan sesi pengguna.
            </p>
          </div>
        </section>

        <div
          class="agenda-module-notice"
          id="agendaNotice"
          role="status"
          aria-live="polite"
          hidden
        ></div>

        <div class="agenda-module-grid">

          <section class="agenda-module-panel">
            <h2 id="formHeading">Buat Agenda Baru</h2>

            <p class="agenda-module-description">
              Isi informasi kajian. Waktu yang dimasukkan menggunakan
              zona waktu Indonesia Barat (WIB).
            </p>

            <form
              class="agenda-module-form"
              id="agendaForm"
              autocomplete="off"
            >
              <input type="hidden" id="agendaId">

              <div class="agenda-module-field">
                <label for="title">Judul Agenda *</label>
                <input
                  type="text"
                  id="title"
                  maxlength="200"
                  placeholder="Contoh: Kajian Tauhid"
                  required
                >
              </div>

              <div class="agenda-module-field">
                <label for="description">Deskripsi Kajian</label>
                <textarea
                  id="description"
                  placeholder="Tuliskan keterangan atau tema kajian..."
                ></textarea>
              </div>

              <div class="agenda-module-field">
                <label for="speakerName">Nama Pemateri</label>
                <input
                  type="text"
                  id="speakerName"
                  maxlength="150"
                  placeholder="Nama ustaz atau pemateri"
                >
              </div>

              <div class="agenda-module-field">
                <label for="startsAt">Waktu Mulai (WIB) *</label>
                <input
                  type="datetime-local"
                  id="startsAt"
                  required
                >
              </div>

              <div class="agenda-module-field">
                <label for="endsAt">Waktu Selesai (WIB) *</label>
                <input
                  type="datetime-local"
                  id="endsAt"
                  required
                >
              </div>

              <div class="agenda-module-field">
                <label for="locationName">Nama Tempat</label>
                <input
                  type="text"
                  id="locationName"
                  maxlength="200"
                  placeholder="Contoh: Masjid atau aula"
                >
              </div>

              <div class="agenda-module-field">
                <label for="locationAddress">
                  Alamat, Koordinat, atau Link Google Maps
                </label>
                <textarea
                  id="locationAddress"
                  placeholder="Masukkan alamat lengkap, koordinat GPS, atau tautan Google Maps..."
                ></textarea>
              </div>

              <div class="agenda-module-actions">
                <button
                  class="agenda-module-button primary"
                  type="submit"
                  id="saveButton"
                >
                  Terbitkan Agenda
                </button>

                <button
                  class="agenda-module-button secondary"
                  type="button"
                  id="cancelEditButton"
                  hidden
                >
                  Batal Mengubah
                </button>
              </div>
            </form>
          </section>

          <section class="agenda-module-panel">
            <div class="agenda-module-list-heading">
              <h2>Daftar Agenda Kajian</h2>
              <span class="agenda-module-count" id="agendaCount">
                Memuat...
              </span>
            </div>

            <div class="agenda-module-actions" style="margin-bottom:14px">
              <button
                class="agenda-module-button secondary"
                type="button"
                id="refreshButton"
              >
                ↻ Muat Ulang Agenda
              </button>
            </div>

            <div id="agendaList" class="agenda-list">
              <div class="agenda-empty">
                Memuat data agenda dari database...
              </div>
            </div>
          </section>

        </div>

        <p style="
          margin:0;
          color:var(--muted-color,#89968f);
          font-size:11px;
          line-height:1.6;
        ">
          Pengelolaan Agenda Kajian hanya tersedia untuk akun
          Super Admin, Admin, dan Mentor. Hak akses tetap diverifikasi
          oleh sistem dan kebijakan database.
        </p>

        <span id="userRole" hidden></span>
      </div>
    `;
  }

  function bindModuleToolbar() {
    const primaryButton = document.querySelector(
      "[data-module-primary-action]"
    );

    if (primaryButton) {
      primaryButton.hidden = false;
      primaryButton.textContent = "＋ Buat Agenda Kajian";

      primaryButton.addEventListener("click", () => {
        document.getElementById("agendaForm")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        document.getElementById("title")?.focus();
      });
    }

    const searchInput = document.querySelector("[data-module-search]");

    function filterAgendaCards(value) {
      const keyword = String(value || "").trim().toLowerCase();

      document.querySelectorAll("#agendaList .agenda-card").forEach(card => {
        card.hidden = !card.textContent.toLowerCase().includes(keyword);
      });
    }

    searchInput?.addEventListener("input", () => {
      filterAgendaCards(searchInput.value);
    });

    document.addEventListener("tarbiyah:module-search", event => {
      filterAgendaCards(event.detail?.query || searchInput?.value || "");
    });

    const list = document.getElementById("agendaList");

    if (list && searchInput && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        filterAgendaCards(searchInput.value);
      });

      observer.observe(list, {
        childList: true,
        subtree: true
      });
    }
  }

  function loadAgendaEngine() {
    if (
      document.querySelector(
        'script[data-agenda-kajian-engine="true"]'
      )
    ) {
      return;
    }

    const script = document.createElement("script");
    script.src = "./js/agenda-kajian.js";
    script.async = false;
    script.dataset.agendaKajianEngine = "true";

    script.onload = () => {
      console.info(
        "[TARBIYAH AGENDA MODULE] Script Agenda Kajian berhasil dimuat."
      );
    };

    script.onerror = () => {
      const notice = document.getElementById("agendaNotice");

      if (notice) {
        notice.textContent =
          "Script js/agenda-kajian.js tidak berhasil dimuat. Periksa lokasi dan nama file.";
        notice.classList.add("error");
        notice.hidden = false;
      }

      console.error(
        "[TARBIYAH AGENDA MODULE] Gagal memuat js/agenda-kajian.js."
      );
    };

    document.body.appendChild(script);
  }

  function initialize() {
    const requestedModule = getModuleKey();

    if (!MODULE_KEYS.includes(requestedModule)) {
      return;
    }

    const container = document.querySelector("[data-module-content]");

    if (!container) {
      console.error(
        "[TARBIYAH AGENDA MODULE] Area data-module-content tidak ditemukan."
      );
      return;
    }

    addAgendaStyles();
    renderAgendaContent(container);
    bindModuleToolbar();
    loadAgendaEngine();

    console.info(
      "[TARBIYAH AGENDA MODULE] Konten Agenda Kajian berhasil dipasang."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
