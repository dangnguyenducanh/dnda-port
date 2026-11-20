import "./styles.css";
import { api, ApiError } from "./api";
import { initCarousel } from "./carousel";
import { initChat } from "./chat";
import { initGame } from "./game";
import { initSky } from "./sky";
import { initTheme } from "./theme";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

// --- progressive-enhancement fallbacks -------------------------------------------------------
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  const polyfill = "https://unpkg.com/@oddbird/popover-polyfill@0.7.3/dist/popover.min.js";
  void import(/* @vite-ignore */ polyfill);
}
if (!("closedBy" in HTMLDialogElement.prototype)) {
  // light dismiss for <dialog closedby="any"> where the attribute isn't supported (Safari)
  const outside = (e: PointerEvent, d: HTMLDialogElement) => {
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const d of document.querySelectorAll<HTMLDialogElement>('dialog[closedby="any"]')) {
    let pressedOutside = false;
    d.addEventListener("pointerdown", (e) => { pressedOutside = outside(e, d); });
    d.addEventListener("pointerup", (e) => { if (pressedOutside && outside(e, d)) d.close(); });
  }
}

// --- features ------------------------------------------------------------------------------
initTheme($<HTMLButtonElement>("#theme-btn"));
initSky($<HTMLCanvasElement>("#sky"), reduced);
initCarousel($(".carousel"));
initChat($("#chat"));
initGame($<HTMLDialogElement>("#game"), $("#play-btn"));

// typed name
{
  const el = $(".typed"), text = el.dataset.text ?? "";
  if (reduced.matches) el.textContent = text;
  else {
    let i = 0;
    const tick = () => { el.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(tick, 75); };
    setTimeout(tick, 450);
  }
}

// the hero pawn's pupils follow the pointer
{
  const pawn = $(".hero-pawn"), pupils = pawn.querySelector<SVGGElement>(".pupils")!;
  let pending = false, x = 0, y = 0;
  addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const r = pawn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * .25;
      const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1, m = Math.min(4, len / 40);
      pupils.style.transform = `translate(${(dx / len) * m}px, ${(dy / len) * m}px)`;
    });
  }, { passive: true });
}

// scroll reveal fallback where CSS view() timelines aren't supported
if (!CSS.supports("(animation-timeline: view()) and (animation-range: entry)") && !reduced.matches) {
  document.documentElement.classList.add("io-reveal");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -10% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

// timeline: gold line fills and the pawn walks down it as you scroll
{
  const tl = $("#timeline");
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = tl.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * .55 - r.top) / r.height));
    tl.style.setProperty("--p", p.toFixed(4));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// copy email: Invoker Command --copy, click fallback where CommandEvent is missing
{
  const timers = new WeakMap<HTMLElement, number>();
  const report = (button: HTMLElement, ok: boolean) => {
    const tip = button.nextElementSibling as HTMLElement;
    clearTimeout(timers.get(button));
    button.removeAttribute("data-copied"); button.removeAttribute("data-failed");
    tip.textContent = "";
    void button.offsetWidth;
    button.setAttribute(ok ? "data-copied" : "data-failed", "");
    requestAnimationFrame(() => (tip.textContent = ok ? "Copied" : "Copy failed"));
    timers.set(button, window.setTimeout(() => {
      button.removeAttribute("data-copied"); button.removeAttribute("data-failed"); tip.textContent = "";
    }, 2000));
  };
  const copy = async (button: HTMLElement, target: HTMLElement) => {
    try { await navigator.clipboard.writeText(target.innerText.trim()); report(button, true); }
    catch { report(button, false); }
  };
  type CommandLike = Event & { command: string; source: HTMLElement };
  document.addEventListener("command", (e) => {
    const ev = e as CommandLike;
    if (ev.command === "--copy") void copy(ev.source, ev.target as HTMLElement);
  }, true);
  if (!("CommandEvent" in window)) {
    document.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLElement>('button[command="--copy"]');
      const target = button && document.getElementById(button.getAttribute("commandfor") ?? "");
      if (button && target) void copy(button, target);
    });
  }
}

// text me: modal form, stored by the API in Postgres
{
  const dialog = $<HTMLDialogElement>("#text-me"), form = $<HTMLFormElement>("#text-me-form"), status = $("#tm-status");
  $("#text-me-btn").addEventListener("click", () => { status.textContent = ""; dialog.showModal(); });
  $("#text-me-close").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const field = (k: string) => String(data.get(k) ?? "").trim();
    status.textContent = "sending…";
    try {
      await api.message({ name: field("name"), contact: field("contact"), body: field("body"), website: field("website") });
      status.textContent = "sent! I'll get back to you ✦";
      form.reset();
    } catch (err) {
      status.textContent = err instanceof ApiError && err.status === 429
        ? "that's a lot of messages, try again in a few minutes"
        : "couldn't send it. Email ducanhdn.ptit@gmail.com instead?";
    }
  });
}
