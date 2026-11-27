/**
 * Menu: a full-screen navigation. Without JavaScript it is the plain list of
 * links it is written as, in the bar. With JavaScript a button opens it as a
 * dialog over the page: focus moves to the first link and stays inside (the
 * button and the links), Esc or the button closes it and focus returns to the
 * button, and everything behind it is inert, so neither a mouse, a keyboard
 * nor a screen reader reaches the page beneath. The links arrive one after the
 * other in CSS (engine.css); with reduced motion it simply opens and closes.
 *
 * It is not marked `aria-modal`: the button that closes it stays outside the
 * dialog, in the bar, and must stay reachable. The page is made inert instead,
 * which is the stronger guarantee.
 *
 * The button steps out of the way while the visitor reads downwards and
 * comes back at the first move up. It always stays near the top of the page,
 * while it has focus, while the menu is open, and with reduced motion.
 *
 * On wide screens the open menu can show a picture of each page beside the
 * list (`data-sg-menu-pictures`, one child per link, in the same order): the
 * hovered or focused link's slides up over the last. Its pictures are fetched
 * only when the menu first opens on a wide screen.
 *
 * Markup: <nav data-sg="menu" aria-label="Meny" data-lenis-prevent>
 *           <button type="button" data-sg-menu-toggle aria-expanded="false" aria-controls="meny">
 *             <span data-sg-menu-word>Meny</span><span data-sg-menu-word aria-hidden="true">Stäng</span>
 *           </button>
 *           <div id="meny" data-sg-menu-panel>
 *             <ol> <li><a href="…"><span>…</span></a></li> … </ol>
 *             <div data-sg-menu-pictures aria-hidden="true"> <img src="…" loading="lazy" alt="" /> <svg>…</svg> … </div>
 *           </div>
 *         </nav>
 */

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function mountMenu(root: HTMLElement, openNow = false): void {
  const toggle = root.querySelector<HTMLButtonElement>("[data-sg-menu-toggle]");
  const panel = root.querySelector<HTMLElement>("[data-sg-menu-panel]");
  if (!toggle || !panel || root.classList.contains("is-ready")) return;
  const html = document.documentElement;
  const words = [...toggle.querySelectorAll<HTMLElement>("[data-sg-menu-word]")];
  // A dialog only once it can open as one: without a script it is a list in the page.
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", words[0]?.textContent?.trim() || "Meny");
  panel.querySelectorAll<HTMLElement>("li").forEach((item, index) => item.style.setProperty("--i", String(index)));
  root.classList.add("is-ready");

  let open = false;
  let quieted: HTMLElement[] = [];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const tuck = (hide: boolean) => root.classList.toggle("is-tucked", hide);

  /** Everything outside the menu, up to the body: the page behind, which nobody should reach while it is open. */
  const quiet = () => {
    for (let node: HTMLElement | null = root; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) continue;
        sibling.inert = true;
        quieted.push(sibling);
      }
    }
  };
  const wake = () => {
    quieted.forEach((element) => (element.inert = false));
    quieted = [];
  };

  const set = (next: boolean, returnFocus: boolean) => {
    if (next === open) return;
    open = next;
    toggle.setAttribute("aria-expanded", String(open));
    // The button says what it does now: "Meny" closed, "Stäng" open. Its name is always its visible word.
    words.forEach((word, index) => (index === (open ? 1 : 0) ? word.removeAttribute("aria-hidden") : word.setAttribute("aria-hidden", "true")));
    root.classList.toggle("is-open", open);
    html.classList.toggle("sg-menu-open", open);
    if (open) {
      tuck(false);
      if (!opened && wide.matches) pictures.forEach((picture) => picture instanceof HTMLImageElement && (picture.loading = "eager"));
      opened = true;
      root.classList.add("has-opened");
      quiet();
      document.addEventListener("keydown", onKey);
      panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else {
      wake();
      document.removeEventListener("keydown", onKey);
      if (returnFocus) toggle.focus();
    }
  };

  // Esc closes; Tab and Shift+Tab go round the button and the links, never out to the page or the browser.
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      set(false, true);
      return;
    }
    if (event.key !== "Tab") return;
    const stops = [toggle, ...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = stops[0];
    const last = stops[stops.length - 1];
    const at = document.activeElement;
    if (event.shiftKey && (at === first || !root.contains(at))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (at === last || !root.contains(at))) {
      event.preventDefault();
      first.focus();
    }
  };

  // The picture beside the list follows the link under the pointer or the keyboard.
  const wide = matchMedia("(min-width: 900px)");
  const links = [...panel.querySelectorAll<HTMLAnchorElement>("li > a")];
  const pictures = [...root.querySelectorAll<HTMLElement>("[data-sg-menu-pictures] > *")];
  let opened = false;
  let shown = -1;
  const follow = (event: Event) => {
    const index = links.indexOf((event.target as Element).closest?.("a") as HTMLAnchorElement);
    const next = pictures[index];
    if (!next || index === shown) return;
    // Everything but the picture on show goes back below; the next one starts there and slides up over it.
    pictures.forEach((picture, at) => at !== shown && picture.classList.remove("was-active"));
    void next.offsetWidth;
    pictures[shown]?.classList.replace("is-active", "was-active");
    next.classList.add("is-active");
    shown = index;
  };
  panel.addEventListener("pointerover", follow);
  panel.addEventListener("focusin", follow);

  // Out of the way while reading down, back at the first move up. Lenis moves the window's own
  // scroll position, so these deltas follow it as well when it runs.
  let lastY = scrollY;
  let travel = 0;
  addEventListener(
    "scroll",
    () => {
      const step = scrollY - lastY;
      lastY = scrollY;
      // Distance in one direction, so a trackpad's jitter back and forth never flickers it.
      travel = step * travel > 0 ? travel + step : step;
      if (scrollY < 80 || open || reduced.matches || toggle.matches(":focus")) tuck(false);
      else if (travel > 12) tuck(true);
      else if (travel < -4) tuck(false);
    },
    { passive: true },
  );
  toggle.addEventListener("focus", () => tuck(false));
  reduced.addEventListener("change", () => reduced.matches && tuck(false));

  toggle.addEventListener("click", () => set(!open, true));
  // A link to a place on this page closes the menu and lets the browser go there; other links leave the page.
  panel.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
    if (link && link.pathname === location.pathname && link.hash) set(false, false);
  });
  // Back from another page with the menu left open (the page was kept in memory): show the page itself.
  addEventListener("pageshow", (event) => event.persisted && set(false, false));
  if (openNow) set(true, false);
}
