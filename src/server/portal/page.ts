/**
 * The client portal's page: where the website stands, what the studio needs,
 * a place for files with the answers about their rights, and the review link.
 * Plain HTML with a small script that sends the forms; every text a person
 * typed is inserted with textContent, never as HTML. In the client's
 * language (the website's default), in the studio's colour.
 */
import type { PortalState } from "./portal";

type Locale = PortalState["locale"];

const T = {
  sv: {
    title: "Er webbplats",
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
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title><style>
:root{--c:${color};--ink:#151922;--muted:#5b6170;--line:#e3e6ee;--bg:#f7f9fc}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font-size:1.9rem;line-height:1.2;margin:.2rem 0 1rem;letter-spacing:-.02em}h2{font-size:1.2rem;margin:0 0 .6rem}
.from{color:var(--muted);font-size:.95rem}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:1.25rem 1.25rem 1.4rem;margin:0 0 1.25rem}
.track{display:grid;grid-template-columns:repeat(5,1fr);gap:.35rem;margin:.9rem 0 .4rem}.track span{height:6px;border-radius:9px;background:var(--line)}.track span.done{background:var(--c)}
.labels{display:grid;grid-template-columns:repeat(5,1fr);gap:.35rem;font-size:.75rem;color:var(--muted)}.labels .here{color:var(--ink);font-weight:600}
.btn{display:inline-block;background:var(--c);color:#fff;border:0;border-radius:999px;padding:.7rem 1.2rem;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.btn:disabled{opacity:.6}
label{display:block;font-size:.9rem;margin:.8rem 0 .25rem}input[type=text],textarea{width:100%;font:inherit;border:1px solid #c9cfdc;border-radius:10px;padding:.55rem .7rem;background:#fff}textarea{min-height:5rem}
.q{margin:1rem 0 0}.q p{margin:0 0 .3rem;font-weight:600}.file{border-top:1px solid var(--line);padding-top:.8rem;margin-top:.8rem}.file b{word-break:break-all}
.opt{display:flex;gap:.5rem;align-items:flex-start;font-size:.92rem;margin:.3rem 0}.opt input{margin-top:.3rem}
.ok{color:#23794a;font-weight:600}.err{color:#b42318}.muted{color:var(--muted);font-size:.9rem}.trap{position:absolute;left:-9999px}
@media (max-width:30rem){.labels{font-size:.65rem}}
</style></head><body><main>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`;
}

export function portalClosedPage(nonce: string): string {
  return shell("sv", T.sv.closedTitle, "#151922", `<h1>${T.sv.closedTitle}</h1><p>${T.sv.closed}</p><p class="muted">${T.en.closed}</p>`, nonce);
}

export function portalPage(state: PortalState, token: string, nonce: string): string {
  const t = T[state.locale] ?? T.sv;
  const color = state.color && /^#[0-9A-Fa-f]{6}$/.test(state.color) ? state.color : "#1F2A37";
  const { step, key } = portalStep(state);
  const track = t.steps.map((_, i) => `<span class="${i <= step ? "done" : ""}"></span>`).join("");
  const labels = t.steps.map((label, i) => `<span class="${i === step ? "here" : ""}">${esc(label)}</span>`).join("");
  const action = state.live
    ? `<a class="btn" href="${esc(state.live.url)}" rel="noopener">${t.openLive}</a>`
    : state.build && !state.build.approval
      ? `<a class="btn" href="${esc(state.build.link)}">${t.openReview}</a>`
      : "";
  const questions = state.questions.length
    ? `<form id="answers"><div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>${state.questions
        .map((q, i) => `<div class="q"><p id="q${i}">${esc(q.text)}</p><textarea aria-labelledby="q${i}" name="a" data-id="${esc(q.id)}"></textarea></div>`)
        .join("")}<label for="a-name">${t.name}</label><input type="text" id="a-name" name="author" maxlength="120" required><p><button class="btn" type="submit">${t.sendAnswers}</button></p><p class="msg" role="status"></p></form>`
    : `<p>${t.needNone}</p>`;
  const body = `<p class="from">${esc(state.studio)} · ${esc(state.client)}</p>
<h1>${t.title}</h1>
<section class="card" aria-label="${esc(t.steps[step])}"><div class="track" aria-hidden="true">${track}</div><div class="labels">${labels}</div><p>${t.status[key]}</p>${action}</section>
<section class="card"><h2>${t.needTitle}</h2>${questions}</section>
<section class="card"><h2>${t.filesTitle}</h2><p class="muted">${t.filesLead}</p><form id="files"><div class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div><label class="btn" for="pick" style="display:inline-block">${t.choose}</label><input type="file" id="pick" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden><div id="list"></div><label for="f-name">${t.name}</label><input type="text" id="f-name" maxlength="120" required><p><button class="btn" type="submit" disabled>${t.sendFiles}</button></p><p class="msg" role="status"></p></form><p class="muted">${t.privacy}</p></section>
<p class="muted">${state.studioEmail ? `${t.contact} <a href="mailto:${esc(state.studioEmail)}">${esc(state.studioEmail)}</a>. ` : ""}${t.valid} ${esc(new Date(state.expiresAt).toLocaleDateString(state.locale === "en" ? "en-GB" : `${state.locale}-FI`, { day: "numeric", month: "long", year: "numeric" }))}.</p>`;
  const texts = { thanksAnswers: t.thanksAnswers, error: t.error, shows: t.shows, rights: t.rights, rightsOwn: t.rightsOwn, rightsPermission: t.rightsPermission, people: t.people, peopleNone: t.peopleNone, peopleConsent: t.peopleConsent, refused: t.refused, files: [1, 2].map((n) => t.thanksFiles(n)) };
  const script = `(function(){var T=${JSON.stringify(texts).replace(/</g, "\\u003c")},api="/api/portal/${token}";
function el(tag,p,kids){var e=document.createElement(tag);for(var k in p||{}){if(k==="text")e.textContent=p[k];else e.setAttribute(k,p[k]);}(kids||[]).forEach(function(c){e.appendChild(c);});return e;}
var a=document.getElementById("answers");if(a)a.addEventListener("submit",function(ev){ev.preventDefault();var m=a.querySelector(".msg"),b=a.querySelector("button");b.disabled=true;var list=[].map.call(a.querySelectorAll("textarea"),function(t){return{id:t.getAttribute("data-id"),answer:t.value};});
fetch(api+"/answers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({author:a.author.value,answers:list,website:a.website.value})}).then(function(r){if(!r.ok)throw 0;m.className="msg ok";m.textContent=T.thanksAnswers;a.querySelectorAll("textarea").forEach(function(t){t.disabled=true;});}).catch(function(){b.disabled=false;m.className="msg err";m.textContent=T.error;});});
var f=document.getElementById("files"),pick=document.getElementById("pick"),list=document.getElementById("list"),chosen=[];
function radio(name,value,text){var id=name+value;return el("label",{"class":"opt","for":id},[el("input",{type:"radio",name:name,value:value,id:id}),el("span",{text:text})]);}
pick.addEventListener("change",function(){chosen=[].slice.call(pick.files,0,10);list.textContent="";chosen.forEach(function(file,i){list.appendChild(el("div",{"class":"file"},[el("b",{text:file.name}),el("label",{"for":"t"+i,text:T.shows}),el("input",{type:"text",id:"t"+i,maxlength:"200"}),el("p",{"class":"muted",text:T.rights}),radio("r"+i,"own",T.rightsOwn),radio("r"+i,"permission",T.rightsPermission),el("p",{"class":"muted",text:T.people}),radio("p"+i,"none",T.peopleNone),radio("p"+i,"consent",T.peopleConsent)]));});f.querySelector("button").disabled=!chosen.length;});
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
