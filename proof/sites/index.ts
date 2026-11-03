/**
 * The proof's three invented firms. Everything here is made up, including the
 * people and quotes, and the published page says so. Written by hand for Gate 1,
 * so the design is judged before any AI drafting exists. The photos are stock,
 * for internal review only: a real client's would be their own.
 */
import type { Site } from "../../design-systems/services/content";
import { siteContent, siteDesign } from "../../design-systems/services/content";
import { briefs, type Brief } from "./briefs";

const w = (text: string) => ({ text, origin: "person" as const });

const STOCK = { source: "Unsplash", licence: "Unsplash licence. Internal review only; check before any client use." };
const photo = (id: string, unsplash: string, width: number, height: number, alt: string, showsPerson: boolean) => ({ id, src: `https://images.unsplash.com/photo-${unsplash}`, width, height, alt, showsPerson, ...STOCK });

const lindqvist: Site = {
  design: { system: "services@0.1", direction: "editorial", palette: "pine" },
  content: {
    invented: true,
    language: "en",
    business: { name: "Lindqvist Accounting", legalName: "Lindqvist Accounting Oy", businessId: "0000000-0", address: "Bulevardi 00, 00120 Helsinki", phone: "+358 40 000 0000", email: "anna@lindqvist.example", hours: "Monday to Friday, 9 to 17" },
    assets: [
      photo("anna", "1573496359142-b8d87734a5a2", 2000, 3000, "Anna Lindqvist by an office window, with a laptop on her knee", true),
      photo("documents", "1450101499163-c8848c66ca85", 2000, 1333, "Someone going through printed documents and signing a page", false),
    ],
    promise: {
      whoFor: w("Accounting for small companies in Helsinki"),
      headline: w("Know where your company stands, every month."),
      turn: "every month.",
      why: w("Bookkeeping, payroll and year-end accounts, with one named accountant, one fixed monthly price, and answers the same day."),
      action: { label: "Book a 30-minute call", by: "form" },
      secondAction: "See what's included",
      reassurance: w("Free and without obligation. You get a written proposal within two days."),
      imageId: "anna",
    },
    reasons: {
      items: [
        { title: w("Your accountant"), text: w("Anna handles your company herself. No call centre, no handovers.") },
        { title: w("Your price"), text: w("Agreed before you start, and the same every month, whatever the month brings.") },
        { title: w("Your questions"), text: w("Ask before noon, hear back the same day.") },
      ],
    },
    services: {
      label: "What we take off your desk",
      heading: w("Three services, and nothing you have to work out for yourself."),
      items: [
        { name: w("Bookkeeping"), text: w("Everything recorded and reconciled each month, with a one-page summary of how the company is doing."), price: w("From €190 a month") },
        { name: w("Payroll"), text: w("Salaries, holiday pay and employer reports handled on time, for teams of two to fifty."), price: w("From €25 a person") },
        { name: w("Year-end accounts"), text: w("Accounts and tax return prepared with you, then explained in plain language."), price: w("From €900 a year") },
      ],
    },
    firstSteps: {
      label: "Switching accountants",
      heading: w("Most owners worry about the move. Your first month looks like this."),
      items: [
        { title: w("A call"), text: w("Thirty minutes on how your company runs and what you need.") },
        { title: w("A written proposal"), text: w("The scope and the monthly price, within two days.") },
        { title: w("We handle the handover"), text: w("We contact your current accountant and collect your records.") },
        { title: w("Your first summary"), text: w("One page showing where you stand, in words you can use.") },
      ],
    },
    proof: {
      quotes: [{ text: w("We stopped worrying about the accounts the month we moved. I now read one page and know what to do."), who: "Maria Salo, Salo Interiors", permission: "invented_test_data" }],
      credentials: [w("Authorised accountant (KLT)"), w("Member of the Finnish Association of Accountants")],
      imageId: "documents",
    },
    questions: {
      label: "Before you decide",
      heading: w("The questions owners ask us first."),
      items: [
        { question: w("Is it complicated to change accountant?"), answer: w("Usually not. We contact your current accountant, collect your records and tell you if anything is missing.") },
        { question: w("What does the fixed price include?"), answer: w("Everything in the written proposal. If something new comes up, you hear the price before any work starts.") },
        { question: w("What if Anna is away?"), answer: w("Mikael knows every client's accounts, and steps in for holidays and illness.") },
        { question: w("Do I need special software?"), answer: w("No. You send receipts from your phone, and we set up the rest.") },
      ],
    },
    closing: { heading: w("Let's look at your books together."), text: w("Tell us a little about your company, and we'll suggest a time for a call.") },
    about: {
      slug: "about",
      menuLabel: "About",
      label: "About the firm",
      heading: w("A small firm, on purpose."),
      lead: w("Lindqvist Accounting looks after about a hundred owner-run companies from one office in Helsinki."),
      story: [
        w("Anna Lindqvist started the firm in 2009, after a decade in a large accounting house. She had noticed that small companies got the least attention, and asked the most reasonable questions."),
        w("It stays small so that clients can keep speaking to the person who knows their numbers. Nobody here reads from a script, and nobody passes you on."),
      ],
      imageId: "documents",
      peopleLabel: "Who you'll deal with",
      people: [
        { name: "Anna Lindqvist", role: w("Founder, authorised accountant"), imageId: "anna", consent: "invented_test_data" },
        { name: "Mikael Koski", role: w("Senior accountant, payroll"), consent: "invented_test_data" },
      ],
      seo: { title: "About | Lindqvist Accounting", description: "A small accounting firm in Helsinki, where owner-run companies speak to the person who knows their numbers." },
    },
    contact: {
      slug: "contact",
      menuLabel: "Contact",
      heading: w("Book a call, or just ask."),
      text: w("Tell us a little about your company. We reply within one working day, and a first call costs nothing."),
      detailsLabel: "Find us",
      seo: { title: "Contact | Lindqvist Accounting", description: "Book a free 30-minute call with Lindqvist Accounting in Helsinki." },
    },
    form: {
      nameLabel: "Your name",
      emailLabel: "Email",
      phoneLabel: "Phone, if you'd like a call",
      messageLabel: "Your company, and what you need help with",
      send: "Book my call",
      whatHappensNext: w("We reply within one working day."),
      consent: w("We use your details only to answer your message. Test wording, not legally reviewed."),
    },
    privacy: {
      slug: "privacy",
      menuLabel: "Privacy",
      heading: "How we handle your details",
      paragraphs: [w("This is a test site for an invented business. It is not a real privacy notice, and a real one needs legal review before any site goes live."), w("Please don't enter real personal details in its forms.")],
      seo: { title: "Privacy | Lindqvist Accounting", description: "A placeholder privacy page on a test site for an invented business." },
    },
    notFound: { heading: "That page isn't here.", text: "The address may have changed. Everything we do is on the front page.", back: "Go to the front page" },
    menu: { servicesLabel: "Services", questionsLabel: "Questions" },
    home: { seo: { title: "Lindqvist Accounting | Accounting for small companies in Helsinki", description: "One named accountant, one fixed monthly price and answers the same day, for small companies in Helsinki." } },
  },
};

const kivela: Site = {
  design: { system: "services@0.1", direction: "formal", palette: "oxblood" },
  content: {
    invented: true,
    language: "fi",
    business: { name: "Asianajotoimisto Kivelä", legalName: "Asianajotoimisto Kivelä Oy", businessId: "0000000-1", address: "Hämeenkatu 00, 33100 Tampere", phone: "+358 40 000 0001", email: "toimisto@kivela.example", hours: "Maanantaista perjantaihin 9–16.30" },
    assets: [
      photo("juhani", "1560250097-0b93528c311a", 2000, 3000, "Asianajaja Juhani Kivelä toimiston ikkunan edessä", true),
      photo("toimisto", "1497366216548-37526070297c", 2000, 1333, "Toimiston valoisa käytävä ja neuvotteluhuoneet", false),
    ],
    promise: {
      whoFor: w("Yritysjuridiikkaa pirkanmaalaisille perheyrityksille"),
      headline: w("Omistajanvaihdos on perheyrityksen suurin päätös. Tehdään se rauhassa."),
      turn: "Tehdään se rauhassa.",
      why: w("Autamme sukupolvenvaihdoksissa, yrityskaupoissa ja osakassopimuksissa. Saat yhden vastuullisen asianajajan ja kirjallisen hinta-arvion ennen työn alkua."),
      action: { label: "Varaa maksuton keskustelu", by: "form" },
      secondAction: "Katso palvelut",
      reassurance: w("Ensimmäinen keskustelu on luottamuksellinen ja maksuton. Se ei sido sinua mihinkään."),
      imageId: "juhani",
    },
    reasons: {
      items: [
        { title: w("Yksi asianajaja"), text: w("Sama ihminen hoitaa asiaasi alusta loppuun, eikä sinun tarvitse kertoa asioita kahdesti.") },
        { title: w("Hinta etukäteen"), text: w("Saat kirjallisen arvion ennen kuin työ alkaa. Muutoksista sovitaan aina erikseen.") },
        { title: w("Selkeä kieli"), text: w("Kerromme, mitä sopimus tarkoittaa käytännössä, ilman tarpeetonta lakikieltä.") },
      ],
    },
    services: {
      label: "Palvelut",
      heading: w("Kolme asiaa, joihin olemme keskittyneet."),
      items: [
        { name: w("Sukupolvenvaihdokset"), text: w("Suunnittelemme vaihdoksen niin, että yritys, perhe ja verotus on otettu huomioon jo hyvissä ajoin.") },
        { name: w("Yrityskaupat"), text: w("Tuemme ostajaa tai myyjää aiesopimuksesta kaupantekopäivään ja sen jälkeisiin velvoitteisiin.") },
        { name: w("Osakassopimukset"), text: w("Sovimme etukäteen, mitä tapahtuu, kun osakkaiden tilanne muuttuu. Se ehkäisee riitoja, joita ei voi ennakoida myöhemmin.") },
      ],
    },
    firstSteps: {
      label: "Näin aloitamme",
      heading: w("Kolme askelta ennen kuin mitään on päätetty."),
      items: [
        { title: w("Keskustelu"), text: w("Kuuntelemme tilanteesi. Tunnin keskustelu on maksuton.") },
        { title: w("Arvio"), text: w("Saat kirjallisen arvion työn laajuudesta ja hinnasta viikon kuluessa.") },
        { title: w("Päätös"), text: w("Päätät itse, jatkammeko. Kukaan ei soita perään.") },
      ],
    },
    proof: { quotes: [], credentials: [w("Suomen Asianajajaliiton jäsen"), w("Toiminnan vastuuvakuutus voimassa")] },
    questions: {
      label: "Usein kysyttyä",
      heading: w("Mitä asiakkaat kysyvät ensimmäisenä."),
      items: [
        { question: w("Milloin sukupolvenvaihdosta kannattaa alkaa suunnitella?"), answer: w("Yleensä muutamaa vuotta ennen kuin vaihdoksen on tarkoitus tapahtua. Verotuksen huojennukset ja perheen tilanne vaativat aikaa.") },
        { question: w("Mitä keskustelu maksaa?"), answer: w("Ensimmäinen keskustelu on maksuton. Jos jatkamme, saat kirjallisen arvion etukäteen.") },
        { question: w("Hoidatteko myös riitoja?"), answer: w("Hoidamme yritysten välisiä sopimusriitoja. Muissa asioissa ohjaamme sinut luotettavalle kollegalle.") },
      ],
    },
    closing: { heading: w("Kerro tilanteestasi."), text: w("Kaikki, mitä kerrot, on luottamuksellista. Vastaamme yhden työpäivän kuluessa.") },
    about: {
      slug: "toimisto",
      menuLabel: "Toimisto",
      label: "Toimisto",
      heading: w("Pieni toimisto, pitkä muisti."),
      lead: w("Asianajotoimisto Kivelä on palvellut pirkanmaalaisia perheyrityksiä vuodesta 1998."),
      story: [
        w("Juhani Kivelä perusti toimiston Tampereelle huomattuaan, että perheyritykset tarvitsevat juristia, joka tuntee sekä yrityksen että suvun. Moni asiakas on nyt toisessa tai kolmannessa polvessa."),
        w("Toimisto on pysynyt pienenä tarkoituksella. Otamme vastaan vain sen verran toimeksiantoja, että jokaiselle riittää aikaa."),
      ],
      imageId: "toimisto",
      peopleLabel: "Asianajajat",
      people: [
        { name: "Juhani Kivelä", role: w("Asianajaja, osakas"), imageId: "juhani", consent: "invented_test_data" },
        { name: "Saara Rautio", role: w("Asianajaja, yrityskaupat"), consent: "invented_test_data" },
      ],
      seo: { title: "Toimisto | Asianajotoimisto Kivelä", description: "Pieni tamperelainen asianajotoimisto, joka on palvellut perheyrityksiä vuodesta 1998." },
    },
    contact: {
      slug: "yhteystiedot",
      menuLabel: "Yhteystiedot",
      heading: w("Varaa keskustelu."),
      text: w("Kerro lyhyesti tilanteestasi. Vastaamme yhden työpäivän kuluessa, ja kaikki on luottamuksellista."),
      detailsLabel: "Toimisto",
      seo: { title: "Yhteystiedot | Asianajotoimisto Kivelä", description: "Varaa maksuton ja luottamuksellinen keskustelu Asianajotoimisto Kivelän kanssa Tampereella." },
    },
    form: {
      nameLabel: "Nimesi",
      emailLabel: "Sähköposti",
      phoneLabel: "Puhelinnumero, jos haluat soiton",
      messageLabel: "Lyhyesti tilanteestasi",
      send: "Lähetä viesti",
      whatHappensNext: w("Vastaamme yhden työpäivän kuluessa."),
      consent: w("Käytämme tietojasi vain viestiisi vastaamiseen. Testiteksti, jota ei ole tarkastettu juridisesti."),
    },
    privacy: {
      slug: "tietosuoja",
      menuLabel: "Tietosuoja",
      heading: "Näin käsittelemme tietojasi",
      paragraphs: [w("Tämä on testisivusto keksitylle yritykselle. Tämä ei ole oikea tietosuojaseloste, ja oikea seloste on tarkastettava juridisesti ennen julkaisua."), w("Älä kirjoita lomakkeisiin oikeita henkilötietoja.")],
      seo: { title: "Tietosuoja | Asianajotoimisto Kivelä", description: "Tietosuojasivun malli keksityn yrityksen testisivustolla." },
    },
    notFound: { heading: "Sivua ei löydy.", text: "Osoite on voinut muuttua. Kaikki olennainen on etusivulla.", back: "Siirry etusivulle" },
    menu: { servicesLabel: "Palvelut", questionsLabel: "Kysymykset" },
    home: { seo: { title: "Asianajotoimisto Kivelä | Perheyritysten asianajaja Tampereella", description: "Sukupolvenvaihdokset, yrityskaupat ja osakassopimukset pirkanmaalaisille perheyrityksille. Ensimmäinen keskustelu on maksuton." } },
  },
};

const norrsken: Site = {
  design: { system: "services@0.1", direction: "statement", palette: "signal" },
  content: {
    invented: true,
    language: "sv",
    business: { name: "Norrsken VVS", legalName: "Norrsken VVS Ab", businessId: "0000000-2", address: "Strandgatan 00, 65100 Vasa", phone: "+358 40 000 0002", email: "jour@norrsken.example", hours: "Vardagar 7–16, jour dygnet runt" },
    assets: [],
    promise: {
      whoFor: w("Rörmokare i Vasaregionen"),
      headline: w("Läcker det? Vi är hos dig inom två timmar."),
      turn: "inom två timmar.",
      why: w("Akuta läckor, stopp och varmvattenberedare, dygnet runt. Du får priset innan vi börjar, och vi städar efter oss."),
      action: { label: "Ring +358 40 000 0002", by: "phone" },
      secondAction: "Be om offert",
      reassurance: w("Ingen utryckningsavgift på vardagar i Vasa."),
    },
    reasons: {
      items: [
        { title: w("Pris först"), text: w("Du hör priset innan arbetet börjar.") },
        { title: w("Två timmar"), text: w("Vid akuta fel är vi på plats inom två timmar i Vasa.") },
        { title: w("Rent efteråt"), text: w("Vi lämnar köket som vi fann det.") },
      ],
    },
    services: {
      label: "Det här gör vi",
      heading: w("Vatten, värme och avlopp."),
      items: [
        { name: w("Akuta läckor"), text: w("Dygnet runt. Vi stoppar läckan först och pratar om resten sedan."), price: w("Från 95 € i timmen") },
        { name: w("Stopp i avlopp"), text: w("Handkraft eller spolning, beroende på vad som behövs."), price: w("Från 180 €") },
        { name: w("Varmvattenberedare"), text: w("Byte och installation, vanligen samma dag."), price: w("Från 420 € plus beredare") },
        { name: w("Badrumsrör"), text: w("Nya rör vid renovering, med dokumentation för försäkringen.") },
      ],
    },
    firstSteps: {
      label: "Så går det till",
      heading: w("Ring. Vi kommer. Klart."),
      items: [
        { title: w("Du ringer"), text: w("Du når en rörmokare, inte en växel.") },
        { title: w("Vi kommer"), text: w("Vid akuta fel inom två timmar i Vasa.") },
        { title: w("Du får priset"), text: w("Innan vi börjar. Sedan fixar vi felet.") },
      ],
    },
    proof: { quotes: [], credentials: [w("Behörig VVS-installatör"), w("Ansvarsförsäkring")] },
    questions: {
      label: "Frågor",
      heading: w("Innan du ringer."),
      items: [
        { question: w("Vad kostar det på natten?"), answer: w("Jour efter klockan 16 kostar 150 € extra. Du får veta det innan vi åker.") },
        { question: w("Vilket område täcker ni?"), answer: w("Vasa, Korsholm och Vörå. Längre bort efter överenskommelse.") },
      ],
    },
    closing: { heading: w("Inte bråttom? Be om en offert."), text: w("Berätta vad som behöver göras, så återkommer vi samma dag.") },
    about: {
      slug: "om-oss",
      menuLabel: "Om oss",
      label: "Om oss",
      heading: w("Tre rörmokare och en bil var."),
      lead: w("Norrsken VVS är ett litet företag i Vasa. Vi har inga säljare och ingen växel."),
      story: [w("Företaget startades 2014 av Henrik Back. Vi tar de jobb vi hinner med, och vi svarar själva i telefonen.")],
      people: [],
      seo: { title: "Om oss | Norrsken VVS", description: "Norrsken VVS är ett litet rörmokarföretag i Vasa, utan säljare och utan växel." },
    },
    contact: {
      slug: "kontakt",
      menuLabel: "Kontakt",
      heading: w("Ring om det är bråttom."),
      text: w("Annars skriver du här, så svarar vi samma dag."),
      detailsLabel: "Här finns vi",
      seo: { title: "Kontakt | Norrsken VVS", description: "Ring Norrsken VVS dygnet runt eller be om en offert. Vi finns i Vasa." },
    },
    form: {
      nameLabel: "Ditt namn",
      emailLabel: "E-post",
      phoneLabel: "Telefon",
      messageLabel: "Vad behöver göras?",
      send: "Be om offert",
      whatHappensNext: w("Vi svarar samma vardag."),
      consent: w("Vi använder dina uppgifter bara för att svara dig. Testtext som inte är juridiskt granskad."),
    },
    privacy: {
      slug: "integritet",
      menuLabel: "Integritet",
      heading: "Så hanterar vi dina uppgifter",
      paragraphs: [w("Det här är en testsida för ett påhittat företag. Det är inte en riktig integritetspolicy, och en riktig måste granskas juridiskt före publicering."), w("Skriv inga riktiga personuppgifter i formulären.")],
      seo: { title: "Integritet | Norrsken VVS", description: "En platshållare för integritetspolicyn på en testsida för ett påhittat företag." },
    },
    notFound: { heading: "Den sidan finns inte.", text: "Adressen kan ha ändrats. Telefonnumret har inte det.", back: "Till startsidan" },
    menu: { servicesLabel: "Tjänster", questionsLabel: "Frågor" },
    home: { seo: { title: "Norrsken VVS | Rörmokare i Vasa, jour dygnet runt", description: "Akuta läckor, stopp och varmvattenberedare i Vasaregionen. Vi är hos dig inom två timmar, och du får priset först." } },
  },
};

export const SITES: Record<string, { site: Site; brief: Brief }> = {
  lindqvist: { site: lindqvist, brief: briefs.lindqvist },
  kivela: { site: kivela, brief: briefs.kivela },
  norrsken: { site: norrsken, brief: briefs.norrsken },
};

for (const [name, { site }] of Object.entries(SITES)) {
  const content = siteContent.safeParse(site.content);
  if (!content.success) throw new Error(`${name}: ${content.error.message}`);
  siteDesign.parse(site.design);
}
