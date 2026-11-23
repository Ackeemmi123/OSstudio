/**
 * Awkward content a real client will eventually bring: no photo, no proof, one
 * service, very long words and very long sentences. The design must hold for
 * each of these, in every direction.
 */
import type { Site, SiteDesign } from "../../design-systems/services/content";
import { SITES } from "./index";

const w = (text: string) => ({ text, origin: "person" as const });

function variant(base: Site, direction: SiteDesign["direction"], palette: SiteDesign["palette"], change: (content: Site["content"]) => void): Site {
  const content = structuredClone(base.content);
  change(content);
  return { content, design: { ...base.design, direction, palette } };
}

const { lindqvist, kivela, norrsken } = SITES;

/** One site with a concept: a hero choice, a signature part, a photo feel and a motion level. */
function concept(base: Site, design: Partial<SiteDesign> & Pick<SiteDesign, "direction" | "palette">, change: (content: Site["content"]) => void): Site {
  const content = structuredClone(base.content);
  change(content);
  return { content, design: { ...base.design, ...design } };
}

/** The same photo under a second name, so a proof can show three or four. */
const again = (content: Site["content"], id: string, as: string) => {
  const asset = content.assets.find((a) => a.id === id)!;
  content.assets.push({ ...asset, id: as });
};

export const STRESS_SITES: Record<string, Site> = {
  "concept-editorial-year-full": concept(lindqvist.site, { direction: "editorial", palette: "pine", hero: "full", signature: "year", feel: "warm", motion: "lively" }, (c) => {
    c.signature = { year: { year: "2009", heading: w("Since 2009, one office on the same street."), events: [{ when: "2009", text: w("Anna opens the office with three clients.") }, { when: "2016", text: w("Payroll added, for the first café on the street.") }, { when: "Today", text: w("About a hundred owner-run companies.") }] } };
  }),
  "concept-editorial-everyday": concept(lindqvist.site, { direction: "editorial", palette: "timber", signature: "everyday", feel: "grain" }, (c) => {
    again(c, "documents", "documents-2");
    again(c, "anna", "anna-2");
    c.signature = { everyday: { label: "An ordinary Tuesday", heading: w("What a month of bookkeeping looks like from here."), items: [{ imageId: "documents", when: "08.30", text: w("Receipts from the weekend, sorted before coffee.") }, { imageId: "anna-2", when: "11.00", text: w("Questions answered before noon, as promised.") }, { imageId: "documents-2", when: "15.00", text: w("The one-page summary goes out.") }] } };
  }),
  "concept-formal-owner": concept(kivela.site, { direction: "formal", palette: "oxblood", hero: "type", signature: "ownerLine", feel: "mono" }, (c) => {
    c.signature = { ownerLine: { text: w("Perheyrityksen omistajanvaihdos ei ole kauppa vaan sukupolvien välinen sopimus. Siihen kannattaa käyttää aikaa."), who: "Juhani Kivelä", role: "Asianajaja, osakas", imageId: "juhani", consent: "invented_test_data" } };
  }),
  "concept-cafe-season-full": concept(lindqvist.site, { direction: "cafe", palette: "terracotta", hero: "full", signature: "season", motion: "lively" }, (c) => {
    c.signature = { season: { label: "This month", title: w("Year-end, done before Christmas"), text: w("Send us the year's receipts by 10 December and the accounts are ready before the holidays."), price: w("From €900") } };
  }),
  "concept-atelier-area": concept(kivela.site, { direction: "atelier", palette: "slate", signature: "area", feel: "grain" }, (c) => {
    c.signature = { area: { label: "Missä toimimme", heading: w("Pirkanmaalta koko Länsi-Suomeen."), text: w("Tapaamme asiakkaat heidän omissa tiloissaan, kun se sopii paremmin."), places: [{ name: "Tampere", note: w("toimisto") }, { name: "Nokia" }, { name: "Valkeakoski" }, { name: "Pori", note: w("sopimuksen mukaan") }] } };
  }),
  "concept-statement-numbers": concept(norrsken.site, { direction: "statement", palette: "signal", signature: "numbers", motion: "lively" }, (c) => {
    c.signature = { numbers: { label: "Siffror från verkstaden", items: [{ value: "1 200", text: w("utryckningar förra året") }, { value: "45 min", text: w("i snitt till dörren i Åbo") }, { value: "24/7", text: w("jour, också på helger") }] } };
  }),

  "cafe-priced-note": variant(lindqvist.site, "cafe", "terracotta", (c) => {
    c.services.items[1] = { ...c.services.items[1], price: w("12 €") };
  }),
  "cafe-no-photo-no-hours": variant(lindqvist.site, "cafe", "ochre", (c) => {
    c.assets = [];
    delete c.promise.imageId;
    delete c.proof.imageId;
    delete c.about.imageId;
    c.about.people.forEach((person) => delete person.imageId);
    delete c.business.hours;
    delete c.business.address;
    c.services.items.forEach((item) => delete item.price);
  }),
  "atelier-gallery": variant(lindqvist.site, "atelier", "slate", (c) => {
    c.gallery = { label: "Selected work", heading: w("Rooms we have finished"), items: c.assets.map((asset) => ({ imageId: asset.id, caption: w(asset.alt) })) };
  }),
  "atelier-no-gallery": variant(kivela.site, "atelier", "verdigris", () => undefined),
  "no-photo-editorial": variant(lindqvist.site, "editorial", "pine", (c) => {
    c.assets = [];
    delete c.promise.imageId;
    delete c.proof.imageId;
    delete c.about.imageId;
    c.about.people.forEach((person) => delete person.imageId);
  }),
  "no-proof-formal": variant(kivela.site, "formal", "oxblood", (c) => {
    c.proof = { quotes: [], credentials: [] };
    c.about.people = [];
    delete c.about.peopleLabel;
  }),
  "one-service-statement": variant(norrsken.site, "statement", "signal", (c) => {
    c.services.items = [c.services.items[0]];
    c.firstSteps.items = c.firstSteps.items.slice(0, 2);
    c.reasons.items = c.reasons.items.slice(0, 2);
    c.questions.items = c.questions.items.slice(0, 1);
  }),
  "long-finnish-formal": variant(kivela.site, "formal", "oxblood", (c) => {
    c.promise.headline = w("Sukupolvenvaihdosjärjestelyt ja yrityskauppaneuvottelut perheyritysten omistajanvaihdostilanteissa");
    delete c.promise.turn;
    c.services.items[0].name = w("Sukupolvenvaihdosjärjestelyt");
    c.services.heading = w("Osakassopimusneuvottelut, yritysjärjestelyt ja omistajanvaihdostilanteet");
    c.business.name = "Asianajotoimisto Kivelä, Rautio ja Kumppanit";
    c.about.heading = w("Perheyritysten omistajanvaihdosasiantuntijat");
  }),
  "long-finnish-statement": variant(kivela.site, "statement", "signal", (c) => {
    c.assets = [];
    delete c.promise.imageId;
    delete c.about.imageId;
    c.about.people.forEach((person) => delete person.imageId);
    c.promise.headline = w("Lämpöpumppuasennuspalvelut taloyhtiöille");
    delete c.promise.turn;
    c.promise.action = { label: "Soita asennusneuvontapalveluumme", by: "phone" };
    c.services.items[0].name = w("Maalämpöjärjestelmäasennukset");
  }),
  "many-services-editorial": variant(lindqvist.site, "editorial", "pine", (c) => {
    const [first] = c.services.items;
    c.services.items = Array.from({ length: 8 }, (_, i) => ({ ...first, name: w(`${first.name.text} ${i + 1}`) }));
    c.questions.items = Array.from({ length: 12 }, (_, i) => ({ ...c.questions.items[0], question: w(`${c.questions.items[0].question.text} ${i + 1}`) }));
    c.promise.headline = w("Know exactly where your company stands, every single month, without having to ask anyone");
    delete c.promise.turn;
    c.business.name = "Lindqvist, Koski & Partners Accounting Services";
  }),
};
