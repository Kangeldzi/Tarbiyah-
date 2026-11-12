
/* =========================================================
   TARBIYAH — AUTH GUARD
   File   : js/auth-guard.js
   Fungsi :
   1. Memeriksa sesi autentikasi Supabase.
   2. Melindungi halaman internal.
   3. Menyediakan status sesi untuk modul lain.
   4. Menangani perubahan status autentikasi.
   5. Mendukung class auth-check-pending dan auth-pending.
   ========================================================= */

(() => {
  "use strict";

  if (window.__TARBIYAH_AUTH_GUARD_INITIALIZED__) return;
  window.__TARBIYAH_AUTH_GUARD_INITIALIZED__ = true;

  const CONFIG = window.TARBIYAH_CONFIG || {};

  const LOGIN_PAGE =
    CONFIG.LOGIN_PAGE || "./login-register.html";

  const SESSION_EVENT = "tarbiyah:session-ready";

  let authSubscription = null;
  let initializationPromise = null;
  let redirecting = false;
  let sessionEventDispatched = false;

  // ---------------------------------------------------------
  // STATUS SESI GLOBAL
  // ---------------------------------------------------------

  window.TARBIYAH_SESSION = {
    ready: false,
    user: null,
    session: null
  };

  // ---------------------------------------------------------
  // CLASS STATUS PEMERIKSAAN AUTENTIKASI
  // ---------------------------------------------------------

  function setPendingState(isPending) {
    const html = document.documentElement;
    const body = document.body;

    if (isPending) {
      html?.classList.add("auth-check-pending");
      body?.classList.add("auth-check-pending", "auth-pending");
      return;
    }

    html?.classList.remove("auth-check-pending");

    body?.classList.remove(
      "auth-check-pending",
      "auth-pending"
    );
  }

  setPendingState(true);

  // ---------------------------------------------------------
  // NORMALISASI HASIL GET SESSION
  // ---------------------------------------------------------

  function normalizeSessionResult(result) {
    if (!result) return null;

    // Bentuk hasil Supabase standar:
    // { data: { session: ... }, error: ... }
    if (
      Object.prototype.hasOwnProperty.call(result, "data")
    ) {
      if (result.error) {
        throw result.error;
      }

      return result.data?.session || null;
    }

    // Bentuk apabila auth.js mengembalikan session langsung.
    return result.session || result;
  }

  // ---------------------------------------------------------
  // UPDATE STATUS SESI GLOBAL
  // ---------------------------------------------------------

  function updateSession(session, eventName = "INITIAL_SESSION") {
    const validSession =
      session && session.user ? session : null;

    window.TARBIYAH_SESSION = {
      ready: true,
      user: validSession?.user || null,
      session: validSession
    };

    window.TARBIYAH_AUTH_READY = true;

    setPendingState(false);

    if (!sessionEventDispatched) {
      sessionEventDispatched = true;

      document.dispatchEvent(
        new CustomEvent(SESSION_EVENT, {
          detail: {
            ready: true,
            authenticated: Boolean(validSession),
            user: validSession?.user || null,
            session: validSession,
            event: eventName
          }
        })
      );
    } else {
      document.dispatchEvent(
        new CustomEvent("tarbiyah:auth-state-changed", {
          detail: {
            authenticated: Boolean(validSession),
            user: validSession?.user || null,
            session: validSession,
            event: eventName
          }
        })
      );
    }

    return validSession;
  }

  // ---------------------------------------------------------
  // REDIRECT KE HALAMAN LOGIN
  // ---------------------------------------------------------

  function redirectToLogin() {
    if (redirecting) return;

    const currentPage =
      window.location.pathname.split("/").pop();

    const loginPageName =
      LOGIN_PAGE.split("?")[0].split("/").pop();

    if (currentPage === loginPageName) {
      setPendingState(false);
      return;
    }

    redirecting = true;

    setPendingState(false);

    window.location.replace(LOGIN_PAGE);
  }

  // ---------------------------------------------------------
  // TANGANI SESI KOSONG
  // ---------------------------------------------------------

  function handleUnauthenticated(eventName = "SIGNED_OUT") {
    window.TARBIYAH_SESSION = {
      ready: true,
      user: null,
      session: null
    };

    window.TARBIYAH_AUTH_READY = true;

    setPendingState(false);

    if (!sessionEventDispatched) {
      sessionEventDispatched = true;

      document.dispatchEvent(
        new CustomEvent(SESSION_EVENT, {
          detail: {
            ready: true,
            authenticated: false,
            user: null,
            session: null,
            event: eventName
          }
        })
      );
    }

    redirectToLogin();
  }

  // ---------------------------------------------------------
  // PERIKSA KETERSEDIAAN MODUL AUTENTIKASI
  // ---------------------------------------------------------

  function getAuthModule() {
    if (
      !window.TARBIYAH_AUTH ||
      typeof window.TARBIYAH_AUTH.getSession !== "function"
    ) {
      throw new Error(
        "TARBIYAH_AUTH.getSession() tidak tersedia. " +
        "Periksa urutan pemuatan auth.js."
      );
    }

    return window.TARBIYAH_AUTH;
  }

  // ---------------------------------------------------------
  // DENGARKAN PERUBAHAN STATUS AUTH SUPABASE
  // ---------------------------------------------------------

  function subscribeToAuthChanges(auth) {
    if (
      authSubscription ||
      typeof auth.onAuthStateChange !== "function"
    ) {
      return;
    }

    authSubscription = auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          handleUnauthenticated(event);
          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED" ||
          event === "INITIAL_SESSION"
        ) {
          const validSession = updateSession(
            session,
            event
          );

          if (!validSession) {
            handleUnauthenticated(event);
          }
        }
      }
    );
  }

  // ---------------------------------------------------------
  // INISIALISASI AUTH GUARD
  // ---------------------------------------------------------

  async function initializeAuthGuard() {
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      try {
        const auth = getAuthModule();

        // Pasang listener sebelum membaca sesi agar perubahan
        // autentikasi tidak terlewat.
        subscribeToAuthChanges(auth);

        const result = await auth.getSession();

        const session = normalizeSessionResult(result);

        if (!session?.user) {
          handleUnauthenticated("NO_SESSION");
          return false;
        }

        updateSession(session, "INITIAL_SESSION");

        console.info(
          "[TARBIYAH] Auth Guard berhasil. Pengguna terautentikasi:",
          session.user.email || session.user.id
        );

        return true;

      } catch (error) {
        console.error(
          "[TARBIYAH] Auth Guard gagal memeriksa sesi:",
          error
        );

        handleUnauthenticated("AUTH_CHECK_FAILED");

        return false;
      }
    })();

    return initializationPromise;
  }

  // ---------------------------------------------------------
  // MULAI SETELAH DOM SIAP
  // ---------------------------------------------------------

  function start() {
    setPendingState(true);
    initializeAuthGuard();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

  // ---------------------------------------------------------
  // API GLOBAL UNTUK MODUL LAIN
  // ---------------------------------------------------------

  window.TARBIYAH_AUTH_GUARD = {
    initialize: initializeAuthGuard,

    getSession() {
      return window.TARBIYAH_SESSION;
    },

    isAuthenticated() {
      return Boolean(
        window.TARBIYAH_SESSION?.ready &&
        window.TARBIYAH_SESSION?.user
      );
    }
  };

})();
