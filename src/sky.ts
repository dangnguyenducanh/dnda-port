// Full-page sky behind everything: twinkling stars and shooting stars at night,
// drifting pollen by day, fireflies in both. One static frame under reduced motion.
import { isDark } from "./theme";

interface Star { x: number; y: number; r: number; phase: number; speed: number }
interface Fly { x: number; y: number; ax: number; ay: number; phase: number; r: number }

export function initSky(canvas: HTMLCanvasElement, reduced: MediaQueryList): void {
  const ctx = canvas.getContext("2d")!;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const stars: Star[] = Array.from({ length: 150 }, () => ({
    x: Math.random(), y: Math.random() ** 1.4, r: rand(.4, 1.5), phase: rand(0, 6.28), speed: rand(.6, 1.8),
  }));
  const flies: Fly[] = Array.from({ length: 24 }, () => ({
    x: Math.random(), y: rand(.15, 1), ax: rand(.01, .04), ay: rand(.01, .03), phase: rand(0, 6.28), r: rand(1.6, 3),
  }));
  let w = 0, h = 0, shoot = { t: -1, x: 0, y: 0 };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(ms: number) {
    const t = ms / 1000, dark = isDark();
    ctx.clearRect(0, 0, w, h);
    if (dark) {
      for (const s of stars) {
        ctx.globalAlpha = .35 + .65 * (.5 + .5 * Math.sin(t * s.speed + s.phase));
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 6.28); ctx.fill();
      }
      if (shoot.t < 0 && Math.random() < .004) shoot = { t: 0, x: rand(.1, .7) * w, y: rand(.05, .3) * h };
      if (shoot.t >= 0) {
        shoot.t += 1 / 60;
        const p = shoot.t / .9, x = shoot.x + p * 260, y = shoot.y + p * 110;
        const g = ctx.createLinearGradient(x - 120, y - 50, x, y);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,.9)");
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = g; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 120, y - 50); ctx.lineTo(x, y); ctx.stroke();
        if (p >= 1) shoot.t = -1;
      }
    }
    for (const f of flies) {
      const x = (f.x + Math.sin(t * .3 + f.phase) * f.ax) * w;
      const y = (f.y + Math.cos(t * .23 + f.phase) * f.ay) * h;
      const glow = .4 + .6 * (.5 + .5 * Math.sin(t * 1.7 + f.phase));
      const g = ctx.createRadialGradient(x, y, 0, x, y, f.r * 5);
      g.addColorStop(0, dark ? "rgba(253,230,138,.95)" : "rgba(255,255,255,.95)");
      g.addColorStop(1, dark ? "rgba(253,230,138,0)" : "rgba(255,255,255,0)");
      ctx.globalAlpha = glow; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, f.r * 5, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduced.matches) requestAnimationFrame(frame);
  }

  const redraw = () => { resize(); if (reduced.matches) frame(0); };
  addEventListener("resize", redraw);
  addEventListener("themechange", () => { if (reduced.matches) frame(0); });
  reduced.addEventListener("change", () => { if (!reduced.matches) requestAnimationFrame(frame); else frame(0); });
  resize();
  if (reduced.matches) frame(0); else requestAnimationFrame(frame);
}
