// Projects carousel: native scroll-snap track + prev/next + one named marker per slide,
// with a polite status announcement once scrolling settles.
export function initCarousel(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>(".carousel-track")!;
  const slides = [...track.children] as HTMLElement[];
  const nav = root.querySelector<HTMLElement>(".carousel-markers")!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const n = slides.length;

  const markers = slides.map((slide, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = slide.dataset.markerName ?? `Project ${i + 1}`;
    b.addEventListener("click", () => go(i));
    nav.append(b);
    return b;
  });

  const offset = (i: number) => {
    const s = slides[i];
    return s.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft
      - (track.clientWidth - s.offsetWidth) / 2;
  };
  const nearest = () => {
    let best = 0, dist = Infinity;
    slides.forEach((_, i) => {
      const d = Math.abs(offset(i) - track.scrollLeft);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  };
  let shown = -1;
  const mark = (i: number) => {
    if (i === shown) return;
    shown = i;
    markers.forEach((m, j) => (j === i ? m.setAttribute("aria-current", "true") : m.removeAttribute("aria-current")));
  };

  let pending: number | null = null;
  let settled = 0;
  function go(i: number) {
    pending = i;
    mark(i);
    track.scrollTo({ left: offset(i) }); // smoothness comes from CSS, only without reduced motion
  }

  root.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((b) =>
    b.addEventListener("click", () => {
      const step = b.dataset.direction === "next" ? 1 : -1;
      go(((pending ?? nearest()) + step + n) % n); // wraps from the last project back to the first
    }));

  let ticking = false;
  track.addEventListener("scroll", () => {
    if (pending !== null || ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; mark(nearest()); });
  }, { passive: true });

  const settle = () => {
    const i = nearest();
    pending = null;
    mark(i);
    if (i !== settled) {
      settled = i;
      status.textContent = `${i + 1} of ${n}: ${slides[i].dataset.markerName ?? ""}`;
    }
  };
  if ("onscrollend" in window) track.addEventListener("scrollend", settle);
  else {
    let timer = 0;
    track.addEventListener("scroll", () => { clearTimeout(timer); timer = window.setTimeout(settle, 120); }, { passive: true });
  }
  mark(0);
}
