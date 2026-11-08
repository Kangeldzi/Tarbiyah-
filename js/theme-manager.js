(() => {
  const KEY = "tarbiyah_theme_preference";
  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  function apply(mode) {
    const safeMode = ["light", "dark", "system"].includes(mode) ? mode : "system";
    const actual = safeMode === "system" ? (media?.matches ? "light" : "dark") : safeMode;
    document.documentElement.dataset.theme = actual;
    document.documentElement.dataset.themePreference = safeMode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = actual === "light" ? "#f7faf7" : "#102a22";
  }
  let preference = "system";
  try { const saved = localStorage.getItem(KEY); if (["light", "dark", "system"].includes(saved)) preference = saved; } catch (_) {}
  apply(preference);
  window.TARBIYAH_THEME = Object.freeze({
    get: () => preference,
    set(mode) { if (!["light", "dark", "system"].includes(mode)) return; preference = mode; try { localStorage.setItem(KEY, mode); } catch (_) {} apply(mode); },
    apply
  });
  const onChange = () => { if (preference === "system") apply("system"); };
  if (media?.addEventListener) media.addEventListener("change", onChange);
  else media?.addListener?.(onChange);
})();
