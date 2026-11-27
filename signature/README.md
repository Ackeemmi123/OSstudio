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
| `data-sg="story"` | `src/modules/story.ts` | Phase 2. Panels that slide sideways while the section holds still (CSS sticky, so no layout shift when it takes hold or lets go), on wide screens with motion; stacked everywhere else. Tabbing into a hidden panel scrolls it into view. |
| `data-sg="marquee"` | `src/modules/marquee.ts` | Phase 2. A line that runs without end, faster with scroll speed and backwards when scrolling up. Copies are hidden from screen readers. |
| `data-sg="object"` | `src/modules/object.ts`, `band-scene.ts`, `band-core.ts` | Phase 2. A Möbius band of brushed satin metal that starts as eight loose pieces and flows together into one band as steps scroll past. Plain WebGL, about 6 KB compressed (it was Three.js, 140 KB, until the same picture was drawn without it): the shape is computed on the graphics card from flowing noise, the studio it reflects is drawn analytically in the shader, and the satin streaks come from blurring that reflection along the band. The scroll drives a spring. Over a rendered picture of it that is the design without WebGL. Quality adapts to the device: it measures the screen's frame rate, then steps down (fewer pixels and a coarser band, then one reflection sample) only if frames are slow; `?quality=0\|1\|2` fixes it for comparison. Drawn in a worker where the browser allows it (`band-worker.ts`). Its `loop`, `zoom` and `tilt` options (stills only) make a film of it that closes exactly: see "Pictures made in code". |
| `data-sg="reveal"` | `src/modules/reveal.ts` | Part B. A picture that arrives behind a living edge as it scrolls in and swells like a lens under the mouse. Drawn by a shader over the real `<img>`, which stays for screen readers, search, reduced motion and devices without WebGL. Once the shader works, only a picture not yet on screen is held back to arrive; one that has shown never vanishes, and without WebGL the `<img>` is never hidden. |
| `data-sg="gallery"` | `src/modules/gallery.ts`, `engine.css` | Part B. A sideways row of pictures: a native scroller with snap points (touch, trackpad, arrow keys, screen readers, no script). The engine adds mouse drag with a throw, buttons, a counter and a progress line; pictures drift in their frames (CSS scroll-driven). |
| `data-sg="sound"` | `src/modules/sound.ts` | Part B. A quiet ambient chord from the browser's own synthesiser: no file, off until asked for, remembered, never started without a click or key press, paused in hidden tabs. Scrolling opens its filter, so it brightens while the page moves. Hidden without JavaScript. |
| `data-sg="play"` | `src/modules/play.ts` | Shapes on springs: the pointer pushes them aside, a drag pulls them away and they swing back, a tap nudges them, and those with eyes look at the pointer. About 1 KB compressed, in the motion engine. Decoration only: hidden from screen readers, still where they were drawn without JavaScript or with reduced motion. Rests when nothing moves or the stage is off screen. |
| `data-sg="menu"` | `src/modules/menu.ts`, `engine.css` | A full-screen navigation. Without JavaScript it is the plain list of links in the bar. With it, a button (which stays at the top right as the page scrolls) opens it as a dialog: focus moves to the first link and goes round the links and the button, never out; Esc or the button closes it and gives focus back; the page behind is inert and holds still. The panel comes down like the page curtain and the big links rise out of their lines one after the other, in CSS; with reduced motion it opens and closes at once. Reading down, the button slides up out of the way (transform only) and any move up brings it back (the direction comes from `src/engine/heading.ts`, shared with the call to action); it stays near the top of the page, while it has focus, while the menu is open and with reduced motion. On wide screens the open menu shows a picture of the hovered or focused link's page beside the list, sliding up over the last: the page's own picture from `lab/bilder/`, or for a page without one a mark drawn in its own colours and type; fetched only when the menu first opens on a wide screen, never on a phone. Its own chunk, 1.24 KB compressed, fetched at once on pages with a menu; a press before it arrives still opens it. Leaving through it, the next page rises over the open menu, and Back (from the back-forward cache) shows the page with the menu closed. On the library and Hantverk. |
| `data-sg="reveal-list"` | `src/modules/reveal-list.ts`, `engine.css` | Rows (services, cases, materials) whose picture follows a mouse with weight (GSAP `quickTo`), leans with the speed and straightens as it catches up; the next row's picture slides up over the last. Without a mouse, with reduced motion and without JavaScript each row shows its own small picture instead, decided in CSS from the first paint, so nothing shifts. In the motion engine, about 0.5 KB. |
| `data-sg="stack"` | `src/engine/engine.css` | Cards (steps, services, people) that stack as the page scrolls, in CSS alone: each sticks near the top in turn (`position: sticky`) and the next slides up over it. Where the browser has scroll-driven animations (`animation-timeline`, on the list's own view timeline) and motion is welcome, the ones beneath settle back, smaller and into shade, the deeper the more (`scale`, and the opacity of a `::after` layer in the site's own colour, `--sg-stack-shade`, multiplied over the card, so a light card turns a deeper tone of itself instead of grey; all on the compositor). Inside a card, while it rises to where it sticks (each card's own view timeline), a picture marked `data-sg-stack-zoom` settles from slightly near inside its frame and anything marked `data-sg-stack-rise` rises into place; on the library, the step's number stands large at the card's foot, cut by its edge. Each card's margins follow its place, so all four end on one line when stacked: the deck leaves as one instead of folding its edges away, and the cards still follow each other at one even distance, which keeps the settling exact. Browsers without scroll-driven animations (Safari before 26, Firefox without its flag) and reduced motion get plain sticky stacking with no scale, shade or movement inside; without JavaScript, and on screens under 40em tall (where a card might not fit), the list it is written as. A card holding keyboard focus comes to the front (`:has(:focus-visible)`), so focus is never hidden under a later card (WCAG 2.4.11). The list sets `--n` and each card `--i`; a site may set `--sg-stack-top`, `--sg-stack-peek`, `--sg-stack-gap`, `--sg-stack-shade` and `--sg-stack-shade-step`. No script. On the library. |
| `data-sg="cta"` | `src/modules/cta.ts`, `engine.css` | The page's own call to action ("Boka tid", "Boka bord"): a real link written where it belongs, never injected. Without JavaScript it is just that link. With it, once the visitor has scrolled past the first screen and while the link's own place is out of view, the same link floats as a pill at the bottom centre; nearing its place it comes out to meet it, even while reading down, and when the place reaches the pill's line it glides into it; reading back up past the place it glides out again. The place keeps its height meanwhile. The link itself changes place while transparent, and a stand-in nobody can reach or focus does the glide and hands over, so no visible box ever jumps and the browser counts no layout shift; with reduced motion the link just shows at its new place. Reading down it slides away and any move up brings it back (the menu's direction logic, `src/engine/heading.ts`); it gives way while the footer, or anything marked `data-sg-cta-end` (the page's own closing call to action), is in view, so there are never two. It never covers the focused element: while it shows, the page keeps room for it (`scroll-padding-bottom`), and it stays away while the focused element is where it would be. Focused itself, it always shows. With reduced motion it fades instead of sliding. Its own chunk, 1.4 KB compressed (and 0.15 shared with the menu), loaded after the page; until then it is the link where it stands. On the library. |
| `data-sg="count"` | `src/modules/count.ts` | A figure that counts up to its value as it comes into view. The value is in the page from the start, read once from hidden text; without motion it simply shows. |
| `data-sg="video"` | `src/modules/video.ts`, `video-grow.ts`, `engine.css` | A muted loop (`<video muted loop playsinline preload="none" controls>`, AV1 in WebM, then H.264 in MP4) in a frame of fixed shape, wide on screens and tall on phones, in full HD for screens 1280 px wide and up, over its poster: a real `<picture>` with sizes, the film's own first frame, so nothing shifts or jumps when it starts. Its player is its own chunk, under 1 KB, loaded as the film comes near; only then does the film start to load. It plays only while on screen and while the tab is visible, and the engine's button ("Pausa film" / "Spela film", words from `data-pause` / `data-play`) is always on it (WCAG 2.2.2); paused there, it stays paused. With reduced motion it never starts by itself: the button plays it. With Save-Data only the poster shows and no film is fetched. Without JavaScript the browser's own controls show, over the film's `poster` (the 8 KB one: Chrome paints a film with controls and no poster grey); the engine removes them when its button takes over. Of the sources this screen may use (`media`), it takes the first the device decodes efficiently, in hardware where the browser can tell (`MediaCapabilities`), else the first it can play. `data-sg-variant="grow"`, the showreel: with motion, a tall track holds the frame on screen and it grows from its framed size to the whole screen as it scrolls, tied to the scroll, starting as soon as the framed film is wholly in view; `clip-path` and a scale only, never layout. The track is pulled up so the framed film follows the text before it like any other block, and the frame's top edge rises only once the frame is held, so the film never runs over that text. With reduced motion it is the plain frame. A site sets `--sg-video-bleed` (its gutter) and may set `--sg-video-start` (the framed width). |
| `data-sg="sequence"` | `src/modules/sequence.ts`, `sequence-loader.ts`, `sequence-worker.ts`, `engine.css` | An image sequence scrubbed by the scroll while its section holds still: the product reveal. Numbered pictures drawn on a canvas, one per step of a movement, each fading into the next as the scroll passes between them, so a slow scroll moves on every screen frame and never steps; on the library 121 of them, the band's eight pieces gathering into one as it turns, rendered in code (see "Pictures made in code"). They come in two formats: AVIF at the size a 2× screen shows (2400 × 1350, and 1080 × 2340 for phones), and WebP for browsers without AVIF (every second picture, 61, at 1600 × 900 and 720 × 1560). The `[data-sg-frames]` that share a media query are that one movement in several formats, the best first, and the loader takes the first whose first frame the browser fetches and decodes (AVIF: Chrome 85, Firefox 93, Safari 16.4), so the choice rests on the real file; a set with fewer pictures says so with its own `data-frames`, and the counter counts in the root's either way. The design is a sized `<picture>` whose own media queries choose the frame: the first with motion, the last with reduced motion or without JavaScript (`scripting: none`), each in two shapes (16:9 for screens, 19.5:9 for phones) and both formats (`<source type="image/avif">` before the WebP), so nothing shifts, and nothing jumps as the canvas takes over with that same first frame. With motion a tall track (300svh, `--sg-sequence-track`) holds the stage on screen (sticky): the frames take the first 85 % of the held distance and the last frame holds for the rest. Its chunk loads a screen ahead and starts the frames, every fourth (and the last) first, so the whole movement can be scrubbed coarsely at once, then the rest. They are fetched and decoded in a worker (`createImageBitmap`, which WebKit decodes on the thread that calls it, so the worker keeps it off the page's main thread in every browser); where no worker can start, the page runs the same loader itself. Only the frames near the one shown are kept decoded, more of them ahead in the direction of reading (about 110 MB: eight wide frames or ten tall ones; a 2400 × 1350 frame is 13 MB decoded, all 121 would be 1.6 GB), decoded from half a screen away and let go further off. It draws only when the scroll moves or a frame it waits for arrives; while one is on its way, the nearest decoded frame on the way to it holds, whole, so the movement never runs past the scroll and back. An AVIF frame of that size takes about 20 ms to decode (a WebP one of 1600 × 900 took 5), so a scroll faster than some forty pictures a second is shown in every second or third picture, each drawn the moment it is decoded. `--sg-p` (0–1) and the text of `[data-sg-at]` follow the frame shown, for a counter in the site's own CSS; with `data-sg-steps` (thresholds, as parts of the movement) the root also carries the step it is in (`data-sg-step`, `--sg-step`), which changes only once the frame shown is 0.03 past a threshold either way, so it never flickers where a reader stops. On the library three words, one per step, roll to the next on a time-based 0.6 s transition (transform only, the house easing) whenever the step changes, never with the scroll, so wherever the reader stops a whole word stands, in a window with room for Å, Ä and Ö; with reduced motion the last word stands and nothing rolls. With Save-Data the boot turns the picture to the last frame, nothing is held, and neither the chunk nor a frame is fetched. Nothing in it takes focus, and the stage only ever covers its own track, so keyboard scrolling goes on through it and focus is never hidden. On the library. |
| Intro (`.sg-intro`) | `engine.css`, a line in the page head | Part B. A curtain with the word mark, once per visit, in CSS alone. Never blocks a click, never shown with reduced motion; the first view's motion waits for it. |
| 404 page | `lab/404.html` | Part B. Says plainly that the page is missing and leads back. `<base href="/">` makes it work at any depth; the host serves it for missing addresses. |
| `data-sg-cursor`, `data-sg-magnetic` | `src/modules/cursor.ts` | Phase 2. A ring beside the system cursor (mouse and trackpad only) and buttons that lean toward the pointer, at most 14 px. |
| `data-sg="mark"` | `src/build/kinetic.ts`, `engine.css` | Phase 2. A word mark split at build time whose letters rise as it scrolls in, in CSS alone (scroll-driven animations). |
| Holding the place | `holdPlace()` in `src/engine/motion.ts` | Phase 2. When a section above the visitor changes height as it starts (a pin, a scrubbed list), the page keeps what they are looking at still. |

## The Signature layer

The engine above is for sites written for it. The layer (`src/layer/`,
`layer/`) is for every other site: it adds Signature motion to a **finished**
static site, from Website Factory or built by hand, without changing its
design. Same HTML, same content, same CSS; the site's own elements become
modules through a map of selectors, and a preset decides how motion feels in
that industry.

What it promises, and `tests/layer.spec.ts` checks on a hand-built site:

- **Without JavaScript** the enhanced site is the base site, pixel for pixel.
  Every rule in `layer.css` is behind `html.sgl`, which only the script sets.
- **With reduced motion** the script returns at once: nothing of the layer
  exists, and the page is the base site with its own reduced-motion rules.
- **No layout shift.** Arrivals are opacity, transform and clip-path. Where
  the layer has to touch the DOM (a headline split into word boxes, a wrapper
  around the call to action, a counting figure) it measures before and after
  in the same task, before anything is drawn, and undoes the change if a
  single box moved. When the motion is over, the headline is the markup that
  was written.
- **Content is never hidden without a way back.** It waits only once the
  script is running and watching it; whatever takes keyboard focus shows at
  once; print shows everything.
- **It adds motion, never design.** No colour, type or layout rule. Where a
  site has motion of its own (Website Factory's CSS entrances), an element
  the layer takes over loses the site's entrance, so the two never play on
  top of each other; elements the map does not name keep the site's.

### Enhancing a site

```bash
# a built site in a folder (changed in place, or copied with --out)
node scripts/enhance.mjs <builtSiteDir> --map services --preset auto
node scripts/enhance.mjs <builtSiteDir> --map ./site.map.json --preset editorial --out <dir>
```

It adds three tags before `</head>` in every HTML file and one folder of
files (`signature/`). Nothing else changes, and running it again replaces
what it added:

```html
<!-- signature-layer <build> -->
<link rel="stylesheet" href="./signature/layer.css">
<link rel="modulepreload" href="./signature/layer.js">
<script type="module" src="./signature/site.js" blocking="render"></script>
<!-- /signature-layer -->
```

The addresses use each page's own way to the site's top (`./`, `../`), as
Website Factory writes its `site.css` link; `--root /` (or `root` below)
gives absolute ones. `site.js` is one line: the site's map and preset, handed
to `start()` in `layer.js`.

**Why the mapping happens in the browser, not in the HTML.** The enhancer
only does plain string operations on the head. Selectors are matched at run
time, before the first paint: the script tag is render-blocking where the
browser supports `blocking="render"` (Chrome 105, Safari 18.2), and it is 4
KB. So there is no HTML parser to ship, no second copy of each page's
markup to keep in step, and a site's HTML stays the site's. Where the script
still runs after a paint (Firefox does not block on it), it leaves the whole
first view exactly as the base site drew it and only prepares what is
further down, so nothing shown is ever taken away.

**From code** (Studio OS, or any build): `layer/enhance.mjs` is the same
thing as a pure function. No filesystem, no network, nothing from Node; the
layer's built files come from `layer-dist/assets.mjs`, an ordinary module.

```ts
import { enhanceSite, presetForDirection, DIRECTION_PRESETS } from "../signature/layer/enhance.mjs";

const { files, assets } = enhanceSite(built /* { path, text }[] */, {
  map: "services",                              // or a map object
  preset: presetForDirection(design.direction), // "calm" | "warm" | "editorial" | "bold", or "auto"
  root: undefined,                              // default: relative per page; "/" for absolute
});
// files:  the HTML files that changed, whole          → replace by path
// assets: { path, text, contentType }[] to add        → signature/layer.js, layer.css, site.js, chunks
```

### The kept build (`layer-dist/`)

`npm run build:layer` builds `src/layer/` with Vite and writes
`layer-dist/assets.mjs` (every built file as text, under a stable name),
its types and `manifest.json` (sizes, and a hash of everything the build was
made from). The folder **is committed**, like Website Factory's fonts, so
that Studio OS never runs Vite. `npm run build:layer -- --check` fails when
the source has changed since; `tests/layer.spec.ts` runs it, so CI catches a
stale build. After changing anything in `src/layer/` (or an engine file it
imports): `npm run build:layer`, commit `layer-dist/`.

### Presets

A preset is tokens (durations, distances, curves) and the list of modules a
site may use at all (`src/layer/presets.ts`). A map's `tokens` can replace
single values for one site.

| Preset | For | Headlines | Blocks and rows | Pictures | Also |
| ------ | --- | --------- | --------------- | -------- | ---- |
| `calm` | law, clinics, experts | line by line, a fade and a 0.3 em rise, 1 s | 0.6 rem, 0.8 s, 60 ms apart | fade, settling from 4 % larger | nothing else: no smooth scroll, no floating link, nothing that follows the pointer, no counting |
| `warm` | cafés, restaurants | word by word, each turning 5° into place with a small overshoot | 1.4 rem with overshoot, 70 ms apart | open from below, settling from 14 % larger | call to action, counting, smooth scroll |
| `editorial` | interior, architecture, studios | lines rising out of masks, 1.5 s, long landing | 1.6 rem, 1.3 s | unveiled from the top, settling from 22 % larger for 2.4 s | hover list, stack, call to action, counting, smooth scroll |
| `bold` | statement brands | words out of masks, fast (0.75 s, 38 ms apart), a 4° kick | 2.2 rem, 0.6 s | wiped in from the side, 0.8 s | the same as editorial |

Website Factory's directions and their default preset (`DIRECTION_PRESETS`,
exported by `layer/enhance.mjs`; `--preset auto` reads the direction from
the page's `d-<direction>` class):

| Direction | Preset |
| --------- | ------ |
| `formal` | `calm` |
| `clinic` | `calm` |
| `cafe` | `warm` |
| `atelier` | `editorial` |
| `editorial` | `editorial` |
| `statement` | `bold` |

### Modules

| Module | What the site's element becomes | Cost |
| ------ | ------------------------------- | ---- |
| `headline` | Text split into word boxes at run time (markup inside it stays), arriving by line or word; put back as written when it is over. A headline with a hyphenated word, or one whose lines would break differently, arrives as one block instead. | in `layer.js` |
| `rise` | A block that rises into place: paragraphs, rows, cards. Siblings follow each other. | in `layer.js` |
| `reveal` | A picture's frame opens (or fades, where the site clips the frame itself), and the picture inside settles on `transform`, so it adds to any drift the site gives it. | in `layer.js` |
| `count` | A figure in the site's text counts up, in a box exactly as wide as the final number. Only an element with one whole number: prices, decimals, "24/7" and hours are left alone. | 0.8 KB, when near |
| `cta` | The engine's call to action on the page's own link (in a wrapper that is kept only if it moves and restyles nothing). `options.end`: sections where it gives way. | 1.4 KB, after load |
| `list` | The engine's reveal list: `options.row` and `options.thumb` name the rows and each row's own picture. Mouse and trackpad only; everyone else keeps the small pictures. **Changes layout for mouse users** (the small pictures go), so it is for lists designed with it. | 46.6 KB (GSAP), when near, never on touch |
| `stack` | The engine's stack on the site's list of cards. **Changes layout** (cards stick and overlap), so it is for opaque cards of one height. | CSS only |
| smooth scroll | Lenis alone, from the first sign of scrolling. Decided by the preset, not by a rule. | 5.3 KB, on first scroll |

### The map

A map is a plain object (or JSON file): the site's own selectors, in order.
An element arrives once, by the first rule that matches it, and nothing
arrives inside something that already arrives.

```json
{
  "presets": [{ "when": "body.d-cafe", "preset": "warm" }],
  "rules": [
    { "module": "headline", "select": ".hero h1, .section-head h2" },
    { "module": "reveal", "select": ".hero-image .frame", "options": { "inner": "img" } },
    { "module": "rise", "select": ".hero-why, .ledger-row, .steps > li" },
    { "module": "count", "select": ".sig-numbers dd" },
    { "module": "cta", "select": ".hero-actions > a.button", "unless": "body.has-call-bar", "options": { "end": ".closing" } }
  ],
  "tokens": { "warm": { "rise": { "stagger": 90 } } }
}
```

Two things to keep out of a map. An element that arrives is moved while it
waits and arrives, and a moved element is what anything `position: fixed`
inside it is placed against: never map an element that holds a fixed bar or
button (the layer's own call to action waits until the element around it has
arrived, for this reason). And a picture's frame should be the picture's own
box: in a frame that also holds a caption and does not clip, the picture
only gets the wipe, not the settling.

`when` and `unless` are selectors tested against the page (a rule for one
direction, or not where the site already has a bar at the foot of the
screen). `presets` is what `--preset auto` reads. Rules for modules the
preset does not allow are skipped, so one map serves every preset.

The shipped map for Website Factory's services system is
`layer/maps/services.mjs`, covering all six directions. It uses `headline`,
`reveal`, `rise`, `count` and `cta`. It has no `stack` and no `list`: no
direction writes steps as cards that could lie on each other (and the
statement direction already stacks its own in CSS), and no list carries a
picture per row. Adding either would be a new layout, which the layer never
makes. A hand-built site's map is in `tests/fixtures/layer-site/`.

### Proof

```bash
npx vitest run proof/concepts/industry-examples.render.ts   # in the repository's top folder: the invented examples
npm run layer-proof                                         # in signature/: enhance them and photograph base and enhanced
npm run layer-proof -- name=<builtSiteDir>[:preset] …       # any other built sites
```

Each site is opened on desktop (1440 × 900) and a Pixel 7 at six scroll
points, base and enhanced, each at rest and held at exactly 350 ms into its
motion (every time-based animation is paused at that time, so the picture is
the same on a busy machine). One sheet per site and device in
`review/layer/` (git-ignored). Port 4407.

Films: the layer's test site is part of the built lab, so the film review
needs no change to film it:
`FR_PAGES=/layer-fixture/enhanced/,/layer-fixture/calm/ npm run film-review`.

## Commands

```bash
npm ci
npm run dev          # the lab at http://127.0.0.1:4316
npm run check        # build (type-checked) → weight budget → tests → Lighthouse
```

`npm run check` is the gate. CI runs the same steps (job "Signature engine").
`npm run build` also puts the layer's test site into `dist/layer-fixture/`
(base, enhanced, calm), from the kept build in `layer-dist/`. To run tests
beside another checkout's server on 4317: `SG_PORT=4407 npx playwright test`.

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

### Film review

Stills show where motion ends; films show how it gets there. To judge
animation by films and numbers, after `npm run build`:

```bash
npm run film-review                          # every page, desktop and phone
FR_PAGES=/,/bibliotek/ npm run film-review   # some pages
```

Each page is opened on desktop (1440 × 900) and on a phone (Pixel 7) and
scrolled from top to bottom twice, each time from a fresh load with the
intro curtains skipped:

- **steady**: small wheel steps, 30 a second, at one screen a second;
- **stop and go**: a screen at that speed, a pause of 0.55 s, a quick flick
  a quarter of a screen back up, a pause of 0.4 s, and on. This is the pass
  that shows jank, pins that jump and things that snap.

The wheel events are sent as a hand sends them: on a clock, without waiting
for the page, and added together while three are still on their way, as the
browser coalesces a queue. (Playwright's `mouse.wheel` waits until the page
has handled each event, so a busy page got slower input: a scroll meant to
take 17 s took 48.) Before filming, the hand rests on the page and nudges it
1 px: in headless Chrome the first wheel event after a load cannot be
cancelled, so Lenis cannot smooth it and the page jumps natively (30 px on
desktop, 79 on a phone).

Both passes are filmed with Chrome's screencast at the rate the page draws,
then encoded to VP9 WebM in Chrome itself with WebCodecs and `webm-muxer`,
every frame at its own time, after filming is over, so encoding never costs
the page frames. Nothing is installed. Headless Chrome on a Mac draws WebGL
on the real graphics card, so no `?webgl` is needed and the films show what a
visitor on this machine sees; `FR_QUERY=?webgl` forces software WebGL where
there is no GPU, as in CI.

A run writes `review-films/<date>_<time>_<commit>/` (gitignored):

- `summary.md`: one table of every page, device and pass, written after
  every page, so a run that is stopped keeps what it has. Start here.
- `<page>/<device>-steady.webm` and `-stopgo.webm`: the films.
- `<page>/<device>-sheet.png`: 24 frames of the steady pass at even scroll
  positions, each labelled with its scroll position and its time in the
  film, under two graphs of frame times along the page (one per pass). In a
  graph every frame is a line at its scroll position as tall as it took:
  blue on time, amber for one dropped frame, red for two or more; red
  triangles mark visual jumps and numbered ticks mark the 24 frames. A
  label turns orange when a frame of 35 ms or more came on the way to it.
- `<page>/<device>-jumps.png`: every visual jump, the frame before and the
  frame of the jump, with the band that changed most outlined.
- `<page>/<device>.md`: the frame report.
- `report.json`: every number, with each frame's time and scroll position.

The frame report is measured in the page while it scrolls: every frame's
time (`requestAnimationFrame`) and scroll position; frames over 16.7 ms and
over 33 ms; the longest frames and where on the page they came; long tasks;
long animation frames, with how their time split between script, style and
layout, and the rest (paint, raster, the GPU, decoding), and the scripts in
them; layout shifts, with the elements that moved. Those are the shifts
Chrome counts in a visitor's CLS while they scroll (wheel and touch scrolling
are not input that excuses a shift), which Lighthouse never sees, since it
does not scroll. rAF times are rounded to 0.1 ms and fall on the screen's
60 Hz beat (16.7, 33.3, 50 ms), so a frame counts as over 16.7 ms from 18 ms
(one frame dropped) and over 33 ms from 35 ms (two or more). Every time is
also given as seconds into the film, to find the moment there.

Visual jumps come from the films. Each frame is compared with the one before
in bands across the screen, both as it was and as moved by the scroll; the
closer match counts, so content that scrolls, a pinned section and a fixed
header all count as unchanged. What is left is motion of the page's own, in
grey levels per 60 Hz frame. A reveal or a WebGL scene changes a little every
frame; a jump changes at least 4 grey levels and four times more than the
frames around it. Where the screencast missed frames, the change is shared
out over the frames it missed, so a gap in the film is not taken for a jump;
rows that scrolled in at the edge of the screen have nothing to be compared
with and are left out. A jump can still be a fast move that is meant (a film
that starts, a card that lands, a marquee that sets off); the jumps sheet
shows which.

Limits, measured on this checkout's lab:

- The screencast costs a few frames as it starts, so measuring begins 0.6 s
  after. With that, filming made no measurable difference: on the lab page,
  1 frame over 16.7 ms in about 360 with filming and 0 to 2 without, three
  runs each.
- The screencast keeps up with 50 to 60 frames a second on a quiet machine
  and fewer under load; the film then skips frames the page drew. The frame
  numbers come from the page, not from the film.
- Frame numbers are only as good as the machine is quiet. The 1-minute load
  average is noted when each page starts and when its filming ends; over 3,
  the reports, the sheets and the summary warn that the frame numbers are
  not trustworthy. `FR_WAIT=120` waits up to two
  minutes before each page for the load to fall under 3.
- One page, one device and one browser at a time, to keep the load down.
  A page took under a minute per device and the library, 17 000 px tall,
  about four, on a machine under some load; a heavily loaded one slows it
  many times over. The films of a run take about 100 MB.

Options (environment): `FR_PAGES` (paths, as `LH_PAGES`), `FR_DEVICES=phone`,
`FR_SPEED=1.5` (screens a second), `FR_QUERY=?webgl`, `FR_WAIT`,
`FR_KEEP_FRAMES=1` (also keeps every JPEG frame in `.frames/`) and `FR_PORT`.
Like the review, it uses a running preview server or starts one, and stops if
that server was started in another folder or serves files other than this
checkout's `dist/`; `FR_PORT=4367 npm run film-review` uses another port.

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

The image sequence (`lab/public/sekvens/`, copied as it is, so the module can
number its frames) is the same band again: 121 pictures from the eight loose
pieces to the whole band, drawn on the same tool page. The band's clock runs
over the last third of the film's loop (8 to 12 seconds, which is 0 again),
so it drifts and turns 120° as it gathers and its last picture is the film's
first. It is drawn at twice the master's size at the framing where the
loose pieces fit, and each picture is cut a little tighter than the last (a
slow push in, eased at both ends) to end at the film's framing; the
supersample keeps even the tightest cut sharp. The top and bottom edges fade
into the page's ink in the pictures themselves, so the stage meets the
section above and the footer below without a line, at no cost on the page.
The tool page draws each picture once as a lossless master (Chrome's WebP at
quality 1), at 2400 × 1350 and, for phones, 1080 × 2340, a phone's own shape,
so the band is never cut at the sides. The script then encodes them in Node
with sharp (libvips; Chrome's canvas cannot write AVIF):

| Set | Pictures | Size | Quality | Weight |
| --- | -------- | ---- | ------- | ------ |
| Wide, AVIF | 121 | 2400 × 1350 | 34, 4:4:4 | 1,144 KB |
| Wide, WebP | 61 (every second) | 1600 × 900 | 80 | 1,052 KB |
| Phone, AVIF | 121 | 1080 × 2340 | 22, 4:4:4 | 625 KB |
| Phone, WebP | 61 | 720 × 1560 | 66 | 582 KB |

A visitor fetches one of the four. The phone's AVIF is held at quality 22 by
its 640 KB limit (at 25 it was 652): edges are clean, but the satin's finest
brushed streaks are smoothed, more than on the wide set. About five minutes
for the masters and eight for the encoding on a quiet machine; the masters
stay in `node_modules/.cache/sekvens/` (about 400 MB), so another quality can
be tried without drawing again:

```bash
node scripts/render-sequence.mjs               # masters, then all four sets
ONLY=telefon node scripts/render-sequence.mjs  # just the phone's
MASTERS=keep node scripts/render-sequence.mjs  # encode again from the kept masters
FRAMES=0,60,120 OUT=/tmp/try node scripts/render-sequence.mjs  # a few pictures elsewhere, for trying settings
```

Client sites use the client's own pictures and footage, with written permission.

## The gate

| Check | Limit |
| ----- | ----- |
| Script for the first view | ≤ 15 KB compressed (now 6.0: the menu's 1.26, the call to action's 1.4 and the 0.15 they share included; the boot's lines for an image sequence, which load its chunk or, with Save-Data, turn it to its last frame, add 0.1) |
| Motion engine, loaded later | ≤ 60 KB (now 57.2) |
| WebGL shaders, loaded later | ≤ 10 KB (now 6.8, with the worker; a browser that draws on the main thread gets the same code for it instead, never both) |
| 3D band, only on pages with an object | ≤ 10 KB (now 7.3, counted the same way; was 137 with Three.js) |
| Sound, after load, only where used | ≤ 3 KB (now 1.1) |
| Video player, only where there is a film | ≤ 3 KB (now 0.9) |
| Signature layer, script for the first view of an enhanced site | ≤ 6 KB compressed (now 5.0: `layer.js` 4.3 and Website Factory's map in `site.js` 0.8) |
| Signature layer, CSS | ≤ 2.5 KB (now 1.5) |
| Signature layer, later and only where a page's map and preset use it | smooth scroll ≤ 6 KB (5.3), call to action ≤ 2 (1.4), count ≤ 1 (0.8), hover list with GSAP ≤ 50 (46.6, mouse only) |
| Image sequence, only where there is one | ≤ 3 KB (now 2.97, with the drawing between frames and the choice of format, so it is full: the module and its worker; where no worker can start, the module and the same loader on the main thread instead, never both) |
| Largest single picture | ≤ 100 KB (now 72); each comes in two sizes for `srcset` |
| Largest single film | ≤ 600 KB (now 555, the wide H.264); fetched only as it comes near, one per screen, never with Save-Data |
| Largest film in full HD, for screens 1280 px wide and up | ≤ 1.2 MB (now 1.1, the H.264; 912 KB as AV1) |
| Image sequence frames, all of one set | ≤ 1.2 MB wide and ≤ 640 KB for phones, each limit for the AVIF set and again for the WebP set, since a visitor fetches one (now 1.14 MB and 625 KB in AVIF: 121 pictures at 2400 × 1350 and 1080 × 2340; 1.05 MB and 582 KB in WebP: 61 at 1600 × 900 and 720 × 1560). The limits are those set for sixty WebP pictures; the built site stores both formats, 3.4 MB in all; one set per screen, fetched a screen ahead, never with Save-Data |
| CSS / HTML / fonts | ≤ 15 / 10 / 140 KB (now 14.5 / 6.6 / 121, fonts all three faces; the stack and the call to action added 0.9 KB of CSS and the image sequence 0.3 (its canvas is styled by its own script, so it costs no CSS), so CSS is the tightest budget now) |
| Lighthouse, simulated phone, median of 3 | performance ≥ 95, accessibility 100, best practices ≥ 95, SEO ≥ 90 (the 404 page: SEO without indexability, and it must say noindex) |
| axe (WCAG 2.2 AA) | no violations, with and without motion |
| Tests | content without JavaScript, nothing moving with reduced motion, still field without WebGL, no sideways scroll on a phone, no console errors, the menu's keyboard path (focus in, round, Esc, focus back), leaving through the menu and coming Back; films: native controls without JavaScript, no autoplay and a keyboard button with reduced motion, playing only while seen, nothing fetched with Save-Data; the stack and the call to action (`tests/stack-cta.spec.ts`): a plain list and a plain link without JavaScript, cards that stick, overlap and settle back (judged on frames recorded in the page) and a deck that leaves as one, a picture that settles and a number that rises inside each card as it comes up, no scale, shade, glide or slide with reduced motion, the pill out past the first screen, away reading down, back reading up, away at a footer, out to meet its place and gliding into it and back out (judged on frames), no layout shift, keyboard focus never covered by a later card or the pill (tabbing down, and back up into a full deck), axe with and without motion; the image sequence (`tests/sequence.spec.ts`): the last frame as a plain picture at its own size without JavaScript, with reduced motion (also turned off and on again while there) and with Save-Data (no chunk), only that picture fetched; with motion nothing fetched at the top of the page, every fourth frame first and one set for the screen, in AVIF, the stage held while the drawn frame follows the scroll down and back up, one way each, with no step larger than the scroll between two painted frames (judged on frames recorded in the page), the last frame holding for the final stretch, the first frame drawn identical to the poster, the nearest frame on the way holding, whole, while others are slow, the canvas between two frames showing both mixed by the scroll's share (compared with the two files drawn again) and a slow scroll moving the picture with almost every step, the WebP set running the same movement where AVIF cannot be decoded (61 pictures, one AVIF tried, the counter still to 121), frames fetched and decoded in a worker and by the page where no worker starts, the words (one whole, the other two hidden, on every frame painted at rest inside each part, reading down and back up; rolling only on their 0.6 s transform transition; no flicker either side of a threshold), no layout shift, Page Down through it to the footer and focus never covered, no sideways scroll, axe with and without motion |

Measured 2026-11-27 with the menu, the reveal list and the worker together,
median of three runs, each started at a 1-minute load under 3: the library and
the dark showcase 100, the lab and the warm showcase 99; accessibility, best
practices and SEO 100 everywhere (the 404 page is kept out of search by
design). The lab's first run in a fresh browser used to be slower (TBT up to
160 ms). The cause was not the silk shader's compile, which already ran in the
background, but creating the first WebGL context: 70 to 210 ms of blocked main
thread under Lighthouse. It now happens in a worker, and the first run scores
like the rest (TBT 0 in six of six). With the film added to the library (its
twelve-second loop and the full HD source), the library and the lab were
measured again, each run started at a 1-minute load under 3: the library 100
(99, 100, 100; largest content 1.0 s, layout shift 0.003) and the lab 99 (99,
99, 99; 0.8 s, 0); the other pages were not measured again with the film.
With the stack and the call to action added to the library, the same two
were measured again, each started at a 1-minute load under 3 (2.93 and
2.8): the library 100 (100, 100, 100; largest content 1.0 s, blocking 0 ms,
layout shift 0.003) and the lab 99 (99, 99, 99; 0.8 s, 0 ms, 0); the other
pages were not measured again. With the shaded, moving cards and the gliding
pill: the library 100 (100, 100, 100; 1.1 s, 0 ms, 0.003; started at a
1-minute load of 3.6) and the lab 99 (99, 99, 99; 0.8 s, 0 ms, 0; started
under 3). The library was not measured again with the image sequence: the
machine's 1-minute load stayed between 30 and 480 the whole day it was built,
far from the 3 these figures were taken under. Its frames and chunk load only
a screen ahead of section 13, the last on the page, so the first view is
unchanged but for 0.1 KB of boot script.
Largest content within 0.8–1.0 s on every page but the warm showcase (about
2 s, its hero picture on a phone); layout shift 0 to 0.003. 234 tests pass
on desktop and phone (12 are skipped: desktop-only, phone-only, run once by
design, or needing a software renderer, as CI has); the stack and the call
to action have 23 of them, the image sequence 32; the film's 18 include
Save-Data, and so do the sequence's, emulated by sending the `Save-Data` header and setting
`navigator.connection.saveData`, which is what the engine reads, since
Playwright cannot turn on Chrome's data saver. The 3D band went from 137 KB
(Three.js) to about 6 KB compressed, with the same picture.

## Licences

- **GSAP** (with ScrollTrigger and SplitText): Webflow's standard "no charge"
  licence. Allowed on any website. **Not allowed** in a tool that lets people
  build visual animations without code in competition with Webflow, so never
  put GSAP behind a no-code animation builder in Studio OS.
- **Lenis**: MIT.
- **sharp** 0.35.5 (with its prebuilt libvips): Apache-2.0. A dev dependency
  for `scripts/render-sequence.mjs` only, to encode AVIF; nothing of it
  reaches a visitor.
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
