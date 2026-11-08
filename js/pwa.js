(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }); }
    catch (error) { console.warn("[TARBIYAH] Service worker belum dapat didaftarkan.", error); }
  });
})();
