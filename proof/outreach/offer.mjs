#!/usr/bin/env node
/**
 * Axivo's one-page offer for meetings, in Finnish and Swedish. It publishes
 * nothing. Prices are arguments, because each site is quoted on its own scope;
 * the discount and the terms follow "Axivo: from yes to live".
 *
 *   node proof/outreach/offer.mjs <out folder> <fonts folder> [normal site price] [normal monthly price]
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("@playwright/test");
const [OUT, FONTS, SITE = "1800", CARE = "100"] = process.argv.slice(2);
const SENDER = { name: "Alexander Hammarén", phone: "+358 40 826 6600", email: "alexander.hammaren@axivo.fi" };
const PHOTO = path.resolve("proof/concepts/alexander.jpg");
const DISCOUNT = 0.8;

const euros = (value) => `${Math.round(value).toLocaleString("fi-FI").replace(/\s/g, " ")} €`;

const WORDS = {
  fi: {
    file: "Axivo-tarjous-fi",
    tag: "Tarjous viidelle ensimmäiselle asiakkaallemme",
    headline: "Verkkosivut valmiina, ilman että teidän tarvitsee tehdä niitä itse.",
    intro: "Viimeistelemme luonnoksen yhdessä teidän kanssanne ja huolehdimme sivustosta myös jatkossa. Saatte 20 % alennuksen, ja vastineeksi saamme näyttää sivuston ja käyttää teitä referenssinä.",
    head: ["", "Normaalisti", "Teille"],
    rows: [["Verkkosivusto", euros(SITE), euros(SITE * DISCOUNT)], ["Ylläpito, 12 ensimmäistä kuukautta", `${euros(CARE)}/kk`, `${euros(CARE * DISCOUNT)}/kk`]],
    vat: "Hinnat ilman arvonlisäveroa. Hinta tarkistetaan sivuston laajuuden mukaan ennen sopimusta.",
    blocks: [
      ["Sivustoon sisältyy", ["Enintään 5 sivua yhdellä kielellä", "Toimiva yhteydenottolomake", "Tietosuojaseloste", "Testaus puhelimella ja tietokoneella", "Kaksi muutoskierrosta", "Julkaisu omassa verkkotunnuksessanne"]],
      ["Ylläpitoon sisältyy", ["Hosting ja verkkotunnuksen uusiminen", "Päivitykset ja testaus", "Pienet tekstimuutokset, enintään 1 tunti kuukaudessa", "Vähimmäiskesto 12 kuukautta, sen jälkeen normaalihinta ja 1 kuukauden irtisanomisaika"]],
      ["Sovitaan erikseen", ["Toinen kieli", "Valokuvaus", "Verkkokauppa", "Ajanvarausjärjestelmän liittäminen. Painike nykyiselle ajanvaraussivullenne sisältyy."]],
      ["Teidän omanne", ["Verkkotunnus pysyy teidän nimissänne.", "Jos yhteistyö päättyy, saatte sivuston tiedostot ja sisällön."]],
    ],
    stepsTitle: "Näin edetään",
    steps: ["Sovimme työstä ja allekirjoitamme sopimuksen.", "Lähetätte tiedot ja kuvat lyhyen listan mukaan.", "Viimeistelemme sivuston, ja te hyväksytte sen.", "Julkaisemme sivuston."],
    timing: "Tavoitteemme on noin 2 viikkoa siitä, kun aineisto on perillä. Puolet laskutetaan työn alkaessa ja puolet ennen julkaisua, maksuaika 14 päivää.",
    next: "Aloitetaanko?",
    call: "Soittakaa tai vastatkaa sähköpostiin, niin sovitaan loput.",
    foot: "Axivo Ab · Y-tunnus 3663995-7 · axivo.fi. Tarjous on voimassa 14 päivää, ja lopulliset ehdot sovitaan sopimuksessa.",
  },
  sv: {
    file: "Axivo-tarjous-sv",
    tag: "Erbjudande till våra fem första kunder",
    headline: "En färdig webbplats, utan att ni behöver göra den själva.",
    intro: "Vi slutför utkastet tillsammans med er och tar hand om webbplatsen också framöver. Ni får 20 % rabatt, och i gengäld får vi visa webbplatsen och använda er som referens.",
    head: ["", "Normalt", "För er"],
    rows: [["Webbplats", euros(SITE), euros(SITE * DISCOUNT)], ["Underhåll, de 12 första månaderna", `${euros(CARE)}/mån`, `${euros(CARE * DISCOUNT)}/mån`]],
    vat: "Priserna är utan moms. Priset ses över enligt webbplatsens omfattning före avtalet.",
    blocks: [
      ["Webbplatsen innehåller", ["Högst 5 sidor på ett språk", "Ett fungerande kontaktformulär", "Dataskyddsbeskrivning", "Testning på mobil och dator", "Två ändringsrundor", "Publicering på er egen domän"]],
      ["Underhållet innehåller", ["Webbhotell och förnyelse av domänen", "Uppdateringar och testning", "Små textändringar, högst 1 timme i månaden", "Minst 12 månader, därefter normalpris och 1 månads uppsägningstid"]],
      ["Avtalas separat", ["Ett andra språk", "Fotografering", "Webbutik", "Koppling till ett bokningssystem. En knapp till er nuvarande bokningssida ingår."]],
      ["Det är ert", ["Domänen står i ert namn.", "Om samarbetet upphör får ni webbplatsens filer och innehåll."]],
    ],
    stepsTitle: "Så går det till",
    steps: ["Vi kommer överens om arbetet och skriver under avtalet.", "Ni skickar uppgifter och bilder enligt en kort lista.", "Vi slutför webbplatsen, och ni godkänner den.", "Vi publicerar webbplatsen."],
    timing: "Vårt mål är cirka 2 veckor från att materialet har kommit fram. Hälften faktureras när arbetet börjar och hälften före publicering, betalningstid 14 dagar.",
    next: "Ska vi sätta i gång?",
    call: "Ring eller svara på mejlet, så kommer vi överens om resten.",
    foot: "Axivo Ab · FO-nummer 3663995-7 · axivo.fi. Erbjudandet gäller i 14 dagar, och de slutliga villkoren fastställs i avtalet.",
  },
};

const sheet = (lang, t) => `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>Axivo: ${t.tag}</title><style>
@font-face{font-family:B;src:url(file://${path.resolve(FONTS)}/hanken-grotesk-latin-wght-normal.woff2);font-weight:100 900}
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}
body{width:210mm;height:297mm;background:#f5f1ea;color:#0e2a2e;font:400 10.2pt/1.38 B,sans-serif;padding:13mm 16mm 0;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:baseline;gap:6mm;font-size:9pt;font-weight:600}.mark{font-weight:800;letter-spacing:.05em}
h1{font:800 27pt/1.06 B,sans-serif;letter-spacing:-.015em;margin:7mm 0 3mm}
.intro{font-size:11.6pt;line-height:1.35;margin:0 0 6mm}
table{width:100%;border-collapse:collapse;background:#0e2a2e;color:#f5f1ea}
th,td{text-align:right;padding:2.6mm 4mm;font-weight:500}th{font-size:9pt;font-weight:600;color:#c4cfcd;padding-bottom:0}
td:first-child,th:first-child{text-align:left}td:nth-child(2){color:#c4cfcd;text-decoration:line-through;white-space:nowrap}td:last-child{font-size:15pt;font-weight:800;white-space:nowrap}
.vat{font-size:8.6pt;margin:1.6mm 0 6mm}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm 9mm}h2{font-size:10.6pt;font-weight:800;margin:0 0 1.2mm}
ul{margin:0;padding:0 0 0 4mm}li{margin:0 0 .5mm}
.steps{border-top:.3mm solid #0e2a2e;margin-top:6mm;padding-top:3.5mm}ol{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:1.5mm 0 2.5mm;padding:0;list-style:none;counter-reset:n}
ol li{counter-increment:n;font-size:9.4pt;line-height:1.3}ol li::before{content:counter(n);display:block;font-weight:800;font-size:13pt}
.timing{font-size:9.4pt;margin:0}
.close{display:flex;align-items:center;gap:5mm;margin-top:6mm}.close img{width:19mm;height:19mm;border-radius:50%;object-fit:cover}
.close b{display:block;font-size:15pt;font-weight:800;line-height:1.15}.close span{display:block;font-size:9.4pt}
.foot{position:absolute;left:16mm;right:16mm;bottom:7mm;border-top:.3mm solid #0e2a2e;padding-top:1.6mm;font-size:7.4pt;opacity:.8}
</style><div class="top"><span class="mark">AXIVO</span><span>${t.tag}</span></div>
<h1>${t.headline}</h1><p class="intro">${t.intro}</p>
<table><tr>${t.head.map((cell) => `<th>${cell}</th>`).join("")}</tr>${t.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>
<p class="vat">${t.vat}</p>
<div class="grid">${t.blocks.map(([title, lines]) => `<div><h2>${title}</h2><ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul></div>`).join("")}</div>
<div class="steps"><h2>${t.stepsTitle}</h2><ol>${t.steps.map((step) => `<li>${step}</li>`).join("")}</ol><p class="timing">${t.timing}</p></div>
<div class="close"><img src="file://${PHOTO}" alt=""><div><b>${t.next}</b><span>${t.call}</span><span>${SENDER.name} · ${SENDER.phone} · ${SENDER.email}</span></div></div>
<div class="foot">${t.foot}</div></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
for (const [lang, t] of Object.entries(WORDS)) {
  const file = path.resolve(OUT, `${t.file}.html`);
  writeFileSync(file, sheet(lang, t));
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => {
    const foot = document.querySelector(".foot").getBoundingClientRect().top;
    return document.querySelector(".close").getBoundingClientRect().bottom > foot;
  });
  if (overflow) throw new Error(`${t.file}: the content runs into the footer`);
  await page.pdf({ path: path.resolve(OUT, `${t.file}.pdf`), format: "A4", printBackground: true });
  await page.screenshot({ path: path.resolve(OUT, `${t.file}.jpg`), type: "jpeg", quality: 85 });
  await page.close();
}
await browser.close();
