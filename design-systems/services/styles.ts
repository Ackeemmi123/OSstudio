/**
 * The services design system's styles. Palettes and directions are a controlled
 * range: a site picks one of each and cannot supply its own values. Directions
 * change type, proportion and how sections are composed, not only colour.
 */
const FONTS = `
@font-face{font-family:"Newsreader";src:url(fonts/newsreader-latin-standard-normal.woff2) format("woff2");font-weight:200 800;font-style:normal;font-display:swap}
@font-face{font-family:"Newsreader";src:url(fonts/newsreader-latin-standard-italic.woff2) format("woff2");font-weight:200 800;font-style:italic;font-display:swap}
@font-face{font-family:"Schibsted Grotesk";src:url(fonts/schibsted-grotesk-latin-wght-normal.woff2) format("woff2");font-weight:400 900;font-style:normal;font-display:swap}
`;

const PALETTES = `
.p-pine{--paper:#f3efe6;--paper-2:#e9e3d6;--ink:#14281f;--mute:#4f5a50;--line:#14281f33;--deep:#17352c;--on-deep:#f4f0e6;--on-deep-mute:#c9cdbf;--on-deep-line:#ffffff33;--accent:#96591f;--accent-on-deep:#e2b27c;--action:#17352c;--on-action:#ffffff}
.p-oxblood{--paper:#f5f2ed;--paper-2:#ebe5dc;--ink:#231815;--mute:#5c4f4a;--line:#231815;--deep:#4b1a22;--on-deep:#f8f1e9;--on-deep-mute:#e0cec8;--on-deep-line:#ffffff3d;--accent:#7f2733;--accent-on-deep:#eec3a8;--action:#4b1a22;--on-action:#ffffff}
.p-signal{--paper:#f5f4ee;--paper-2:#e9e7dd;--ink:#101113;--mute:#50524f;--line:#10111340;--deep:#101113;--on-deep:#ffffff;--on-deep-mute:#c9c9c2;--on-deep-line:#ffffff40;--accent:#b93a06;--accent-on-deep:#ff9350;--action:#ff7a2b;--on-action:#101113}
`;

const DIRECTIONS = `
.d-editorial{--display:"Newsreader",Georgia,serif;--display-weight:300;--display-track:-.03em;--display-lead:.98;--h1-1:clamp(3.1rem,8.1vw,8.1rem);--h1-2:clamp(2.8rem,6.6vw,6.6rem);--h1-3:clamp(2.3rem,5vw,5rem);--h2:clamp(2.2rem,4.6vw,4.4rem);--h3:clamp(1.5rem,2.3vw,2.1rem);--h3-weight:400;--radius:0}
.d-formal{--display:"Newsreader",Georgia,serif;--display-weight:400;--display-track:-.018em;--display-lead:1.06;--h1-1:clamp(2.7rem,5.6vw,5.4rem);--h1-2:clamp(2.4rem,4.7vw,4.5rem);--h1-3:clamp(2.05rem,3.8vw,3.7rem);--h2:clamp(1.95rem,3.2vw,3.1rem);--h3:clamp(1.3rem,1.8vw,1.6rem);--h3-weight:500;--radius:0}
.d-statement{--display:"Schibsted Grotesk",system-ui,sans-serif;--display-weight:800;--display-track:-.045em;--display-lead:.94;--h1-1:clamp(3.4rem,10.4vw,11rem);--h1-2:clamp(3rem,8.6vw,9.2rem);--h1-3:clamp(2.5rem,6.4vw,6.8rem);--h2:clamp(2.3rem,5.4vw,5.4rem);--h3:clamp(1.35rem,2vw,1.8rem);--h3-weight:700;--radius:6px}
`;

const BASE = `
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 1.0625rem/1.55 "Schibsted Grotesk",system-ui,sans-serif;-webkit-font-smoothing:antialiased;--gut:clamp(20px,4.4vw,72px);overflow-wrap:break-word}
img{display:block;width:100%;height:auto;object-fit:cover}
a{color:inherit;text-underline-offset:.2em}
h1,h2,h3,p,ul,ol,figure,blockquote{margin:0;padding:0}
ul,ol{list-style:none}
h1,h2{font-family:var(--display);font-weight:var(--display-weight);letter-spacing:var(--display-track);line-height:var(--display-lead);hyphens:auto;hyphenate-limit-chars:14 6 6;text-wrap:balance}
h2{font-size:var(--h2);line-height:calc(var(--display-lead) + .06)}
h3{font-family:var(--display);font-size:var(--h3);font-weight:var(--h3-weight);line-height:1.12;letter-spacing:calc(var(--display-track) / 3);hyphens:auto;hyphenate-limit-chars:14 6 6}
h1 em{font-style:italic;color:var(--accent)}
@media (min-width:821px){h1 em{white-space:nowrap}}
[data-tier="1"] h1,h1{font-size:var(--h1-1)}
[data-tier="2"] h1{font-size:var(--h1-2)}
[data-tier="3"] h1{font-size:var(--h1-3)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:8px;top:8px;background:#fff;color:#111;padding:.6rem .9rem;z-index:10}
.test-note{background:var(--ink);color:var(--paper);font-size:.78rem;padding:.4rem var(--gut)}
.label{font-size:.875rem;font-family:"Schibsted Grotesk",system-ui,sans-serif;font-weight:400;letter-spacing:0;line-height:1.4;color:var(--mute)}
.button{display:inline-block;background:var(--action);color:var(--on-action);padding:1.05rem 1.6rem;text-decoration:none;font:500 1rem/1.2 "Schibsted Grotesk",system-ui,sans-serif;border:0;border-radius:var(--radius);cursor:pointer;transition:background-color .15s,color .15s}
.button:hover{background:var(--accent);color:#fff}
.button--small{padding:.72rem 1.05rem;font-size:.92rem}
.link-action{font-weight:500}
.site-header{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding:1.4rem var(--gut)}
.mark{font:400 1.45rem/1.1 "Newsreader",Georgia,serif;letter-spacing:-.01em;text-decoration:none}
.menu-wide{display:flex;align-items:center;gap:2.25rem;font-size:.95rem}
.menu-wide ul{display:flex;gap:2rem}
.menu-wide ul a{text-decoration:none}.menu-wide ul a:hover,.menu-wide ul a[aria-current]{text-decoration:underline}
.menu-narrow{display:none;position:relative}
.menu-narrow summary{list-style:none;cursor:pointer;padding:.6rem .95rem;border:1px solid currentColor;border-radius:var(--radius);font-size:.95rem;min-height:44px;display:flex;align-items:center}
.menu-narrow summary::-webkit-details-marker{display:none}
.menu-narrow nav{position:absolute;right:0;top:calc(100% + .5rem);z-index:5;width:min(78vw,300px);background:var(--paper);border:1px solid var(--ink);padding:.5rem 1.25rem 1.25rem}
.menu-narrow li a{display:block;padding:.75rem 0;text-decoration:none;border-bottom:1px solid var(--line)}
.menu-narrow .button{margin-top:1rem;display:block;text-align:center}

.hero{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px;padding:clamp(1.5rem,4vw,3.5rem) var(--gut) 0;position:relative}
.hero-for{grid-column:1/-1;margin-bottom:1.1rem}
.hero h1{grid-column:1/11}
.hero-why{grid-column:1/6;margin-top:clamp(2rem,4vw,3.5rem);font-size:clamp(1.1rem,1.5vw,1.3rem);line-height:1.45}
.hero-actions{grid-column:1/7;display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center;margin-top:2rem}
.hero-reassurance{grid-column:1/6;margin:1rem 0 clamp(3rem,6vw,6rem);font-size:.9rem;color:var(--mute)}
.hero-image{grid-column:8/13;grid-row:3/7;margin-top:clamp(2rem,4vw,3.5rem);margin-bottom:-9rem;position:relative;z-index:2}
.hero-image img{aspect-ratio:4/5}

.reasons{background:var(--deep);color:var(--on-deep);padding:clamp(3rem,6vw,5.5rem) var(--gut)}
.reason-list{display:grid;grid-template-columns:1fr;max-width:calc(50% - 12px)}
.reason-list li{display:grid;grid-template-columns:9rem minmax(0,1fr);gap:1rem;padding:1rem 0;border-top:1px solid var(--on-deep-line)}
.hero--type + .reasons .reason-list{max-width:none;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:24px}
.hero--type + .reasons .reason-list[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.hero--type + .reasons .reason-list[data-count="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}
.hero--type + .reasons .reason-list li{display:block}
.hero--type + .reasons .reason-list strong{display:block;margin-bottom:.35rem}
.reason-list strong{font-weight:500}
.reason-list span{color:var(--on-deep-mute)}

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
.steps li::before{content:counter(step);display:block;font:300 3.4rem/1 "Newsreader",Georgia,serif;color:var(--accent)}
.steps h3{margin:.8rem 0 .4rem;font:600 1.05rem/1.3 "Schibsted Grotesk",system-ui,sans-serif;letter-spacing:0}
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
 .hero h1,.hero-why,.hero-actions,.hero-reassurance{grid-column:1/-1}
 .hero-reassurance{margin-bottom:2rem}
 .hero-image{grid-column:3/-1;grid-row:auto;margin:0 calc(var(--gut) * -1) -5rem 0}
 .reasons{padding-top:8rem}
 .hero--type + .reasons{padding-top:3rem}
 .reason-list{max-width:none}
 .hero--type + .reasons .reason-list,.hero--type + .reasons .reason-list[data-count]{grid-template-columns:1fr}
 .reason-list li{grid-template-columns:1fr;gap:.1rem}
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


/* Formal: measured and upright. Hairlines instead of bands, the portrait inside the frame. */
.d-formal .mark{font-weight:500}
.d-formal .site-header{border-bottom:1px solid var(--line)}
.d-formal .label{text-transform:uppercase;letter-spacing:.09em;font-size:.76rem;font-weight:500}
.d-formal h1 em{color:inherit}
.d-formal .hero{padding-top:clamp(2rem,5vw,5rem)}
.d-formal .hero h1{grid-column:1/8;grid-row:2}
.d-formal .hero-for{grid-column:1/8}
.d-formal .hero-why{grid-column:1/7;grid-row:3}
.d-formal .hero-actions{grid-column:1/8;grid-row:4}
.d-formal .hero-reassurance{grid-column:1/7;grid-row:5;margin-bottom:clamp(3rem,6vw,5.5rem)}
.d-formal .hero-image{grid-column:9/13;grid-row:1/6;margin:0 0 clamp(3rem,6vw,5.5rem)}
.d-formal .reasons{background:transparent;color:inherit;padding:0 var(--gut)}
.d-formal .reason-list{max-width:none;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.d-formal .reason-list[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.d-formal .reason-list[data-count="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}
.d-formal .reason-list li{display:block;border:0;padding:2rem 0}
.d-formal .reason-list strong{display:block;font:500 clamp(1.25rem,1.7vw,1.5rem)/1.2 var(--display);margin-bottom:.5rem}
.d-formal .reason-list span{color:var(--mute)}
.d-formal .section-head{display:block;max-width:44rem}
.d-formal .section-head .label{padding:0;margin-bottom:1rem}
.d-formal .services{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px}
.d-formal .services .section-head{grid-column:1/6}
.d-formal .services .ledger{grid-column:7/13;border-top:1px solid var(--ink)}
.d-formal .ledger-row{display:block;padding:1.6rem 0}
.d-formal .ledger-row p{margin-top:.5rem;color:var(--mute)}
.d-formal .ledger-row .price{text-align:left;color:var(--ink)}
.d-formal .steps{background:transparent;margin:0;padding:0;border-top:1px solid var(--ink)}
.d-formal .steps li:nth-child(n){margin-top:0;padding-top:1.5rem}
.d-formal .steps li::before{font:400 1rem/1 var(--display);color:var(--accent);content:counter(step) ".";margin-bottom:.9rem}
.d-formal .steps h3{font:500 clamp(1.25rem,1.7vw,1.5rem)/1.2 var(--display)}
.d-formal .proof--credentials .credentials{justify-content:flex-start}
.d-formal .proof:not(.proof--image) .proof-words{grid-column:1/-1}
.d-formal .question-list{margin-left:0;max-width:52rem}
.d-formal .questions{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:24px}
.d-formal .questions .section-head{grid-column:1/6}
.d-formal .question-list{grid-column:7/13}
.d-formal .site-footer{background:var(--paper-2);border-top:0}
@media (max-width:820px){
 .d-formal .hero h1,.d-formal .hero-for,.d-formal .hero-why,.d-formal .hero-actions,.d-formal .hero-reassurance{grid-column:1/-1;grid-row:auto}
 .d-formal .hero-image{grid-column:1/-1;grid-row:auto;margin:0 0 3rem}
 .d-formal .reason-list,.d-formal .reason-list[data-count]{grid-template-columns:1fr;gap:0}
 .d-formal .reason-list li + li{border-top:1px solid var(--line)}
 .d-formal .reasons{padding-top:0}
 .d-formal .services .section-head,.d-formal .services .ledger,.d-formal .questions .section-head,.d-formal .question-list{grid-column:1/-1}
 .d-formal .steps,.d-formal .steps[data-count]{grid-template-columns:1fr;gap:0}
 .d-formal .steps li:nth-child(n){display:block;padding:1.25rem 0;border-bottom:1px solid var(--line)}
}

/* Statement: type-led and direct, for a firm whose visitor needs one thing now. */
.d-statement .mark{font:800 1.3rem/1 var(--display);letter-spacing:-.03em}
.d-statement .site-header{background:var(--deep);color:var(--on-deep)}
.d-statement .site-header .menu-narrow nav{color:var(--ink)}
.d-statement .site-header :focus-visible{outline-color:var(--accent-on-deep)}
.d-statement .hero{background:var(--deep);color:var(--on-deep);padding-top:clamp(2rem,6vw,6rem);padding-bottom:clamp(3rem,6vw,6rem)}
.d-statement .hero :focus-visible{outline-color:var(--accent-on-deep)}
.d-statement .hero .label,.d-statement .hero-reassurance{color:var(--on-deep-mute)}
.d-statement .hero h1{grid-column:1/-1}
.d-statement h1 em{font-style:normal;color:var(--accent-on-deep)}
.d-statement .hero-why{grid-column:1/7;font-size:clamp(1.15rem,1.7vw,1.45rem)}
.d-statement .hero-actions{grid-column:8/13;grid-row:3;margin-top:clamp(2rem,4vw,3.5rem);align-self:start;flex-direction:column;align-items:flex-start;gap:1.1rem}
.d-statement .hero-reassurance{grid-column:8/13;grid-row:4;margin:1rem 0 0}
.d-statement .hero .button--phone{font-size:clamp(1.25rem,2.2vw,1.9rem);font-weight:700;letter-spacing:-.02em;padding:1.25rem 1.75rem;max-width:100%}
.d-statement .hero .button:hover{background:#fff;color:#101113}
.d-statement .reasons{background:var(--paper);color:inherit;padding:0 var(--gut)}
.d-statement .reason-list{max-width:none;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding-top:clamp(2.5rem,5vw,4.5rem)}
.d-statement .reason-list[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}
.d-statement .reason-list[data-count="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}
.d-statement .reason-list li{display:block;border-top:4px solid var(--ink)}
.d-statement .reason-list strong{display:block;font:700 clamp(1.5rem,2.6vw,2.4rem)/1.05 var(--display);letter-spacing:-.03em;margin-bottom:.6rem}
.d-statement .reason-list span{color:var(--ink)}
.d-statement .section-head .label{color:var(--accent);font-weight:600}
.d-statement .section-head{display:block}
.d-statement .section-head .label{padding:0;margin-bottom:.9rem}
.d-statement .ledger{border-top:4px solid var(--ink)}
.d-statement .ledger-row .price{font-size:1.05rem;font-weight:700}
.d-statement .steps{background:var(--accent-on-deep);--mute:#101113}
.d-statement .steps li:nth-child(n){margin-top:0}
.d-statement .steps li::before{font:800 clamp(3.5rem,7vw,7rem)/.9 var(--display);letter-spacing:-.05em;color:var(--ink);margin-bottom:.8rem}
.d-statement .steps h3{font:700 1.4rem/1.15 var(--display);letter-spacing:-.02em}
.d-statement .proof--credentials .credentials{font-weight:500;justify-content:flex-start;border-top:0;border-bottom:0;padding:0}
.d-statement .proof:not(.proof--image) .proof-words{grid-column:1/-1}
.d-statement .question-list{margin-left:0;max-width:60rem}
.d-statement .question-list summary{font-weight:600;letter-spacing:-.015em}
.d-statement .question-list details{border-top-width:2px}
.d-statement .button--send{background:var(--action);color:var(--on-action)}
.d-statement .closing .button--send{background:var(--action);color:var(--on-action)}
.d-statement .closing .button--send:hover{background:#fff;color:#101113}
.d-statement .footer-mark{font-weight:800}
.d-statement .button:not(.hero .button):hover{background:var(--ink);color:#fff}
@media (max-width:820px){
 .d-statement .hero-why,.d-statement .hero-actions,.d-statement .hero-reassurance{grid-column:1/-1;grid-row:auto}
 .d-statement .hero-actions{margin-top:2rem}
 .d-statement .hero .button--phone{width:100%;text-align:center}
 .d-statement .reason-list,.d-statement .reason-list[data-count]{grid-template-columns:1fr;gap:0}
 .d-statement .steps li:nth-child(n){grid-template-columns:5.5rem minmax(0,1fr)}
}

/* The portrait stays on the first screen, however wide the window: it sits beside the words, not under them. */
@media (min-width:1100px){
 .hero--image{grid-template-rows:repeat(4,auto) 1fr}
 .hero--image .hero-for{grid-column:1/8;grid-row:1}
 .hero--image h1{grid-column:1/8;grid-row:2}
 .hero--image .hero-why{grid-row:3}
 .hero--image .hero-actions{grid-row:4}
 .hero--image .hero-reassurance{grid-row:5}
 .hero--image .hero-image{grid-column:8/13;grid-row:1/6;margin-top:0;align-self:start}
 .d-formal .hero--image .hero-image{grid-column:9/13}
}
/* Tablet: a portrait in proportion, not filling the screen. */
@media (min-width:561px) and (max-width:820px){
 .hero-image{grid-column:5/-1}
 .d-formal .hero-image{grid-column:1/8}
 .person,.person--no-photo{grid-column:span 6}
}
`;

export const STYLES = `${FONTS}${PALETTES}${DIRECTIONS}${BASE}`;
