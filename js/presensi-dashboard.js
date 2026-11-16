
/* =========================================================
   TARBIYAH — PRESENSI DASHBOARD
   Version : 1.0.0
   Purpose : Statistik presensi dan jadwal kegiatan
   Database:
   - members
   - kajian_agenda
   - kajian_attendance
   ========================================================= */

(function () {
  "use strict";

  const Dashboard = {
    isLoading: false,
    lastUpdated: null,

    // -----------------------------------------------------
    // 1. SUPABASE CLIENT
    // -----------------------------------------------------

    getClient() {
      if (
        window.TARBIYAH_BACKEND_READY !== true ||
        !window.tarbiyahSupabase
      ) {
        throw new Error(
          "Koneksi Supabase TARBIYAH belum siap."
        );
      }

      return window.tarbiyahSupabase;
    },

    // -----------------------------------------------------
    // 2. HELPER
    // -----------------------------------------------------

    getElement(selector) {
      return document.querySelector(selector);
    },

    setText(selector, value) {
      const element = this.getElement(selector);

      if (element) {
        element.textContent = value;
      }
    },

    formatNumber(value) {
      return Number(value || 0).toLocaleString("id-ID");
    },

    formatDate(value) {
      if (!value) return "Tanggal belum tersedia";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "Tanggal tidak valid";
      }

      return new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    },

    chunkArray(array, size) {
      const result = [];

      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
      }

      return result;
    },

    // Mengambil seluruh ID dengan pagination.
    // Tidak bergantung pada batas 500 catatan.

    async getAllIds(table, column, filters = []) {
      const client = this.getClient();
      const pageSize = 1000;
      let offset = 0;
      let results = [];

      while (true) {
        let query = client
          .from(table)
          .select(column)
          .order(column, { ascending: true })
          .range(offset, offset + pageSize - 1);

        filters.forEach((filter) => {
          query = query[filter.method](
            filter.column,
            filter.value
          );
        });

        const { data, error } = await query;

        if (error) throw error;

        const rows = data || [];

        results = results.concat(
          rows.map((item) => item[column])
        );

        if (rows.length < pageSize) break;

        offset += pageSize;
      }

      return results;
    },

    // -----------------------------------------------------
    // 3. TOTAL SELURUH PRESENSI
    // -----------------------------------------------------

    async getTotalAttendance() {
      const client = this.getClient();

      const { count, error } = await client
        .from("kajian_attendance")
        .select("id", {
          count: "exact",
          head: true
        });

      if (error) throw error;

      return count || 0;
    },

    // -----------------------------------------------------
    // 4. PRESENSI BULAN BERJALAN
    // -----------------------------------------------------

    async getMonthlyAttendance() {
      const client = this.getClient();

      const now = new Date();

      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

      const startOfNextMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1
      );

      const { count, error } = await client
        .from("kajian_attendance")
        .select("id", {
          count: "exact",
          head: true
        })
        .gte(
          "attended_at",
          startOfMonth.toISOString()
        )
        .lt(
          "attended_at",
          startOfNextMonth.toISOString()
        );

      if (error) throw error;

      return count || 0;
    },

    // -----------------------------------------------------
    // 5. ANGGOTA AKTIF
    // -----------------------------------------------------

    async getActiveMemberIds() {
      return await this.getAllIds(
        "members",
        "id",
        [
          {
            method: "eq",
            column: "membership_status",
            value: "active"
          }
        ]
      );
    },

    // -----------------------------------------------------
    // 6. AGENDA SELESAI
    // -----------------------------------------------------

    async getCompletedAgendaIds() {
      return await this.getAllIds(
        "kajian_agenda",
        "id",
        [
          {
            method: "eq",
            column: "status",
            value: "completed"
          }
        ]
      );
    },

    // -----------------------------------------------------
    // 7. HITUNG KEHADIRAN PADA AGENDA SELESAI
    // -----------------------------------------------------

    async getCompletedAttendanceCount(
      agendaIds,
      memberIds
    ) {
      if (!agendaIds.length || !memberIds.length) {
        return 0;
      }

      const client = this.getClient();

      const agendaChunks = this.chunkArray(
        agendaIds,
        200
      );

      const memberChunks = this.chunkArray(
        memberIds,
        200
      );

      let total = 0;

      for (const agendaGroup of agendaChunks) {
        for (const memberGroup of memberChunks) {
          const { count, error } = await client
            .from("kajian_attendance")
            .select("id", {
              count: "exact",
              head: true
            })
            .in("agenda_id", agendaGroup)
            .in("member_id", memberGroup);

          if (error) throw error;

          total += count || 0;
        }
      }

      return total;
    },

    // -----------------------------------------------------
    // 8. PERSENTASE KEHADIRAN
    // -----------------------------------------------------

    async getAttendanceRate() {
      const [
        activeMemberIds,
        completedAgendaIds
      ] = await Promise.all([
        this.getActiveMemberIds(),
        this.getCompletedAgendaIds()
      ]);

      const activeCount = activeMemberIds.length;
      const agendaCount = completedAgendaIds.length;

      if (!activeCount || !agendaCount) {
        return null;
      }

      const actualAttendance =
        await this.getCompletedAttendanceCount(
          completedAgendaIds,
          activeMemberIds
        );

      const possibleAttendance =
        activeCount * agendaCount;

      if (!possibleAttendance) {
        return null;
      }

      return Math.min(
        100,
        (actualAttendance / possibleAttendance) * 100
      );
    },

    // -----------------------------------------------------
    // 9. JADWAL KEGIATAN MENDATANG
    // -----------------------------------------------------

    async getUpcomingAgendas() {
      const client = this.getClient();

      const now = new Date().toISOString();

      const { data, error } = await client
        .from("kajian_agenda")
        .select(`
          id,
          title,
          speaker_name,
          starts_at,
          ends_at,
          location_name,
          location_address,
          status
        `)
        .eq("status", "published")
        .gte("starts_at", now)
        .order("starts_at", {
          ascending: true
        })
        .limit(5);

      if (error) throw error;

      return data || [];
    },

    // -----------------------------------------------------
    // 10. RENDER JADWAL KEGIATAN
    // -----------------------------------------------------

    renderAgendas(agendas) {
      const container = this.getElement(
        "[data-attendance-events]"
      );

      if (!container) return;

      container.replaceChildren();

      if (!agendas.length) {
        const empty = document.createElement("div");

        empty.className = "attendance-empty";
        empty.textContent =
          "Belum ada jadwal kegiatan mendatang.";

        container.appendChild(empty);
        return;
      }

      agendas.forEach((agenda) => {
        const card = document.createElement("article");

        card.className = "attendance-event-item";

        const title = document.createElement("h4");
        title.textContent =
          agenda.title || "Kegiatan Tarbiyah";

        const date = document.createElement("p");
        date.textContent = this.formatDate(
          agenda.starts_at
        );

        const speaker = document.createElement("p");
        speaker.textContent = agenda.speaker_name
          ? "Pemateri: " + agenda.speaker_name
          : "Pemateri belum ditentukan";

        const location = document.createElement("p");
        location.textContent =
          agenda.location_name ||
          agenda.location_address ||
          "Lokasi belum ditentukan";

        card.append(
          title,
          date,
          speaker,
          location
        );

        container.appendChild(card);
      });
    },

    // -----------------------------------------------------
    // 11. REFRESH DASHBOARD
    // -----------------------------------------------------

    async refresh() {
      if (this.isLoading) return;

      this.isLoading = true;

      try {
        const [
          total,
          monthly,
          rate,
          agendas
        ] = await Promise.all([
          this.getTotalAttendance(),
          this.getMonthlyAttendance(),
          this.getAttendanceRate(),
          this.getUpcomingAgendas()
        ]);

        this.setText(
          "[data-attendance-total]",
          this.formatNumber(total)
        );

        this.setText(
          "[data-attendance-month]",
          this.formatNumber(monthly)
        );

        this.setText(
          "[data-attendance-rate]",
          rate === null
            ? "—"
            : rate.toFixed(1).replace(".", ",") + "%"
        );

        this.renderAgendas(agendas);

        this.lastUpdated = new Date();

        console.info(
          "[TARBIYAH PRESENSI] Dashboard berhasil diperbarui.",
          {
            total,
            monthly,
            rate,
            upcomingAgendas: agendas.length
          }
        );

        return {
          success: true,
          total,
          monthly,
          rate,
          agendas
        };

      } catch (error) {
        console.error(
          "[TARBIYAH PRESENSI] Dashboard error:",
          error
        );

        this.setText(
          "[data-attendance-events]",
          "Data dashboard belum dapat dimuat. Periksa koneksi dan izin database."
        );

        return {
          success: false,
          error
        };

      } finally {
        this.isLoading = false;
      }
    },

    // -----------------------------------------------------
    // 12. INITIALIZE
    // -----------------------------------------------------

    initialize() {
      this.refresh();

      // Perbarui saat halaman kembali dibuka.
      document.addEventListener(
        "visibilitychange",
        () => {
          if (!document.hidden) {
            this.refresh();
          }
        }
      );

      // Bisa dipanggil oleh modul lain setelah
      // presensi berhasil dicatat.
      window.addEventListener(
        "tarbiyah:attendance-updated",
        () => this.refresh()
      );

      console.info(
        "[TARBIYAH PRESENSI] Dashboard initialized."
      );
    }
  };

  window.TARBIYAH_PRESENSI_DASHBOARD = Dashboard;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => Dashboard.initialize(),
      { once: true }
    );
  } else {
    Dashboard.initialize();
  }

})();
