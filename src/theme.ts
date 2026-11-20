// Night/day toggle. The <meta name="color-scheme"> is the source of truth (an inline script in
// index.html applies the stored override before first paint); CSS maps it to color-scheme.
const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!;
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const KEY = "color-scheme";

export const isDark = (): boolean =>
  meta.content === "dark" || (meta.content === "light dark" && systemDark.matches);

const changed = () => window.dispatchEvent(new Event("themechange"));

export function initTheme(button: HTMLButtonElement): void {
  button.addEventListener("click", () => {
    // flip what the user sees; storing the system's own value would pin it, so clear instead
    const target = isDark() ? "light" : "dark";
    const system = systemDark.matches ? "dark" : "light";
    const followSystem = target === system;
    try {
      if (followSystem) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, target);
    } catch { /* storage blocked: still switch for this visit */ }
    meta.content = followSystem ? "light dark" : target;
    changed();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { meta.content = e.newValue ?? "light dark"; changed(); }
  });
  systemDark.addEventListener("change", changed);
}
