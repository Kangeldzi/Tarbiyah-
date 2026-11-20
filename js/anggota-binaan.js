
/* ============================================================
   TARBIYAH — ANGGOTA BINAAN
   File    : js/anggota-binaan.js
   Versi   : 1.0.0

   Fitur:
   - Verifikasi sesi login
   - Verifikasi role
   - Membaca penugasan Mentor aktif
   - Membaca data anggota binaan
   - Membaca profil anggota binaan
   - Pencarian anggota
   - Tidak mengubah data database
============================================================ */

(() => {
  "use strict";

  if (window.__TARBIYAH_ANGGOTA_BINAAN_V1__) return;
  window.__TARBIYAH_ANGGOTA_BINAAN_V1__ = true;

  const $ = id => document.getElementById(id);

  const state = {
    user: null,
    role: null,
    members: [],
    loading: false
  };

  const LOGIN_PAGE =
    window.TARBIYAH_CONFIG?.LOGIN_PAGE ||
    "./login-register.html";

  function getClient() {
    const client = window.tarbiyahSupabase;

    if (
      !client ||
      !client.auth ||
      typeof client.from !== "function"
    ) {
      throw new Error(
        "Koneksi Supabase belum tersedia."
      );
    }

    return client;
  }

  function showMessage(message, type = "error") {
    const element = $("mentorMessage");
    if (!element) return;

    element.textContent = message;
    element.className = `mentor-message show ${type}`;
  }

  function hideMessage() {
    const element = $("mentorMessage");
    if (!element) return;

    element.textContent = "";
    element.className = "mentor-message";
  }

  function setLoading(loading) {
    state.loading = loading;

    const button = $("refreshMentees");

    if (button) {
      button.disabled = loading;
      button.textContent = loading
        ? "Memuat..."
        : "↻ Perbarui";
    }
  }

  function initials(name) {
    return String(name || "A")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "Belum tersedia";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Belum tersedia";
    }

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function statusLabel(value) {
    const status = String(value || "").toLowerCase();

    const labels = {
      active: "Aktif",
      pending: "Menunggu",
      inactive: "Tidak Aktif",
      suspended: "Ditangguhkan"
    };

    return labels[status] || value || "Belum tersedia";
  }

  function safeText(value, fallback = "Belum tersedia") {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      return fallback;
    }

    return String(value);
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function createDetail(label, value) {
    const row = createElement("div", "mentor-detail-row");

    row.append(
      createElement("span", "", label),
      createElement("span", "", safeText(value))
    );

    return row;
  }

  function renderMembers(rows) {
    const container = $("menteeList");
    if (!container) return;

    container.replaceChildren();

    if (!rows.length) {
      const empty = createElement("div", "mentor-empty");

      empty.append(
        createElement(
          "strong",
          "",
          "Belum Ada Anggota Binaan"
        ),
        createElement(
          "span",
          "",
          "Belum ditemukan penugasan aktif untuk akun Mentor ini."
        )
      );

      container.appendChild(empty);
      return;
    }

    rows.forEach(item => {
      const card = createElement(
        "article",
        "mentor-member-card"
      );

      const top = createElement(
        "div",
        "mentor-member-top"
      );

      const avatar = createElement(
        "div",
        "mentor-avatar",
        initials(item.full_name)
      );

      const identity = createElement(
        "div",
        "mentor-member-name"
      );

      identity.append(
        createElement(
          "strong",
          "",
          safeText(item.full_name, "Nama belum tersedia")
        ),
        createElement(
          "small",
          "",
          item.member_number
            ? `Nomor anggota: ${item.member_number}`
            : "Nomor anggota belum tersedia"
        )
      );

      top.append(avatar, identity);

      const details = createElement(
        "div",
        "mentor-member-details"
      );

      details.append(
        createDetail("Username", item.username ? `@${item.username}` : ""),
        createDetail("Telepon", item.phone),
        createDetail("Kota", item.city),
        createDetail("Mulai dibina", formatDate(item.assigned_at))
      );

      const statusRow = createElement(
        "div",
        "mentor-detail-row"
      );

      statusRow.append(
        createElement("span", "", "Status keanggotaan")
      );

      const badge = createElement(
        "span",
        "mentor-status",
        statusLabel(item.membership_status)
      );

      if (
        String(item.membership_status).toLowerCase() !== "active"
      ) {
        badge.classList.add("inactive");
      }

      statusRow.appendChild(badge);
      details.appendChild(statusRow);

      card.append(top, details);
      container.appendChild(card);
    });
  }

  function applySearch() {
    const query = String($("menteeSearch")?.value || "")
      .trim()
      .toLowerCase();

    const filtered = state.members.filter(member => {
      const searchable = [
        member.full_name,
        member.username,
        member.member_number,
        member.phone,
        member.city
      ].join(" ").toLowerCase();

      return searchable.includes(query);
    });

    renderMembers(filtered);
  }

  async function getUserRole(client, userId) {
    const { data, error } = await client
      .from("user_roles")
      .select("role_id, roles(name)")
      .eq("user_id", userId);

    if (error) throw error;

    const roles = (data || []).map(row => {
      const relation = Array.isArray(row.roles)
        ? row.roles[0]
        : row.roles;

      return String(relation?.name || "")
        .trim()
        .toLowerCase();
    });

    if (roles.includes("super_admin")) return "super_admin";
    if (roles.includes("admin")) return "admin";
    if (roles.includes("mentor")) return "mentor";

    return roles[0] || null;
  }

  async function loadMembers() {
    if (state.loading) return;

    setLoading(true);
    hideMessage();

    try {
      const client = getClient();

      const { data: authData, error: authError } =
        await client.auth.getUser();

      if (authError) throw authError;

      const user = authData?.user;

      if (!user?.id) {
        window.location.replace(LOGIN_PAGE);
        return;
      }

      state.user = user;

      const role = await getUserRole(client, user.id);
      state.role = role;

      if (!["mentor", "admin", "super_admin"].includes(role)) {
        throw new Error(
          "Akun ini tidak memiliki akses ke halaman Anggota Binaan."
        );
      }

      let assignmentQuery = client
        .from("mentor_assignments")
        .select("id,member_id,assigned_at,notes,is_active")
        .eq("is_active", true)
        .order("assigned_at", { ascending: false });

      if (role === "mentor") {
        assignmentQuery = assignmentQuery.eq(
          "mentor_user_id",
          user.id
        );
      }

      const {
        data: assignments,
        error: assignmentError
      } = await assignmentQuery;

      if (assignmentError) throw assignmentError;

      const assignmentRows = assignments || [];

      $("totalMentees").textContent =
        String(new Set(assignmentRows.map(row => row.member_id)).size);

      $("activeAssignments").textContent =
        String(assignmentRows.length);

      const memberIds = [
        ...new Set(
          assignmentRows
            .map(row => row.member_id)
            .filter(Boolean)
        )
      ];

      if (!memberIds.length) {
        state.members = [];
        renderMembers([]);
        return;
      }

      const {
        data: memberRows,
        error: memberError
      } = await client
        .from("members")
        .select(
          "id,user_id,member_number,membership_status"
        )
        .in("id", memberIds);

      if (memberError) throw memberError;

      const members = memberRows || [];

      const userIds = [
        ...new Set(
          members
            .map(row => row.user_id)
            .filter(Boolean)
        )
      ];

      let profiles = [];

      if (userIds.length) {
        const {
          data,
          error: profileError
        } = await client
          .from("profiles")
          .select(
            "id,full_name,username,phone,city"
          )
          .in("id", userIds);

        if (profileError) throw profileError;

        profiles = data || [];
      }

      const profileMap = new Map(
        profiles.map(profile => [profile.id, profile])
      );

      const memberMap = new Map(
        members.map(member => [member.id, member])
      );

      state.members = assignmentRows
        .map(assignment => {
          const member = memberMap.get(assignment.member_id);

          if (!member) return null;

          const profile = profileMap.get(member.user_id) || {};

          return {
            member_id: member.id,
            user_id: member.user_id,
            member_number: member.member_number,
            membership_status: member.membership_status,
            full_name: profile.full_name,
            username: profile.username,
            phone: profile.phone,
            city: profile.city,
            assigned_at: assignment.assigned_at
          };
        })
        .filter(Boolean);

      applySearch();

      console.info(
        "[TARBIYAH] Anggota Binaan berhasil dimuat.",
        {
          role: state.role,
          total: state.members.length
        }
      );

    } catch (error) {
      console.error(
        "[TARBIYAH] Gagal memuat Anggota Binaan:",
        error
      );

      showMessage(
        error?.message ||
        "Data anggota binaan tidak dapat dimuat.",
        "error"
      );

      state.members = [];
      renderMembers([]);

    } finally {
      setLoading(false);
    }
  }

  function initialize() {
    $("refreshMentees")?.addEventListener(
      "click",
      loadMembers
    );

    $("menteeSearch")?.addEventListener(
      "input",
      applySearch
    );

    loadMembers();
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

})();
