# Axivo Signature

The engine for Axivo's award-level client sites: motion, scroll, page
transitions and WebGL, with accessibility and weight held to a gate. It sits
beside Website Factory (static sites from a spec, for €500–1,000 clients) and
will be driven by Studio OS in phase 3. Phase 1 is the engine and a lab that
proves it; phase 2 is the library of building blocks (`lab/bibliotek/`),
with the intro on the lab's first page, a page for missing addresses
(`lab/404.html`) and a showcase (`lab/visning/`): one idea, "En sida." (a
Möbius band has only one side, and so does a good site), built only from the
library's parts, to judge the whole against award nominees rather than the
parts one by one. A second showcase (`lab/hantverk/`) uses the same engine in
a light, warm direction with a display serif (Instrument Serif) and its own
curtain, to show that every client gets their own look, never a template in a
new colour.

The plan, the research behind it (20 Awwwards nominees, measured) and the
phases are in the Claude Doc "Axivo på Awwwards-nivå: vad som krävs".

## The rule

**Content first, motion on top.** Every page works and reads fully with no
JavaScript, with reduced motion, and without WebGL. The engine only adds.

## What is in it

| Part | File | What it does |
| ---- | ---- | ------------ |
| Capabilities | `src/engine/capabilities.ts` | Reduced motion, saved data, weak device, fine pointer. Creates no WebGL context. |
| Boot | `src/engine/index.ts` | Mounts `data-sg` modules. Loads the motion engine only when a moving section comes near or the visitor first scrolls. |
| Motion | `src/engine/motion.ts` | GSAP + ScrollTrigger + SplitText. `whenMotion()` runs animations only while motion is welcome and reverts them when it is not. |
| Smooth scroll | `src/engine/scroll.ts` | Lenis, in step with ScrollTrigger. Native scrolling, keyboard, anchors and touch keep working. |
| Page transitions | `src/engine/engine.css` | The browser's own cross-document View Transitions: the new page rises like a curtain. A picture with the same `view-transition-name` on two pages flies from one to the other (the showcases' "next" pictures grow into the next page's main picture); a line in each page head marks an arrival by transition, so a picture that flew in needs no second entrance. Off with reduced motion; browsers without them change page as usual. |
| Shader stage | `src/engine/shader-stage.ts` | A full-screen fragment shader in plain WebGL: compiles in the background, draws only when visible, refuses software renderers, recovers from a lost context. |
| Moving headlines | `src/build/kinetic.ts` | Split into letters **at build time**; CSS animates them. No script, visible from the first paint, the whole sentence as the accessible name. |
| `data-sg="rise"` | `src/engine/engine.css` | First-view text that arrives with one CSS rise. |
| `data-sg="lines"` | `src/modules/text.ts` | Text further down that arrives line by line as it scrolls in. |
| `data-sg="scene"` | `src/modules/scene.ts` | A pinned visual driven by the scroll, over steps. A plain list without motion. |
| `data-sg="ink-field"` | `src/modules/ink-field.ts` | A slow field of silk in the site's colours, lit like satin and stirred by the pointer, over a still gradient that is the design without WebGL. |
| `data-sg="story"` | `src/modules/story.ts` | Phase 2. Panels that slide sideways while the section holds still, on wide screens with motion; stacked everywhere else. Tabbing into a hidden panel scrolls it into view. |
| `data-sg="marquee"` | `src/modules/marquee.ts` | Phase 2. A line that runs without end, faster with scroll speed and backwards when scrolling up. Copies are hidden from screen readers. |
| `data-sg="object"` | `src/modules/object.ts`, `band-scene.ts` | Phase 2. A Möbius band of brushed satin metal that starts as eight loose pieces and flows together into one band as steps scroll past. Plain WebGL, about 5 KB compressed (it was Three.js, 140 KB, until the same picture was drawn without it): the shape is computed on the graphics card from flowing noise, the studio it reflects is drawn analytically in the shader, and the satin streaks come from blurring that reflection along the band. The scroll drives a spring. Over a rendered picture of it that is the design without WebGL. Quality adapts to the device: it measures the screen's frame rate, then steps down (fewer pixels and a coarser band, then one reflection sample) only if frames are slow; `?quality=0\|1\|2` fixes it for comparison. |
| `data-sg="reveal"` | `src/modules/reveal.ts` | Part B. A picture that arrives behind a living edge as it scrolls in and swells like a lens under the mouse. Drawn by a shader over the real `<img>`, which stays for screen readers, search, reduced motion and devices without WebGL. |
| `data-sg="gallery"` | `src/modules/gallery.ts`, `engine.css` | Part B. A sideways row of pictures: a native scroller with snap points (touch, trackpad, arrow keys, screen readers, no script). The engine adds mouse drag with a throw, buttons, a counter and a progress line; pictures drift in their frames (CSS scroll-driven). |
| `data-sg="sound"` | `src/modules/sound.ts` | Part B. A quiet ambient chord from the browser's own synthesiser: no file, off until asked for, remembered, never started without a click or key press, paused in hidden tabs. Scrolling opens its filter, so it brightens while the page moves. Hidden without JavaScript. |
| `data-sg="count"` | `src/modules/count.ts` | A figure that counts up to its value as it comes into view. The value is in the page from the start, read once from hidden text; without motion it simply shows. |
| Intro (`.sg-intro`) | `engine.css`, a line in the page head | Part B. A curtain with the word mark, once per visit, in CSS alone. Never blocks a click, never shown with reduced motion; the first view's motion waits for it. |
| 404 page | `lab/404.html` | Part B. Says plainly that the page is missing and leads back. `<base href="/">` makes it work at any depth; the host serves it for missing addresses. |
| `data-sg-cursor`, `data-sg-magnetic` | `src/modules/cursor.ts` | Phase 2. A ring beside the system cursor (mouse and trackpad only) and buttons that lean toward the pointer, at most 14 px. |
| `data-sg="mark"` | `src/build/kinetic.ts`, `engine.css` | Phase 2. A word mark split at build time whose letters rise as it scrolls in, in CSS alone (scroll-driven animations). |
| Holding the place | `holdPlace()` in `src/engine/motion.ts` | Phase 2. When a section above the visitor changes height as it starts (a pin, a scrubbed list), the page keeps what they are looking at still. |

## Commands

```bash
npm ci
npm run dev          # the lab at http://127.0.0.1:4316
npm run check        # build (type-checked) → weight budget → tests → Lighthouse
```

`npm run check` is the gate. CI runs the same steps (job "Signature engine").

### Visual review

Every change is looked at screen by screen, on desktop and phone, and
compared with how it looked before. After `npm run build`:

```bash
npm run review                  # screenshots and contact sheets in review/<run>/
npm run review -- --baseline    # the same, and keep it as review/baseline/
npm run review -- --compare     # the same, and compare it with the baseline
```

Every page in `vite.config.ts` is opened on desktop (1440 × 900) and on a
phone (Pixel 7), scrolled the way a visitor scrolls (wheel notches, so
modules mount as they come near), and photographed once per screen height
when motion has settled: scrolling has stopped, CSS animations have ended,
pictures in view have loaded, WebGL in view has drawn its first frame, and
then a fixed 0.9 s for springs and GSAP. The intro curtains are skipped,
WebGL runs in software (`?webgl`) and the 3D band's quality is fixed
(`?quality=2`), so it never steps down mid-run. Each page and device also
gets a contact sheet (`review/<run>/<page>-<device>.jpg`) with all its
screens, for looking at a whole page at once. A run of every page takes
about two minutes.

Each screen is photographed twice: as the visitor sees it (`NN.png`, on the
contact sheets) and held still (`NN.still.png`): WebGL canvases hidden, so
the still design beneath them shows with the text over it, marquees at
their start and looping CSS at its first frame. The still picture is the
same in every run, to the pixel, so `--compare` judges it strictly: a screen
has changed when more than 0.02 % of its still picture differs, when a WebGL
part drew differently (drawn, starting or still) or sits elsewhere, or when
the screen ended at another scroll position. It prints a table of those
screens, saves a diff next to each (`NN.diff.png`: changes in red, moving
parts outlined in blue) and a side-by-side sheet per page and device
(`<page>-<device>.compare.jpg`: baseline, now, diff). When a page's height
changes, every screen after the change shows another part of the page; the
compare says so.

Expected noise, which the compare ignores: the silk field, the band and the
picture effect run on time since they started, which differs between runs by
up to a few seconds, so their live pixels differ by 5–50 % (the hero's silk
the most); a marquee is wherever its loop has got to. The table's "moving
parts" column shows that difference, for information. A WebGL picture that
is wrong in detail (a shader change, another colour) is therefore found by
looking at the side-by-side sheet, not by the numbers; a WebGL part that
stops drawing is found by its state.

A busy machine gives false changes: screens settle late and WebGL may not
draw in time. When the load average is over 1.5 per core, the review warns,
captures one page at a time, and the compare says which runs were taken
under load. Run it again when the machine is quieter before trusting a
"starting" WebGL part or a screen that did not settle.

Options: `--pages=lab,scen` (names or paths), `--devices=phone`, `--jobs=3`
(pages captured at once, each in its own browser; 1 on a busy machine),
`--settle=900`, `--threshold=0.1` (pixelmatch colour distance) and
`--tolerance=0.02` (per cent). The review uses a running preview server or
starts one. It stops if that server was started in another folder or serves
files other than this checkout's `dist/`; `REVIEW_PORT=4320 npm run review`
uses another port.

## Pictures made in code

The lab's pictures (`lab/bilder/`) are rendered by Axivo in code, so there
are no rights to clear: satin stills from a shader and the satin band from the
engine itself, at full quality. The tool page is `lab/verktyg/` (dev server
only, not built). With `npm run dev` running:

```bash
node scripts/render-art.mjs              # every picture, full size and 800 px wide
ONLY=siden node scripts/render-art.mjs   # just the ones whose name starts with "siden"
```

Client sites use the client's own pictures, with written permission.

## The gate

| Check | Limit |
| ----- | ----- |
| Script for the first view | ≤ 15 KB compressed (now 2.8) |
| Motion engine, loaded later | ≤ 60 KB (now 55) |
| WebGL shaders, loaded later | ≤ 10 KB (now 4.3) |
| 3D band, only on pages with an object | ≤ 10 KB (was 137 with Three.js) |
| Sound, after load, only where used | ≤ 3 KB (now 1) |
| Largest single picture | ≤ 100 KB (now 72); each comes in two sizes for `srcset` |
| CSS / HTML / fonts | ≤ 15 / 10 / 140 KB (fonts now 121, all three faces) |
| Lighthouse, simulated phone, median of 3 | performance ≥ 95, accessibility 100, best practices ≥ 95, SEO ≥ 90 (the 404 page: SEO without indexability, and it must say noindex) |
| axe (WCAG 2.2 AA) | no violations, with and without motion |
| Tests | content without JavaScript, nothing moving with reduced motion, still field without WebGL, no sideways scroll on a phone, no console errors |

Measured 2026-11-26, median of three runs: lab 98 (its first run is slower,
while the graphics card compiles the silk shader cold), the warm showcase 98,
the library and the dark showcase 99, scene two and the 404 page 100;
accessibility, best practices and SEO 100 everywhere. Largest content after
0.8 s on every page; layout shift 0 to 0.003. 91 tests pass on desktop and
phone (7 are desktop-only or run once by design). The 3D band went from 137 KB
(Three.js) to 5.7 KB compressed, with the same picture.

## Licences

- **GSAP** (with ScrollTrigger and SplitText): Webflow's standard "no charge"
  licence. Allowed on any website. **Not allowed** in a tool that lets people
  build visual animations without code in competition with Webflow, so never
  put GSAP behind a no-code animation builder in Studio OS.
- **Lenis**: MIT.
- **Simplex noise** (2D and 3D) in the silk field, the image effect, the band and the satin stills: Ashima Arts / Stefan Gustavson, MIT.
- **Fonts** in the lab: Archivo, Instrument Sans and Instrument Serif, SIL
  Open Font License (`lab/fonts/LICENSE-*.txt`). Instrument Serif came from
  the `@fontsource/instrument-serif` 5.3.0 package (Latin, regular); its
  fallback's metrics were measured in the browser against Times New Roman.
  All three are trimmed with fontTools (`pyftsubset`, no hinting, every
  layout feature kept) to the Latin letters and punctuation Swedish, Finnish
  and English need, about 17 KB less in all. No font declares a Reserved Font
  Name, so the trimmed files keep theirs.
