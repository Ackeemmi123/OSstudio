#!/usr/bin/env node
/**
 * Axivo's outreach template: one personal A4 sheet and one email per firm. Only
 * the wording lives here. Each firm's details come from a private JSON file, and
 * its pictures from its built concept, so a new prospect is one new entry.
 *
 *   node proof/outreach/sheets.mjs <firms.json> <out folder> <python with qrcode> <concepts address>
 *
 * Say a sheet was made for a firm only when its concept really was.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");
const [firmsFile, OUT, PY, BASE] = process.argv.slice(2);
const FIRMS = JSON.parse(readFileSync(firmsFile, "utf8"));
const LOCAL = "http://127.0.0.1:3210/concepts";
const SENDER = { name: "Alexander Hammarén", first: "Alexander", phone: "+358 40 826 6600", email: "alexander.hammaren@axivo.fi", initials: "AH" };
const PHOTO = path.resolve("proof/concepts/alexander.jpg");

const WORDS = {
  fi: {
    to: "Vastaanottaja",
    headline: (name) => `${name},<br>tältä verkkosivunne<br>voisivat näyttää.`,
    intro: "Halusimme tehdä teille jotain konkreettista. Suunnittelimme alustavan verkkosivuluonnoksen, jotta näette, miltä yrityksenne voisi näyttää verkossa.",
    made: (firm) => `Suunniteltu juuri ${firm.for}.`,
    caption: "Axivon luonnos. Kuva esittää idean, ei valmista sivustoa.",
    scan: "Kurkatkaa luonnos myös puhelimella.",
    hello: "Hei!",
    message: ["Olemme Axivo, pieni verkkosivutoimisto, joka auttaa yrityksiä erottumaan verkossa. Emme halunneet lähettää vain viestiä siitä, mitä voisimme tehdä, vaan päätimme näyttää sen.", "Luonnos on idea, ei valmis sivusto. Sen katsominen ei maksa mitään eikä sido teitä mihinkään.", "Palaan asiaan muutaman päivän kuluttua ja kuulisin mielelläni, mitä ajatuksia luonnos herätti. Voitte myös vastata suoraan tähän sähköpostiin."],
    regards: "Ystävällisin terveisin,",
    id: "Y-tunnus",
    footer: "Tämä on Axivon markkinointia. Löysimme yrityksenne yhteystiedot julkisista lähteistä. Jos ette halua meiltä lisää yhteydenottoja, kertokaa siitä sähköpostitse tai puhelimitse, niin poistamme tietonne yhteydenottolistaltamme ja luonnoksen verkosta.",
    privacy: "Tietosuoja",
    subject: (firm) => `${firm.name}: tältä verkkosivunne voisivat näyttää`,
    email: (firm, link, greeting) => `${greeting}

Olen Alexander Axivosta, pienestä verkkosivutoimistosta, joka auttaa yrityksiä erottumaan verkossa.

Halusin lähestyä teitä hieman tavallisesta poikkeavalla tavalla. En halunnut lähettää vain viestiä siitä, mitä voisimme tehdä, vaan päätimme näyttää sen konkreettisesti.

Teimme ${firm.for} alustavan verkkosivuluonnoksen. ${firm.note} Se ei ole valmis sivusto, vaan idea siitä, miltä verkkosivunne voisivat näyttää.

Luonnos on liitteenä, ja sen voi avata myös puhelimella: ${link}

Sen katsominen ei maksa mitään eikä sido teitä mihinkään.

Palaan asiaan muutaman päivän kuluttua ja kuulisin mielelläni, mitä ajatuksia luonnos herätti. Voitte myös vastata suoraan tähän sähköpostiin.

Ystävällisin terveisin,
Alexander Hammarén
Axivo
${SENDER.phone}
${SENDER.email}

--
Axivo Ab, Y-tunnus 3663995-7, axivo.fi
Tämä on Axivon markkinointia. Löysimme yrityksenne yhteystiedot julkisista lähteistä. Jos ette halua meiltä lisää yhteydenottoja, kertokaa siitä vastaamalla tähän viestiin, niin poistamme tietonne yhteydenottolistaltamme ja luonnoksen verkosta.
Tietosuoja: axivo.fi/privacy-policy`,
  },
  sv: {
    to: "Till",
    headline: (name) => `${name},<br>så här kunde er<br>webbplats se ut.`,
    intro: "Vi ville göra något konkret för er. Vi har tagit fram ett första utkast, så att ni ser hur ert företag kunde se ut på webben.",
    made: (firm) => `Gjort just för ${firm.for}.`,
    caption: "Utkast av Axivo. Bilden visar en idé, inte en färdig webbplats.",
    scan: "Kika på utkastet också på mobilen.",
    hello: "Hej!",
    message: ["Vi är Axivo, en liten webbyrå som hjälper företag att sticka ut på webben. Vi ville inte bara skicka ett meddelande om vad vi kunde göra, utan bestämde oss för att visa det.", "Utkastet är en idé, inte en färdig webbplats. Det kostar inget att titta på det och binder er inte till något.", "Jag återkommer om några dagar och skulle gärna höra vilka tankar utkastet väckte. Ni kan också svara direkt på det här mejlet."],
    regards: "Med vänliga hälsningar,",
    id: "FO-nummer",
    footer: "Det här är marknadsföring från Axivo. Vi hittade era kontaktuppgifter i offentliga källor. Vill ni inte höra mer från oss, säg till per e-post eller telefon, så tar vi bort era uppgifter från vår kontaktlista och utkastet från webben.",
    privacy: "Dataskydd",
    subject: (firm) => `${firm.name}: så här kunde er webbplats se ut`,
    email: (firm, link, greeting, altLink) => `${greeting}

Jag är Alexander från Axivo, en liten webbyrå som hjälper företag att sticka ut på webben.

Jag ville kontakta er på ett lite annorlunda sätt. Jag ville inte bara skicka ett meddelande om vad vi kunde göra, så vi bestämde oss för att visa det.

Vi har gjort ett första utkast till en webbplats för ${firm.for}. ${firm.note} Det är inte en färdig webbplats, utan en idé om hur er webbplats kunde se ut.

Utkastet finns som bilaga, och ni kan öppna det på mobilen: ${link}${altLink ? `\nSuomeksi: ${altLink}` : ""}

Det kostar inget att titta på det och binder er inte till något.

Jag återkommer om några dagar och skulle gärna höra vilka tankar utkastet väckte. Ni kan också svara direkt på det här mejlet.

Med vänliga hälsningar,
Alexander Hammarén
Axivo
${SENDER.phone}
${SENDER.email}

--
Axivo Ab, FO-nummer 3663995-7, axivo.fi
Det här är marknadsföring från Axivo. Vi hittade era kontaktuppgifter i offentliga källor. Vill ni inte höra mer från oss, svara på det här meddelandet, så tar vi bort era uppgifter från vår kontaktlista och utkastet från webben.
Dataskydd: axivo.fi/privacy-policy`,
  },
};

const qr = (key, file) => execFileSync(PY, ["-c", `import qrcode,qrcode.image.svg;qrcode.make("${BASE}/${key}/",image_factory=qrcode.image.svg.SvgPathImage,border=0).save("${file}")`]);

function sheet(firm) {
  const t = WORDS[firm.lang];
  const fi = WORDS.fi;
  const alt = firm.alt;
  const up = firm.up ? "text-transform:uppercase;" : "";
  const face = firm.stretch ?? "100%";
  const avatar = existsSync(PHOTO) ? `<img class="face" src="${PHOTO}" alt="">` : `<span class="face initials">${SENDER.initials}</span>`;
  return `<!doctype html><html lang="${firm.lang}"><meta charset="utf-8"><title>Axivo: ${firm.name}</title><style>
@font-face{font-family:H;src:url(../../concepts/${firm.slug}/fonts/${firm.font});font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:B;src:url(../../concepts/${firm.slug}/fonts/hanken-grotesk-latin-wght-normal.woff2);font-weight:100 900}
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}
body{width:210mm;height:297mm;background:${firm.paper};color:${firm.ink};font:400 10.8pt/1.4 B,sans-serif;position:relative;overflow:hidden}
.pad{padding:12mm 15mm 0}.top{display:flex;justify-content:space-between;align-items:baseline;gap:6mm;font-weight:600;font-size:9pt}.tag{font-weight:800;letter-spacing:.05em}
h1{font:${firm.w} ${firm.size}/1.02 H,serif;font-stretch:${face};${up}${firm.up ? "" : "letter-spacing:-.015em;"}margin:6mm 0 3mm}
.intro{font-size:12.5pt;line-height:1.35;max-width:160mm;margin:0}
.stage{position:relative;margin:6mm 0 0;height:${alt ? "90mm" : "103mm"};background:${firm.deep};overflow:hidden;padding:15mm 15mm 0;color:${firm.mute}}
.made{position:absolute;left:15mm;top:6mm;margin:0;color:#fff;font-size:10.5pt;font-weight:700}
.desk{width:${alt ? "112mm" : "126mm"};display:block;box-shadow:0 2mm 7mm #0007}.ph{position:absolute;right:15mm;top:6mm;width:41mm;border:1.3mm solid ${firm.paper};border-radius:5mm;box-shadow:0 3mm 8mm #000a}
.cap{position:absolute;left:15mm;bottom:3.5mm;width:125mm;margin:0;font-size:8.3pt}
.row{display:grid;grid-template-columns:1fr ${alt ? "62mm" : "41mm"};gap:9mm;padding:6mm 15mm 0}
.row p{margin:0 0 1.8mm}.hello{font:${firm.w} 14pt/1.1 H,serif;font-stretch:${face};${up}}
.sender{display:flex;align-items:center;gap:3.5mm;margin-top:3mm}.face{width:17mm;height:17mm;border-radius:50%;object-fit:cover;flex:none}
.initials{display:flex;align-items:center;justify-content:center;background:${firm.deep};color:#fff;font-weight:700;font-size:10pt;letter-spacing:.03em}
.sender small{display:block;font-size:9pt;line-height:1.3}.who{font:${firm.w} 13pt/1.15 H,serif;font-stretch:${face};${firm.up ? "font-size:11.5pt;" : ""}}
.scan{font:${firm.w} ${firm.up ? "12pt" : "11.5pt"}/1.12 H,serif;font-stretch:${face};${up}margin:0 0 2mm}.qr{width:100%;display:block}
.pair{display:flex;gap:4mm}.pair figure{margin:0;flex:1}.pair figcaption{font-size:8.5pt;font-weight:700;margin-top:1mm}
.alt{font-size:9pt;line-height:1.3;opacity:.9}
.foot{position:absolute;left:15mm;right:15mm;bottom:7mm;border-top:.3mm solid ${firm.ink};padding-top:1.6mm;font-size:7.2pt;line-height:1.3;opacity:.8}.foot p{margin:0}
</style><div class="pad"><div class="top"><span class="tag">AXIVO</span><span>${t.to}: ${firm.addr}</span></div><h1>${t.headline(firm.name)}</h1><p class="intro">${t.intro}</p></div>
<div class="stage"><p class="made">${t.made(firm)}</p><img class="desk" src="${firm.slug}-d.jpg" alt=""><img class="ph" src="${firm.slug}-p.jpg" alt=""><p class="cap">${t.caption}</p></div>
<div class="row"><div><p class="hello">${t.hello}</p>${t.message.map((line) => `<p>${line}</p>`).join("")}${alt ? `<p class="alt" lang="fi"><b>${alt.name}:</b> ${fi.intro} ${fi.message[1]}</p>` : ""}
<div class="sender">${avatar}<div><small>${t.regards}</small><div class="who">${SENDER.name}</div><small>Axivo · ${SENDER.phone} · ${SENDER.email}</small></div></div></div>
<div><p class="scan">${t.scan}</p>${alt ? `<div class="pair"><figure><img class="qr" src="${firm.slug}-qr.svg" alt="QR"><figcaption>På svenska</figcaption></figure><figure><img class="qr" src="${alt.slug}-qr.svg" alt="QR"><figcaption>Suomeksi</figcaption></figure></div>` : `<img class="qr" src="${firm.slug}-qr.svg" alt="QR">`}</div></div>
<div class="foot"><p>Axivo Ab · ${t.id} 3663995-7 · axivo.fi · ${t.privacy}: axivo.fi/privacy-policy</p><p>${t.footer}</p></div></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
for (const firm of FIRMS) {
  const t = WORDS[firm.lang];
  qr(firm.key, `${OUT}/${firm.slug}-qr.svg`);
  if (firm.alt) qr(firm.alt.key, `${OUT}/${firm.alt.slug}-qr.svg`);
  for (const [width, height, scale, kind] of [[1440, 900, 1, "d"], [390, 780, 2, "p"]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${LOCAL}/${kind === "p" && firm.alt ? firm.alt.slug : firm.slug}/`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    // Stop where the first section ends, so no picture cuts through the next one.
    const end = Math.ceil(await page.evaluate(() => document.querySelector(".hero").getBoundingClientRect().bottom));
    const bar = await page.evaluate(() => document.body.classList.contains("has-call-bar"));
    if (kind === "p") await page.setViewportSize({ width, height: Math.min(height, end + (bar ? 56 : 0)) });
    await page.screenshot({ path: `${OUT}/${firm.slug}-${kind}.jpg`, type: "jpeg", quality: 85, clip: kind === "d" ? { x: 0, y: 0, width, height: Math.min(height, end) } : undefined });
    await context.close();
  }
  writeFileSync(`${OUT}/${firm.slug}.html`, sheet(firm));
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const page = await context.newPage();
  await page.goto(`file://${path.resolve(OUT)}/${firm.slug}.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.pdf({ path: `${OUT}/${firm.slug}.pdf`, format: "A4", printBackground: true });
  await page.screenshot({ path: `${OUT}/${firm.slug}.jpg`, type: "jpeg", quality: 80 });
  await context.close();
  const greeting = firm.contact ? `${t.hello.slice(0, 3)} ${firm.contact}!` : t.hello;
  writeFileSync(`${OUT}/${firm.slug}.email.txt`, `Aihe / Ämne: ${t.subject(firm)}\n\n${t.email(firm, `${BASE}/${firm.key}/`, greeting, firm.alt ? `${BASE}/${firm.alt.key}/` : null)}\n`);
}
await browser.close();
