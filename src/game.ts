// Pawn climb: the googly-eyed pawn bounces up chessboard platforms. ← → / A D to steer,
// space or tap to start. ♛ = +5. Every 1200px is a rank; rank 8 promotes (+50).
import { api, ApiError, type Score } from "./api";

const W = 360, H = 520, G = 0.38, JUMP = -11, RANK_PX = 1200;
interface Plat { x: number; y: number; w: number; vx: number }
interface Crown { x: number; y: number; taken: boolean }

export function initGame(dialog: HTMLDialogElement, openButton: HTMLElement): void {
  const canvas = dialog.querySelector<HTMLCanvasElement>("#game-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const scoreEl = dialog.querySelector<HTMLElement>("#g-score")!;
  const bestEl = dialog.querySelector<HTMLElement>("#g-best")!;
  const fame = dialog.querySelector<HTMLOListElement>("#fame-list")!;
  const form = dialog.querySelector<HTMLFormElement>("#score-form")!;
  const nameInput = dialog.querySelector<HTMLInputElement>("#score-name")!;
  const finalEl = dialog.querySelector<HTMLElement>("#score-final")!;
  const formStatus = dialog.querySelector<HTMLElement>("#score-status")!;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  let best = Number(read("pawn-best") ?? 0);
  bestEl.textContent = String(best);
  nameInput.value = read("pawn-name") ?? "";

  let state: "ready" | "playing" | "over" = "ready";
  let px = 0, py = 0, vx = 0, vy = 0, cam = 0, top = 0, crowns = 0, promoted = false, flash = 0;
  let plats: Plat[] = [], gems: Crown[] = [];
  let dir = 0, raf = 0, last = 0;

  const climbed = () => Math.max(0, Math.round(-top));
  const score = () => Math.floor(climbed() / 10) + crowns * 5 + (promoted ? 50 : 0);
  const rank = () => Math.min(8, 1 + Math.floor(climbed() / RANK_PX));

  function spawn(y: number) {
    const hard = Math.min(1, -y / 12000);
    const w = 70 - 20 * hard;
    const p: Plat = { x: Math.random() * (W - w), y, w, vx: Math.random() < hard * .6 ? (Math.random() < .5 ? -1 : 1) * (1 + hard) : 0 };
    plats.push(p);
    if (Math.random() < .17) gems.push({ x: p.x + w / 2, y: y - 26, taken: false });
  }

  function reset() {
    px = W / 2; py = H - 60; vx = 0; vy = JUMP; cam = 0; top = 0; crowns = 0; promoted = false; flash = 0;
    plats = [{ x: W / 2 - 50, y: H - 30, w: 100, vx: 0 }]; gems = [];
    for (let y = H - 110; y > -H; y -= 70) spawn(y);
    form.hidden = true; formStatus.textContent = "";
  }

  function step(k: number) {
    vx += ((dir * 4.6) - vx) * Math.min(1, .25 * k);
    px += vx * k; vy += G * k; py += vy * k;
    if (px < -12) px = W + 12; else if (px > W + 12) px = -12;

    for (const p of plats) {
      if (p.vx) { p.x += p.vx * k; if (p.x < 0 || p.x + p.w > W) p.vx *= -1; }
      // land only while falling, feet crossing the platform top this frame
      if (vy > 0 && px > p.x - 8 && px < p.x + p.w + 8 && py >= p.y - 2 && py - vy * k <= p.y + 4) { py = p.y; vy = JUMP; }
    }
    for (const g of gems) if (!g.taken && Math.abs(g.x - px) < 18 && Math.abs(g.y - (py - 22)) < 24) { g.taken = true; crowns++; flash = 1; }

    top = Math.min(top, py - (H - 60));
    if (py - cam < H * .42) cam = py - H * .42;
    if (!promoted && rank() >= 8) { promoted = true; flash = 2; }
    let highest = Math.min(...plats.map((p) => p.y));
    while (highest > cam - 80) { highest -= 58 + Math.random() * (32 + Math.min(40, climbed() / 300)); spawn(highest); }
    plats = plats.filter((p) => p.y < cam + H + 40);
    gems = gems.filter((g) => g.y < cam + H + 40 && !g.taken);
    if (py - cam > H + 40) gameOver();
    flash = Math.max(0, flash - .02 * k);
  }

  function drawPawn(x: number, y: number) {
    ctx.save(); ctx.translate(x, y); ctx.scale(.42, .42);
    ctx.fillStyle = "#f5f3ff"; ctx.strokeStyle = "#1e1b4b"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-42, -16, -27, -20); ctx.lineTo(27, -20); ctx.quadraticCurveTo(42, -16, 40, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-22, -20); ctx.quadraticCurveTo(-12, -40, -12, -58); ctx.lineTo(12, -58); ctx.quadraticCurveTo(12, -40, 22, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -60, 24, 6.5, 0, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -88, 27, 0, 6.28); ctx.fill(); ctx.stroke();
    const look = Math.max(-4, Math.min(4, vx)), up = vy < 0 ? -3 : 2;
    for (const ex of [-10, 11]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, -92, 9.5, 0, 6.28); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex + look, -92 + up, 4.6, 0, 6.28); ctx.fill();
    }
    ctx.fillStyle = "rgba(249,168,212,.85)";
    for (const cx of [-17, 18]) { ctx.beginPath(); ctx.ellipse(cx, -77, 5.5, 3, 0, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b0f2e"); g.addColorStop(1, "#2a1f63");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // faint board squares that scroll slower than the play field (parallax)
    const s = 45, off = ((-cam * .3) % (s * 2) + s * 2) % (s * 2);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    for (let y = -s * 2 + off; y < H; y += s) for (let x = 0; x < W; x += s)
      if ((Math.floor((y - off) / s) + x / s) % 2 === 0) ctx.fillRect(x, y, s, s);

    for (const p of plats) {
      const y = p.y - cam, sq = 10;
      for (let i = 0; i * sq < p.w; i++) {
        ctx.fillStyle = i % 2 ? "#7468d6" : "#f3ead2";
        ctx.fillRect(p.x + i * sq, y, Math.min(sq, p.w - i * sq), 10);
      }
      ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 1; ctx.strokeRect(p.x + .5, y + .5, p.w - 1, 9);
    }
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const c of gems) { ctx.fillStyle = "#fcd34d"; ctx.fillText("♛", c.x, c.y - cam); }
    drawPawn(px, py - cam);

    ctx.fillStyle = "#c7d2fe"; ctx.font = "600 13px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
    ctx.fillText(`rank ${rank()}${promoted ? " ♛" : ""}`, 12, 18);
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash); ctx.textAlign = "center"; ctx.fillStyle = "#fcd34d";
      ctx.font = "800 26px 'Bricolage Grotesque', sans-serif";
      ctx.fillText(promoted && flash > 1 ? "PROMOTION! ♛ +50" : "+5", W / 2, H * .3);
      ctx.globalAlpha = 1;
    }
    if (state !== "playing") {
      ctx.fillStyle = "rgba(5,6,20,.55)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff7ed"; ctx.font = "800 28px 'Bricolage Grotesque', sans-serif";
      ctx.fillText(state === "ready" ? "help the pawn climb!" : "checkmate…", W / 2, H / 2 - 30);
      ctx.font = "600 13px 'JetBrains Mono', monospace"; ctx.fillStyle = "#fcd34d";
      ctx.fillText(state === "ready" ? "grab ♛ for +5 · reach rank 8" : `score ${score()} · rank ${rank()}`, W / 2, H / 2 + 4);
      ctx.fillStyle = "#c7d2fe";
      ctx.fillText("press space or tap to " + (state === "ready" ? "start" : "retry"), W / 2, H / 2 + 30);
    }
    scoreEl.textContent = String(score());
  }

  function loop(ms: number) {
    const k = last ? Math.min(3, (ms - last) / 16.67) : 1;
    last = ms;
    if (state === "playing") step(k);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function start() { reset(); state = "playing"; canvas.focus(); }

  function gameOver() {
    state = "over";
    const s = score();
    if (s > best) { best = s; write("pawn-best", String(s)); bestEl.textContent = String(s); }
    if (s > 0) { finalEl.textContent = String(s); form.hidden = false; }
  }

  function renderFame(list: Score[]) {
    fame.replaceChildren(...(list.length ? list : [{ name: "be the first!", score: 0 }]).map((r) => {
      const li = document.createElement("li");
      li.textContent = r.name;
      if (list.length) { const sc = document.createElement("span"); sc.textContent = String(r.score); li.append(sc); }
      return li;
    }));
  }
  async function loadFame() {
    try { renderFame(await api.scores()); }
    catch { fame.replaceChildren(Object.assign(document.createElement("li"), { textContent: "board offline", className: "muted" })); }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    write("pawn-name", name);
    formStatus.textContent = "saving…";
    try {
      renderFame(await api.addScore(name, score()));
      formStatus.textContent = "on the board ✦";
      form.hidden = true;
    } catch (err) {
      formStatus.textContent = err instanceof ApiError && err.status === 429
        ? "too many saves, try again in a bit" : "couldn't reach the board; your best is saved here";
    }
  });

  // input
  const keys = new Map([["ArrowLeft", -1], ["a", -1], ["A", -1], ["ArrowRight", 1], ["d", 1], ["D", 1]]);
  dialog.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return; // typing a name
    if (keys.has(e.key)) { dir = keys.get(e.key)!; e.preventDefault(); }
    else if (e.key === " " && state !== "playing") { start(); e.preventDefault(); }
  });
  dialog.addEventListener("keyup", (e) => { if (keys.get(e.key) === dir) dir = 0; });
  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing") { start(); return; }
    const r = canvas.getBoundingClientRect();
    dir = e.clientX < r.left + r.width / 2 ? -1 : 1;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => { dir = 0; });
  canvas.addEventListener("pointercancel", () => { dir = 0; });
  canvas.tabIndex = 0;

  openButton.addEventListener("click", () => {
    dialog.showModal();
    if (state === "playing") state = "ready";
    reset(); last = 0; raf = requestAnimationFrame(loop);
    void loadFame();
  });
  dialog.addEventListener("close", () => { cancelAnimationFrame(raf); dir = 0; if (state === "playing") state = "ready"; });
}
