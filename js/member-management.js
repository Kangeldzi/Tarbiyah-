
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    supabase: null,
    user: null,
    currentRole: null,
    records: [],
    pendingAction: null,
    loading: false
  };

  const STATUS_LABELS = {
    pending: "Menunggu",
    active: "Aktif",
    rejected: "Ditolak",
    suspended: "Ditangguhkan",
    inactive: "Tidak aktif",
    no_member: "Belum menjadi anggota"
  };

  const ROLE_LABELS = {
    super_admin: "Super Admin",
    admin: "Admin",
    member: "Anggota",
    registered_user: "Pengguna Terdaftar"
  };

  function notify(message) {
    const toast = $("adminToast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function getDisplayName(profile) {
    return profile.full_name ||
      profile.username ||
      "Pengguna TARBIYAH";
  }

  function getInitials(name) {
    return String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase() || "T";
  }

  async function getSession() {
    const auth = window.TARBIYAH_AUTH;

    if (typeof auth?.getSession !== "function") {
      throw new Error("Modul autentikasi tidak tersedia.");
    }

    const result = await auth.getSession();

    if (result?.configured === false) {
      throw new Error("Backend belum dikonfigurasi.");
    }

    if (result?.error) throw result.error;

    return result?.session ||
      result?.data?.session ||
      window.TARBIYAH_SESSION?.session ||
      null;
  }

  async function getCurrentRole(userId) {
    const { data, error } = await state.supabase
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", userId);

    if (error) throw error;

    const names = (data || []).map(row => {
      const relation = Array.isArray(row.roles)
        ? row.roles[0]
        : row.roles;

      return String(relation?.name || "").toLowerCase();
    });

    if (names.includes("super_admin")) return "super_admin";
    if (names.includes("admin")) return "admin";

    return null;
  }

  async function fetchRecords() {
    const [profilesResult, membersResult, userRolesResult] =
      await Promise.all([
        state.supabase
          .from("profiles")
          .select("id, full_name, username, phone, avatar_path")
          .order("full_name", { ascending: true }),

        state.supabase
          .from("members")
          .select(
            "id, user_id, member_number, membership_status, submitted_at, reviewed_at, review_note"
          ),

        state.supabase
          .from("user_roles")
          .select("user_id, role_id")
      ]);

    if (profilesResult.error) {
      throw new Error(
        "Gagal membaca profiles: " + profilesResult.error.message
      );
    }

    if (membersResult.error) {
      throw new Error(
        "Gagal membaca members: " + membersResult.error.message
      );
    }

    if (userRolesResult.error) {
      throw new Error(
        "Gagal membaca user_roles: " + userRolesResult.error.message
      );
    }

    const roleIds = [
      ...new Set(
        (userRolesResult.data || [])
          .map(row => row.role_id)
          .filter(Boolean)
      )
    ];

    let roleMap = new Map();

    if (roleIds.length) {
      const { data: roleRows, error: roleError } =
        await state.supabase
          .from("roles")
          .select("id, name")
          .in("id", roleIds);

      if (roleError) {
        throw new Error(
          "Gagal membaca roles: " + roleError.message
        );
      }

      roleMap = new Map(
        (roleRows || []).map(role => [
          role.id,
          String(role.name || "").toLowerCase()
        ])
      );
    }

    const memberMap = new Map(
      (membersResult.data || []).map(member => [
        member.user_id,
        member
      ])
    );

    const userRoleMap = new Map();

    (userRolesResult.data || []).forEach(row => {
      const name = roleMap.get(row.role_id);
      if (!name) return;

      if (!userRoleMap.has(row.user_id)) {
        userRoleMap.set(row.user_id, []);
      }

      userRoleMap.get(row.user_id).push(name);
    });

    state.records = (profilesResult.data || []).map(profile => {
      const member = memberMap.get(profile.id) || null;
      const roles = userRoleMap.get(profile.id) || [];

      return {
        profile,
        member,
        roles,
        name: getDisplayName(profile),
        status: member?.membership_status || "no_member"
      };
    });

    renderRecords();
  }

  function getFilteredRecords() {
    const query = ($("memberSearch")?.value || "")
      .trim()
      .toLowerCase();

    const filter = $("memberFilter")?.value || "all";

    return state.records.filter(record => {
      const searchable = [
        record.name,
        record.profile.username,
        record.profile.phone,
        record.member?.member_number,
        ...record.roles
      ].join(" ").toLowerCase();

      const matchesQuery = !query || searchable.includes(query);
      const matchesStatus =
        filter === "all" || record.status === filter;

      return matchesQuery && matchesStatus;
    });
  }

  function actionButtons(record) {
    const userId = escapeHTML(record.profile.id);
    const status = record.status;
    const buttons = [];

    if (status === "pending") {
      buttons.push(
        `<button class="member-action"
          data-action="active" data-user="${userId}">Setujui</button>`,
        `<button class="member-action danger"
          data-action="rejected" data-user="${userId}">Tolak</button>`
      );
    }

    if (status === "active") {
      buttons.push(
        `<button class="member-action neutral"
          data-action="suspended" data-user="${userId}">Tangguhkan</button>`
      );
    }

    if (
      status === "suspended" ||
      status === "rejected"
    ) {
      buttons.push(
        `<button class="member-action"
          data-action="active" data-user="${userId}">Aktifkan</button>`
      );
    }

    const isAdmin = record.roles.includes("admin");
    const isSuperAdmin = record.roles.includes("super_admin");

    if (
      state.currentRole === "super_admin" &&
      status === "active" &&
      !isSuperAdmin
    ) {
      buttons.push(
        `<button class="member-action ${isAdmin ? "danger" : "neutral"}"
          data-action="admin-${isAdmin ? "off" : "on"}"
          data-user="${userId}">
          ${isAdmin ? "Cabut Admin" : "Jadikan Admin"}
        </button>`
      );
    }

    if (!buttons.length) {
      return '<span style="color:var(--admin-muted)">Tidak ada tindakan</span>';
    }

    return `<div class="member-actions">${buttons.join("")}</div>`;
  }

  function renderDesktop(records) {
    const body = $("memberTableBody");
    if (!body) return;

    if (!records.length) {
      body.innerHTML =
        '<tr><td colspan="5" class="member-empty">Tidak ada data yang sesuai.</td></tr>';
      return;
    }

    body.innerHTML = records.map(record => {
      const name = escapeHTML(record.name);
      const username = escapeHTML(
        record.profile.username || record.profile.phone || "Profil TARBIYAH"
      );
      const memberNumber = escapeHTML(
        record.member?.member_number || "Belum tersedia"
      );
      const status = escapeHTML(record.status);
      const submitted = formatDate(record.member?.submitted_at);

      return `
        <tr>
          <td>
            <div class="member-user">
              <div class="member-user-avatar">${escapeHTML(getInitials(record.name))}</div>
              <div class="member-user-info">
                <strong>${name}</strong>
                <small>${username}</small>
              </div>
            </div>
          </td>
          <td>${memberNumber}</td>
          <td><span class="member-status ${status}">${STATUS_LABELS[record.status] || status}</span></td>
          <td>${submitted}</td>
          <td>${actionButtons(record)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderMobile(records) {
    const container = $("memberMobileList");
    if (!container) return;

    if (!records.length) {
      container.innerHTML =
        '<div class="member-empty">Tidak ada data yang sesuai.</div>';
      return;
    }

    container.innerHTML = records.map(record => {
      const status = escapeHTML(record.status);

      return `
        <article class="member-mobile-card">
          <div class="member-user">
            <div class="member-user-avatar">${escapeHTML(getInitials(record.name))}</div>
            <div class="member-user-info">
              <strong>${escapeHTML(record.name)}</strong>
              <small>${escapeHTML(record.profile.username || record.profile.phone || "Profil TARBIYAH")}</small>
            </div>
          </div>

          <div class="member-mobile-meta">
            <div>Nomor Anggota<strong>${escapeHTML(record.member?.member_number || "Belum tersedia")}</strong></div>
            <div>Status<strong><span class="member-status ${status}">${STATUS_LABELS[record.status] || status}</span></strong></div>
            <div>Pengajuan<strong>${formatDate(record.member?.submitted_at)}</strong></div>
            <div>Role<strong>${escapeHTML(record.roles.map(role => ROLE_LABELS[role] || role).join(", ") || "Belum ditetapkan")}</strong></div>
          </div>

          ${actionButtons(record)}
        </article>
      `;
    }).join("");
  }

  function renderRecords() {
    const records = getFilteredRecords();

    renderDesktop(records);
    renderMobile(records);

    const summary = $("memberSummary");

    if (summary) {
      summary.textContent =
        `Menampilkan ${records.length} dari ${state.records.length} profil yang dapat dibaca.`;
    }
  }

  function openDecisionDialog(userId, action) {
    const record = state.records.find(
      item => item.profile.id === userId
    );

    if (!record) return;

    const isAdminAction = action.startsWith("admin-");

    const titleMap = {
      active: "Setujui keanggotaan",
      rejected: "Tolak permohonan",
      suspended: "Tangguhkan anggota",
      "admin-on": "Berikan akses Admin",
      "admin-off": "Cabut akses Admin"
    };

    const descriptionMap = {
      active: `Setujui ${record.name} sebagai anggota TARBIYAH?`,
      rejected: `Tolak permohonan keanggotaan ${record.name}?`,
      suspended: `Tangguhkan status keanggotaan ${record.name}?`,
      "admin-on": `Berikan role Admin kepada ${record.name}?`,
      "admin-off": `Cabut role Admin dari ${record.name}?`
    };

    state.pendingAction = { userId, action };

    $("memberDialogTitle").textContent = titleMap[action];
    $("memberDialogDescription").textContent = descriptionMap[action];
    $("memberDecisionNote").value = "";
    $("memberDialogConfirm").textContent =
      isAdminAction ? "Lanjutkan" : "Konfirmasi";

    $("memberDialog").hidden = false;
  }

  function closeDialog() {
    $("memberDialog").hidden = true;
    state.pendingAction = null;
  }

  async function executeDecision() {
    if (!state.pendingAction) return;

    const { userId, action } = state.pendingAction;
    const note = $("memberDecisionNote").value.trim();
    const button = $("memberDialogConfirm");

    button.disabled = true;
    button.textContent = "Memproses...";

    try {
      if (
        ["active", "rejected", "suspended"].includes(action)
      ) {
        const { error } = await state.supabase.rpc(
          "review_member",
          {
            p_user_id: userId,
            p_decision: action,
            p_note: note || null
          }
        );

        if (error) throw error;
      } else if (action === "admin-on" || action === "admin-off") {
        if (state.currentRole !== "super_admin") {
          throw new Error("Hanya Super Admin yang dapat mengelola akses Admin.");
        }

        const { error } = await state.supabase.rpc(
          "set_admin_access",
          {
            p_user_id: userId,
            p_enabled: action === "admin-on"
          }
        );

        if (error) throw error;
      } else {
        throw new Error("Tindakan tidak dikenali.");
      }

      closeDialog();
      notify("Tindakan berhasil diproses. Memperbarui data...");
      await fetchRecords();

    } catch (error) {
      console.error("[TARBIYAH MEMBER] Tindakan gagal:", error);
      notify("Gagal memproses: " + (error.message || "Kesalahan tidak diketahui."));

    } finally {
      button.disabled = false;
      button.textContent = "Konfirmasi";
    }
  }

  function setupEvents() {
    $("memberSearch")?.addEventListener("input", renderRecords);
    $("memberFilter")?.addEventListener("change", renderRecords);

    $("refreshMembers")?.addEventListener("click", async () => {
      await loadRecords();
    });

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-action][data-user]");
      if (!button) return;

      openDecisionDialog(
        button.dataset.user,
        button.dataset.action
      );
    });

    $("memberDialogClose")?.addEventListener("click", closeDialog);
    $("memberDialogCancel")?.addEventListener("click", closeDialog);
    $("memberDialogConfirm")?.addEventListener("click", executeDecision);

    $("memberDialog")?.addEventListener("click", event => {
      if (event.target === $("memberDialog")) closeDialog();
    });
  }

  async function loadRecords() {
    if (state.loading) return;

    state.loading = true;

    if ($("memberSummary")) {
      $("memberSummary").textContent = "Memuat data dari Supabase...";
    }

    try {
      await fetchRecords();
      console.info(
        "[TARBIYAH MEMBER] Data berhasil dimuat:",
        state.records.length,
        "profil."
      );
    } catch (error) {
      console.error("[TARBIYAH MEMBER] Gagal memuat data:", error);

      if ($("memberSummary")) {
        $("memberSummary").textContent =
          "Data tidak dapat dimuat: " + error.message;
      }

      if ($("memberTableBody")) {
        $("memberTableBody").innerHTML =
          `<tr><td colspan="5" class="member-empty">${escapeHTML(error.message)}</td></tr>`;
      }

      if ($("memberMobileList")) {
        $("memberMobileList").innerHTML =
          `<div class="member-empty">${escapeHTML(error.message)}</div>`;
      }

      notify("Gagal memuat data pengguna dan anggota.");
    } finally {
      state.loading = false;
    }
  }

  async function initialize() {
    try {
      if (!window.TARBIYAH_BACKEND_READY || !window.tarbiyahSupabase) {
        throw new Error("Supabase Client belum siap.");
      }

      state.supabase = window.tarbiyahSupabase;

      const session = await getSession();

      if (!session?.user) {
        window.location.replace("./login-register.html");
        return;
      }

      state.user = session.user;
      state.currentRole = await getCurrentRole(session.user.id);

      if (!["admin", "super_admin"].includes(state.currentRole)) {
        notify("Akses modul ini hanya untuk administrator.");

        setTimeout(() => {
          window.location.replace("./dashboard.html");
        }, 1200);

        return;
      }

      setupEvents();
      await loadRecords();

      console.info(
        "[TARBIYAH MEMBER] Modul aktif. Role:",
        state.currentRole
      );

    } catch (error) {
      console.error("[TARBIYAH MEMBER] Inisialisasi gagal:", error);
      notify("Modul anggota gagal diinisialisasi: " + error.message);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
