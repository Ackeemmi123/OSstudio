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

export const STRESS_SITES: Record<string, Site> = {
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
