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
 * Markup: <nav data-sg="menu" aria-label="Meny" data-lenis-prevent>
 *           <button type="button" data-sg-menu-toggle aria-expanded="false" aria-controls="meny">
 *             <span data-sg-menu-word>Meny</span><span data-sg-menu-word aria-hidden="true">Stäng</span>
 *           </button>
 *           <div id="meny" data-sg-menu-panel> <ol> <li><a href="…">…</a></li> … </ol> </div>
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
