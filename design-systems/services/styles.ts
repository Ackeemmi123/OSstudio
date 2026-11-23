/**
 * The services design system's styles. Palettes and directions are a controlled
 * range: a site picks one of each and cannot supply its own values. Directions
 * change type, proportion and how sections are composed, not only colour.
 */
const FONTS = `
@font-face{font-family:"Fraunces";src:url(fonts/fraunces-display-normal.woff2) format("woff2");font-weight:300 500;font-style:normal;font-display:swap}
@font-face{font-family:"Fraunces";src:url(fonts/fraunces-display-italic.woff2) format("woff2");font-weight:300 500;font-style:italic;font-display:swap}
@font-face{font-family:"Instrument Sans";src:url(fonts/instrument-sans-latin-wght-normal.woff2) format("woff2");font-weight:400 700;font-style:normal;font-display:swap}
@font-face{font-family:"Bodoni Moda";src:url(fonts/bodoni-moda-latin-wght-normal.woff2) format("woff2");font-weight:400 900;font-style:normal;font-display:swap}
@font-face{font-family:"Bodoni Moda";src:url(fonts/bodoni-moda-latin-wght-italic.woff2) format("woff2");font-weight:400 900;font-style:italic;font-display:swap}
@font-face{font-family:"Hanken Grotesk";src:url(fonts/hanken-grotesk-latin-wght-normal.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"Big Shoulders Display";src:url(fonts/big-shoulders-display-latin-wght-normal.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:"Archivo";src:url(fonts/archivo-latin-wdth-normal.woff2) format("woff2");font-weight:100 900;font-stretch:62% 125%;font-style:normal;font-display:swap}
@font-face{font-family:"Young Serif";src:url(fonts/young-serif-latin-normal.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Figtree";src:url(fonts/figtree-latin-wght-normal.woff2) format("woff2");font-weight:300 900;font-style:normal;font-display:swap}
@font-face{font-family:"Cormorant Garamond";src:url(fonts/cormorant-garamond-latin-wght-normal.woff2) format("woff2");font-weight:300 700;font-style:normal;font-display:swap}
@font-face{font-family:"Cormorant Garamond";src:url(fonts/cormorant-garamond-latin-wght-italic.woff2) format("woff2");font-weight:300 700;font-style:italic;font-display:swap}
@font-face{font-family:"Work Sans";src:url(fonts/work-sans-latin-wght-normal.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
`;

const PALETTES = `
.p-pine{--paper:#f4efe4;--paper-2:#e8e0cf;--ink:#16291f;--mute:#4c574d;--line:#14281f33;--deep:#17352c;--deep-2:#122a23;--on-deep:#f4f0e6;--on-deep-mute:#cfd3c5;--on-deep-line:#ffffff38;--accent:#8a5018;--accent-on-deep:#e2b27c;--action:#17352c;--on-action:#f4f0e6}
.p-oxblood{--paper:#f4ece1;--paper-2:#e9dece;--ink:#26171a;--mute:#5d4b48;--line:#26171a;--deep:#4b1a22;--deep-2:#3a1219;--on-deep:#f4ece1;--on-deep-mute:#e4d2cb;--on-deep-line:#ffffff3d;--accent:#7f2733;--accent-on-deep:#f0c8ad;--action:#4b1a22;--on-action:#ffffff;--ring:#f0c8ad33}
.p-signal{--paper:#f6f5ee;--paper-2:#e9e8de;--ink:#0f1112;--mute:#4b4e4c;--line:#0f111240;--deep:#0f1112;--deep-2:#1b1e20;--on-deep:#f6f5ee;--on-deep-mute:#c9cbc4;--on-deep-line:#ffffff40;--accent:#46540a;--accent-on-deep:#bbdd4b;--signal:#bbdd4b;--action:#bbdd4b;--on-action:#0f1112}
.p-harbor{--paper:#f5f1ea;--paper-2:#e8e1d4;--ink:#0e2a2e;--mute:#48585a;--line:#0e2a2e40;--deep:#0e2a2e;--deep-2:#15383d;--on-deep:#f5f1ea;--on-deep-mute:#c4cfcd;--on-deep-line:#ffffff40;--accent:#9c3d14;--accent-on-deep:#ff9d6e;--signal:#ff9d6e;--action:#ff9d6e;--on-action:#0e2a2e}
.p-dry{--paper:#f7f5ef;--paper-2:#e9e6dc;--ink:#101a2b;--mute:#4a5361;--line:#101a2b40;--deep:#101a2b;--deep-2:#1a2840;--on-deep:#f7f5ef;--on-deep-mute:#c6ccd6;--on-deep-line:#ffffff40;--accent:#0b5a8a;--accent-on-deep:#8ed0f5;--signal:#8ed0f5;--action:#8ed0f5;--on-action:#101a2b}
.p-measure{--paper:#f2f4f3;--paper-2:#e2e7e5;--ink:#11181c;--mute:#48545a;--line:#11181c40;--deep:#11181c;--deep-2:#1c262c;--on-deep:#f2f4f3;--on-deep-mute:#c5cdcf;--on-deep-line:#ffffff40;--accent:#0b6b60;--accent-on-deep:#5eead4;--signal:#5eead4;--action:#5eead4;--on-action:#11181c}
.p-brick{--paper:#f5eee6;--paper-2:#eadfd2;--ink:#2a1712;--mute:#5f4a42;--line:#2a1712;--deep:#6e2b1c;--deep-2:#4f1e13;--on-deep:#f7efe7;--on-deep-mute:#ecd8cc;--on-deep-line:#ffffff3d;--accent:#8f3a25;--accent-on-deep:#f3c9a8;--action:#6e2b1c;--on-action:#ffffff;--ring:#f3c9a833}
.p-verdigris{--paper:#f2f0e8;--paper-2:#e2e3d6;--ink:#15302c;--mute:#48594f;--line:#15302c33;--deep:#1d4a43;--deep-2:#163a35;--on-deep:#f2f0e8;--on-deep-mute:#cfdcd3;--on-deep-line:#ffffff38;--accent:#8a4a1f;--accent-on-deep:#e6a877;--action:#1d4a43;--on-action:#f2f0e8}
.p-ember{--paper:#f7f3e8;--paper-2:#ece6d4;--ink:#1a1210;--mute:#544a42;--line:#1a121040;--deep:#7a1616;--deep-2:#5c0f0f;--on-deep:#fbf6e9;--on-deep-mute:#f0d9c9;--on-deep-line:#ffffff40;--accent:#8a5a00;--accent-on-deep:#ffd21f;--signal:#ffd21f;--action:#ffd21f;--on-action:#1a1210}
.p-cobalt{--paper:#f4f7fa;--paper-2:#e2eaf2;--ink:#0a2240;--mute:#47566a;--line:#0a224040;--deep:#0a3a78;--deep-2:#082c5c;--on-deep:#f4f7fa;--on-deep-mute:#cfdcec;--on-deep-line:#ffffff40;--accent:#0a5ea8;--accent-on-deep:#9fd6ff;--signal:#9fd6ff;--action:#9fd6ff;--on-action:#0a2240}
.p-gold{--paper:#f5f1e6;--paper-2:#e9e2cf;--ink:#16130c;--mute:#544e40;--line:#16130c40;--deep:#16130c;--deep-2:#242016;--on-deep:#f5f1e6;--on-deep-mute:#d2ccba;--on-deep-line:#ffffff40;--accent:#7d5f12;--accent-on-deep:#dcb85c;--signal:#dcb85c;--action:#dcb85c;--on-action:#16130c}
.p-navy{--paper:#f3f4f6;--paper-2:#e3e6ec;--ink:#121d33;--mute:#4a5468;--line:#121d33;--deep:#16325c;--deep-2:#0f2444;--on-deep:#f3f4f6;--on-deep-mute:#cbd5e4;--on-deep-line:#ffffff3d;--accent:#1f4f8f;--accent-on-deep:#f2c98a;--action:#16325c;--on-action:#ffffff;--ring:#f2c98a33}
.p-timber{--paper:#f6efe2;--paper-2:#eadfca;--ink:#2b2013;--mute:#5a4d3b;--line:#2b201333;--deep:#3d4a2a;--deep-2:#2e3a1f;--on-deep:#f6efe2;--on-deep-mute:#d9dcc6;--on-deep-line:#ffffff38;--accent:#8c5414;--accent-on-deep:#e6b774;--action:#3d4a2a;--on-action:#f6efe2}
.p-plum{--paper:#f7f1ee;--paper-2:#ecdfdb;--ink:#2a1424;--mute:#5d4a55;--line:#2a142440;--deep:#3b1730;--deep-2:#2c1024;--on-deep:#f7f1ee;--on-deep-mute:#dcc9d2;--on-deep-line:#ffffff40;--accent:#8a2f5e;--accent-on-deep:#f4a9c0;--signal:#f4a9c0;--action:#f4a9c0;--on-action:#2a1424;}
.p-hazard{--paper:#f5f4ef;--paper-2:#e8e6dc;--ink:#111111;--mute:#4d4d48;--line:#11111140;--deep:#111111;--deep-2:#222222;--on-deep:#f5f4ef;--on-deep-mute:#c9c8c0;--on-deep-line:#ffffff40;--accent:#6e5a00;--accent-on-deep:#ffcc00;--signal:#ffcc00;--action:#ffcc00;--on-action:#111111;}
.p-slate{--paper:#f1f2f1;--paper-2:#e0e3e3;--ink:#1c2a33;--mute:#4e5a60;--line:#1c2a3340;--deep:#2f4552;--deep-2:#233540;--on-deep:#f1f2f1;--on-deep-mute:#cdd7da;--on-deep-line:#ffffff40;--accent:#8a4b2c;--accent-on-deep:#e8b89a;--action:#2f4552;--on-action:#f1f2f1;}
.p-forest{--paper:#f4f2ea;--paper-2:#e6e3d4;--ink:#16261c;--mute:#4c584e;--line:#16261c40;--deep:#1f3a2a;--deep-2:#16291e;--on-deep:#f4f2ea;--on-deep-mute:#ccd6ca;--on-deep-line:#ffffff40;--accent:#7a5c14;--accent-on-deep:#e0c27a;--action:#1f3a2a;--on-action:#ffffff;--ring:#e0c27a33;}
.p-indigo{--paper:#f4f4fa;--paper-2:#e4e4f2;--ink:#1a1a4b;--mute:#4e4e6e;--line:#1a1a4b40;--deep:#23236e;--deep-2:#1a1a52;--on-deep:#f4f4fa;--on-deep-mute:#d0d0ec;--on-deep-line:#ffffff40;--accent:#a14d00;--accent-on-deep:#ffb25e;--signal:#ffb25e;--action:#ffb25e;--on-action:#1a1a4b;}
.p-steel{--paper:#f2f3f3;--paper-2:#e2e5e6;--ink:#16191c;--mute:#4b5156;--line:#16191c40;--deep:#2b3137;--deep-2:#1f2429;--on-deep:#f2f3f3;--on-deep-mute:#c8ced3;--on-deep-line:#ffffff40;--accent:#3f6212;--accent-on-deep:#c5e86c;--signal:#c5e86c;--action:#c5e86c;--on-action:#16191c;}
.p-terracotta{--paper:#f8f1ea;--paper-2:#efe1d4;--ink:#2c1a13;--mute:#5f4c42;--line:#2c1a1340;--deep:#a0432a;--deep-2:#83331e;--on-deep:#fff6ee;--on-deep-mute:#f5dccd;--on-deep-line:#ffffff40;--accent:#a0432a;--accent-on-deep:#ffd0b0;--action:#a0432a;--on-action:#ffffff;}
.p-teal{--paper:#f0f6f5;--paper-2:#dcebe8;--ink:#06302e;--mute:#42605d;--line:#06302e40;--deep:#06403c;--deep-2:#052f2c;--on-deep:#f0f6f5;--on-deep-mute:#c1dad6;--on-deep-line:#ffffff40;--accent:#0a6b63;--accent-on-deep:#7ff0dd;--signal:#7ff0dd;--action:#7ff0dd;--on-action:#06302e;}
.p-ochre{--paper:#f8f3e6;--paper-2:#efe6cf;--ink:#2a2110;--mute:#5c5238;--line:#2a211040;--deep:#6b4e12;--deep-2:#523b0c;--on-deep:#fbf6e6;--on-deep-mute:#ecdfbe;--on-deep-line:#ffffff40;--accent:#7a5a12;--accent-on-deep:#f0cf7a;--action:#6b4e12;--on-action:#ffffff;--ring:#f0cf7a33;}
`;

const DIRECTIONS = `
.d-editorial{--gut:clamp(1.25rem,4vw,4rem);--body:"Instrument Sans",system-ui,sans-serif;--display:"Fraunces",Georgia,serif;--display-weight:300;--display-track:-.018em;--display-lead:1.02;--h1-1:clamp(3.1rem,7.1vw,8rem);--h1-2:clamp(2.7rem,5.6vw,6.4rem);--h1-3:clamp(2.2rem,4.4vw,5rem);--h2:clamp(2.3rem,4.6vw,5rem);--h3:clamp(1.9rem,3.6vw,3.8rem);--h3-weight:300;--radius:999px}
.d-formal{--gut:clamp(1.25rem,4vw,4rem);--body:"Hanken Grotesk",system-ui,sans-serif;--display:"Bodoni Moda",Didot,serif;--display-weight:400;--display-track:-.012em;--display-lead:1.03;--h1-1:clamp(2.7rem,5.6vw,7rem);--h1-2:clamp(2.35rem,4.5vw,5.6rem);--h1-3:clamp(2rem,3.6vw,4.4rem);--h2:clamp(2.1rem,4.4vw,4.8rem);--h3:clamp(1.95rem,5.5vw,6.6rem);--h3-weight:400;--radius:0}
.d-statement{--gut:clamp(16px,3vw,48px);--display:"Big Shoulders Display",Impact,sans-serif;--display-weight:900;--display-track:-.005em;--display-lead:.98;--h1-1:clamp(3.2rem,11vw,13rem);--h1-2:clamp(2.8rem,8vw,9.5rem);--h1-3:clamp(2.1rem,5.6vw,6.5rem);--h2:clamp(3rem,8.6vw,10.5rem);--h3:clamp(2.3rem,4.2vw,5rem);--h3-weight:900;--radius:0;--body:"Archivo",system-ui,sans-serif}
.d-cafe{--gut:clamp(1.25rem,4vw,4rem);--body:"Figtree",system-ui,sans-serif;--display:"Young Serif",Georgia,serif;--display-weight:400;--display-track:-.015em;--display-lead:1.06;--h1-1:clamp(2.6rem,5.2vw,4.9rem);--h1-2:clamp(2.3rem,4.4vw,4.1rem);--h1-3:clamp(2rem,3.6vw,3.4rem);--h2:clamp(2rem,3.6vw,3.3rem);--h3:clamp(1.3rem,2vw,1.6rem);--h3-weight:400;--radius:999px}
.d-atelier{--gut:clamp(1.25rem,4.5vw,4.5rem);--body:"Work Sans",system-ui,sans-serif;--display:"Cormorant Garamond",Garamond,serif;--display-weight:300;--display-track:-.02em;--display-lead:1.0;--h1-1:clamp(3rem,7vw,6.6rem);--h1-2:clamp(2.6rem,5.6vw,5.4rem);--h1-3:clamp(2.2rem,4.4vw,4.4rem);--h2:clamp(2.2rem,4vw,3.6rem);--h3:clamp(1.15rem,1.6vw,1.3rem);--h3-weight:400;--radius:0}
`;

const BASE = `
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 1.0625rem/1.55 var(--body);-webkit-font-smoothing:antialiased;--gut:clamp(20px,4.4vw,72px);overflow-wrap:break-word}
img{display:block;width:100%;height:auto;object-fit:cover}
a{color:inherit;text-underline-offset:.2em}
h1,h2,h3,p,ul,ol,figure,blockquote{margin:0;padding:0}
ul,ol{list-style:none}
h1,h2{font-family:var(--display);font-weight:var(--display-weight);letter-spacing:var(--display-track);line-height:var(--display-lead);hyphens:auto;hyphenate-limit-chars:14 6 6;text-wrap:balance}
h2{font-size:var(--h2);line-height:calc(var(--display-lead) + .06)}
h3{font-family:var(--display);font-size:var(--h3);font-weight:var(--h3-weight);line-height:1.12;letter-spacing:calc(var(--display-track) / 3);hyphens:auto;hyphenate-limit-chars:14 6 6}
@media (min-width:821px){h1 .turn{white-space:nowrap}}
[data-tier="1"] h1,h1{font-size:var(--h1-1)}
[data-tier="2"] h1{font-size:var(--h1-2)}
[data-tier="3"] h1{font-size:var(--h1-3)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:8px;top:8px;background:#fff;color:#111;padding:.6rem .9rem;z-index:10}
.test-note{background:var(--ink);color:var(--paper);font-size:.78rem;padding:.4rem var(--gut)}
.label{font-size:.875rem;font-family:var(--body);font-weight:400;letter-spacing:0;line-height:1.4;color:var(--mute)}
.button{display:inline-block;background:var(--action);color:var(--on-action);padding:1.05rem 1.6rem;text-decoration:none;font:500 1rem/1.2 var(--body);border:0;border-radius:var(--radius);cursor:pointer;transition:background-color .15s,color .15s}
.button:hover{background:var(--accent);color:#fff}
.button--small{padding:.72rem 1.05rem;font-size:.92rem}
.link-action{font-weight:500}
.site-header{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding:1.4rem var(--gut)}
.mark{font:400 1.45rem/1.1 var(--display);letter-spacing:-.01em;text-decoration:none}
.menu-wide{display:flex;align-items:center;gap:2.25rem;font-size:.95rem}
.menu-wide ul{display:flex;gap:2rem}
.menu-wide ul a{text-decoration:none}.menu-wide ul a:hover,.menu-wide ul a[aria-current]{text-decoration:underline}
.menu-narrow{display:none;position:relative}
.menu-narrow summary{list-style:none;cursor:pointer;padding:.6rem .95rem;border:1px solid currentColor;border-radius:var(--radius);font-size:.95rem;min-height:44px;display:flex;align-items:center}
.menu-narrow summary::-webkit-details-marker{display:none}
.menu-narrow nav{position:absolute;right:0;top:calc(100% + .5rem);z-index:5;width:min(78vw,300px);background:var(--paper);border:1px solid var(--ink);padding:.5rem 1.25rem 1.25rem}
.menu-narrow li a{display:block;padding:.75rem 0;text-decoration:none;border-bottom:1px solid var(--line)}
.menu-narrow .button{margin-top:1rem;display:block;text-align:center}

.services,.steps-section,.proof,.questions{padding:clamp(5rem,10vw,10rem) var(--gut) 0}
.section-head{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;margin-bottom:clamp(2.5rem,5vw,4.5rem)}
.section-head .label{grid-column:1/4;padding-top:.7rem}
.section-head h2{grid-column:4/12;scroll-margin-top:2rem}
.ledger{border-top:2px solid var(--ink)}
.ledger-row{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:2rem 0;border-bottom:1px solid var(--line);align-items:baseline}
.ledger-row h3{grid-column:1/5}
.ledger-row p{grid-column:5/10}
.ledger-row .price{grid-column:10/13;text-align:right;font-size:1.05rem;font-weight:500}
.services--one .ledger-row h3{grid-column:1/13;font-size:var(--h2);margin-bottom:1.5rem}
.services--one .ledger-row p{grid-column:4/10;font-size:1.2rem}

.steps{display:grid;grid-template-columns:repeat(var(--count,4),minmax(0,1fr));gap:24px;background:var(--paper-2);margin:0 calc(var(--gut) * -1);padding:clamp(3rem,6vw,5rem) var(--gut);counter-reset:step}
.steps[data-count="2"]{--count:2}.steps[data-count="3"]{--count:3}
.steps li{counter-increment:step}
.steps li:nth-child(2){margin-top:3rem}.steps li:nth-child(3){margin-top:6rem}.steps li:nth-child(4){margin-top:9rem}
.steps li::before{content:counter(step);display:block;font:300 3.4rem/1 var(--display);color:var(--accent)}
.steps h3{margin:.8rem 0 .4rem;font:600 1.05rem/1.3 var(--body);letter-spacing:0}
.steps p{font-size:1rem}

.proof{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;align-items:end}
.proof-image{grid-column:1/6}.proof-image img{aspect-ratio:5/4}
.proof-words{grid-column:7/13}
.proof:not(.proof--image) .proof-words{grid-column:4/12}
.quote blockquote{font:300 clamp(1.7rem,3vw,2.8rem)/1.15 var(--display);letter-spacing:-.015em}
.quote figcaption{margin-top:1rem;font-size:.95rem;color:var(--mute)}
.quote + .quote{margin-top:2.5rem}
.credentials{margin-top:2rem;font-size:.95rem;color:var(--mute);display:flex;flex-wrap:wrap;gap:.35rem 2rem}
.proof--credentials .credentials{margin-top:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:1.25rem 0;color:var(--ink)}

.question-list{margin-left:calc((100% + 24px) / 12 * 3)}
.question-list details{border-top:1px solid var(--line);padding:1.3rem 0}
.question-list details:last-child{border-bottom:1px solid var(--line)}
.question-list summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:1.5rem;font:400 clamp(1.2rem,1.8vw,1.55rem)/1.2 var(--display)}
.question-list summary::-webkit-details-marker{display:none}
.question-list summary::after{content:"+";flex:none;color:var(--accent)}
.question-list details[open] summary::after{content:"\\2212"}
.question-list details p{margin-top:.8rem;max-width:42rem}

.closing{margin-top:clamp(5rem,10vw,10rem);background:var(--deep);color:var(--on-deep);display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(4rem,8vw,8rem) var(--gut)}
.closing-words{grid-column:1/7;display:flex;flex-direction:column;align-items:flex-start}
.closing-details{margin-top:auto;padding-top:2.5rem;font-size:1.05rem}
.closing-details p + p{margin-top:.2rem}
.closing-words h2{scroll-margin-top:2rem}
.closing-words h2:focus{outline:0}
.closing-words p{margin-top:1.5rem;color:var(--on-deep-mute);max-width:26rem}
.closing .form{grid-column:8/13}
.closing .field input,.closing .field textarea{border-bottom-color:#ffffffa0;color:var(--on-deep)}
.closing .consent,.closing .next{color:var(--on-deep-mute)}
.closing .button--send{background:var(--on-deep);color:var(--deep)}
.closing .button--send:hover{background:var(--accent-on-deep);color:#111}
.closing :focus-visible{outline-color:var(--accent-on-deep)}

.field{margin-bottom:1.3rem}
.field label{display:block;font-size:.9rem}
.field input,.field textarea{display:block;width:100%;margin-top:.3rem;background:transparent;border:0;border-bottom:1px solid var(--ink);border-radius:0;color:inherit;font:inherit;padding:.55rem 0;min-height:44px}
.call-bar{display:none}
.trap{position:absolute;left:-9999px;height:1px;overflow:hidden}
.consent{font-size:.84rem;color:var(--mute);margin-bottom:1.2rem}
.next{font-size:.88rem;color:var(--mute);margin-top:.9rem}

.page-intro{padding:clamp(2rem,5vw,4.5rem) var(--gut) clamp(2.5rem,5vw,4.5rem);display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px}
.page-intro .label{grid-column:1/-1;margin-bottom:1.1rem}
.page-intro h1{grid-column:1/11}
.page-lead{font-size:clamp(1.15rem,1.7vw,1.4rem);line-height:1.42}
.page-intro .page-lead{grid-column:4/10;margin-top:2.25rem}
.wide-image img{aspect-ratio:2/1}
.story{padding:clamp(3.5rem,7vw,7rem) var(--gut) 0;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;row-gap:1.5rem}
.page-intro + .story{padding-top:0}
.story p{grid-column:4/10;font-size:clamp(1.05rem,1.3vw,1.18rem);line-height:1.6}
.people{padding:clamp(4rem,8vw,8rem) var(--gut) 0}
.people > .label{margin-bottom:1.5rem;font-size:.875rem;letter-spacing:0;line-height:1.4;font-weight:400;hyphens:none}
.people-list{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;align-items:end}
.person{grid-column:span 5}.person img{aspect-ratio:4/5;margin-bottom:1rem}
.person--no-photo{grid-column:span 4;border-top:1px solid var(--ink);padding-top:1rem}
.person p{color:var(--mute);font-size:.95rem;margin-top:.25rem}
.end-action{padding:clamp(4rem,8vw,8rem) var(--gut);display:flex;flex-wrap:wrap;gap:2rem;align-items:end;justify-content:space-between}
.end-action h2{max-width:18ch}
.contact-page{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(2rem,5vw,4.5rem) var(--gut) clamp(5rem,9vw,9rem)}
.contact-words{grid-column:1/7}
.contact-words .page-lead{margin:2rem 0}
.contact-page .form{grid-column:8/13;padding-top:.75rem}
.contact-details{margin-top:clamp(2.5rem,5vw,4.5rem);border-top:1px solid var(--line);padding-top:1rem;font-size:.97rem}
.contact-details .label{margin-bottom:.75rem;font-size:.875rem;line-height:1.4;letter-spacing:0;hyphens:none}
.plain-page{padding:clamp(2rem,5vw,4.5rem) var(--gut) clamp(5rem,9vw,9rem);max-width:60rem}
.plain-page h1{font-size:var(--h2);margin-bottom:2.5rem}
.plain-page p{max-width:40rem;margin-bottom:1.1rem}
.plain-page--missing .button{margin-top:1rem}

.site-footer{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;row-gap:1.5rem;padding:clamp(3rem,5vw,4.5rem) var(--gut) 2rem;font-size:.92rem;border-top:1px solid var(--line)}
.footer-mark{grid-column:1/5;font:400 1.45rem/1.1 var(--display);letter-spacing:var(--display-track)}
.footer-details{grid-column:5/10}.footer-details p + p{margin-top:.2rem}
.site-footer nav{grid-column:10/13}.site-footer nav li + li{margin-top:.2rem}
.footer-legal{grid-column:1/-1;color:var(--mute);font-size:.84rem}
.site-footer a[aria-current]{font-weight:600}

@media (max-width:980px){
 .menu-wide{display:none}.menu-narrow{display:block}
}
@media (max-width:820px){
 .section-head{row-gap:.5rem}
 .section-head .label,.section-head h2{grid-column:1/-1}.section-head .label{padding:0}
 .ledger-row{row-gap:.5rem}
 .ledger-row h3,.ledger-row p,.ledger-row .price,.services--one .ledger-row p{grid-column:1/-1;text-align:left}
 .steps,.steps[data-count]{grid-template-columns:1fr}
 .steps li:nth-child(n){margin-top:0;display:grid;grid-template-columns:4rem minmax(0,1fr)}
 .steps li::before{grid-row:1/3;font-size:2.6rem}
 .steps h3{margin-top:.2rem}
 .proof-image,.proof-words,.proof:not(.proof--image) .proof-words{grid-column:1/-1}
 .proof-image{margin-bottom:1.5rem}
 .question-list{margin-left:0}
 .closing-words,.closing .form{grid-column:1/-1}
 .closing .form{margin-top:2.5rem}
 .page-intro h1,.page-intro .page-lead,.story p{grid-column:1/-1}
 .wide-image img{aspect-ratio:4/3}
 .person,.person--no-photo{grid-column:1/-1}
 .contact-words,.contact-page .form{grid-column:1/-1}
 .contact-page .form{margin-top:3rem}
 .footer-mark,.footer-details,.site-footer nav{grid-column:1/-1}
 .has-call-bar{padding-bottom:4.5rem}
 .call-bar{display:block;position:fixed;left:0;right:0;bottom:0;z-index:6;background:var(--action);color:var(--on-action);padding:1.05rem var(--gut);text-align:center;font-weight:700;text-decoration:none;min-height:3.5rem}
}


/* Editorial: a monthly journal. Warm paper, a soft serif with a voice, and pictures that cross from one section into the next. */
.d-editorial::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:50;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .3 0 0 0 0 .2 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E")}
.d-editorial{overflow-x:clip}
.d-editorial em{font-style:italic}
.d-editorial .label{font-size:.82rem;letter-spacing:.09em;text-transform:uppercase}
.d-editorial .site-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:1rem var(--gut);border-bottom:1px solid var(--line)}
.d-editorial .mark{grid-column:2;grid-row:1;font-size:clamp(1.25rem,2vw,1.7rem);text-align:center}
.d-editorial .menu-wide{display:contents}
.d-editorial .menu-wide ul{grid-column:1;grid-row:1}
.d-editorial .menu-wide .button{grid-column:3;grid-row:1;justify-self:end}
.d-editorial .menu-narrow{grid-column:3;grid-row:1;justify-self:end;display:none}
.d-editorial a:not(.button,.mark){text-decoration:none;background:linear-gradient(currentColor,currentColor) 0 100%/100% 1px no-repeat;padding-bottom:1px;transition:background-size .45s cubic-bezier(.2,.7,.2,1)}
.d-editorial .menu-wide ul a,.d-editorial .menu-narrow li a{background-size:0 1px}
.d-editorial .button{position:relative;overflow:hidden;isolation:isolate;transition:color .35s}
.d-editorial .button::before{content:"";position:absolute;inset:0;background:var(--accent);transform:translateY(101%);transition:transform .45s cubic-bezier(.2,.7,.2,1);z-index:-1;border-radius:inherit}
.d-editorial .button:hover{background:var(--action);color:var(--on-action)}
@media (hover:hover){
 .d-editorial .button:hover::before{transform:none}
 .d-editorial .button:hover{color:#fff}
 .d-editorial .menu-wide ul a:hover{background-size:100% 1px;text-decoration:none}
}
.d-editorial .hero{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(2rem,4.5vw,4.5rem) 0 0 var(--gut)}
.d-editorial .hero-for{grid-column:1/8;grid-row:1;margin-bottom:1.3rem}
.d-editorial .hero h1{grid-column:1/8;grid-row:2;position:relative;z-index:2;text-wrap:wrap}
@media (min-width:821px){.d-editorial h1 .turn{display:block}}
.d-editorial .hero-body{grid-column:1/6;grid-row:3;margin-top:clamp(2rem,4vw,3.5rem)}
.d-editorial .hero-why{font-size:1.2rem;line-height:1.5;max-width:30rem}
.d-editorial .hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:1.1rem 1.6rem;margin-top:2rem}
.d-editorial .hero-reassurance{margin-top:1rem;font-size:.95rem;color:var(--mute);max-width:30rem}
.d-editorial .hero-image{grid-column:8/13;grid-row:1/5;position:relative;margin-top:-1rem}
.d-editorial .frame{overflow:hidden}
.d-editorial .frame img{aspect-ratio:4/4.5;object-position:50% 16%}
.d-editorial .hero-image figcaption{padding:.6rem var(--gut) 0 0;font-size:.9rem;color:var(--mute);text-align:right}
.d-editorial .hero-note{position:absolute;left:clamp(-9rem,-9vw,-3rem);bottom:12%;width:clamp(13rem,20vw,19rem);background:#fbf7ee;padding:1.1rem 1.25rem;font:400 1.1rem/1.35 var(--display);rotate:-1.6deg;box-shadow:0 1px 1px #1d1a1020,0 14px 30px -12px #1d1a1050;z-index:3}
.d-editorial .hero--type{padding-right:var(--gut)}
.d-editorial .hero--type h1,.d-editorial .hero--type .hero-for{grid-column:1/-1}
.d-editorial .hero--type h1{font-size:clamp(2.9rem,7.6vw,9rem)}
.d-editorial .hero--type .hero-body{grid-column:1/8}
.d-editorial .reasons{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(4.5rem,10vw,10rem) var(--gut) 0}
.d-editorial .reasons h2{grid-column:1/6;position:sticky;top:2.5rem;align-self:start}
.d-editorial .reason-list{grid-column:7/13}
.d-editorial .reason-list li{font:300 clamp(1.55rem,2.5vw,2.35rem)/1.25 var(--display);padding:clamp(1.5rem,3vw,2.6rem) 0;border-top:1px solid var(--line)}
.d-editorial .reason-list li:last-child{border-bottom:1px solid var(--line)}
.d-editorial .reason-list strong{font-weight:300;color:var(--accent)}
.d-editorial .reason-list strong::after{content:". ";font-style:normal}
.d-editorial .proof{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;align-items:start;padding:0 var(--gut) clamp(4rem,8vw,8rem);margin-top:clamp(7rem,14vw,14rem);background:var(--deep);color:var(--on-deep)}
.d-editorial .proof-image{grid-column:1/7;overflow:hidden;margin:clamp(-9rem,-10vw,-4rem) 0 0 calc(var(--gut) * -1);aspect-ratio:3/2.1}
.d-editorial .proof-image img{height:116%;aspect-ratio:auto}
.d-editorial .proof-words{grid-column:7/13;padding-top:clamp(3rem,6vw,6rem)}
.d-editorial .proof:not(.proof--image) .proof-words{grid-column:3/11}
.d-editorial .quote blockquote{font:300 clamp(1.9rem,3.3vw,3.5rem)/1.14 var(--display)}
.d-editorial .quote figcaption{color:var(--accent-on-deep);margin-top:1.6rem}
.d-editorial .credentials{color:var(--on-deep-mute);border-top:1px solid var(--on-deep-line);margin-top:2.5rem;padding-top:1.1rem}
.d-editorial .proof--credentials{padding-top:1.5rem;padding-bottom:1.5rem;margin-top:clamp(4rem,8vw,8rem)}
.d-editorial .proof--credentials .proof-words{padding:0}
.d-editorial .proof--credentials .credentials{margin:0;border:0;padding:0;color:var(--on-deep)}
.d-editorial .services{padding:clamp(4.5rem,10vw,10rem) var(--gut)}
.d-editorial .section-head{display:block}
.d-editorial .section-head .label{padding:0;margin-bottom:1rem}
.d-editorial .section-head h2{max-width:19ch}
.d-editorial .ledger{border:0;margin-left:auto;max-width:62rem}
.d-editorial .ledger-row{display:grid;grid-template-columns:auto minmax(1rem,1fr) auto;column-gap:1rem;align-items:baseline;padding:1.6rem 0;border-bottom:0;border-top:1px solid var(--line)}
.d-editorial .ledger-row h3{grid-column:1;grid-row:1;transition:translate .5s cubic-bezier(.2,.7,.2,1),color .3s}
.d-editorial .ledger-row::after{content:"";grid-column:2;grid-row:1;border-bottom:2px dotted var(--line);translate:0 -.35em;transform-origin:left}
.d-editorial .ledger-row .price{grid-column:3;grid-row:1;text-align:right;font-weight:400;white-space:nowrap}
.d-editorial .ledger-row p:not(.price){grid-column:1/-1;grid-row:2;max-width:36rem;margin-top:.7rem;color:var(--mute)}
@media (hover:hover){.d-editorial .ledger-row:hover h3{translate:.6rem 0;color:var(--accent)}}
.d-editorial .steps-section{background:var(--paper-2);padding:clamp(4.5rem,9vw,9rem) var(--gut)}
.d-editorial .steps{display:block;background:transparent;margin:0;padding:0}
.d-editorial .steps li:nth-child(n){--step:0;margin:0 0 0 calc(var(--step) * clamp(.8rem,13vw,15rem));max-width:32rem;display:grid;grid-template-columns:clamp(3rem,6vw,5.5rem) minmax(0,1fr);column-gap:.6rem;padding:1.2rem 0}
.d-editorial .steps li:nth-child(2){--step:1}.d-editorial .steps li:nth-child(3){--step:2}.d-editorial .steps li:nth-child(4){--step:3}
.d-editorial .steps li::before{grid-row:1/3;font:300 clamp(2.6rem,5vw,4.6rem)/1 var(--display);font-variant-numeric:lining-nums;color:var(--accent)}
.d-editorial .steps h3{margin:0;font:400 1.6rem/1.2 var(--display);letter-spacing:-.01em}
.d-editorial .steps p{margin-top:.3rem;color:var(--mute)}
.letter{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(4.5rem,10vw,10rem) var(--gut);align-items:start}
.cameo{grid-column:1/5;aspect-ratio:4/5;border-radius:50%;overflow:hidden;max-width:24rem}
.cameo img{height:100%;object-position:50% 12%;scale:1.25;transform-origin:50% 20%}
.letter-words{grid-column:6/13}
.letter--words .letter-words{grid-column:3/12}
.letter-lead{font:300 clamp(1.8rem,3.1vw,3.1rem)/1.15 var(--display);letter-spacing:-.012em}
.letter-story{columns:2 19rem;column-gap:2.5rem;margin-top:2.2rem}
.letter-story p + p{margin-top:1rem}
.letter-story p:first-child::first-letter{font:300 4.4rem/.82 var(--display);float:left;padding:.28rem .5rem 0 0;color:var(--accent)}
.signature{margin-top:2.2rem;font:300 1.9rem/1.1 var(--display)}
.signature small{display:block;font:400 .95rem/1.4 var(--body);margin-top:.35rem;color:var(--mute)}
.d-editorial .questions{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:0 var(--gut) clamp(4.5rem,9vw,9rem)}
.d-editorial .questions .section-head{grid-column:1/6}
.d-editorial .question-list{grid-column:7/13;margin:0}
.d-editorial .question-list summary{font:400 1.3rem/1.3 var(--display)}
.d-editorial .question-list summary::after{transition:rotate .35s}
.d-editorial .question-list details[open] summary::after{content:"\\00d7"}
.d-editorial .closing{margin:0;padding:clamp(5rem,9vw,9rem) var(--gut)}
.d-editorial .closing-words h2{font-size:clamp(3rem,6.2vw,7.5rem);line-height:1}
.d-editorial .closing .button--send{--on:var(--on-deep);background:var(--on-deep);color:var(--deep)}
.d-editorial .closing .button--send::before{background:var(--accent-on-deep)}
.d-editorial .closing .button--send:hover{background:var(--on-deep);color:var(--deep)}
.d-editorial .site-footer{background:var(--deep);color:var(--on-deep);border-top:1px solid var(--on-deep-line)}
.d-editorial .footer-legal{color:var(--on-deep-mute)}
.d-editorial .site-footer :focus-visible,.d-editorial .closing :focus-visible{outline-color:var(--accent-on-deep)}
.d-editorial .page-intro h1{font-weight:300}
.d-editorial .person img{border-radius:50%}
.d-editorial .person h3{font-size:clamp(1.6rem,2.4vw,2.4rem)}
@media (max-width:980px){
 .d-editorial .menu-wide{display:none}
 .d-editorial .menu-narrow{display:block}
 .d-editorial .site-header{grid-template-columns:1fr auto}
 .d-editorial .mark{grid-column:1;text-align:left}
 .d-editorial .menu-narrow{grid-column:2}
 .d-editorial .hero{padding-right:0}
 .d-editorial .hero-for,.d-editorial .hero h1{grid-column:1/-1;padding-right:var(--gut)}
 .d-editorial .hero-image{grid-column:3/13;grid-row:3;margin-top:2rem}
 .d-editorial .hero-note{left:-1rem;bottom:17%;width:min(15rem,62vw);font-size:1rem}
 .d-editorial .hero-body,.d-editorial .hero--type .hero-body{grid-column:1/-1;grid-row:4;padding-right:var(--gut)}
}
@media (max-width:760px){
 .d-editorial .reasons h2,.d-editorial .reason-list,.d-editorial .questions .section-head,.d-editorial .question-list,.d-editorial .proof-words,.d-editorial .proof:not(.proof--image) .proof-words,.letter-words,.letter--words .letter-words{grid-column:1/-1;position:static}
 .d-editorial .reason-list,.d-editorial .question-list{margin-top:2rem}
 .d-editorial .proof-image{grid-column:1/12}
 .cameo{grid-column:1/8;margin-bottom:2rem}
}
@media (max-width:640px){
 .d-editorial .ledger-row{grid-template-columns:minmax(0,1fr)}
 .d-editorial .ledger-row::after{display:none}
 .d-editorial .ledger-row .price{grid-column:1;grid-row:2;text-align:left;font-weight:500;margin-top:.4rem}
 .d-editorial .ledger-row p:not(.price){grid-row:3}
}
@media (prefers-reduced-motion:reduce){
 html{scroll-behavior:auto}
 .d-editorial .button,.d-editorial .button::before,.d-editorial a,.d-editorial .ledger-row h3,.d-editorial .question-list summary::after{transition:none}
}
@media (prefers-reduced-motion:no-preference){
 @keyframes editorial-settle{from{opacity:.25;translate:0 .7rem}}
 @keyframes editorial-unveil{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0)}}
 @keyframes editorial-note{from{opacity:0;translate:0 1.5rem;rotate:2deg}}
 @keyframes editorial-rise{from{opacity:.05;translate:0 1.8rem}}
 @keyframes editorial-drift{from{translate:0 -14%}to{translate:0 0}}
 @keyframes editorial-draw{from{scale:0 1}to{scale:1 1}}
 @keyframes editorial-breathe{from{scale:1.42}to{scale:1.22}}
 .d-editorial .hero-for,.d-editorial .hero h1{animation:editorial-settle .7s cubic-bezier(.2,.7,.2,1) backwards}
 .d-editorial .hero-body{animation:editorial-settle .7s .12s cubic-bezier(.2,.7,.2,1) backwards}
 .d-editorial .hero-image .frame{animation:editorial-unveil 1.1s .05s cubic-bezier(.65,0,.15,1) backwards}
 .d-editorial .hero-note{animation:editorial-note .5s .45s cubic-bezier(.2,.7,.2,1) backwards}
 @supports (animation-timeline:view()){
  .d-editorial .reason-list li,.d-editorial .ledger-row,.d-editorial .steps li,.d-editorial .quote blockquote,.d-editorial .section-head,.letter-lead,.letter-story,.signature,.d-editorial .closing-words h2{animation:editorial-rise linear both;animation-timeline:view();animation-range:entry 5% cover 28%}
  .d-editorial .proof-image img{animation:editorial-drift linear both;animation-timeline:view()}
  .d-editorial .proof-image,.cameo{animation:editorial-unveil linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
  .cameo img{animation:editorial-breathe linear both;animation-timeline:view()}
  .d-editorial .ledger-row::after{animation:editorial-draw linear both;animation-timeline:view();animation-range:entry 20% cover 40%}
 }
}

/* Formal: a stone in still water. A full field of oxblood, large classical type, and rings that widen as you read. */
.d-formal{overflow-x:clip}
.d-formal em{font-style:italic}
.d-formal .label{font-size:.8rem;letter-spacing:.16em;text-transform:uppercase}
.d-formal .site-header{background:var(--deep);color:var(--on-deep)}
.d-formal .site-header .menu-narrow nav{color:var(--ink)}
.d-formal .mark{font:500 clamp(.92rem,1.3vw,1.05rem)/1.1 var(--display);letter-spacing:.16em;text-transform:uppercase}
.d-formal .site-header .button{background:var(--on-deep);color:var(--deep)}
.d-formal .site-header .menu-narrow .button{background:var(--deep);color:var(--on-deep)}
.d-formal .button{transition:background-color .4s,color .4s,box-shadow .5s cubic-bezier(.2,.7,.2,1)}
@media (hover:hover){
 .d-formal .button:hover{background:var(--accent);color:#fff;box-shadow:0 0 0 .45rem #7f273326,0 0 0 .9rem #7f273314}
 .d-formal .hero .button:hover,.d-formal .site-header .menu-wide .button:hover,.d-formal .closing .button:hover{background:var(--accent-on-deep);color:var(--deep-2);box-shadow:0 0 0 .45rem #f0c8ad33,0 0 0 .9rem #f0c8ad1a}
}
.ringbox{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.ringbox::before,.d-formal.m-ripple .closing::before{content:"";position:absolute;aspect-ratio:1;border-radius:50%;background:repeating-radial-gradient(circle at center,transparent 0 calc(var(--gap) - 1px),var(--ring) calc(var(--gap) - 1px) var(--gap));-webkit-mask:radial-gradient(circle,#000 0 66%,transparent 71%);mask:radial-gradient(circle,#000 0 66%,transparent 71%)}
.ringbox::before{--gap:clamp(1.5rem,3.1vw,3rem);width:clamp(44rem,92vw,96rem);left:80%;top:62%;translate:-50% -50%}
.d-formal .hero{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;position:relative;background:var(--deep);color:var(--on-deep);padding:clamp(1.5rem,4vw,4rem) var(--gut) clamp(3rem,7vw,7rem)}
.d-formal .hero :focus-visible,.d-formal .site-header :focus-visible,.d-formal .closing :focus-visible,.d-formal .site-footer :focus-visible{outline-color:var(--accent-on-deep)}
.d-formal .hero > :not(.ringbox){position:relative;z-index:1}
.d-formal .hero-for{grid-column:1/9;color:var(--accent-on-deep);margin-bottom:1.6rem}
.d-formal .hero h1{grid-column:1/9;text-wrap:wrap}
@media (min-width:600px){.d-formal h1,.d-formal .ledger-row h3{hyphens:manual}}
@media (min-width:821px){.d-formal h1 .turn{display:block}}
.d-formal .hero-why{grid-column:1/7;margin-top:clamp(1.8rem,3.5vw,3.2rem);font-size:1.15rem;max-width:33rem;color:var(--on-deep-mute)}
.d-formal .hero-actions{grid-column:1/8;display:flex;flex-wrap:wrap;gap:1.1rem 1.8rem;align-items:center;margin-top:2rem}
.d-formal .hero .button{background:var(--on-deep);color:var(--deep)}
.d-formal .hero-reassurance{grid-column:1/7;margin-top:1.2rem;font-size:.95rem;color:var(--on-deep-mute);max-width:30rem}
.d-formal .hero .hero-image{grid-column:9/13;grid-row:1/7;align-self:end;margin-bottom:calc(clamp(3rem,7vw,7rem) * -1 - clamp(3rem,6vw,6rem));z-index:3}
.d-formal .frame{background:var(--accent-on-deep);overflow:hidden}
.d-formal .frame img{aspect-ratio:3/4.3;filter:grayscale(1) contrast(1.08);mix-blend-mode:multiply;object-position:50% 12%}
.d-formal .hero--type h1,.d-formal .hero--type .hero-for{grid-column:1/-1}
.d-formal .reasons{counter-reset:reason;padding:clamp(5.5rem,11vw,11rem) var(--gut) clamp(4rem,8vw,8rem)}
.d-formal .reason-list{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px}
.d-formal .reason-list li{grid-column:span 3;counter-increment:reason}
.d-formal .reason-list li:nth-child(2){margin-top:clamp(0rem,6vw,6rem)}
.d-formal .reason-list li:nth-child(3){margin-top:clamp(0rem,12vw,12rem)}
.d-formal .reason-list li:nth-child(4){margin-top:clamp(0rem,18vw,18rem)}
.d-formal .reason-list li::before{content:counter(reason,upper-roman);display:block;font:500 .9rem/1 var(--body);letter-spacing:.14em;color:var(--accent);margin-bottom:.9rem}
.d-formal .reason-list strong{display:block;font:400 clamp(1.9rem,2.9vw,3rem)/1.05 var(--display)}
.d-formal .reason-list span{display:block;margin-top:.8rem;color:var(--mute)}
.d-formal .services{padding:0 0 clamp(4rem,8vw,8rem)}
.d-formal .services .section-head{display:block;padding:0 var(--gut)}
.d-formal .section-head .label{padding:0;margin-bottom:1rem;color:var(--accent)}
.d-formal .section-head h2{max-width:18ch}
.d-formal .ledger{border-top:1px solid var(--ink)}
.d-formal .ledger-row{position:relative;isolation:isolate;padding:clamp(1.4rem,2.6vw,2.6rem) var(--gut);border-bottom:1px solid var(--ink);transition:color .45s}
.d-formal .ledger-row::before{content:"";position:absolute;inset:0;background:var(--deep);transform:scaleY(0);transform-origin:bottom;transition:transform .55s cubic-bezier(.3,.7,.1,1);z-index:-1}
.d-formal .ledger-row h3{grid-column:1/9;line-height:1}
.d-formal .ledger-row p{grid-column:9/13;color:var(--mute);transition:color .45s}
.d-formal .ledger-row .price{grid-column:9/13;text-align:left;margin-top:.4rem;color:var(--ink)}
@media (hover:hover){
 .d-formal .ledger-row:hover{color:var(--on-deep)}
 .d-formal .ledger-row:hover::before{transform:none}
 .d-formal .ledger-row:hover p{color:var(--on-deep-mute)}
}
.memory{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;position:relative;overflow:clip;background:var(--paper-2);padding:clamp(4rem,8vw,8rem) var(--gut)}
.memory-year{grid-column:1/-1;font:400 clamp(6.5rem,29vw,34rem)/.76 var(--display);color:var(--accent);letter-spacing:-.04em;margin-left:-.04em}
.memory-image{grid-column:7/13;overflow:hidden;aspect-ratio:16/10;margin-top:clamp(-4rem,-3.5vw,-1rem);position:relative;z-index:2}
.memory-image img{height:116%;aspect-ratio:auto}
.memory-head{grid-column:1/7;grid-row:2;padding-right:1.5rem;margin-top:clamp(1.5rem,3vw,3rem)}
.memory--no-year .memory-head{grid-row:1}
.memory h2{font-size:clamp(2.2rem,3.9vw,4.2rem)}
.memory .page-lead{margin-top:1.1rem;font-size:1.1rem}
.memory-story{grid-column:7/13;columns:2 18rem;column-gap:2rem;margin-top:2rem}
.memory-story p + p{margin-top:1rem}
.d-formal .steps-section{background:var(--deep);color:var(--on-deep);padding:clamp(4.5rem,9vw,9rem) var(--gut)}
.d-formal .steps-section .section-head{display:block}
.d-formal .steps-section .label{color:var(--accent-on-deep)}
.d-formal .steps-section h2{font-size:clamp(2.2rem,5vw,5.5rem);max-width:17ch}
.d-formal .steps{background:transparent;margin:clamp(3rem,5vw,5rem) 0 0;padding:0;align-items:end;gap:1rem}
.d-formal .steps li:nth-child(n){margin:0;border-top:1px solid #f0c8ad80;padding:1.2rem 0}
.d-formal .steps li::before{content:counter(step,upper-roman);font:500 .9rem/1 var(--body);letter-spacing:.14em;color:var(--accent-on-deep);margin-bottom:.8rem}
.d-formal .steps h3{margin:0;font:400 clamp(1.6rem,2.5vw,2.7rem)/1.05 var(--display);color:var(--on-deep)}
.d-formal .steps p{margin-top:.6rem;font-size:1.02rem;color:var(--on-deep-mute)}
@media (min-width:981px){
 .d-formal .steps[data-count="3"]{grid-template-columns:1fr 1.18fr 1.4fr}
 .d-formal .steps[data-count="2"]{grid-template-columns:1fr 1.3fr}
 .d-formal .steps:not([data-count="4"]) li:nth-child(n){aspect-ratio:1;border:1px solid #f0c8ad80;border-radius:50%;display:flex;flex-direction:column;justify-content:center;padding:clamp(1.2rem,2.6vw,3rem);text-align:center}
 .d-formal .steps:not([data-count="4"]) li::before{display:none}
}
.d-formal .proof{padding:clamp(3rem,5vw,5rem) var(--gut) 0}
.d-formal .proof-words,.d-formal .proof:not(.proof--image) .proof-words{grid-column:1/-1}
.d-formal .proof--credentials .credentials{justify-content:flex-start;border-color:var(--ink)}
.d-formal .questions{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(4.5rem,9vw,9rem) var(--gut)}
.d-formal .questions .section-head{grid-column:1/6;display:block}
.d-formal .question-list{grid-column:6/13;margin:0}
.d-formal .question-list details,.d-formal .question-list details:last-child{border-color:var(--ink)}
.d-formal .question-list summary{font:400 1.38rem/1.25 var(--display)}
.d-formal .question-list details[open] summary::after{content:"\\00d7"}
.d-formal .closing{position:relative;overflow:clip;isolation:isolate;margin:0;background:var(--deep-2);padding:clamp(5rem,10vw,10rem) var(--gut);--ring:#f0c8ad26;--gap:clamp(1.5rem,3vw,3rem)}
.d-formal.m-ripple .closing::before{z-index:-1;width:clamp(50rem,110vw,120rem);left:28%;top:40%;translate:-50% -50%}
.d-formal .closing-words h2{font-size:clamp(3rem,6.6vw,8rem);color:var(--on-deep)}
.d-formal .closing .button--send{background:var(--on-deep);color:var(--deep)}
.d-formal .site-footer{background:var(--deep-2);color:var(--on-deep);border-top:1px solid var(--on-deep-line)}
.d-formal .footer-legal{color:var(--on-deep-mute)}
.m-courses .hero::before{content:"";position:absolute;inset:0;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='64'%3E%3Cpath d='M0 .5h160M0 32.5h160M.5 0v32M80.5 32v32' fill='none' stroke='%23fff' stroke-opacity='.11'/%3E%3C/svg%3E") 0 100%/clamp(110px,11vw,160px) auto}
.m-courses .closing{position:relative;isolation:isolate}
.m-courses .closing::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='64'%3E%3Cpath d='M0 .5h160M0 32.5h160M.5 0v32M80.5 32v32' fill='none' stroke='%23fff' stroke-opacity='.07'/%3E%3C/svg%3E") 0 100%/clamp(110px,11vw,160px) auto}

.d-formal .page-intro{background:var(--deep);color:var(--on-deep)}
.d-formal .page-intro .label{color:var(--accent-on-deep)}
.d-formal .page-intro h1{grid-column:1/-1}
.d-formal .page-intro .page-lead{grid-column:1/9}
.d-formal .story p{grid-column:1/9}
.d-formal .person img{filter:grayscale(1) contrast(1.05)}
.d-formal .person h3{font-size:clamp(1.7rem,2.6vw,2.6rem)}
.d-formal .person--no-photo{border-top-color:var(--ink)}
.d-formal .end-action h2{color:var(--ink)}
@media (max-width:900px){
 .d-formal .hero-for,.d-formal .hero h1,.d-formal .hero-why,.d-formal .hero-actions,.d-formal .hero-reassurance{grid-column:1/-1}
 .d-formal .hero .hero-image{grid-column:5/13;grid-row:auto;margin:2.8rem calc(var(--gut) * -1) calc(clamp(3rem,7vw,7rem) * -1 - 3rem) 0}
 .ringbox::before{width:48rem;left:72%;top:84%}
}
@media (max-width:820px){
 .d-formal .reason-list li{grid-column:1/-1;margin:0 0 2.4rem!important}
 .d-formal .reason-list li:nth-child(2){padding-left:12%}
 .d-formal .reason-list li:nth-child(3){padding-left:24%}
 .d-formal .ledger-row h3,.d-formal .ledger-row p,.d-formal .ledger-row .price{grid-column:1/-1}
 .d-formal .ledger-row p{margin-top:.8rem}
 .memory-image{grid-column:1/-1;margin:.5rem calc(var(--gut) * -1) 0 12%}
 .memory-head{grid-column:1/-1;grid-row:auto;margin-top:2rem;padding:0}
 .memory-story{grid-column:1/-1}
 .d-formal .questions .section-head,.d-formal .question-list{grid-column:1/-1}
 .d-formal .question-list{margin-top:2rem}
 .d-formal .page-intro .page-lead,.d-formal .story p{grid-column:1/-1}
}
@media (prefers-reduced-motion:reduce){
 .d-formal .button,.d-formal .ledger-row,.d-formal .ledger-row::before,.d-formal .ledger-row p{transition:none}
}
@media (prefers-reduced-motion:no-preference){
 @keyframes formal-lay{from{clip-path:inset(62% 0 0 0)}to{clip-path:inset(0)}}
 @keyframes formal-calm{from{opacity:.25;translate:0 .6rem}}
 @keyframes formal-turn{from{opacity:.2;translate:-1.2rem 0}}
 @keyframes formal-plate{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0)}}
 @keyframes formal-lift{from{opacity:.05;translate:0 2rem}}
 @keyframes formal-widen{from{scale:.72}to{scale:1.08}}
 @keyframes formal-ripple{from{scale:.7;opacity:.4}to{scale:1;opacity:1}}
 @keyframes formal-drift{from{translate:0 -14%}to{translate:0 0}}
 @keyframes formal-year{from{translate:-3% 0}to{translate:2% 0}}
 .d-formal .hero-for,.d-formal .hero h1{animation:formal-calm .8s cubic-bezier(.2,.6,.2,1) backwards}
 .d-formal h1 .turn{display:inline-block;animation:formal-turn .9s .15s cubic-bezier(.2,.6,.2,1) backwards}
 .d-formal .hero-why,.d-formal .hero-actions,.d-formal .hero-reassurance{animation:formal-calm .8s .15s cubic-bezier(.2,.6,.2,1) backwards}
 .d-formal .hero .frame{animation:formal-plate 1.2s .1s cubic-bezier(.65,0,.15,1) backwards}
 @supports (animation-timeline:view()){
  .m-courses .hero::before{animation:formal-lay linear both;animation-timeline:scroll(root);animation-range:0 90vh}
  .ringbox::before{animation:formal-widen linear both;animation-timeline:scroll(root);animation-range:0 110vh}
  .d-formal.m-ripple .closing::before{animation:formal-ripple linear both;animation-timeline:view();animation-range:entry 0% cover 60%}
  .d-formal .reason-list li,.d-formal .section-head,.d-formal .ledger-row,.memory-head,.memory-story,.d-formal .closing-words h2{animation:formal-lift linear both;animation-timeline:view();animation-range:entry 5% cover 28%}
  .d-formal .steps li{animation:formal-ripple linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
  .memory-image img{animation:formal-drift linear both;animation-timeline:view()}
  .memory-year{animation:formal-year linear both;animation-timeline:view()}
 }
}

/* Statement: the side of a van. Type-led and direct, for a firm whose visitor needs one thing now. */
.d-statement h1,.d-statement h2,.d-statement h3,.d-statement .button,.d-statement .call-bar,.d-statement .footer-mark{text-transform:uppercase}
.d-statement .label{font:600 .8rem/1.3 "Archivo",sans-serif;font-stretch:115%;letter-spacing:.05em;text-transform:uppercase}
.d-statement .mark{font:900 1.7rem/1 var(--display);text-transform:uppercase}
.d-statement .site-header{background:var(--deep);color:var(--on-deep);padding:.7rem var(--gut);border-bottom:2px solid var(--deep-2)}
.d-statement .site-header .menu-narrow nav{color:var(--ink)}
.d-statement .menu-wide{font-weight:600}
.d-statement .menu-wide ul a{padding:.15rem .3rem;transition:background-color .12s,color .12s}
.d-statement .menu-wide ul a:hover{background:var(--signal);color:var(--ink);text-decoration:none}
.d-statement .site-header :focus-visible,.d-statement .hero :focus-visible,.d-statement .closing-words :focus-visible,.d-statement .site-footer :focus-visible{outline-color:var(--signal)}
.d-statement .button{--lip:var(--ink);font:900 1.6rem/1 var(--display);padding:.55em .8em;box-shadow:.14em .14em 0 var(--lip);transition:translate .1s,box-shadow .1s}
.d-statement .button--small{font-size:1.25rem;--lip:var(--on-deep)}
.d-statement .button:hover{background:var(--action);color:var(--on-action);translate:-2px -2px;box-shadow:.18em .18em 0 var(--lip)}
.d-statement .button:active{translate:.08em .08em;box-shadow:.03em .03em 0 var(--lip)}

.d-statement .hero{display:block;background:var(--deep);color:var(--on-deep);padding:clamp(1rem,2vw,2rem) var(--gut) clamp(2rem,3.5vw,3.5rem)}
.d-statement .hero-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.25rem 1.5rem}
.d-statement .hero-meta .label{color:var(--on-deep-mute);margin:0}
.d-statement .hero h1{margin-top:.9rem;text-wrap:wrap}
.d-statement .poster{display:block;width:fit-content;white-space:nowrap;line-height:.9;margin-top:.22em;--fit:calc((100vw - 2 * var(--gut)) / (var(--n) * var(--cw,.46)));font-size:min(var(--fit),14vh)}
.d-statement .poster:first-child{font-size:min(var(--fit),23vh);margin-top:.2em}
.d-statement .poster--turn{font-size:min(var(--fit),16vh)}
.d-statement .hero-under{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;align-items:end;margin-top:clamp(1.4rem,2.6vw,2.6rem)}
.d-statement .hero-why{grid-column:1/6;margin:0;font-size:clamp(1.1rem,1.5vw,1.4rem);line-height:1.35}
.d-statement .hero-call{grid-column:6/13;display:flex;flex-direction:column;align-items:flex-end;gap:.7rem;text-align:right}
.d-statement .hero .button{--lip:var(--on-deep);font-size:clamp(1.9rem,4.4vw,5.4rem);margin:0 .14em .14em 0;max-width:100%}
.d-statement .hero-reassurance{margin:0;font-size:.95rem;color:var(--on-deep)}
.d-statement .link-action{font-weight:600}

.pipe{--r:clamp(2.4rem,5vw,5.5rem);--wide:clamp(18px,2.6vw,40px);height:clamp(4.5rem,8vw,8rem);position:relative;overflow:hidden;background:var(--from)}
.pipe i{position:absolute;display:block;top:32%;bottom:0;border:0 solid var(--to);border-top-width:var(--wide)}
.pipe--right i{left:0;right:14%;border-right-width:var(--wide);border-top-right-radius:var(--r)}
.pipe--left i{left:14%;right:0;border-left-width:var(--wide);border-top-left-radius:var(--r)}
.pipe i::after{content:"";position:absolute;bottom:0;height:calc(var(--wide) * .7);width:calc(var(--wide) * 1.7);background:var(--to)}
.pipe--right i::after{right:calc(var(--wide) * -1.35)}
.pipe--left i::after{left:calc(var(--wide) * -1.35)}

.scale{height:clamp(2.6rem,5vw,4.6rem);position:relative;overflow:hidden;background:var(--from)}
.scale i{position:absolute;inset:0;display:block;background:repeating-linear-gradient(90deg,var(--to) 0 3px,transparent 3px 10%) 0 100%/100% 100% no-repeat,repeating-linear-gradient(90deg,var(--to) 0 1px,transparent 1px 2%) 0 100%/100% 45% no-repeat}

.d-statement .reasons{background:var(--signal);color:var(--ink);padding:clamp(1.5rem,3vw,3rem) var(--gut) clamp(2.5rem,5vw,5rem);position:relative;overflow:clip;isolation:isolate}
.d-statement .reason-list,.d-statement .reason-list[data-count]{display:block;max-width:none}
.d-statement .reason-list li{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;align-items:end;padding:clamp(1.2rem,2.8vw,3rem) 0 clamp(.6rem,1.2vw,1.2rem);border-top:3px solid var(--ink)}
.d-statement .reason-list li:last-child{border-bottom:3px solid var(--ink)}
.d-statement .reason-list strong{grid-column:1/9;font:var(--mega-weight,900) var(--mega,clamp(3.2rem,11vw,14rem))/.98 var(--display);text-transform:uppercase}
.d-statement .reason-list span{grid-column:9/13;color:var(--ink);font-size:clamp(1.1rem,1.5vw,1.4rem);font-weight:550;line-height:1.25;padding-bottom:.5em}

.d-statement .services{padding:clamp(1.5rem,4vw,4rem) var(--gut) clamp(3rem,6vw,6rem)}
.d-statement .section-head{display:block}
.d-statement .section-head .label{padding:0;margin-bottom:.8rem;color:var(--mute)}
.d-statement .ledger{border-top:3px solid var(--ink)}
.d-statement .ledger-row{align-items:center;padding:clamp(1rem,1.8vw,1.8rem) .6rem;border-bottom:3px solid var(--ink);transition:background-color .12s,color .12s,padding .12s}
.d-statement .ledger-row h3{grid-column:1/6;hyphens:manual;overflow-wrap:anywhere}
.d-statement .ledger-row p{grid-column:6/10}
.d-statement .ledger-row .price{grid-column:10/13;font:800 clamp(1.45rem,2.2vw,2.6rem)/1.05 var(--display);text-transform:uppercase}
.d-statement .services--one .ledger-row h3{grid-column:1/13}
.d-statement .services--one .ledger-row p{grid-column:1/9}
@media (hover:hover){
 .d-statement .ledger-row:hover{background:var(--ink);color:var(--on-deep);padding-left:1.4rem}
 .d-statement .ledger-row:hover h3,.d-statement .ledger-row:hover .price{color:var(--signal)}
}

.d-statement .steps-section{background:var(--deep);color:var(--on-deep);padding:clamp(3rem,6vw,6rem) var(--gut)}
.d-statement .steps-section .section-head .label{color:var(--on-deep-mute)}
.d-statement .steps{background:transparent;margin:0;padding:0}
.d-statement .steps li:nth-child(n){margin-top:0}
.d-statement .steps li::before{font:900 clamp(3.5rem,7vw,7rem)/.9 var(--display);color:var(--signal);margin-bottom:.6rem}
.d-statement .steps h3{font:700 1.3rem/1.2 "Archivo",sans-serif;text-transform:none;letter-spacing:0}
.stack{background:var(--deep);color:var(--on-deep)}
.d-statement .stack-label{padding:clamp(2rem,4vw,4rem) var(--gut) 1rem;color:var(--on-deep-mute);hyphens:none}
.stack li{position:sticky;top:0;min-height:min(72vh,44rem);display:flex;flex-direction:column;justify-content:flex-end;padding:clamp(1.5rem,3vw,3rem) var(--gut);overflow:clip;background:var(--deep-2);color:var(--on-deep);border-top:3px solid var(--deep)}
.stack li:nth-child(even){background:var(--deep)}
.stack li:last-child{background:var(--paper);color:var(--ink);border-top-color:var(--ink);min-height:min(60vh,38rem)}
.stack-word{font:900 min(calc((100vw - 2 * var(--gut)) / (var(--n) * var(--cw,.54))),34vh)/.9 var(--display);text-transform:uppercase;white-space:nowrap}
.stack li:nth-child(even) .stack-word{color:var(--signal)}
.stack h3{font:700 1.35rem/1.2 "Archivo",sans-serif;text-transform:none;letter-spacing:0;margin-top:1rem}
.stack li p:last-child{margin-top:.25rem;max-width:34rem;color:var(--on-deep-mute)}
.stack li:last-child p:last-child{color:var(--mute)}

.crew{background:var(--paper);padding:clamp(3rem,6vw,6rem) var(--gut) 0}
.crew-words{margin:clamp(1.5rem,3vw,3rem) 0 0 auto;max-width:44rem;font-size:clamp(1.05rem,1.3vw,1.2rem)}
.crew-words p + p{margin-top:.9rem}
.d-statement .proof{padding:clamp(2rem,4vw,4rem) var(--gut) 0}
.d-statement .proof-words,.d-statement .proof:not(.proof--image) .proof-words{grid-column:1/-1}
.d-statement .proof--credentials .credentials{font-weight:650;justify-content:flex-start;border-top:3px solid var(--ink);border-bottom:0;padding:.8rem 0 0}
.d-statement .questions{padding:clamp(3rem,6vw,6rem) var(--gut) clamp(3rem,6vw,6rem)}
.d-statement .question-list{margin-left:auto;max-width:52rem}
.d-statement .question-list details{border-top:2px solid var(--ink)}
.d-statement .question-list details:last-child{border-bottom:2px solid var(--ink)}
.d-statement .question-list summary{font:650 1.25rem/1.25 "Archivo",sans-serif}
.d-statement .question-list summary::after{color:var(--ink);font:900 1.9rem/.8 var(--display)}
.d-statement .question-list details[open] summary::after{content:"\\00d7"}

.d-statement .closing{margin-top:0;padding:clamp(2rem,5vw,5rem) var(--gut) clamp(4rem,7vw,7rem)}
.d-statement .closing-words h2{font-size:clamp(3rem,6.2vw,8rem)}
.d-statement .closing-words p{color:var(--on-deep);font-size:clamp(1.1rem,1.5vw,1.4rem)}
.d-statement .closing .closing-details{color:var(--signal);font-weight:600}
.d-statement .closing .closing-details p{color:inherit;margin-top:.2rem;font-size:1.1rem}
.d-statement .closing .form{background:var(--paper);color:var(--ink);padding:clamp(1.25rem,2.5vw,2.5rem);box-shadow:.7rem .7rem 0 var(--signal);align-self:start}
.d-statement .closing .field input,.d-statement .closing .field textarea{border-bottom:2px solid var(--ink);color:var(--ink)}
.d-statement .closing .field label{font-weight:600}
.d-statement .closing .consent,.d-statement .closing .next{color:var(--mute)}
.d-statement .closing .button--send,.d-statement .closing .button--send:hover{background:var(--ink);color:var(--signal);--lip:var(--signal)}
.d-statement .closing .form :focus-visible{outline-color:var(--ink)}

.d-statement .page-intro{background:var(--deep);color:var(--on-deep);padding-top:clamp(1.5rem,3vw,3rem)}
.d-statement .page-intro .label{color:var(--on-deep-mute)}
.d-statement .page-intro h1{grid-column:1/-1}
.d-statement .page-intro .page-lead{grid-column:1/9;margin-top:1.6rem}
.d-statement .story{padding-top:clamp(2rem,4vw,4rem)}
.d-statement .story p{grid-column:1/9}
.d-statement .person--no-photo{border-top:3px solid var(--ink)}
.d-statement .end-action{align-items:center}
.d-statement .contact-words .button{margin-bottom:.3em}
.d-statement .contact-details{border-top:3px solid var(--ink)}
.d-statement .plain-page h1{margin-bottom:1.5rem}
.d-statement .site-footer{background:var(--deep);color:var(--on-deep);border-top:0;padding-top:clamp(1.5rem,3vw,3rem)}
.d-statement .footer-mark{grid-column:1/-1;font:900 min(calc((100vw - 2 * var(--gut)) / (var(--n) * var(--cw,.46))),40vh)/.86 var(--display);white-space:nowrap;color:var(--signal)}
.d-statement .footer-details{grid-column:1/8}
.d-statement .site-footer nav{grid-column:8/-1}
.d-statement .footer-legal{color:var(--on-deep-mute)}
.d-statement .test-note{background:var(--deep-2);color:var(--on-deep)}
.d-statement .call-bar{font:900 1.7rem/1 var(--display);border-top:3px solid var(--ink);padding:.8rem var(--gut);min-height:0;transition:scale .1s}
.d-statement .call-bar:active{scale:.985}
@media (max-width:820px){
 .d-statement .hero-why,.d-statement .hero-call{grid-column:1/-1}
 .d-statement .hero-call{align-items:stretch;text-align:left;margin-top:1.2rem}
 .d-statement .hero .button{text-align:center;font-size:clamp(1.5rem,7.3vw,3.6rem)}
 .d-statement .reason-list strong,.d-statement .reason-list span{grid-column:1/-1}
 .d-statement .reason-list span{padding:.5rem 0 .3rem}
 .d-statement .ledger-row h3,.d-statement .ledger-row p,.d-statement .ledger-row .price{grid-column:1/-1;text-align:left}
 .d-statement .steps li:nth-child(n){grid-template-columns:5.5rem minmax(0,1fr)}
 .d-statement .page-intro .page-lead,.d-statement .story p{grid-column:1/-1}
 .d-statement .footer-details,.d-statement .site-footer nav{grid-column:1/-1}
 .d-statement .closing .form{margin-right:.7rem}
}
@media (max-height:560px){.stack li,.stack li:last-child{position:static;min-height:0}}

/* Other voices for this direction, so two firms in one trade do not look alike. */
.t-grotesk{--display:"Hanken Grotesk",system-ui,sans-serif;--cw:.6;--display-weight:800;--display-track:-.035em;--display-lead:1.02;--h1-1:clamp(2.8rem,8.4vw,10rem);--h1-2:clamp(2.5rem,6.4vw,8rem);--h1-3:clamp(2rem,4.6vw,5.5rem);--h2:clamp(2.4rem,6vw,7rem);--h3:clamp(1.8rem,3vw,3.4rem);--h3-weight:800;--mega:clamp(2.6rem,8vw,9.5rem);--mega-weight:800}
.t-grotesk h1,.t-grotesk h2,.t-grotesk h3,.t-grotesk .button,.t-grotesk .call-bar,.t-grotesk .footer-mark,.t-grotesk .mark,.t-grotesk .stack-word,.t-grotesk .reason-list strong,.t-grotesk .ledger-row .price{text-transform:none}
.t-grotesk .button,.t-grotesk .call-bar{letter-spacing:-.02em;font-weight:800}
.t-wide{--display:"Archivo",system-ui,sans-serif;--cw:.92;--display-weight:800;--display-track:-.02em;--display-lead:1.02;--h1-1:clamp(2.4rem,6.6vw,8rem);--h1-2:clamp(2.1rem,5vw,6rem);--h1-3:clamp(1.8rem,3.6vw,4.4rem);--h2:clamp(2rem,4.6vw,5.4rem);--h3:clamp(1.5rem,2.3vw,2.7rem);--h3-weight:800;--mega:clamp(1.8rem,5.5vw,6.6rem);--mega-weight:800}
.t-wide h1,.t-wide h2,.t-wide h3,.t-wide .poster,.t-wide .stack-word,.t-wide .reason-list strong,.t-wide .footer-mark,.t-wide .mark,.t-wide .button,.t-wide .call-bar,.t-wide .ledger-row .price{font-stretch:125%}
.t-wide .button,.t-wide .call-bar{font-weight:800;font-size:1.2rem}
.t-wide .hero .button{font-size:clamp(1.15rem,3vw,3.6rem)}
.t-wide .ledger-row .price{font-size:clamp(1.05rem,1.5vw,1.7rem)}

/* Motion: quick and mechanical, and only below the first screen's message. The call button is never animated. */
@media (prefers-reduced-motion:reduce){
 html{scroll-behavior:auto}
 .stack li,.stack li:last-child{position:static;min-height:0}
 .d-statement .button,.d-statement .ledger-row,.d-statement .menu-wide ul a,.d-statement .call-bar{transition:none}
}
@media (prefers-reduced-motion:no-preference){
 @keyframes statement-wipe{from{clip-path:inset(-.35em 100% -.15em 0)}to{clip-path:inset(-.35em -2% -.15em 0)}}
 @keyframes statement-slide{from{translate:-5% 0}}
 @keyframes statement-rise{from{translate:0 1.4rem}}
 @keyframes pipe-from-left{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
 @keyframes pipe-from-right{from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0)}}
 @keyframes water-drain{from{translate:0 0}to{translate:-25% 100%}}
 @keyframes water-rise{from{translate:-25% 100%}to{translate:0 0}}
 @keyframes drip{0%,72%{opacity:0;translate:0 0;scale:.3}76%{opacity:1;translate:0 0;scale:1}94%{opacity:1;translate:0 1.15em}100%{opacity:0;translate:0 1.3em}}
 .d-statement .poster{animation:statement-wipe .42s cubic-bezier(.7,0,.2,1) backwards}
 .d-statement .poster:nth-child(2){animation-delay:.07s}
 .d-statement .poster:nth-child(3){animation-delay:.14s}
 .m-pipe .poster--question{position:relative}
 .m-pipe .poster--question::after{content:"";position:absolute;right:.075em;top:.8em;width:.055em;height:.085em;border-radius:50% 50% 50% 50%/65% 65% 40% 40%;background:var(--signal);opacity:0;animation:drip 7s 1.4s ease-in infinite}
 @supports (animation-timeline:view()){
  .pipe--right i{animation:pipe-from-left linear both;animation-timeline:view();animation-range:entry 20% cover 70%}
  .pipe--left i{animation:pipe-from-right linear both;animation-timeline:view();animation-range:entry 20% cover 70%}
  .m-pipe .reasons,.m-drain .reasons{background:var(--paper)}
  .m-pipe .reasons::before,.m-drain .reasons::before{content:"";position:absolute;inset:-36px -50% 0;z-index:-1;background:var(--signal);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='36'%3E%3Cpath d='M0 18c80-24 160-24 240 0s160 24 240 0v18H0z'/%3E%3C/svg%3E") 0 0/480px 36px repeat-x,linear-gradient(#000 0 0) 0 35px no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='36'%3E%3Cpath d='M0 18c80-24 160-24 240 0s160 24 240 0v18H0z'/%3E%3C/svg%3E") 0 0/480px 36px repeat-x,linear-gradient(#000 0 0) 0 35px no-repeat}
  .m-pipe .reasons::before{animation:water-rise linear both;animation-timeline:view();animation-range:entry 15% cover 52%}
  .m-drain .reasons::before{animation:water-drain linear both;animation-timeline:view();animation-range:cover 12% cover 62%}
  .scale i{animation:pipe-from-left linear both;animation-timeline:view();animation-range:entry 10% cover 60%}
  .d-statement .reason-list li{animation:statement-slide linear both;animation-timeline:view();animation-range:entry 0% cover 28%}
  .d-statement .ledger-row{animation:statement-rise linear both;animation-timeline:view();animation-range:entry 0% cover 16%}
  .d-statement .section-head h2,.crew h2,.d-statement .closing-words h2{animation:statement-wipe linear both;animation-timeline:view();animation-range:entry 10% cover 34%}
  .stack-word{animation:statement-slide linear both;animation-timeline:view();animation-range:entry 0% entry 90%}
 }
}

/* Tablet: people side by side. */
@media (min-width:561px) and (max-width:820px){
 .person,.person--no-photo{grid-column:span 6}
}
`;


const ROOMS = `
/* Café: a warm room you can walk into. Opening hours first, a menu card on the counter, the day's priced item pinned to the photo. */
.d-cafe .label{font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.d-cafe .site-header{border-bottom:1.5px solid var(--ink)}
.d-cafe .mark{font-size:clamp(1.4rem,2.2vw,1.9rem)}
.visit-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.4rem 2rem;background:var(--deep);color:var(--on-deep);padding:.7rem var(--gut);font-size:.95rem}
.visit-bar strong{color:var(--on-deep);font-weight:700;margin-right:.4rem}
.d-cafe .hero{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;align-items:center;padding:clamp(2.5rem,5vw,5rem) var(--gut) clamp(4rem,7vw,6.5rem)}
.d-cafe .hero-words{grid-column:1/7}
.d-cafe .hero--type .hero-words{grid-column:1/10}
.d-cafe .hero-for{margin-bottom:1.25rem}
.d-cafe .hero-why{font-size:1.2rem;line-height:1.55;margin-top:1.5rem;max-width:32rem}
.d-cafe .hero-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem}
.d-cafe .button--quiet{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--ink)}
.d-cafe .button--quiet:hover{background:var(--ink);color:var(--paper)}
.d-cafe .hero-reassurance{margin-top:1.25rem;color:var(--mute);font-size:.98rem}
.d-cafe .hero-image{grid-column:8/13;position:relative;padding-bottom:2.5rem}
.d-cafe .arch{overflow:hidden;border-radius:999px 999px 1.1rem 1.1rem}
.d-cafe .arch img{aspect-ratio:4/5}
.pinned{position:absolute;left:clamp(-3.5rem,-4vw,-1rem);bottom:0;width:min(17rem,80%);display:flex;flex-direction:column;gap:.35rem;background:var(--paper-2);padding:1.2rem 1.25rem 1.1rem;rotate:-2.2deg;box-shadow:0 1px 1px #1d1a1022,0 16px 30px -14px #1d1a1066}
.pinned strong{font:400 1.35rem/1.15 var(--display)}
.pinned span{font-size:.95rem;line-height:1.45}
.pinned .pinned-price{font-weight:700;font-size:1.05rem}
.hero--type .pinned,.d-cafe .hero-image:not(:has(.arch)) .pinned{position:static;rotate:-1.2deg;width:auto;max-width:20rem}
.menu-card{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;row-gap:2rem;background:var(--paper-2);border-block:1.5px solid var(--ink);padding:clamp(4rem,7vw,6rem) var(--gut)}
.menu-card-head{grid-column:1/6;display:flex;flex-direction:column;gap:1.1rem}
.menu-card-head h2{scroll-margin-top:2rem}
.menu-card-head figure{margin-top:1rem;overflow:hidden;border-radius:1.1rem}
.menu-card-head img{aspect-ratio:3/2}
.menu-lines{grid-column:7/13;align-self:start}
.menu-lines li{padding:1.15rem 0;border-bottom:1px dashed var(--mute)}
.menu-lines li:first-child{padding-top:0}
.menu-line{display:flex;align-items:baseline;gap:.75rem}
.menu-name{font:400 clamp(1.25rem,1.9vw,1.55rem)/1.2 var(--display)}
.menu-dots{flex:1 1 2rem;min-width:1rem;border-bottom:2px dotted var(--mute);translate:0 -.3em}
.menu-price{font-weight:700;white-space:nowrap}
.menu-text{margin-top:.35rem;color:var(--mute);font-size:.98rem;max-width:34rem}
.visit{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;row-gap:2.5rem;padding:clamp(4.5rem,8vw,7rem) var(--gut) 0}
.visit-head{grid-column:1/6;display:flex;flex-direction:column;gap:1.1rem}
.visit-head h2{scroll-margin-top:2rem}
.visit-card{margin-top:1rem;display:flex;flex-direction:column;gap:1rem;background:var(--paper-2);padding:1.4rem 1.5rem;border-radius:1.1rem}
.visit-card p{display:flex;flex-direction:column;gap:.25rem;font-size:1.1rem;font-weight:500}
.visit-list{grid-column:7/13;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2rem 24px;align-self:start}
.visit-list h3{font-size:var(--h3);margin-bottom:.4rem}
.visit-list p{color:var(--ink)}
.d-cafe .proof,.d-cafe .questions{padding-top:clamp(4.5rem,8vw,7rem)}
.d-cafe .closing{background:var(--accent);color:#fff}
.d-cafe .closing-words p,.d-cafe .closing .consent,.d-cafe .closing .next{color:#fffffff0}
.d-cafe .closing .form{background:var(--paper);color:var(--ink);padding:clamp(1.5rem,3vw,2.25rem);border-radius:1.1rem}
.d-cafe .closing .field input,.d-cafe .closing .field textarea{border:1.5px solid var(--ink);border-radius:.6rem;padding:.65rem .8rem;color:var(--ink);background:#fffdf9}
.d-cafe .closing .consent,.d-cafe .closing .next{color:var(--mute)}
.d-cafe .closing .button--send{background:var(--ink);color:var(--paper)}
.d-cafe .closing .button--send:hover{background:var(--deep);color:var(--on-deep)}
.d-cafe .closing :focus-visible{outline-color:var(--ink)}
.cafe-story{max-width:48rem;margin:0 auto;padding:clamp(4.5rem,8vw,7rem) var(--gut);display:flex;flex-direction:column;gap:1.1rem;align-items:flex-start}
.cafe-story-lead{font-size:1.2rem;line-height:1.6}
.d-cafe .site-footer{background:var(--deep);color:var(--on-deep);border-top:0}
.d-cafe .footer-legal{color:var(--on-deep-mute)}

/* Atelier: light, quiet and led by the work. A large light serif, an uneven gallery, thin rules. */
.d-atelier .label{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase}
.d-atelier .site-header{padding-block:2rem}
.d-atelier .mark{font-size:clamp(1.5rem,2.2vw,1.95rem);font-weight:400}
.d-atelier .menu-wide ul{gap:2.5rem;letter-spacing:.04em}
.d-atelier .button{border:1px solid var(--ink);background:var(--ink);color:var(--paper);letter-spacing:.04em}
.d-atelier .button:hover{background:transparent;color:var(--ink)}
.d-atelier .hero{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(3rem,7vw,6.5rem) var(--gut) 0}
.d-atelier .hero-for{grid-column:1/-1;margin-bottom:1.6rem}
.d-atelier .hero h1{grid-column:1/11}
.d-atelier .hero-body{grid-column:8/13;margin-top:2.5rem;display:flex;flex-direction:column;gap:1.4rem;align-items:flex-start}
.d-atelier .hero-why{color:var(--mute);font-size:1.05rem;line-height:1.7}
.link-action--arrow{text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:.2rem}
.link-action--arrow::after{content:" \\2192"}
.d-atelier .hero-image{grid-column:1/-1;margin-top:clamp(3rem,6vw,5rem)}
.d-atelier .hero-image img{aspect-ratio:16/7}
.work{padding:clamp(5rem,9vw,8.5rem) var(--gut) 0}
.work-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:1rem;border-top:1px solid var(--ink);padding-top:1.25rem;margin-bottom:clamp(2.5rem,4vw,3.5rem)}
.work-head h2{scroll-margin-top:2rem}
.work-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:28px;row-gap:clamp(2.5rem,5vw,4.5rem)}
.work-item{display:flex;flex-direction:column;gap:.8rem}
.work-item figcaption{font-size:.95rem}
.work-item--1{grid-column:1/8}
.work-item--2{grid-column:8/13;margin-top:clamp(3rem,7vw,6rem)}
.work-item--3{grid-column:1/6}
.work-item--4{grid-column:6/13;margin-top:clamp(4rem,9vw,8.5rem)}
.approach{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;margin-top:clamp(5rem,9vw,8.5rem);background:var(--paper-2);padding:clamp(4.5rem,8vw,7rem) var(--gut)}
.approach-lead{grid-column:1/11;font:300 clamp(1.7rem,3.2vw,2.9rem)/1.18 var(--display);letter-spacing:-.01em;margin-bottom:clamp(3rem,6vw,5rem)}
.approach .label{grid-column:1/-1;margin-bottom:.8rem}
.approach h2{grid-column:1/-1;margin-bottom:2.5rem;scroll-margin-top:2rem}
.approach-steps{grid-column:1/-1;display:grid;grid-template-columns:repeat(var(--count,3),minmax(0,1fr));gap:40px;counter-reset:step}
.approach-steps[data-count="2"]{--count:2}.approach-steps[data-count="4"]{--count:4}
.approach-steps li{counter-increment:step;border-top:1px solid var(--ink);padding-top:1.25rem}
.approach-steps li::before{content:counter(step,decimal-leading-zero);display:block;font:300 2rem/1 var(--display);margin-bottom:1rem}
.approach-steps h3{font:500 1.05rem/1.3 var(--body);letter-spacing:0;margin-bottom:.5rem}
.approach-steps p{color:var(--mute);line-height:1.65}
.d-atelier .ledger{border-top:1px solid var(--ink)}
.d-atelier .ledger-row h3{font-family:var(--display);font-size:clamp(1.4rem,2.2vw,1.9rem);font-weight:400}
.d-atelier .closing{background:transparent;color:var(--ink);border-top:1px solid var(--ink)}
.d-atelier .closing-words p,.d-atelier .closing .consent,.d-atelier .closing .next{color:var(--mute)}
.d-atelier .closing .field input,.d-atelier .closing .field textarea{border-bottom-color:var(--ink);color:var(--ink)}
.d-atelier .closing .button--send{background:var(--ink);color:var(--paper)}
.d-atelier .closing .button--send:hover{background:transparent;color:var(--ink)}
.d-atelier .closing :focus-visible{outline-color:var(--accent)}

/* Café motion: a room waking up. The words settle, the photo opens like a door, the day's note is pinned on with a little sway, and the menu's dotted lines are drawn as you read. Opening hours never move. */
.menu-card{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .25 0 0 0 0 .15 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.d-cafe .arch img,.menu-card-head img{transition:scale 1.2s cubic-bezier(.2,.7,.2,1)}
@media (hover:hover){.d-cafe .arch:hover img,.menu-card-head figure:hover img{scale:1.04}}
@media (prefers-reduced-motion:reduce){.d-cafe .arch img,.menu-card-head img,.d-cafe .button--quiet{transition:none}}
@media (prefers-reduced-motion:no-preference){
 @keyframes cafe-settle{from{opacity:.2;translate:0 .9rem}}
 @keyframes cafe-door{from{clip-path:inset(100% 0 0 0 round 999px 999px 1.1rem 1.1rem)}to{clip-path:inset(0 0 0 0 round 999px 999px 1.1rem 1.1rem)}}
 @keyframes cafe-pin{0%{opacity:0;translate:0 -1.6rem;rotate:-9deg}55%{opacity:1;translate:0 .15rem;rotate:1.2deg}78%{translate:0 0;rotate:-3.4deg}100%{rotate:-2.2deg}}
 @keyframes cafe-rise{from{opacity:.1;translate:0 1.4rem}}
 @keyframes cafe-dots{from{scale:0 1}to{scale:1 1}}
 @keyframes cafe-warm{from{scale:1.12}to{scale:1}}
 .d-cafe .hero-for,.d-cafe .hero h1{animation:cafe-settle .75s cubic-bezier(.2,.7,.2,1) backwards}
 .d-cafe .hero-why,.d-cafe .hero-actions,.d-cafe .hero-reassurance{animation:cafe-settle .75s .12s cubic-bezier(.2,.7,.2,1) backwards}
 .d-cafe .arch{animation:cafe-door 1.15s .05s cubic-bezier(.65,0,.15,1) backwards}
 .d-cafe .hero-image:has(.arch) .pinned{animation:cafe-pin .9s .75s cubic-bezier(.3,.6,.3,1) backwards}
 @supports (animation-timeline:view()){
  .d-cafe .arch img{animation:cafe-warm linear both;animation-timeline:scroll(root);animation-range:0 100vh}
  .menu-card-head,.menu-lines li,.visit-head,.visit-card,.visit-list > *,.cafe-story > *,.d-cafe .section-head,.d-cafe .closing-words h2{animation:cafe-rise linear both;animation-timeline:view();animation-range:entry 5% cover 25%}
  .menu-dots{transform-origin:left;animation:cafe-dots linear both;animation-timeline:view();animation-range:entry 30% cover 40%}
  .menu-card-head img{animation:cafe-warm linear both;animation-timeline:view()}
 }
}

/* Atelier motion: slow and quiet, led by the work. The first photo opens from the middle like a curtain; each project is revealed and settles as it comes into view. */
.work-item img{transition:scale 1.6s cubic-bezier(.2,.7,.2,1)}
.work-frame,.d-atelier .hero-image{overflow:hidden}
@media (hover:hover){.work-item:hover img{scale:1.035}}
@media (prefers-reduced-motion:reduce){.work-item img,.d-atelier .button{transition:none}}
@media (prefers-reduced-motion:no-preference){
 @keyframes atelier-fade{from{opacity:0}}
 @keyframes atelier-lift{from{opacity:0;translate:0 1rem}}
 @keyframes atelier-curtain{from{clip-path:inset(0 50% 0 50%)}to{clip-path:inset(0)}}
 @keyframes atelier-settle{from{scale:1.14}to{scale:1}}
 @keyframes atelier-reveal{from{clip-path:inset(18% 0 0 0);opacity:.3}to{clip-path:inset(0);opacity:1}}
 @keyframes atelier-rule{from{scale:0 1}to{scale:1 1}}
 .d-atelier .hero-for,.d-atelier .hero h1{animation:atelier-fade 1.4s cubic-bezier(.3,0,.2,1) backwards}
 .d-atelier .hero-body{animation:atelier-lift 1.2s .35s cubic-bezier(.2,.7,.2,1) backwards}
 .d-atelier .hero-image{animation:atelier-curtain 1.8s .2s cubic-bezier(.7,0,.2,1) backwards}
 .d-atelier .hero-image img{animation:atelier-settle 2.4s .2s cubic-bezier(.2,.7,.2,1) backwards}
 @supports (animation-timeline:view()){
  .work-item{animation:atelier-reveal linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
  .work-item img{animation:atelier-settle linear both;animation-timeline:view();animation-range:entry 0% exit 20%}
  .work-head,.approach-lead,.approach-steps li,.d-atelier .ledger-row,.d-atelier .section-head,.d-atelier .closing-words h2{animation:atelier-lift linear both;animation-timeline:view();animation-range:entry 5% cover 30%}
 }
}

@media (max-width:820px){
 .d-cafe .hero-words,.d-cafe .hero--type .hero-words,.d-cafe .hero-image{grid-column:1/-1}
 .d-cafe .hero-image{margin-top:2.5rem}
 .pinned{left:.75rem}
 .menu-card-head,.menu-lines,.visit-head,.visit-list{grid-column:1/-1}
 .visit-list{grid-template-columns:1fr}
 .d-atelier .hero h1,.d-atelier .hero-body,.approach-lead{grid-column:1/-1}
 .d-atelier .hero-image img{aspect-ratio:4/3}
 .work-item--1,.work-item--2,.work-item--3,.work-item--4{grid-column:1/-1;margin-top:0}
 .approach-steps,.approach-steps[data-count]{grid-template-columns:1fr;gap:2rem}
}
`;


/* The concept: what sets one firm's site apart from another's in the same direction. */
const CONCEPT = `
/* Signature parts. Each takes its direction's type and colours; nothing here switches voice mid-sentence. */
.sig{padding:clamp(4.5rem,9vw,8.5rem) var(--gut)}
.sig h2{font-family:var(--display);font-weight:var(--display-weight);letter-spacing:var(--display-track);line-height:1.04;hyphens:manual;overflow-wrap:normal}
.sig .section-head{display:flex;flex-direction:column;align-items:flex-start;gap:1rem;padding:0;margin:0;max-width:48rem}
.sig .section-head h2{font-size:clamp(2rem,3.6vw,3.4rem)}
.sig--year{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;align-items:end;background:var(--paper-2)}
.sig-year{grid-column:1/8;margin:0;font:var(--display-weight) clamp(7rem,24vw,22rem)/.78 var(--display);letter-spacing:-.045em;color:var(--accent);font-variant-numeric:oldstyle-nums proportional-nums}
.sig--year .sig-body{grid-column:8/13;display:flex;flex-direction:column;gap:1.6rem;padding-bottom:.6rem}
.sig--year h2{font-size:var(--h3)}
.sig-events{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.sig-events li{border-top:1px solid var(--line);padding:.85rem 0;color:var(--mute)}
.sig-events strong{color:var(--ink);font-weight:600;margin-right:.6rem;font-variant-numeric:tabular-nums}
.sig--owner{display:flex;justify-content:center}
.sig--owner figure{max-width:52rem;display:flex;flex-direction:column;gap:1.8rem}
.sig--owner blockquote{margin:0}
.sig--owner blockquote p{font:var(--display-weight) clamp(1.8rem,3.6vw,3.2rem)/1.18 var(--display);letter-spacing:var(--display-track);text-indent:-.4em;hanging-punctuation:first}
.sig--owner figcaption{display:flex;align-items:center;gap:1rem;font-size:1rem}
.sig--owner figcaption span{display:flex;flex-direction:column}
.sig--owner figcaption small{color:var(--mute);font-size:.92rem}
.sig-portrait{width:4.5rem;height:4.5rem;border-radius:50%;object-fit:cover}
.sig--everyday .section-head{margin-bottom:clamp(2rem,4vw,3.5rem)}
.sig-days{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:24px;align-items:start}
.sig-days[data-count="3"]{--n:3}.sig-days[data-count="5"]{--n:5}
.sig-days li{display:flex;flex-direction:column;gap:.7rem}
.sig-days li:nth-child(even){margin-top:clamp(0rem,4vw,3.5rem)}
.sig-frame{overflow:hidden;border-radius:calc(var(--radius) * .02)}
.sig-when{font:var(--display-weight) clamp(1.6rem,2.4vw,2.2rem)/1 var(--display);font-variant-numeric:tabular-nums;margin-top:.3rem}
.sig-days li p:last-child{color:var(--mute)}
.sig--area{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;background:var(--deep);color:var(--on-deep)}
.sig--area .label{color:var(--accent-on-deep)}
.sig-lead{grid-column:1/6;display:flex;flex-direction:column;gap:1.2rem}
.sig-lead > p{color:var(--on-deep-mute)}
.sig-places{grid-column:6/13;list-style:none;margin:0;padding:0 0 0 2rem;border-left:2px dashed var(--accent-on-deep);display:flex;flex-direction:column;gap:1.4rem}
.sig-places li{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap}
.sig-place{font:var(--display-weight) clamp(1.9rem,3.4vw,3rem)/1 var(--display);letter-spacing:var(--display-track)}
.sig-place-note{color:var(--on-deep-mute);font-size:.95rem}
.sig--numbers{border-block:1px solid var(--line)}
.sig-numbers{margin:1.5rem 0 0;display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:24px}
.sig-numbers[data-count="2"]{--n:2}
.sig-numbers div{display:flex;flex-direction:column-reverse;gap:.9rem;border-top:1px solid var(--ink);padding-top:1rem}
.sig-numbers dd{margin:0;padding-bottom:.12em;font:var(--display-weight) clamp(3.4rem,8vw,7rem)/.95 var(--display);letter-spacing:-.03em;font-variant-numeric:lining-nums tabular-nums}
.sig-numbers dt{color:var(--mute);max-width:22rem}
.sig--season{display:flex;justify-content:center}
.sig-card{background:var(--paper-2);max-width:34rem;padding:clamp(1.6rem,3vw,2.4rem);display:flex;flex-direction:column;gap:.8rem;rotate:-1.2deg;box-shadow:0 1px 1px #1d1a1018,0 22px 40px -24px #1d1a1066}
.sig-card h2{font-size:clamp(1.8rem,3vw,2.6rem)}
.sig-price{font-weight:700;font-variant-numeric:tabular-nums}
.d-formal .sig-card,.d-atelier .sig-card{rotate:none;box-shadow:none;border:1px solid var(--ink)}
/* Books: typographic covers standing on shelves, three to a shelf, year first; on a phone, one book a line. */
.sig--books .section-head{margin-bottom:clamp(2.2rem,4vw,3.5rem)}
.sig-shelf{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:clamp(.7rem,1.4vw,1.2rem);row-gap:clamp(2.4rem,4vw,3.4rem);align-items:end}
.sig-shelf[data-count="2"],.sig-shelf[data-count="4"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.sig-book{position:relative;min-height:clamp(15rem,20vw,19rem);display:flex;flex-direction:column;gap:.7rem;padding:1.4rem 1.4rem 1.5rem 1.7rem;background:var(--deep);color:var(--on-deep);box-shadow:inset 7px 0 0 #00000026}
.sig-book::after{content:"";position:absolute;left:calc(clamp(.7rem,1.4vw,1.2rem) * -1);right:0;bottom:calc(clamp(.6rem,1vw,.9rem) * -1);height:2px;background:var(--ink)}
.sig-book:nth-child(3n+1)::after{left:0}
.sig-book--2{background:var(--paper-2);color:var(--ink);min-height:clamp(13.5rem,17.5vw,16.5rem);box-shadow:inset 7px 0 0 #0000000f}
.sig-book--3{background:var(--accent);color:#fff;min-height:clamp(16.5rem,22vw,21rem)}
.sig-book-year{font:600 .82rem/1 var(--body);letter-spacing:.14em;text-transform:uppercase;opacity:.85;font-variant-numeric:lining-nums}
.sig-book-title{font:var(--display-weight) clamp(1.45rem,2.1vw,2rem)/1.12 var(--display);letter-spacing:var(--display-track);hyphens:manual;overflow-wrap:break-word;margin-top:auto}
.sig-book-title a{color:inherit;text-decoration-thickness:1px;text-underline-offset:.18em}
.sig-book-detail{font-size:.92rem;line-height:1.45;opacity:.9}
.sig-more{margin-top:2.2rem;color:var(--mute);max-width:40rem}
@media (max-width:820px){
 .sig-shelf,.sig-shelf[data-count]{grid-template-columns:1fr;row-gap:.6rem}
 .sig-book,.sig-book--2,.sig-book--3{min-height:0;padding:1.1rem 1.1rem 1.2rem 1.4rem}
 .sig-book::after{display:none}
 .sig-book-title{margin-top:.1rem;font-size:1.5rem}
}
.d-statement .sig h2,.d-statement .sig-place,.d-statement .sig-year,.d-statement .sig-numbers dd{text-transform:uppercase}
@media (max-width:820px){
 .sig-year,.sig--year .sig-body,.sig-lead,.sig-places{grid-column:1/-1}
 .sig-places{margin-top:2.5rem}
 .sig-days,.sig-numbers{grid-template-columns:1fr 1fr}
 .sig-days li:nth-child(even){margin-top:0}
}

/* Hero, full: the photo behind the words, with a quiet scrim so they stay readable. */
.hero--full{position:relative;isolation:isolate;background:var(--deep);color:var(--on-deep);min-height:min(92vh,56rem);align-content:end;align-items:end}
.hero--full .hero-image{position:absolute;inset:0;margin:0;z-index:-1;grid-column:auto;grid-row:auto;padding:0}
.hero--full .hero-image .frame,.hero--full .hero-image .arch{height:100%;border-radius:0;background:none}
.hero--full .hero-image img{width:100%;height:100%;aspect-ratio:auto;object-fit:cover;filter:none;mix-blend-mode:normal}
.hero--full .hero-image::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#0000 30%,#000000a8 100%),linear-gradient(90deg,#00000066,#0000 60%)}
.hero--full .hero-image figcaption,.hero--full .hero-note{display:none}
.hero--full .hero-words,.hero--full .hero-for,.hero--full h1,.hero--full .hero-body,.hero--full .hero-why,.hero--full .hero-reassurance{color:var(--on-deep)}
.hero.hero--full .hero-for{color:var(--on-deep)}
.hero--full .hero-why,.hero--full .hero-reassurance{color:#ffffffe6}
.hero--full .button{background:var(--on-deep);color:var(--deep)}
.hero--full .link-action{color:var(--on-deep)}
.hero--full .button--quiet{background:transparent;color:var(--on-deep);box-shadow:inset 0 0 0 1.5px var(--on-deep)}
.hero--full .button--quiet:hover{background:var(--on-deep);color:var(--deep)}
.hero--full :focus-visible{outline-color:var(--on-deep)}
.hero--full .pinned{position:absolute;left:auto;right:var(--gut);bottom:clamp(2rem,5vw,4rem);z-index:1;color:var(--ink)}

/* Feel: how photos are treated across the site. */
/* Natural, chosen on purpose, shows photos as they are, also where a direction would tint them. */
.f-natural .frame{background:none}
.f-natural .frame img,.f-natural .person img{filter:none;mix-blend-mode:normal}
.f-warm main img{filter:sepia(.14) saturate(1.12) contrast(1.03)}
.f-mono main img{filter:grayscale(1) contrast(1.08)}
.f-grain main figure,.f-grain .sig-frame,.f-grain .frame{position:relative}
.f-grain main figure::after,.f-grain .sig-frame::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.28;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* Motion: the signature always settles into view; lively adds more movement around it. */
@media (prefers-reduced-motion:no-preference){
 @keyframes sig-rise{from{opacity:.08;translate:0 1.6rem}}
 @keyframes sig-draw{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0)}}
 @keyframes sig-count{from{opacity:0;translate:0 .4em}}
 @supports (animation-timeline:view()){
  .sig .section-head,.sig-body,.sig--owner figure,.sig-days li,.sig-book,.sig-lead,.sig-places li,.sig-numbers div,.sig-card{animation:sig-rise linear both;animation-timeline:view();animation-range:entry 5% cover 28%}
  .sig-year{animation:sig-count linear both;animation-timeline:view();animation-range:entry 0% cover 30%}
  .sig-places{animation:sig-draw linear both;animation-timeline:view();animation-range:entry 10% cover 45%}
  .mo-lively .sig-days li:nth-child(2),.mo-lively .sig-places li:nth-child(2),.mo-lively .sig-numbers div:nth-child(2){animation-range:entry 12% cover 34%}
  .mo-lively .sig-days li:nth-child(3),.mo-lively .sig-places li:nth-child(3),.mo-lively .sig-numbers div:nth-child(3){animation-range:entry 18% cover 40%}
  .mo-lively .sig-days li:nth-child(4),.mo-lively .sig-places li:nth-child(4){animation-range:entry 24% cover 46%}
  .mo-lively .hero-image img{animation:sig-settle linear both;animation-timeline:scroll(root);animation-range:0 100vh}
  @keyframes sig-settle{from{scale:1.1}to{scale:1}}
 }
 .mo-lively .reason-list li,.mo-lively .sig-days li,.mo-lively .ledger-row{transition:translate .5s cubic-bezier(.2,.7,.2,1)}
 @media (hover:hover){.mo-lively .reason-list li:hover,.mo-lively .sig-days li:hover{translate:0 -6px}}
}
`;

export const STYLES = `${FONTS}${PALETTES}${DIRECTIONS}${BASE}${ROOMS}${CONCEPT}`;
