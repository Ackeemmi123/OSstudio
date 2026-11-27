/**
 * Video: a muted loop in a frame of fixed shape, for films made in code
 * (scripts/render-video.mjs) or a client's own footage, with written
 * permission. The picture underneath is the design until the film draws its
 * first frame, which is the same picture, so nothing jumps.
 *
 * Without JavaScript the browser's own controls are shown, over the film's
 * `poster` (small, since Chrome paints a film with controls and no poster
 * grey). The engine hides that and shows the sized <picture> instead, and
 * takes over with one button of its own:
 * - with motion, the film loads as it comes near and plays only while it is on
 *   screen and the tab is visible; the button pauses it, and it stays paused;
 * - with reduced motion it never starts by itself: the button plays it;
 * - with Save-Data only the picture shows, and no film is fetched.
 * It picks the first source the device decodes efficiently (in hardware,
 * where the browser can tell), else the first it can play.
 *
 * Markup: <div data-sg="video" [data-sg-variant="grow"]>
 *           <div data-sg-frame><div data-sg-media>
 *             <picture>…<img … alt=""></picture>
 *             <video muted loop playsinline preload="none" controls poster="…-800.webp" aria-label="…">
 *               <source src="….webm" type='video/webm; codecs="av01…"' [media="…"]> <source src="….mp4" type='video/mp4; codecs="avc1…"'> …
 *             </video></div>
 *             <button type="button" data-sg-toggle hidden><span aria-hidden="true"></span><span data-sg-label>Pausa film</span></button>
 *           </div></div>
 * The button's words come from `data-play` and `data-pause`, so a site in
 * another language says them in its own.
 */
import type { Capabilities } from "../engine/capabilities";

/**
 * The first source this screen should use: decoded efficiently if the browser
 * can tell, else the first playable. Asked about full HD, the largest a film
 * here comes in, so a yes holds for the smaller ones too.
 */
async function choose(video: HTMLVideoElement): Promise<string | null> {
  const sources = [...video.querySelectorAll("source")].filter((source) => (!source.media || matchMedia(source.media).matches) && video.canPlayType(source.type));
  if (!navigator.mediaCapabilities) return sources[0]?.src ?? null;
  const answers = await Promise.all(
    sources.map((source) =>
      navigator.mediaCapabilities
        .decodingInfo({ type: "file", video: { contentType: source.type, width: 1920, height: 1080, bitrate: 1_000_000, framerate: 30 } })
        .then((info) => info.supported && info.powerEfficient)
        .catch(() => false),
    ),
  );
  return (sources[answers.indexOf(true)] ?? sources[0])?.src ?? null;
}

export function mountVideo(root: HTMLElement, capabilities: Capabilities): void {
  const video = root.querySelector("video");
  const toggle = root.querySelector<HTMLButtonElement>("[data-sg-toggle]");
  if (!video || !toggle || root.dataset.sgState) return;
  const label = toggle.querySelector("[data-sg-label]") ?? toggle;
  video.removeAttribute("controls");

  // Saving data: the picture is the film. Nothing is fetched.
  if (capabilities.saveData) {
    video.hidden = true;
    const poster = root.querySelector("img");
    if (poster) poster.alt = video.getAttribute("aria-label") ?? "";
    root.dataset.sgState = "poster";
    return;
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  /** Whether the film should run while it is seen: by itself with motion, only when asked for without. */
  let wanted = !reduced.matches;
  let asked = false;
  let seen = false;
  let source: Promise<string | null> | null = null;
  root.dataset.sgState = "ready";
  toggle.hidden = false;

  // No source to play, or a broken one: the picture stays, and the button goes.
  const fail = () => {
    wanted = false;
    toggle.hidden = true;
    root.dataset.sgState = "poster";
    video.hidden = true;
  };

  const load = () =>
    (source ??= choose(video).then((src) => {
      if (src) {
        video.src = src;
        video.preload = "auto";
      } else fail();
      return src;
    }));

  const render = () => {
    label.textContent = (wanted ? toggle.dataset.pause : toggle.dataset.play) ?? (wanted ? "Pausa film" : "Spela film");
    toggle.dataset.state = wanted ? "playing" : "paused";
  };

  const sync = () => {
    const run = wanted && seen && document.visibilityState === "visible";
    if (run && video.paused) {
      void load().then((src) => {
        if (!src || !wanted || !seen || document.visibilityState !== "visible") return;
        video.play().catch((error: DOMException) => {
          // A pause that came first is no failure; a refusal (power saving, a strict browser) is: show the play button.
          if (error.name === "AbortError") return;
          wanted = false;
          render();
        });
      });
    } else if (!run && !video.paused) video.pause();
  };

  toggle.addEventListener("click", () => {
    asked = true;
    wanted = !wanted;
    render();
    sync();
  });
  video.addEventListener("loadeddata", () => (root.dataset.sgState = "live"));
  video.addEventListener("error", fail);
  // Turned on or off while here: follow, unless the visitor has already chosen with the button.
  reduced.addEventListener("change", () => {
    if (reduced.matches) wanted = false;
    else if (!asked) wanted = true;
    render();
    sync();
  });

  const watcher = new IntersectionObserver(([entry]) => {
    seen = entry.isIntersecting;
    sync();
  });
  watcher.observe(root.querySelector("[data-sg-frame]") ?? root);
  document.addEventListener("visibilitychange", sync);

  // It has come near: with motion, start loading now so it is ready when seen.
  if (wanted) void load();
  render();
}
