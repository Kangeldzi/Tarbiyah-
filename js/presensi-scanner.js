
/* =====================================================
   TARBIYAH - QR ATTENDANCE SCANNER
   File: js/presensi-scanner.js
   Version: 1.0.0
===================================================== */

(function () {
  "use strict";

  if (window.TARBIYAH_PRESENSI_SCANNER) return;

  const state = {
    scanner: null,
    scanning: false,
    processing: false,
    paused: false,
    agendas: [],
    selectedAgenda: null,
    isAdmin: false
  };

  const $ = (selector) => document.querySelector(selector);

  function setStatus(message, type = "") {
    const el = $("#scanner-status");
    if (!el) return;

    el.className = "scanner-status" + (type ? " " + type : "");
    el.textContent = message;
  }

  function showResult(title, message, type = "success") {
    const panel = $("#scanner-result");
    const titleEl = $("#scanner-result-title");
    const messageEl = $("#scanner-result-message");

    if (!panel || !titleEl || !messageEl) return;

    panel.classList.add("visible");
    panel.dataset.type = type;
    titleEl.textContent = title;
    messageEl.textContent = message;
  }

  function hideResult() {
    const panel = $("#scanner-result");
    if (panel) panel.classList.remove("visible");
  }

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function extractToken(decodedText) {
    const raw = String(decodedText || "").trim();

    if (!raw) {
      throw new Error("QR Code tidak berisi token.");
    }

    // QR dapat berisi token dalam format JSON.
    try {
      const parsed = JSON.parse(raw);

      if (typeof parsed === "string") {
        return parsed.trim();
      }

      if (parsed && typeof parsed === "object") {
        const token =
          parsed.token ||
          parsed.qr_token ||
          parsed.value;

        if (token) return String(token).trim();
      }
    } catch (_) {
      // Bukan JSON, lanjut periksa format lainnya.
    }

    // QR dapat berupa URL yang memiliki parameter token.
    try {
      const url = new URL(raw);
      const token = url.searchParams.get("token");

      if (token) return token.trim();
    } catch (_) {
      // Bukan URL, anggap sebagai token langsung.
    }

    return raw;
  }

  function getResponsePayload(response) {
    if (!response || typeof response !== "object") {
      return {};
    }

    let payload = response.data ?? response;

    // Beberapa Edge Function membungkus hasil RPC.
    if (payload && typeof payload === "object" && payload.data) {
      payload = payload.data;
    }

    return payload || {};
  }

  function interpretResponse(response) {
    const payload = getResponsePayload(response);

    const status = String(
      payload.result ||
      payload.status ||
      payload.code ||
      ""
    ).toLowerCase();

    const success =
      payload.success === true ||
      payload.ok === true ||
      [
        "success",
        "valid",
        "attendance_recorded",
        "recorded"
      ].includes(status);

    const messages = {
      duplicate_attendance:
        "Anggota ini sudah tercatat hadir pada agenda yang dipilih.",

      expired:
        "QR Code sudah kedaluwarsa. Anggota perlu memperbarui QR Code.",

      revoked:
        "QR Code sudah tidak berlaku karena telah dicabut.",

      invalid_token:
        "QR Code tidak valid atau tidak dikenali.",

      inactive_member:
        "Status keanggotaan anggota tidak aktif.",

      unauthorized:
        "Akun pemindai tidak memiliki izin untuk melakukan presensi.",

      agenda_not_open:
        "Agenda belum dimulai atau waktu presensi sudah berakhir.",

      agenda_not_found:
        "Agenda tidak ditemukan atau tidak tersedia."
    };

    let message =
      payload.message ||
      payload.error ||
      messages[status] ||
      (success
        ? "Presensi berhasil dicatat."
        : "Server belum memberikan konfirmasi keberhasilan presensi.");

    if (status === "duplicate_attendance") {
      return {
        success: false,
        duplicate: true,
        title: "Presensi Sudah Tercatat",
        message
      };
    }

    if (success) {
      return {
        success: true,
        title: "Presensi Berhasil",
        message
      };
    }

    return {
      success: false,
      title: "Presensi Belum Berhasil",
      message
    };
  }

  function renderAgendaInfo(agenda) {
    const title = $("#scanner-agenda-title");
    const time = $("#scanner-agenda-time");
    const location = $("#scanner-agenda-location");

    if (!title || !time || !location) return;

    if (!agenda) {
      title.textContent = "Belum ada agenda dipilih";
      time.textContent = "Silakan pilih agenda kajian.";
      location.textContent = "Lokasi: -";
      return;
    }

    title.textContent = agenda.title || "Agenda Kajian";

    time.textContent =
      formatDate(agenda.starts_at) +
      " — " +
      formatDate(agenda.ends_at);

    location.textContent =
      "Lokasi: " +
      (agenda.location_name || agenda.location_address || "-");
  }

  function isAgendaOpen(agenda) {
    if (!agenda || !agenda.starts_at || !agenda.ends_at) {
      return false;
    }

    const now = Date.now();
    const start = new Date(agenda.starts_at).getTime();
    const end = new Date(agenda.ends_at).getTime();

    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      now >= start &&
      now <= end
    );
  }

  function updateButtons() {
    const start = $("#btn-start-scanner");
    const stop = $("#btn-stop-scanner");
    const resume = $("#btn-resume-scanner");
    const select = $("#presensi-agenda-select");

    if (start) {
      start.disabled =
        !state.isAdmin ||
        !state.selectedAgenda ||
        state.scanning;
    }

    if (stop) {
      stop.disabled = !state.scanning;
    }

    if (resume) {
      resume.disabled =
        !state.scanning ||
        !state.paused ||
        state.processing;
    }

    if (select) {
      select.disabled = state.scanning;
    }
  }

  async function loadAgendas() {
    const select = $("#presensi-agenda-select");

    if (!select) return;

    select.innerHTML =
      '<option value="">Memuat agenda...</option>';

    try {
      const allAgendas =
        await window.TARBIYAH_PRESENSI_API.getAgendas();

      // Pemindaian QR hanya untuk agenda published.
      state.agendas = (allAgendas || []).filter(
        agenda => agenda.status === "published"
      );

      select.innerHTML =
        '<option value="">-- Pilih Agenda Kajian --</option>';

      state.agendas.forEach(agenda => {
        const option = document.createElement("option");

        option.value = agenda.id;
        option.textContent = agenda.title;

        select.appendChild(option);
      });

      if (state.agendas.length === 0) {
        setStatus(
          "Belum ada agenda berstatus published. Buat atau publikasikan agenda terlebih dahulu.",
          "warning"
        );
      } else {
        setStatus(
          "Agenda berhasil dimuat. Pilih agenda untuk melanjutkan."
        );
      }

    } catch (error) {
      console.error("Gagal memuat agenda:", error);

      select.innerHTML =
        '<option value="">Gagal memuat agenda</option>';

      setStatus(
        "Gagal mengambil agenda dari Supabase: " + error.message,
        "error"
      );
    }

    updateButtons();
  }

  function handleAgendaChange() {
    const select = $("#presensi-agenda-select");
    const agendaId = select ? select.value : "";

    state.selectedAgenda =
      state.agendas.find(
        agenda => agenda.id === agendaId
      ) || null;

    renderAgendaInfo(state.selectedAgenda);
    hideResult();

    if (!state.selectedAgenda) {
      setStatus("Silakan pilih agenda kajian.");
    } else if (!isAgendaOpen(state.selectedAgenda)) {
      setStatus(
        "Agenda dipilih, tetapi waktu pemindaian QR belum dibuka atau sudah berakhir. Gunakan presensi manual Admin jika diperlukan.",
        "warning"
      );
    } else {
      setStatus(
        "Agenda siap. Kamera dapat diaktifkan untuk memindai QR anggota."
      );
    }

    updateButtons();
  }

  async function startScanner() {
    if (!state.isAdmin) {
      setStatus("Akses scanner hanya untuk Admin dan Super Admin.", "error");
      return;
    }

    if (!state.selectedAgenda) {
      setStatus("Pilih agenda kajian terlebih dahulu.", "warning");
      return;
    }

    if (!isAgendaOpen(state.selectedAgenda)) {
      setStatus(
        "Waktu pemindaian QR untuk agenda ini belum dibuka atau sudah berakhir.",
        "warning"
      );
      return;
    }

    if (!window.Html5Qrcode) {
      setStatus(
        "Pustaka QR Scanner belum berhasil dimuat. Periksa koneksi internet.",
        "error"
      );
      return;
    }

    try {
      hideResult();

      const reader = $("#qr-reader");
      if (!reader) throw new Error("Area kamera tidak ditemukan.");

      reader.innerHTML = "";

      state.scanner = new Html5Qrcode("qr-reader");

      await state.scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: function (width, height) {
            const size = Math.floor(
              Math.min(width, height) * 0.72
            );

            return {
              width: size,
              height: size
            };
          },
          aspectRatio: 1.0
        },
        handleQrDetected,
        function () {
          // Frame tanpa QR bukan error; scanner tetap berjalan.
        }
      );

      state.scanning = true;
      state.paused = false;
      state.processing = false;

      setStatus(
        "Kamera aktif. Arahkan QR Code anggota ke dalam bingkai."
      );

    } catch (error) {
      console.error("Kamera gagal diaktifkan:", error);

      state.scanning = false;
      state.paused = false;

      setStatus(
        "Kamera gagal dibuka. Pastikan izin kamera diberikan dan halaman menggunakan HTTPS. " +
        (error.message || ""),
        "error"
      );
    }

    updateButtons();
  }

  async function handleQrDetected(decodedText) {
    if (state.processing || !state.scanning) return;

    state.processing = true;
    state.paused = true;

    updateButtons();

    try {
      if (state.scanner) {
        state.scanner.pause(true);
      }
    } catch (_) {}

    setStatus("QR terbaca. Sedang memverifikasi ke Supabase...");

    try {
      const token = extractToken(decodedText);

      const response =
        await window.TARBIYAH_PRESENSI_API.verifyMemberQR(
          token,
          state.selectedAgenda.id
        );

      const result = interpretResponse(response);

      showResult(
        result.title,
        result.message,
        result.success ? "success" : "warning"
      );

      setStatus(
        result.message,
        result.success ? "success" : "warning"
      );

    } catch (error) {
      console.error("Verifikasi QR gagal:", error);

      showResult(
        "Verifikasi Gagal",
        error.message || "Terjadi kesalahan saat memverifikasi QR.",
        "error"
      );

      setStatus(
        "Verifikasi QR gagal. Periksa koneksi dan konfigurasi Edge Function.",
        "error"
      );

    } finally {
      state.processing = false;
      updateButtons();
    }
  }

  async function resumeScanner() {
    if (!state.scanner || !state.scanning) return;

    try {
      hideResult();

      state.scanner.resume();

      state.paused = false;

      setStatus(
        "Scanner aktif kembali. Silakan pindai QR anggota berikutnya."
      );

    } catch (error) {
      console.error("Gagal melanjutkan scanner:", error);

      setStatus(
        "Tidak dapat melanjutkan kamera. Hentikan lalu mulai kembali.",
        "error"
      );
    }

    updateButtons();
  }

  async function stopScanner() {
    if (!state.scanner) return;

    try {
      if (state.scanning) {
        await state.scanner.stop();
      }

      await state.scanner.clear();

    } catch (error) {
      console.warn("Proses penghentian scanner:", error);
    }

    state.scanner = null;
    state.scanning = false;
    state.paused = false;
    state.processing = false;

    const reader = $("#qr-reader");

    if (reader) {
      reader.innerHTML = `
        <div class="scanner-camera-placeholder">
          <div>
            <div class="camera-icon">▣</div>
            <strong>Kamera telah dihentikan</strong>
            <p>Tekan Mulai Scanner untuk mengaktifkan kembali.</p>
          </div>
        </div>
      `;
    }

    setStatus("Kamera telah dihentikan.");

    updateButtons();
  }

  async function initialize() {
    const panel = $("#scanner-admin-panel");
    const memberNotice = $("#scanner-member-notice");

    if (!panel || !memberNotice) return;

    const api = window.TARBIYAH_PRESENSI_API;

    if (!api) {
      setStatus("Presensi API belum tersedia.", "error");
      return;
    }

    try {
      state.isAdmin = await api.isAttendanceAdmin();

      if (!state.isAdmin) {
        panel.hidden = true;
        memberNotice.hidden = false;
        return;
      }

      panel.hidden = false;
      memberNotice.hidden = true;

      $("#presensi-agenda-select")?.addEventListener(
        "change",
        handleAgendaChange
      );

      $("#btn-start-scanner")?.addEventListener(
        "click",
        startScanner
      );

      $("#btn-stop-scanner")?.addEventListener(
        "click",
        stopScanner
      );

      $("#btn-resume-scanner")?.addEventListener(
        "click",
        resumeScanner
      );

      await loadAgendas();

    } catch (error) {
      console.error("Inisialisasi scanner gagal:", error);

      panel.hidden = true;
      memberNotice.hidden = false;

      memberNotice.textContent =
        "Tidak dapat memeriksa hak akses Admin. Silakan muat ulang halaman atau periksa koneksi Supabase.";
    }
  }

  window.TARBIYAH_PRESENSI_SCANNER = {
    initialize,
    loadAgendas,
    startScanner,
    stopScanner
  };

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
