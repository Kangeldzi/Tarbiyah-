/* ============================================================
   TARBIYAH — ROLE MANAGEMENT
   File    : js/role-management.js
   Versi   : 1.0.0

   Fungsi:
   - Daftar pengguna dari profiles
   - Membaca penetapan Role dari user_roles
   - Menetapkan Role melalui RPC admin_assign_role
   - Mencabut Role melalui RPC admin_revoke_role
   - Hanya Super Admin yang dapat mengelola Role

   Tidak mengubah:
   - Struktur database
   - RLS
   - Hak akses tabel
   - Sistem tema universal
   ============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_ROLE_MANAGEMENT_V1__) return;
  window.__TARBIYAH_ROLE_MANAGEMENT_V1__ = true;

  const VERSION = "1.0.0";

  const CONFIG = {
    PROFILE_TABLE: "profiles",
    ROLE_TABLE: "roles",
    USER_ROLE_TABLE: "user_roles",
    ASSIGN_RPC: "admin_assign_role",
    REVOKE_RPC: "admin_revoke_role",
    PAGE_SIZE: 500
  };

  const ROLE_LABELS = {
    super_admin: "Super Admin",
    admin: "Admin",
    mentor: "Mentor",
    member: "Member",
    registered_user: "Registered User"
  };

  const state = {
    supabase: null,
    user: null,
    isSuperAdmin: false,
    roles: [],
    users: [],
    assignments: [],
    loading: false,
    busy: false,
    search: ""
  };

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function normalizeRole(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function getClient() {
    const client = window.tarbiyahSupabase;

    if (
      !window.TARBIYAH_BACKEND_READY ||
      !client ||
      typeof client.from !== "function" ||
      !client.auth
    ) {
      throw new Error(
        "Koneksi Supabase TARBIYAH belum tersedia."
      );
    }

    return client;
  }

  function showNotice(message, type = "info") {
    const notice = $("#tarbiyahRoleNotice");
    if (!notice) return;

    notice.textContent = message;
    notice.dataset.type = type;
    notice.hidden = false;
  }

  function hideNotice() {
    const notice = $("#tarbiyahRoleNotice");
    if (notice) notice.hidden = true;
  }

  function injectInterface() {
    const host = document.getElementById("roles");

    if (!host) {
      console.error(
        "[TARBIYAH ROLE] Elemen #roles tidak ditemukan."
      );
      return false;
    }

    if ($("#tarbiyahRoleManagement")) return true;

    const panel = document.createElement("section");
    panel.id = "tarbiyahRoleManagement";
    panel.className = "tarbiyah-role-management";

    panel.innerHTML = `
      <style>
        #tarbiyahRoleManagement {
          margin-top: 24px;
          color: var(--text-primary, inherit);
        }

        #tarbiyahRoleManagement .trm-panel {
          padding: 18px;
          border: 1px solid var(--border-color, rgba(128,128,128,.2));
          border-radius: 16px;
          background: var(--bg-secondary, transparent);
        }

        #tarbiyahRoleManagement .trm-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 15px;
        }

        #tarbiyahRoleManagement .trm-heading h3 {
          margin: 0;
          font-size: 17px;
        }

        #tarbiyahRoleManagement .trm-muted {
          color: var(--text-secondary, #888);
          font-size: 12px;
        }

        #tarbiyahRoleManagement .trm-search {
          width: 100%;
          min-height: 43px;
          box-sizing: border-box;
          padding: 10px 13px;
          border: 1px solid var(--border-color, #888);
          border-radius: 10px;
          background: var(--bg-primary, transparent);
          color: var(--text-primary, inherit);
          margin-bottom: 15px;
        }

        #tarbiyahRoleManagement .trm-user {
          padding: 14px 0;
          border-top: 1px solid var(--border-color, rgba(128,128,128,.2));
        }

        #tarbiyahRoleManagement .trm-user-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        #tarbiyahRoleManagement .trm-name {
          font-weight: 700;
          font-size: 13px;
        }

        #tarbiyahRoleManagement .trm-username {
          display: block;
          margin-top: 3px;
          color: var(--text-secondary, #888);
          font-size: 11px;
        }

        #tarbiyahRoleManagement .trm-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 10px 0;
        }

        #tarbiyahRoleManagement .trm-badge {
          padding: 5px 9px;
          border-radius: 20px;
          background: rgba(16,185,129,.12);
          color: var(--color-primary, #10b981);
          font-size: 10px;
          font-weight: 700;
        }

        #tarbiyahRoleManagement .trm-empty {
          color: var(--text-secondary, #888);
          font-size: 12px;
        }

        #tarbiyahRoleManagement .trm-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        #tarbiyahRoleManagement select,
        #tarbiyahRoleManagement button {
          min-height: 38px;
          border-radius: 9px;
          padding: 8px 11px;
          font-size: 12px;
        }

        #tarbiyahRoleManagement select {
          flex: 1 1 160px;
          min-width: 0;
          border: 1px solid var(--border-color, #888);
          background: var(--bg-primary, transparent);
          color: var(--text-primary, inherit);
        }

        #tarbiyahRoleManagement button {
          border: 0;
          cursor: pointer;
          font-weight: 700;
        }

        #tarbiyahRoleManagement button:disabled,
        #tarbiyahRoleManagement select:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        #tarbiyahRoleManagement .trm-assign {
          background: var(--color-primary, #10b981);
          color: white;
        }

        #tarbiyahRoleManagement .trm-revoke {
          background: rgba(239,68,68,.12);
          color: #ef4444;
          border: 1px solid rgba(239,68,68,.3);
        }

        #tarbiyahRoleManagement .trm-refresh {
          background: var(--bg-tertiary, rgba(128,128,128,.15));
          color: var(--text-primary, inherit);
          border: 1px solid var(--border-color, #888);
        }

        #tarbiyahRoleManagement .trm-notice {
          padding: 11px 13px;
          border-radius: 10px;
          margin: 12px 0;
          font-size: 12px;
          background: rgba(16,185,129,.1);
        }

        #tarbiyahRoleManagement .trm-notice[data-type="error"],
        #tarbiyahRoleManagement .trm-notice[data-type="warning"] {
          background: rgba(239,68,68,.1);
          color: #ef7777;
        }

        #tarbiyahRoleManagement [hidden] {
          display: none !important;
        }
      </style>

      <div class="trm-panel">
        <div class="trm-heading">
          <div>
            <h3>Manajemen Penetapan Role</h3>
            <div class="trm-muted" id="trmSummary">
              Menyiapkan data pengguna...
            </div>
          </div>

          <button
            type="button"
            class="trm-refresh"
            id="trmRefresh"
          >↻ Muat Ulang</button>
        </div>

        <div
          class="trm-notice"
          id="tarbiyahRoleNotice"
          role="status"
          aria-live="polite"
          hidden
        ></div>

        <input
          type="search"
          class="trm-search"
          id="trmSearch"
          placeholder="Cari nama atau username pengguna..."
          autocomplete="off"
          aria-label="Cari pengguna"
        >

        <div id="trmUserList">
          <p class="trm-muted">Memuat daftar pengguna...</p>
        </div>
      </div>
    `;

    host.appendChild(panel);
    return true;
  }

  async function verifySuperAdmin() {
    const { data, error } = await state.supabase.auth.getUser();

    if (error) throw error;

    if (!data?.user?.id) {
      throw new Error("Sesi pengguna tidak ditemukan.");
    }

    state.user = data.user;

    const { data: assignments, error: roleError } =
      await state.supabase
        .from(CONFIG.USER_ROLE_TABLE)
        .select("role_id, roles(name)")
        .eq("user_id", state.user.id);

    if (roleError) throw roleError;

    const names = (assignments || []).map(item => {
      const relation = Array.isArray(item.roles)
        ? item.roles[0]
        : item.roles;

      return normalizeRole(relation?.name);
    });

    state.isSuperAdmin = names.includes("super_admin");

    if (!state.isSuperAdmin) {
      throw new Error(
        "Akses ditolak. Manajemen Role hanya tersedia bagi Super Admin."
      );
    }
  }

  async function loadRoles() {
    const { data, error } = await state.supabase
      .from(CONFIG.ROLE_TABLE)
      .select("id, name")
      .order("name");

    if (error) throw error;

    state.roles = (data || [])
      .filter(role => ROLE_LABELS[normalizeRole(role.name)])
      .map(role => ({
        id: role.id,
        name: normalizeRole(role.name)
      }));
  }

  async function loadUsers() {
    const { data: profiles, error: profileError } =
      await state.supabase
        .from(CONFIG.PROFILE_TABLE)
        .select("id, full_name, username")
        .order("full_name", { ascending: true })
        .limit(CONFIG.PAGE_SIZE);

    if (profileError) throw profileError;

    const { data: assignments, error: assignmentError } =
      await state.supabase
        .from(CONFIG.USER_ROLE_TABLE)
        .select("id, user_id, role_id, roles(name)")
        .limit(2000);

    if (assignmentError) throw assignmentError;

    state.users = profiles || [];
    state.assignments = assignments || [];
  }

  function getUserRoles(userId) {
    return state.assignments
      .filter(item => item.user_id === userId)
      .map(item => {
        const relation = Array.isArray(item.roles)
          ? item.roles[0]
          : item.roles;

        return normalizeRole(relation?.name);
      })
      .filter(Boolean);
  }

  function renderUsers() {
    const container = $("#trmUserList");
    const summary = $("#trmSummary");

    if (!container) return;

    const query = state.search.trim().toLowerCase();

    const filtered = state.users.filter(user => {
      const name = String(user.full_name || "").toLowerCase();
      const username = String(user.username || "").toLowerCase();

      return name.includes(query) || username.includes(query);
    });

    if (summary) {
      summary.textContent =
        `${state.users.length} pengguna · ${filtered.length} ditampilkan`;
    }

    if (!filtered.length) {
      container.innerHTML = `
        <p class="trm-empty">
          ${state.users.length
            ? "Tidak ada pengguna yang cocok dengan pencarian."
            : "Belum ada data pengguna yang dapat ditampilkan."}
        </p>
      `;
      return;
    }

    container.innerHTML = filtered.map(user => {
      const roles = getUserRoles(user.id);

      const badges = roles.length
        ? roles.map(role => `
            <span class="trm-badge">
              ${escapeHTML(ROLE_LABELS[role] || role)}
            </span>
          `).join("")
        : `<span class="trm-empty">Belum memiliki Role</span>`;

      const options = state.roles.map(role => `
        <option value="${escapeHTML(role.name)}">
          ${escapeHTML(ROLE_LABELS[role.name])}
        </option>
      `).join("");

      const revokeButtons = roles.map(role => `
        <button
          type="button"
          class="trm-revoke"
          data-action="revoke"
          data-user-id="${escapeHTML(user.id)}"
          data-role="${escapeHTML(role)}"
        >
          Cabut ${escapeHTML(ROLE_LABELS[role] || role)}
        </button>
      `).join("");

      return `
        <article class="trm-user">
          <div class="trm-user-top">
            <div>
              <div class="trm-name">
                ${escapeHTML(user.full_name || "Tanpa Nama")}
              </div>
              <span class="trm-username">
                ${user.username
                  ? "@" + escapeHTML(user.username)
                  : "Username belum tersedia"}
              </span>
            </div>
          </div>

          <div class="trm-badges">${badges}</div>

          <div class="trm-actions">
            <select
              aria-label="Pilih Role untuk ${escapeHTML(user.full_name || "pengguna")}"
              data-role-select="${escapeHTML(user.id)}"
            >
              <option value="">Pilih Role...</option>
              ${options}
            </select>

            <button
              type="button"
              class="trm-assign"
              data-action="assign"
              data-user-id="${escapeHTML(user.id)}"
            >Tetapkan Role</button>
          </div>

          ${revokeButtons
            ? `<div class="trm-actions">${revokeButtons}</div>`
            : ""}
        </article>
      `;
    }).join("");
  }

  async function refresh() {
    if (state.loading || state.busy) return;

    state.loading = true;
    hideNotice();

    const list = $("#trmUserList");
    if (list) {
      list.innerHTML =
        '<p class="trm-muted">Memuat data pengguna dan Role...</p>';
    }

    try {
      await verifySuperAdmin();
      await Promise.all([loadRoles(), loadUsers()]);
      renderUsers();

      console.info("[TARBIYAH ROLE] Data berhasil dimuat.", {
        version: VERSION,
        users: state.users.length,
        roles: state.roles.length,
        assignments: state.assignments.length
      });
    } catch (error) {
      console.error("[TARBIYAH ROLE] Gagal memuat:", error);

      if (list) {
        list.innerHTML = `
          <p class="trm-empty">
            ${escapeHTML(error.message || "Gagal memuat data.")}
          </p>
        `;
      }

      showNotice(
        error.message || "Gagal memuat data Manajemen Role.",
        "error"
      );
    } finally {
      state.loading = false;
    }
  }

  async function assignRole(userId) {
    if (!state.isSuperAdmin || state.busy) return;

    const select = document.querySelector(
      `[data-role-select="${CSS.escape(userId)}"]`
    );

    const roleName = normalizeRole(select?.value);

    if (!roleName) {
      showNotice("Pilih Role terlebih dahulu.", "warning");
      return;
    }

    if (!state.roles.some(role => role.name === roleName)) {
      showNotice("Role yang dipilih tidak tersedia.", "error");
      return;
    }

    if (getUserRoles(userId).includes(roleName)) {
      showNotice("Pengguna sudah memiliki Role tersebut.", "warning");
      return;
    }

    const user = state.users.find(item => item.id === userId);
    const userName = user?.full_name || "pengguna";

    if (!window.confirm(
      `Tetapkan Role ${ROLE_LABELS[roleName]} kepada ${userName}?`
    )) return;

    await executeRoleAction(
      CONFIG.ASSIGN_RPC,
      userId,
      roleName,
      "Role berhasil ditetapkan."
    );
  }

  async function revokeRole(userId, roleName) {
    if (!state.isSuperAdmin || state.busy) return;

    roleName = normalizeRole(roleName);

    const user = state.users.find(item => item.id === userId);
    const userName = user?.full_name || "pengguna";

    if (!getUserRoles(userId).includes(roleName)) {
      showNotice("Penetapan Role tidak ditemukan.", "warning");
      return;
    }

    if (!window.confirm(
      `Cabut Role ${ROLE_LABELS[roleName] || roleName} dari ${userName}?`
    )) return;

    await executeRoleAction(
      CONFIG.REVOKE_RPC,
      userId,
      roleName,
      "Role berhasil dicabut."
    );
  }

  async function executeRoleAction(
    rpcName,
    userId,
    roleName,
    successMessage
  ) {
    state.busy = true;
    hideNotice();

    const panel = $("#tarbiyahRoleManagement");
    panel?.querySelectorAll("button, select").forEach(control => {
      control.disabled = true;
    });

    try {
      const { data, error } = await state.supabase.rpc(rpcName, {
        p_user_id: userId,
        p_role_name: roleName
      });

      if (error) throw error;

      if (rpcName === CONFIG.REVOKE_RPC && data !== true) {
        throw new Error(
          "Tidak ada penetapan Role yang dicabut. Periksa data pengguna."
        );
      }

      showNotice(successMessage, "success");

      await loadUsers();
      renderUsers();

      console.info("[TARBIYAH ROLE] Operasi berhasil.", {
        action: rpcName,
        userId,
        roleName,
        result: data
      });
    } catch (error) {
      console.error("[TARBIYAH ROLE] Operasi gagal:", error);

      showNotice(
        error.message || "Operasi Role gagal dilakukan.",
        "error"
      );
    } finally {
      state.busy = false;

      panel?.querySelectorAll("button, select").forEach(control => {
        control.disabled = false;
      });
    }
  }

  function bindEvents() {
    const panel = $("#tarbiyahRoleManagement");
    if (!panel || panel.dataset.bound === "true") return;

    panel.dataset.bound = "true";

    $("#trmRefresh")?.addEventListener("click", refresh);

    $("#trmSearch")?.addEventListener("input", event => {
      state.search = event.target.value || "";
      renderUsers();
    });

    $("#trmUserList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled) return;

      const userId = button.dataset.userId;
      const action = button.dataset.action;

      if (!userId) return;

      if (action === "assign") {
        assignRole(userId);
      } else if (action === "revoke") {
        revokeRole(userId, button.dataset.role);
      }
    });
  }

  async function initialize() {
    if (!injectInterface()) return;

    bindEvents();

    try {
      state.supabase = getClient();
      await refresh();
    } catch (error) {
      console.error("[TARBIYAH ROLE] Inisialisasi gagal:", error);
      showNotice(error.message, "error");
    }
  }

  window.TARBIYAH_ROLE_MANAGEMENT = Object.freeze({
    version: VERSION,
    refresh,
    getState: () => ({
      isSuperAdmin: state.isSuperAdmin,
      users: state.users.length,
      roles: state.roles.length,
      assignments: state.assignments.length
    })
  });

  function start() {
    initialize();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  console.info("[TARBIYAH ROLE] Modul v1.0.0 siap.");
})();
