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
new colour. A third (`lab/lekfull/`) goes the opposite way from both: bold
colour, Archivo at its widest and heaviest, sections laid on each other like
cut paper, and shapes drawn in code (inline SVG, no picture files) that can be
picked up and thrown. Its styles are its own file, `lab/lekfull/lekfull.css`.

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
| Drawing off the main thread | `src/engine/offscreen.ts`, `stage-core.ts`, `stage-worker.ts`, `worker-host.ts` | Where the browser can draw WebGL in a worker, the shader stage and the 3D band hand their canvas to one (`transferControlToOffscreen`): the WebGL context, the compile and every frame happen there, so even the first WebGL context in a fresh browser never blocks the page. The size, visibility, uniforms, scroll and pointer go in as messages; a picture goes in as decoded bitmaps. Elsewhere (no OffscreenCanvas, or no WebGL in workers) the same drawing code runs on the main thread, as before. |
| Moving headlines | `src/build/kinetic.ts` | Split into letters **at build time**; CSS animates them. No script, visible from the first paint, the whole sentence as the accessible name. |
| `data-sg="rise"` | `src/engine/engine.css` | First-view text that arrives with one CSS rise. |
| `data-sg="lines"` | `src/modules/text.ts` | Text further down that arrives line by line as it scrolls in. |
| `data-sg="scene"` | `src/modules/scene.ts` | A pinned visual driven by the scroll, over steps. A plain list without motion. |
| `data-sg="ink-field"` | `src/modules/ink-field.ts` | A slow field of silk in the site's colours, lit like satin and stirred by the pointer, over a still gradient that is the design without WebGL. |
| `data-sg="story"` | `src/modules/story.ts` | Phase 2. Panels that slide sideways while the section holds still, on wide screens with motion; stacked everywhere else. Tabbing into a hidden panel scrolls it into view. |
| `data-sg="marquee"` | `src/modules/marquee.ts` | Phase 2. A line that runs without end, faster with scroll speed and backwards when scrolling up. Copies are hidden from screen readers. |
| `data-sg="object"` | `src/modules/object.ts`, `band-scene.ts`, `band-core.ts` | Phase 2. A Möbius band of brushed satin metal that starts as eight loose pieces and flows together into one band as steps scroll past. Plain WebGL, about 6 KB compressed (it was Three.js, 140 KB, until the same picture was drawn without it): the shape is computed on the graphics card from flowing noise, the studio it reflects is drawn analytically in the shader, and the satin streaks come from blurring that reflection along the band. The scroll drives a spring. Over a rendered picture of it that is the design without WebGL. Quality adapts to the device: it measures the screen's frame rate, then steps down (fewer pixels and a coarser band, then one reflection sample) only if frames are slow; `?quality=0\|1\|2` fixes it for comparison. Drawn in a worker where the browser allows it (`band-worker.ts`). Its `loop`, `zoom` and `tilt` options (stills only) make a film of it that closes exactly: see "Pictures made in code". |
| `data-sg="reveal"` | `src/modules/reveal.ts` | Part B. A picture that arrives behind a living edge as it scrolls in and swells like a lens under the mouse. Drawn by a shader over the real `<img>`, which stays for screen readers, search, reduced motion and devices without WebGL. |
| `data-sg="gallery"` | `src/modules/gallery.ts`, `engine.css` | Part B. A sideways row of pictures: a native scroller with snap points (touch, trackpad, arrow keys, screen readers, no script). The engine adds mouse drag with a throw, buttons, a counter and a progress line; pictures drift in their frames (CSS scroll-driven). |
| `data-sg="sound"` | `src/modules/sound.ts` | Part B. A quiet ambient chord from the browser's own synthesiser: no file, off until asked for, remembered, never started without a click or key press, paused in hidden tabs. Scrolling opens its filter, so it brightens while the page moves. Hidden without JavaScript. |
| `data-sg="play"` | `src/modules/play.ts` | Shapes on springs: the pointer pushes them aside, a drag pulls them away and they swing back, a tap nudges them, and those with eyes look at the pointer. About 1 KB compressed, in the motion engine. Decoration only: hidden from screen readers, still where they were drawn without JavaScript or with reduced motion. Rests when nothing moves or the stage is off screen. |
| `data-sg="menu"` | `src/modules/menu.ts`, `engine.css` | A full-screen navigation. Without JavaScript it is the plain list of links in the bar. With it, a button (which stays at the top right as the page scrolls) opens it as a dialog: focus moves to the first link and goes round the links and the button, never out; Esc or the button closes it and gives focus back; the page behind is inert and holds still. The panel comes down like the page curtain and the big links rise out of their lines one after the other, in CSS; with reduced motion it opens and closes at once. Reading down, the button slides up out of the way (transform only) and any move up brings it back; it stays near the top of the page, while it has focus, while the menu is open and with reduced motion. On wide screens the open menu shows a picture of the hovered or focused link's page beside the list, sliding up over the last: the page's own picture from `lab/bilder/`, or for a page without one a mark drawn in its own colours and type; fetched only when the menu first opens on a wide screen, never on a phone. Its own chunk, 1.24 KB compressed, fetched at once on pages with a menu; a press before it arrives still opens it. Leaving through it, the next page rises over the open menu, and Back (from the back-forward cache) shows the page with the menu closed. On the library and Hantverk. |
| `data-sg="reveal-list"` | `src/modules/reveal-list.ts`, `engine.css` | Rows (services, cases, materials) whose picture follows a mouse with weight (GSAP `quickTo`), leans with the speed and straightens as it catches up; the next row's picture slides up over the last. Without a mouse, with reduced motion and without JavaScript each row shows its own small picture instead, decided in CSS from the first paint, so nothing shifts. In the motion engine, about 0.5 KB. |
| `data-sg="count"` | `src/modules/count.ts` | A figure that counts up to its value as it comes into view. The value is in the page from the start, read once from hidden text; without motion it simply shows. |
| `data-sg="video"` | `src/modules/video.ts`, `video-grow.ts`, `engine.css` | A muted loop (`<video muted loop playsinline preload="none" controls>`, AV1 in WebM, then H.264 in MP4) in a frame of fixed shape, wide on screens and tall on phones, in full HD for screens 1280 px wide and up, over its poster: a real `<picture>` with sizes, the film's own first frame, so nothing shifts or jumps when it starts. Its player is its own chunk, under 1 KB, loaded as the film comes near; only then does the film start to load. It plays only while on screen and while the tab is visible, and the engine's button ("Pausa film" / "Spela film", words from `data-pause` / `data-play`) is always on it (WCAG 2.2.2); paused there, it stays paused. With reduced motion it never starts by itself: the button plays it. With Save-Data only the poster shows and no film is fetched. Without JavaScript the browser's own controls show, over the film's `poster` (the 8 KB one: Chrome paints a film with controls and no poster grey); the engine removes them when its button takes over. Of the sources this screen may use (`media`), it takes the first the device decodes efficiently, in hardware where the browser can tell (`MediaCapabilities`), else the first it can play. `data-sg-variant="grow"`, the showreel: with motion, a tall track holds the frame on screen and it grows from its framed size to the whole screen as it scrolls, tied to the scroll, starting as soon as the framed film is wholly in view; `clip-path` and a scale only, never layout. The track is pulled up so the framed film follows the text before it like any other block, and the frame's top edge rises only once the frame is held, so the film never runs over that text. With reduced motion it is the plain frame. A site sets `--sg-video-bleed` (its gutter) and may set `--sg-video-start` (the framed width). |
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
contact sheets) and held still (`NN.still.png`): WebGL canvases and films
hidden, so the still design (or the poster) beneath them shows with the text
over it, marquees at their start and looping CSS at its first frame. The
still picture is the same in every run, to the pixel, so `--compare` judges
it strictly: a screen has changed when more than 0.02 % of its still picture
differs, when a WebGL
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

The films (`lab/film/`) are made the same way, never bought or filmed: a
twelve-second loop of the engine's own band, one slow turn in its own plane
(30° a second) at 24 frames a second, drawn frame by frame on
`lab/verktyg/film.html` at twice the film's size and scaled down, with the
clock pinned to each frame. The band's flow and sway are made to come round in
the same twelve seconds (the band scene's `loop` option), so the last frame
leads into the first with no seam. The band leans further back than on the
page (`tilt`) and the camera is closer (`zoom`): nearer edge-on, the inside of
the band shows its satin and the backdrop seen through the loop stays a sliver,
so it reads as a ribbon all the way round rather than a ring around a flat
disc. These options apply to stills only; the band on the pages is unchanged.
The band is kept on the main thread here (`preserve`), never handed to its
worker, so every frame can be read back. Chrome encodes it itself (WebCodecs:
AV1, and H.264 through the system's encoder) and two small dev packages pack
it (`webm-muxer`, `mp4-muxer`), so nothing is installed outside npm. A wide
film (1280 × 720) for screens, a tall one (720 × 1280) for phones, about 480
KB as AV1 and 555 KB as H.264 each, and a full HD one (1920 × 1080) for
screens 1280 px wide and up, 912 KB and 1.1 MB: at full screen on 1440 and
1920 wide screens it keeps the satin's brushed streaks and the band's edges
that the 1280 film, enlarged, smears. Posters come from the same first frame
(WebP, 1600 and 800 wide, and 720 for phones). Before it saves, the script
plays each film back in the page: it must last the whole loop and start in its
poster's colours (a wrong colour tag would make it jump as it starts over its
poster). About a minute and a half for all six:

```bash
node scripts/render-video.mjs              # every film, both codecs, and their posters
ONLY=telefon node scripts/render-video.mjs # just the phone's
```

Client sites use the client's own pictures and footage, with written permission.

## The gate

| Check | Limit |
| ----- | ----- |
| Script for the first view | ≤ 15 KB compressed (now 4.3, the menu's 1.24 included) |
| Motion engine, loaded later | ≤ 60 KB (now 57.2) |
| WebGL shaders, loaded later | ≤ 10 KB (now 6.8, with the worker; a browser that draws on the main thread gets the same code for it instead, never both) |
| 3D band, only on pages with an object | ≤ 10 KB (now 7.3, counted the same way; was 137 with Three.js) |
| Sound, after load, only where used | ≤ 3 KB (now 1.1) |
| Video player, only where there is a film | ≤ 3 KB (now 0.9) |
| Largest single picture | ≤ 100 KB (now 72); each comes in two sizes for `srcset` |
| Largest single film | ≤ 600 KB (now 555, the wide H.264); fetched only as it comes near, one per screen, never with Save-Data |
| Largest film in full HD, for screens 1280 px wide and up | ≤ 1.2 MB (now 1.1, the H.264; 912 KB as AV1) |
| CSS / HTML / fonts | ≤ 15 / 10 / 140 KB (now 13.3 / 5.4 / 121, fonts all three faces) |
| Lighthouse, simulated phone, median of 3 | performance ≥ 95, accessibility 100, best practices ≥ 95, SEO ≥ 90 (the 404 page: SEO without indexability, and it must say noindex) |
| axe (WCAG 2.2 AA) | no violations, with and without motion |
| Tests | content without JavaScript, nothing moving with reduced motion, still field without WebGL, no sideways scroll on a phone, no console errors, the menu's keyboard path (focus in, round, Esc, focus back), leaving through the menu and coming Back; films: native controls without JavaScript, no autoplay and a keyboard button with reduced motion, playing only while seen, nothing fetched with Save-Data |

Measured 2026-11-27, median of three runs. With WebGL in a worker: the lab
and the warm showcase 99, scene two, the library, the dark and the playful
showcase and the 404 page 100; accessibility and best practices 100
everywhere, SEO 100 (the 404 page is kept out of search by design). The lab's
first run in a fresh browser used to be slower (TBT up to 160 ms). The cause
was not the silk shader's compile, which already ran in the background, but
creating the first WebGL context: 70 to 210 ms of blocked main thread under
Lighthouse. It now happens in a worker, and the first run scores like the
rest (TBT 0 in six of six). With the menu and the reveal list, each run
started at a 1-minute load under 3: the library 100 (100, 100, 100), the warm
showcase 99 (99, 99, 99, largest content 1.9 s, its hero picture). With all
three together and the film in the library (its twelve-second loop and the
full HD source), each run started at a 1-minute load under 3: the library 100
(99, 100, 100; largest content 1.0 s, layout shift 0.003) and the lab 99 (99,
99, 99; 0.8 s, 0). Largest content within 0.8–1.0 s on every page but the
warm showcase; layout shift 0 to 0.004. 181 tests pass on desktop and phone
(11 are skipped: desktop-only, run once by design, or needing a software
renderer, as CI has); the film's 18 include Save-Data, emulated by sending the
`Save-Data` header and setting `navigator.connection.saveData`, which is what
the engine reads, since Playwright cannot turn on Chrome's data saver. The 3D
band went from 137 KB (Three.js) to about 6 KB compressed, with the same
picture.

## Licences

- **GSAP** (with ScrollTrigger and SplitText): Webflow's standard "no charge"
  licence. Allowed on any website. **Not allowed** in a tool that lets people
  build visual animations without code in competition with Webflow, so never
  put GSAP behind a no-code animation builder in Studio OS.
- **Lenis**: MIT.
- **mp4-muxer** 5.2.2 and **webm-muxer** 5.1.4 (Vanilagy): MIT. Dev
  dependencies for `scripts/render-video.mjs` only; nothing of them reaches a
  visitor. Both are final releases (their author has moved on to Mediabunny,
  which is MPL-2.0, so these MIT ones were kept).
- **Simplex noise** (2D and 3D) in the silk field, the image effect, the band and the satin stills: Ashima Arts / Stefan Gustavson, MIT.
- **Fonts** in the lab: Archivo, Instrument Sans and Instrument Serif, SIL
  Open Font License (`lab/fonts/LICENSE-*.txt`). Instrument Serif came from
  the `@fontsource/instrument-serif` 5.3.0 package (Latin, regular); its
  fallback's metrics were measured in the browser against Times New Roman.
  All three are trimmed with fontTools (`pyftsubset`, no hinting, every
  layout feature kept) to the Latin letters and punctuation Swedish, Finnish
  and English need, about 17 KB less in all. No font declares a Reserved Font
  Name, so the trimmed files keep theirs.
