/**
 * The client portal's page: where the website stands, with the draft itself
 * in a small browser frame, what the studio needs, a place for files with the
 * answers about their rights, and who they talk to.
 * Plain HTML with a small script that sends the forms; every text a person
 * typed is inserted with textContent, never as HTML. In the client's
 * language (the website's default), in the studio's colour.
 */
import type { PortalState } from "./portal";

type Locale = PortalState["locale"];

const T = {
  sv: {
    title: "Er webbplats",
    stepOf: (n: number) => `Steg ${n} av 5`,
    stepText: ["Vi går igenom era mål och ert material.", "Vi skriver och bygger den första versionen.", "Ni tittar på utkastet och kommenterar direkt på sidan.", "Ert godkännande sparas och vi förbereder publiceringen.", "Webbplatsen är ute på er egen adress."],
    yourTurn: "Er tur",
    ourTurn: "Vi jobbar på det",
    privateBadge: "Privat sida",
    previewTitle: "Utkastet",
    previewOpen: "Öppna utkastet i helskärm",
    liveTitle: "Er webbplats",
    needCount: (n: number) => (n === 1 ? "1 fråga" : `${n} frågor`),
    talkTitle: "Ni pratar direkt med oss",
    talkLead: "Ingen mellanhand. Svara på frågorna här, eller skriv till oss när ni vill.",
    write: "Skriv till oss",
    drop: "Dra filer hit eller",
    previewSoon: "Utkastet visas här när det är klart.",
    stepsTitle: "Så går det till",
    from: "från",
    steps: ["Planering", "Utkast", "Granskning", "Godkänd", "Publicerad"],
    status: {
      start: "Vi har börjat planera er webbplats.",
      draft: "Vi skriver och bygger er webbplats.",
      review: "Ett utkast är klart. Titta på det och säg vad ni tycker.",
      approved: "Ni har godkänt webbplatsen. Vi förbereder publiceringen.",
      live: "Er webbplats är publicerad.",
    },
    openReview: "Granska och godkänn utkastet",
    openLive: "Öppna webbplatsen",
    needTitle: "Det här behöver vi av er",
    needNone: "Just nu behöver vi inget mer. Tack!",
    name: "Ert namn",
    answer: "Svar",
    sendAnswers: "Skicka svaren",
    thanksAnswers: "Tack! Vi har fått era svar.",
    filesTitle: "Skicka bilder och filer",
    filesLead: "Foton, logotyp eller dokument (JPG, PNG, WebP eller PDF, högst 4 MB per fil, högst 10 åt gången). Berätta kort vad varje fil visar.",
    choose: "Välj filer",
    shows: "Vad visar filen?",
    rights: "Rättigheter",
    rightsOwn: "Vi äger bilden eller filen",
    rightsPermission: "Vi har skriftligt tillstånd att använda den",
    people: "Personer",
    peopleNone: "Inga personer som kan kännas igen",
    peopleConsent: "Personerna som syns har gett sitt samtycke till att visas",
    sendFiles: "Skicka filerna",
    thanksFiles: (n: number) => (n === 1 ? "Tack! Filen har kommit fram." : `Tack! ${n} filer har kommit fram.`),
    refused: { answers: "svara på frågorna om rättigheter och personer", limit: "länken tar inte emot fler filer i dag", size: "filen är större än 4 MB", type: "bara JPG, PNG, WebP och PDF går att skicka", failed: "filen kunde inte tas emot, försök igen" },
    error: "Något gick fel. Försök igen.",
    closedTitle: "Länken är inte öppen",
    closed: "Länken har stängts eller gått ut. Be oss om en ny.",
    contact: "Frågor? Skriv till",
    privacy: "Det ni skickar här används bara för er webbplats och syns bara för oss.",
    valid: "Länken gäller till",
  },
  fi: {
    title: "Verkkosivustonne",
    stepOf: (n: number) => `Vaihe ${n}/5`,
    stepText: ["Käymme läpi tavoitteenne ja materiaalinne.", "Kirjoitamme ja rakennamme ensimmäisen version.", "Katsotte luonnoksen ja kommentoitte suoraan sivulla.", "Hyväksyntänne tallentuu, ja valmistelemme julkaisun.", "Sivusto on verkossa omassa osoitteessanne."],
    yourTurn: "Teidän vuoronne",
    ourTurn: "Työ on meillä",
    privateBadge: "Yksityinen sivu",
    previewTitle: "Luonnos",
    previewOpen: "Avaa luonnos koko näytölle",
    liveTitle: "Verkkosivustonne",
    needCount: (n: number) => (n === 1 ? "1 kysymys" : `${n} kysymystä`),
    talkTitle: "Puhutte suoraan meidän kanssamme",
    talkLead: "Ei välikäsiä. Vastatkaa kysymyksiin täällä tai kirjoittakaa meille milloin vain.",
    write: "Kirjoita meille",
    drop: "Vedä tiedostot tähän tai",
    previewSoon: "Luonnos näkyy tässä, kun se on valmis.",
    stepsTitle: "Näin etenemme",
    from: "–",
    steps: ["Suunnittelu", "Luonnos", "Tarkastus", "Hyväksytty", "Julkaistu"],
    status: {
      start: "Olemme aloittaneet verkkosivustonne suunnittelun.",
      draft: "Kirjoitamme ja rakennamme verkkosivustoanne.",
      review: "Luonnos on valmis. Katsokaa se ja kertokaa mielipiteenne.",
      approved: "Olette hyväksyneet sivuston. Valmistelemme julkaisua.",
      live: "Verkkosivustonne on julkaistu.",
    },
    openReview: "Tarkasta ja hyväksy luonnos",
    openLive: "Avaa sivusto",
    needTitle: "Tätä tarvitsemme teiltä",
    needNone: "Tällä hetkellä emme tarvitse muuta. Kiitos!",
    name: "Nimenne",
    answer: "Vastaus",
    sendAnswers: "Lähetä vastaukset",
    thanksAnswers: "Kiitos! Saimme vastauksenne.",
    filesTitle: "Lähetä kuvia ja tiedostoja",
    filesLead: "Valokuvia, logo tai asiakirjoja (JPG, PNG, WebP tai PDF, enintään 4 Mt tiedostoa kohden, enintään 10 kerralla). Kertokaa lyhyesti, mitä kukin tiedosto esittää.",
    choose: "Valitse tiedostot",
    shows: "Mitä tiedosto esittää?",
    rights: "Oikeudet",
    rightsOwn: "Omistamme kuvan tai tiedoston",
    rightsPermission: "Meillä on kirjallinen lupa käyttää sitä",
    people: "Henkilöt",
    peopleNone: "Ei tunnistettavia henkilöitä",
    peopleConsent: "Kuvassa näkyvät henkilöt ovat antaneet suostumuksensa",
    sendFiles: "Lähetä tiedostot",
    thanksFiles: (n: number) => (n === 1 ? "Kiitos! Tiedosto on perillä." : `Kiitos! ${n} tiedostoa on perillä.`),
    refused: { answers: "vastatkaa oikeuksia ja henkilöitä koskeviin kysymyksiin", limit: "linkki ei ota tänään vastaan enempää tiedostoja", size: "tiedosto on yli 4 Mt", type: "vain JPG, PNG, WebP ja PDF käyvät", failed: "tiedostoa ei voitu vastaanottaa, yrittäkää uudelleen" },
    error: "Jokin meni vikaan. Yrittäkää uudelleen.",
    closedTitle: "Linkki ei ole auki",
    closed: "Linkki on suljettu tai vanhentunut. Pyytäkää meiltä uusi.",
    contact: "Kysyttävää? Kirjoittakaa osoitteeseen",
    privacy: "Täällä lähettämiänne tietoja käytetään vain verkkosivustoonne, ja ne näkyvät vain meille.",
    valid: "Linkki on voimassa",
  },
  en: {
    title: "Your website",
    stepOf: (n: number) => `Step ${n} of 5`,
    stepText: ["We go through your goals and your material.", "We write and build the first version.", "You look at the draft and comment right on the page.", "Your approval is saved and we prepare the launch.", "The website is live on your own address."],
    yourTurn: "Your turn",
    ourTurn: "We are on it",
    privateBadge: "Private page",
    previewTitle: "The draft",
    previewOpen: "Open the draft full screen",
    liveTitle: "Your website",
    needCount: (n: number) => (n === 1 ? "1 question" : `${n} questions`),
    talkTitle: "You talk directly with us",
    talkLead: "No go-between. Answer the questions here, or write to us whenever you like.",
    write: "Write to us",
    drop: "Drag files here or",
    previewSoon: "The draft appears here when it is ready.",
    stepsTitle: "How it goes",
    from: "from",
    steps: ["Planning", "Draft", "Review", "Approved", "Live"],
    status: {
      start: "We have started planning your website.",
      draft: "We are writing and building your website.",
      review: "A draft is ready. Have a look and tell us what you think.",
      approved: "You approved the website. We are preparing to publish it.",
      live: "Your website is live.",
    },
    openReview: "Review and approve the draft",
    openLive: "Open the website",
    needTitle: "What we need from you",
    needNone: "We need nothing more right now. Thank you!",
    name: "Your name",
    answer: "Answer",
    sendAnswers: "Send the answers",
    thanksAnswers: "Thank you! We have your answers.",
    filesTitle: "Send photos and files",
    filesLead: "Photos, a logo or documents (JPG, PNG, WebP or PDF, at most 4 MB each, at most 10 at a time). Say briefly what each file shows.",
    choose: "Choose files",
    shows: "What does the file show?",
    rights: "Rights",
    rightsOwn: "We own the photo or file",
    rightsPermission: "We have written permission to use it",
    people: "People",
    peopleNone: "No people who can be recognised",
    peopleConsent: "The people in it agreed to be shown",
    sendFiles: "Send the files",
    thanksFiles: (n: number) => (n === 1 ? "Thank you! The file has arrived." : `Thank you! ${n} files have arrived.`),
    refused: { answers: "answer the questions about rights and people", limit: "the link takes no more files today", size: "the file is larger than 4 MB", type: "only JPG, PNG, WebP and PDF can be sent", failed: "the file could not be received, try again" },
    error: "Something went wrong. Try again.",
    closedTitle: "The link is not open",
    closed: "The link was turned off or has expired. Ask us for a new one.",
    contact: "Questions? Write to",
    privacy: "What you send here is used only for your website and seen only by us.",
    valid: "The link works until",
  },
} as const;

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Where the website stands, as a step from 0 to 4 and its sentence. */
export function portalStep(state: PortalState): { step: number; key: keyof (typeof T)["sv"]["status"] } {
  if (state.live) return { step: 4, key: "live" };
  if (state.build?.approval) return { step: 3, key: "approved" };
  if (state.build) return { step: 2, key: "review" };
  if (state.spec) return { step: 1, key: "draft" };
  return { step: 0, key: "start" };
}

function shell(locale: Locale, title: string, color: string, body: string, nonce: string, script = ""): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="light"><title>${esc(title)}</title><style>
:root{--c:${color};--ink:#11151d;--muted:#5d6472;--soft:#8a909c;--line:#e6e8ee;--bg:#f6f7f9;--card:#fff;--tint:color-mix(in srgb,var(--c) 9%,#fff);--tint2:color-mix(in srgb,var(--c) 16%,#fff)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:radial-gradient(1200px 520px at 50% -180px,var(--tint2),transparent 70%),var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}main{max-width:68rem;margin:0 auto;padding:1.25rem 1.25rem 4rem}
.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.5rem 0 2.25rem}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:650;letter-spacing:-.01em}.dot{width:.7rem;height:.7rem;border-radius:50%;background:var(--c);box-shadow:0 0 0 4px var(--tint2)}
.badge{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:999px;padding:.3rem .7rem}.badge svg{width:.85rem;height:.85rem}
.hero{display:grid;gap:2rem;grid-template-columns:minmax(0,1fr);align-items:start;margin-bottom:2rem}
@media (min-width:56rem){.hero{grid-template-columns:minmax(0,5fr) minmax(0,6fr)}}
.eyebrow{font-size:.82rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c);margin:0 0 .6rem}
h1{font-size:clamp(2.1rem,5vw,3.3rem);line-height:1.05;letter-spacing:-.035em;margin:0 0 1rem;font-weight:700}
.lead{font-size:1.15rem;color:#2c323d;margin:0 0 1.4rem;max-width:32rem}
.turn{display:inline-flex;align-items:center;gap:.45rem;font-size:.8rem;font-weight:650;border-radius:999px;padding:.32rem .75rem;margin:0 0 1.1rem}.turn.you{background:var(--c);color:#fff}.turn.us{background:#fff;border:1px solid var(--line);color:var(--muted)}.turn i{width:.45rem;height:.45rem;border-radius:50%;background:currentColor;display:inline-block}
.btn{display:inline-flex;align-items:center;gap:.5rem;background:var(--c);color:#fff;border:0;border-radius:999px;padding:.8rem 1.35rem;font:inherit;font-weight:650;text-decoration:none;cursor:pointer;box-shadow:0 8px 24px -10px var(--c);transition:transform .15s,box-shadow .15s}.btn:hover{transform:translateY(-1px)}.btn:disabled{opacity:.55;box-shadow:none;transform:none;cursor:default}.btn svg{width:1rem;height:1rem}
.btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line);box-shadow:none}
.steps{list-style:none;margin:0;padding:0;counter-reset:s}.steps li{position:relative;padding:0 0 1.15rem 2.6rem}.steps li:last-child{padding-bottom:0}
.steps li:before{content:"";position:absolute;left:.84rem;top:1.8rem;bottom:.2rem;width:2px;background:var(--line)}.steps li:last-child:before{display:none}.steps li.done:before{background:var(--c)}
.mark{position:absolute;left:0;top:0;width:1.75rem;height:1.75rem;border-radius:50%;display:grid;place-items:center;font-size:.8rem;font-weight:700;background:#fff;border:2px solid var(--line);color:var(--soft)}
.steps li.done .mark{background:var(--c);border-color:var(--c);color:#fff}.steps li.here .mark{border-color:var(--c);color:var(--c);box-shadow:0 0 0 5px var(--tint)}
.steps b{display:block;font-weight:650}.steps li.todo b{color:var(--soft)}.steps .t{display:block;font-size:.92rem;color:var(--muted)}.steps li.todo .t{color:var(--soft)}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:1.5rem;box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 32px -22px rgba(16,24,40,.25)}
.card.preview{padding:0;overflow:hidden}.chrome{display:flex;align-items:center;gap:.4rem;padding:.7rem .9rem;border-bottom:1px solid var(--line);background:#fbfbfc}.chrome i{width:.6rem;height:.6rem;border-radius:50%;background:#e1e4ea;display:inline-block}.chrome em{font-style:normal;font-size:.78rem;color:var(--muted);margin-left:.5rem}
.frame{position:relative;height:22rem;overflow:hidden;background:#fff}.frame iframe{position:absolute;top:0;left:0;width:1280px;height:1600px;border:0;transform-origin:0 0;pointer-events:none}
.frame a{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:flex-end;padding:1rem;text-decoration:none;background:linear-gradient(180deg,transparent 60%,rgba(17,21,29,.28))}.frame a span{background:#fff;border-radius:999px;padding:.45rem .9rem;font-size:.85rem;font-weight:650;box-shadow:0 6px 18px -8px rgba(0,0,0,.4)}
.empty{display:grid;place-items:center;text-align:center;min-height:16rem;color:var(--muted);background:repeating-linear-gradient(135deg,#fafbfc 0 14px,#f3f5f8 14px 28px)}.empty b{display:block;color:var(--ink);font-size:1.05rem;margin-bottom:.25rem}
.grid{display:grid;gap:1.25rem;grid-template-columns:minmax(0,1fr)}@media (min-width:56rem){.grid{grid-template-columns:minmax(0,7fr) minmax(0,4fr)}}
h2{font-size:1.25rem;letter-spacing:-.015em;margin:0 0 .35rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}.count{font-size:.78rem;font-weight:650;color:var(--c);background:var(--tint);border-radius:999px;padding:.15rem .6rem}
.sub{color:var(--muted);margin:0 0 1rem;font-size:.95rem}
label{display:block;font-size:.88rem;font-weight:600;margin:.9rem 0 .3rem}input[type=text],textarea{width:100%;font:inherit;border:1px solid #d3d7e0;border-radius:12px;padding:.65rem .8rem;background:#fff;transition:border-color .15s,box-shadow .15s}input[type=text]:focus,textarea:focus{outline:0;border-color:var(--c);box-shadow:0 0 0 4px var(--tint)}textarea{min-height:5.5rem;resize:vertical}
.q{margin:0 0 1.1rem;padding:0 0 0 2.4rem;position:relative}.q p{margin:0 0 .45rem;font-weight:600}.q .n{position:absolute;left:0;top:0;width:1.6rem;height:1.6rem;border-radius:8px;background:var(--tint);color:var(--c);font-size:.8rem;font-weight:700;display:grid;place-items:center}
.done-note{display:flex;gap:.7rem;align-items:center;color:#24553a;background:#eef8f1;border-radius:14px;padding:.9rem 1rem}.done-note svg{flex:none;width:1.2rem;height:1.2rem}
.drop{border:1.5px dashed #c9cfda;border-radius:16px;padding:1.4rem;text-align:center;background:#fbfcfd;transition:border-color .15s,background .15s}.drop.over{border-color:var(--c);background:var(--tint)}.drop p{margin:0 0 .7rem;color:var(--muted)}
.file{border-top:1px solid var(--line);padding-top:.9rem;margin-top:.9rem}.file b{word-break:break-all}
.opt{display:flex;gap:.55rem;align-items:flex-start;font-size:.93rem;font-weight:400;margin:.35rem 0}.opt input{margin-top:.35rem;accent-color:var(--c)}
.talk{background:var(--ink);color:#fff;border-color:var(--ink)}.talk .sub{color:#c5cad3}.talk .btn{background:#fff;color:var(--ink);box-shadow:none}
.ok{color:#23794a;font-weight:600}.err{color:#b42318}.muted{color:var(--muted);font-size:.88rem}.trap{position:absolute;left:-9999px}
.foot{margin-top:2.5rem;display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;justify-content:space-between;color:var(--soft);font-size:.84rem}
@media (max-width:40rem){main{padding:1rem 1rem 3rem}.top{padding-bottom:1.5rem}.card{padding:1.2rem;border-radius:18px}.frame{height:15rem}}
@media (prefers-reduced-motion:reduce){.btn{transition:none}.btn:hover{transform:none}}
</style></head><body><main>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

const LOCK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`;
const ARROW = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`;
const CHECK = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="m6.5 10.2 2.3 2.3 4.7-4.9"/></svg>`;

export function portalClosedPage(nonce: string): string {
  return shell("sv", T.sv.closedTitle, "#151922", `<h1>${T.sv.closedTitle}</h1><p>${T.sv.closed}</p><p class="muted">${T.en.closed}</p>`, nonce);
}

export function portalPage(state: PortalState, token: string, nonce: string): string {
  const t = T[state.locale] ?? T.sv;
  const color = state.color && /^#[0-9A-Fa-f]{6}$/.test(state.color) ? state.color : "#1F2A37";
  const { step, key } = portalStep(state);
  const reviewing = Boolean(state.build && !state.build.approval && !state.live);
  const yourTurn = reviewing || state.questions.length > 0;
  const action = state.live
    ? `<a class="btn" href="${esc(state.live.url)}" rel="noopener">${t.openLive} ${ARROW}</a>`
    : reviewing
      ? `<a class="btn" href="${esc(state.build!.link)}">${t.openReview} ${ARROW}</a>`
      : "";
  const steps = t.steps
    .map((label, i) => {
      const phase = i < step || (i === step && step === 4) ? "done" : i === step ? "here" : "todo";
      return `<li class="${phase}"${i === step ? ' aria-current="step"' : ""}><span class="mark">${phase === "done" ? "✓" : i + 1}</span><b>${esc(label)}</b><span class="t">${esc(t.stepText[i])}</span></li>`;
    })
    .join("");
  const preview = state.live
    ? `<div class="card preview"><div class="chrome"><i></i><i></i><i></i><em>${esc(state.live.domain ?? state.live.url)}</em></div><div class="empty"><div><b>${t.liveTitle}</b><a class="btn" href="${esc(state.live.url)}" rel="noopener">${t.openLive} ${ARROW}</a></div></div></div>`
    : state.build
      ? `<div class="card preview"><div class="chrome"><i></i><i></i><i></i><em>${t.previewTitle}</em></div><div class="frame" id="frame"><iframe src="${esc(state.build.link)}" title="${esc(t.previewTitle)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe><a href="${esc(state.build.link)}"><span>${t.previewOpen}</span></a></div></div>`
      : `<div class="card preview"><div class="chrome"><i></i><i></i><i></i><em>${t.previewTitle}</em></div><div class="empty"><div><b>${t.previewTitle}</b>${t.previewSoon}</div></div></div>`;
  const questions = state.questions.length
    ? `<form id="answers"><div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>${state.questions
        .map((q, i) => `<div class="q"><span class="n" aria-hidden="true">${i + 1}</span><p id="q${i}">${esc(q.text)}</p><textarea aria-labelledby="q${i}" name="a" data-id="${esc(q.id)}"></textarea></div>`)
        .join("")}<label for="a-name">${t.name}</label><input type="text" id="a-name" name="author" maxlength="120" required><p><button class="btn" type="submit">${t.sendAnswers}</button></p><p class="msg" role="status"></p></form>`
    : `<p class="done-note">${CHECK}<span>${t.needNone}</span></p>`;
  const until = new Date(state.expiresAt).toLocaleDateString(state.locale === "en" ? "en-GB" : `${state.locale}-FI`, { day: "numeric", month: "long", year: "numeric" });
  const body = `<header class="top"><div class="brand"><span class="dot" aria-hidden="true"></span>${esc(state.studio)}</div><span class="badge">${LOCK}${t.privateBadge}</span></header>
<section class="hero" aria-label="${esc(t.steps[step])}"><div><p class="eyebrow">${esc(state.client)}</p><h1>${t.title}</h1><p class="turn ${yourTurn ? "you" : "us"}"><i aria-hidden="true"></i>${yourTurn ? t.yourTurn : t.ourTurn} · ${t.stepOf(step + 1)}</p><p class="lead">${t.status[key]}</p>${action}</div>${preview}</section>
<div class="grid"><div>
<section class="card" id="need"><h2>${t.needTitle}${state.questions.length ? ` <span class="count">${t.needCount(state.questions.length)}</span>` : ""}</h2>${questions}</section>
<section class="card" style="margin-top:1.25rem"><h2>${t.filesTitle}</h2><p class="sub">${t.filesLead}</p><form id="files"><div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div><div class="drop" id="drop"><p>${t.drop}</p><label class="btn ghost" for="pick" style="display:inline-flex;margin:0">${t.choose}</label></div><input type="file" id="pick" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden><div id="list"></div><label for="f-name">${t.name}</label><input type="text" id="f-name" maxlength="120" required><p><button class="btn" type="submit" disabled>${t.sendFiles}</button></p><p class="msg" role="status"></p></form><p class="muted">${t.privacy}</p></section>
</div><div>
<section class="card"><h2>${t.stepsTitle}</h2><ol class="steps" style="margin-top:1rem">${steps}</ol></section>
<section class="card talk" style="margin-top:1.25rem"><h2>${t.talkTitle}</h2><p class="sub">${t.talkLead}</p>${state.studioEmail ? `<a class="btn" href="mailto:${esc(state.studioEmail)}">${t.write} ${ARROW}</a><p class="muted" style="color:#c5cad3;margin:.7rem 0 0">${esc(state.studioEmail)}</p>` : ""}</section>
</div></div>
<footer class="foot"><span>${esc(state.studio)}</span><span>${t.valid} ${esc(until)}.</span></footer>`;
  const texts = { thanksAnswers: t.thanksAnswers, error: t.error, shows: t.shows, rights: t.rights, rightsOwn: t.rightsOwn, rightsPermission: t.rightsPermission, people: t.people, peopleNone: t.peopleNone, peopleConsent: t.peopleConsent, refused: t.refused, files: [1, 2].map((n) => t.thanksFiles(n)) };
  const script = `(function(){var T=${JSON.stringify(texts).replace(/</g, "\\u003c")},api="/api/portal/${token}";
function el(tag,p,kids){var e=document.createElement(tag);for(var k in p||{}){if(k==="text")e.textContent=p[k];else e.setAttribute(k,p[k]);}(kids||[]).forEach(function(c){e.appendChild(c);});return e;}
var a=document.getElementById("answers");if(a)a.addEventListener("submit",function(ev){ev.preventDefault();var m=a.querySelector(".msg"),b=a.querySelector("button");b.disabled=true;var list=[].map.call(a.querySelectorAll("textarea"),function(t){return{id:t.getAttribute("data-id"),answer:t.value};});
fetch(api+"/answers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({author:a.author.value,answers:list,website:a.website.value})}).then(function(r){if(!r.ok)throw 0;m.className="msg ok";m.textContent=T.thanksAnswers;a.querySelectorAll("textarea").forEach(function(t){t.disabled=true;});}).catch(function(){b.disabled=false;m.className="msg err";m.textContent=T.error;});});
var f=document.getElementById("files"),pick=document.getElementById("pick"),list=document.getElementById("list"),chosen=[];
function radio(name,value,text){var id=name+value;return el("label",{"class":"opt","for":id},[el("input",{type:"radio",name:name,value:value,id:id}),el("span",{text:text})]);}
function take(files){chosen=[].slice.call(files,0,10);list.textContent="";chosen.forEach(function(file,i){list.appendChild(el("div",{"class":"file"},[el("b",{text:file.name}),el("label",{"for":"t"+i,text:T.shows}),el("input",{type:"text",id:"t"+i,maxlength:"200"}),el("p",{"class":"muted",text:T.rights}),radio("r"+i,"own",T.rightsOwn),radio("r"+i,"permission",T.rightsPermission),el("p",{"class":"muted",text:T.people}),radio("p"+i,"none",T.peopleNone),radio("p"+i,"consent",T.peopleConsent)]));});f.querySelector("button").disabled=!chosen.length;}
pick.addEventListener("change",function(){take(pick.files);});
var drop=document.getElementById("drop");["dragenter","dragover"].forEach(function(n){drop.addEventListener(n,function(e){e.preventDefault();drop.classList.add("over");});});["dragleave","drop"].forEach(function(n){drop.addEventListener(n,function(e){e.preventDefault();drop.classList.remove("over");});});drop.addEventListener("drop",function(e){if(e.dataTransfer&&e.dataTransfer.files.length)take(e.dataTransfer.files);});
var frame=document.getElementById("frame");if(frame){var fit=function(){var i=frame.querySelector("iframe");if(i)i.style.transform="scale("+(frame.clientWidth/1280)+")";};fit();window.addEventListener("resize",fit);}
f.addEventListener("submit",function(ev){ev.preventDefault();var m=f.querySelector(".msg"),b=f.querySelector("button"),author=document.getElementById("f-name").value,stored=0,refused=[],i=0;b.disabled=true;m.textContent="";
function done(){if(stored){m.appendChild(el("p",{"class":"ok",text:stored===1?T.files[0]:T.files[1].replace("2",String(stored))}));}refused.forEach(function(x){m.appendChild(el("p",{"class":"err",text:x.title+": "+(T.refused[x.reason]||T.error)}));});if(stored&&!refused.length){list.textContent="";chosen=[];pick.value="";}else b.disabled=false;}
function next(){if(i>=chosen.length)return done();var k=i++,file=chosen[k],d=new FormData(),r=f.querySelector("input[name=r"+k+"]:checked"),p=f.querySelector("input[name=p"+k+"]:checked");
d.append("author",author);d.append("website",f.website.value);d.append("file",file);d.append("title_0",document.getElementById("t"+k).value||file.name);d.append("rights_0",r?r.value:"");d.append("people_0",p?p.value:"");if(i>=chosen.length){d.append("last","1");}
d.append("sent",String(stored));
fetch(api+"/files",{method:"POST",body:d}).then(function(res){return res.json().catch(function(){return{};});}).then(function(j){stored+=j.stored||0;(j.refused||[]).forEach(function(x){refused.push(x);});if(!j.stored&&!j.refused)refused.push({title:file.name,reason:"failed"});next();}).catch(function(){refused.push({title:file.name,reason:"failed"});next();});}
next();});
})();`;
  return shell(state.locale, `${t.title} · ${state.client}`, color, body, nonce, script);
}
