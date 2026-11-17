/* =========================================================
   TARBIYAH — DASHBOARD ATTENDANCE
   Statistik presensi pribadi dan komunitas
   Hanya membaca data Supabase.
   Tidak mengubah database, SQL, atau RLS.
   ========================================================= */

(() => {
  "use strict";

  const log = (...args) =>
    console.log("[TARBIYAH ATTENDANCE]", ...args);

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const STATUS_CONFIRMED = [
    "hadir",
    "izin",
    "sakit",
    "alpa"
  ];

  function getClient() {
    if (
      !window.TARBIYAH_BACKEND_READY ||
      !window.tarbiyahSupabase
    ) {
      throw new Error("Koneksi Supabase belum tersedia.");
    }

    return window.tarbiyahSupabase;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID").format(value);
  }

  function getJakartaMonthRange() {
    const now = new Date();

    const year = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Jakarta",
        year: "numeric"
      }).format(now)
    );

    const month = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Jakarta",
        month: "numeric"
      }).format(now)
    );

    const pad = value => String(value).padStart(2, "0");

    const start = `${year}-${pad(month)}-01T00:00:00+07:00`;

    const nextMonth = month === 12
      ? `${year + 1}-01`
      : `${year}-${pad(month + 1)}`;

    const end = `${nextMonth}-01T00:00:00+07:00`;

    return { start, end };
  }

  function ensureExtraCards() {
    const grid = $(".dashboard-stats");

    if (!grid) {
      throw new Error("Area kartu statistik tidak ditemukan.");
    }

    const cards = [
      {
        key: "month",
        icon: "▣",
        label: "Hadir Bulan Ini",
        description: "Jumlah kajian yang dihadiri bulan ini"
      },
      {
        key: "percentage",
        icon: "%",
        label: "Persentase Kehadiran",
        description: "Hadir dibanding presensi terkonfirmasi"
      },
      {
        key: "community",
        icon: "♧",
        label: "Total Hadir Komunitas",
        description: "Akumulasi kehadiran seluruh anggota"
      }
    ];

    cards.forEach(card => {
      if ($(`[data-attendance-stat="${card.key}"]`, grid)) {
        return;
      }

      const article = document.createElement("article");
      article.className = "dashboard-stat-card";
      article.dataset.attendanceCard = card.key;

      article.innerHTML = `
        <div class="dashboard-stat-icon"></div>
        <span class="dashboard-stat-label"></span>
        <strong class="dashboard-stat-value"
          data-attendance-stat="${card.key}">—</strong>
        <small class="dashboard-stat-description"></small>
      `;

      $(".dashboard-stat-icon", article).textContent = card.icon;
      $(".dashboard-stat-label", article).textContent = card.label;
      $(".dashboard-stat-description", article).textContent =
        card.description;

      grid.appendChild(article);
    });
  }

  function setValue(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function setError(message) {
    setValue("[data-stat-attendance]", "—");
    setValue('[data-attendance-stat="month"]', "—");
    setValue('[data-attendance-stat="percentage"]', "—");
    setValue('[data-attendance-stat="community"]', "—");

    log("Statistik tidak dapat dimuat:", message);
  }

  async function getSession(client) {
    const auth = window.TARBIYAH_AUTH;

    if (typeof auth?.getSession === "function") {
      const result = await auth.getSession();

      if (result?.error) throw result.error;

      return result?.session ||
        result?.data?.session ||
        null;
    }

    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    return data?.session || null;
  }

  async function getOwnMember(client, userId) {
    const { data, error } = await client
      .from("members")
      .select("id, user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "Data anggota untuk akun ini belum ditemukan."
      );
    }

    return data;
  }

  async function loadPersonalAttendance(client, memberId) {
    const { data, error } = await client
      .from("kajian_attendance")
      .select("attendance_status, attended_at")
      .eq("member_id", memberId);

    if (error) throw error;

    return Array.isArray(data) ? data : [];
  }

  async function loadCommunityAttendance(client) {
    const { data, error } = await client
      .from("kajian_attendance")
      .select("attendance_status")
      .eq("attendance_status", "hadir");

    if (error) throw error;

    return Array.isArray(data) ? data.length : 0;
  }

  function calculatePersonal(records) {
    const confirmed = records.filter(row =>
      STATUS_CONFIRMED.includes(
        String(row.attendance_status || "").toLowerCase()
      )
    );

    const attended = confirmed.filter(row =>
      String(row.attendance_status || "").toLowerCase() === "hadir"
    );

    const { start, end } = getJakartaMonthRange();

    const monthCount = attended.filter(row => {
      if (!row.attended_at) return false;

      const timestamp = new Date(row.attended_at).getTime();

      return (
        Number.isFinite(timestamp) &&
        timestamp >= new Date(start).getTime() &&
        timestamp < new Date(end).getTime()
      );
    }).length;

    const percentage = confirmed.length
      ? Math.round((attended.length / confirmed.length) * 100)
      : 0;

    const statusCounts = {
      izin: confirmed.filter(row => row.attendance_status === "izin").length,
      sakit: confirmed.filter(row => row.attendance_status === "sakit").length,
      alpa: confirmed.filter(row => row.attendance_status === "alpa").length
    };

    return {
      total: attended.length,
      month: monthCount,
      percentage,
      denominator: confirmed.length,
      statusCounts
    };
  }

  function renderPersonal(stats) {
    setValue(
      "[data-stat-attendance]",
      formatNumber(stats.total)
    );

    setValue(
      '[data-attendance-stat="month"]',
      formatNumber(stats.month)
    );

    setValue(
      '[data-attendance-stat="percentage"]',
      `${stats.percentage}%`
    );

    const personalCard = $(
      '[data-attendance-card="month"]'
    );

    if (personalCard) {
      const description = $(".dashboard-stat-description", personalCard);

      if (description) {
        description.textContent =
          `Izin ${stats.statusCounts.izin} · ` +
          `Sakit ${stats.statusCounts.sakit} · ` +
          `Alpa ${stats.statusCounts.alpa}`;
      }
    }
  }

  function renderCommunity(total) {
    setValue(
      '[data-attendance-stat="community"]',
      formatNumber(total)
    );
  }

  async function waitForRole(maxWait = 15000) {
    const started = Date.now();

    while (Date.now() - started < maxWait) {
      const role = window.TARBIYAH_USER_ROLE;

      if (role?.ready && role.name) {
        return role.name;
      }

      await new Promise(resolve =>
        window.setTimeout(resolve, 150)
      );
    }

    throw new Error("Informasi role akun belum tersedia.");
  }

  async function initialize() {
    ensureExtraCards();

    try {
      const client = getClient();
      const session = await getSession(client);

      if (!session?.user?.id) {
        throw new Error("Sesi pengguna tidak ditemukan.");
      }

      const role = await waitForRole();

      const member = await getOwnMember(
        client,
        session.user.id
      );

      const personalRecords = await loadPersonalAttendance(
        client,
        member.id
      );

      const personalStats = calculatePersonal(
        personalRecords
      );

      renderPersonal(personalStats);

      const isAdmin = [
        "admin",
        "super_admin"
      ].includes(String(role).toLowerCase());

      const communityCard = $(
        '[data-attendance-card="community"]'
      );

      if (communityCard) {
        communityCard.hidden = !isAdmin;
      }

      if (isAdmin) {
        const communityTotal =
          await loadCommunityAttendance(client);

        renderCommunity(communityTotal);
      }

      log("Statistik presensi berhasil dimuat.", {
        role,
        personal: personalStats
      });

    } catch (error) {
      setError(error?.message || "Terjadi kesalahan.");

      const communityCard = $(
        '[data-attendance-card="community"]'
      );

      if (communityCard) {
        const role = window.TARBIYAH_USER_ROLE?.name;

        communityCard.hidden = ![
          "admin",
          "super_admin"
        ].includes(String(role || "").toLowerCase());
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

  window.TARBIYAH_DASHBOARD_ATTENDANCE = {
    refresh: initialize
  };

})();
