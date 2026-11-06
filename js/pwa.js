(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
      console.info("[TARBIYAH] Service worker terdaftar.");
    } catch (error) {
      console.error("[TARBIYAH] Pendaftaran service worker gagal:", error);
    }
  });
})();
