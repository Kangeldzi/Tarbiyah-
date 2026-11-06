(() => {
  const KEY = "tarbiyah_theme_preference";
  function apply(mode) {
    const actual = mode === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : mode;
    document.documentElement.dataset.theme = actual;
    document.documentElement.dataset.themePreference = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = actual === "light" ? "#f7faf7" : "#102a22";
  }
  let preference = "system";
  try { preference = localStorage.getItem(KEY) || "system"; } catch (_) {}
  apply(preference);
  window.TARBIYAH_THEME = {
    get: () => preference,
    set(mode) {
      if (!["light", "dark", "system"].includes(mode)) return;
      preference = mode;
      try { localStorage.setItem(KEY, mode); } catch (_) {}
      apply(mode);
    },
    apply
  };
  window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if (preference === "system") apply("system");
  });
})();
