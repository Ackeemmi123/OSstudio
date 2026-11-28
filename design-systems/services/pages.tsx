/**
 * The services design system's pages. These are compositions, not a list of
 * generic blocks: each one decides from the content what to show and how, so a
 * firm with no photo or one service still gets a page designed for that. The
 * only words of its own are in CHROME.
 */
import type { CSSProperties, ReactNode } from "react";
import type { Asset, SiteContent, SiteDesign } from "./content";

type Language = SiteContent["language"];

/** The system's own words: its interface, never anything about the business. */
export const CHROME: Record<Language, { skip: string; menu: string; mainNav: string; footerNav: string; trap: string; testNote: string; conceptNote: string; prototypeNote: string; formOff: string; sent: string; notSent: string; backHome: string; hours: string; forWhom: string; matters: string; otherAreas: string; readMore: string; education: string; positions: string; languages: string; fullMenu: string; year: string; place: string; role: string; nextProject: string; allProjects: string }> = {
  en: { skip: "Skip to content", menu: "Menu", mainNav: "Main", footerNav: "Footer", trap: "Leave this empty", testNote: "Test site. This business and everything about it are invented.", prototypeNote: "Prototype by {madeBy}. Not public.", formOff: "The form is switched off in the prototype.", conceptNote: "Concept by Axivo, from public information. This is not the website of the firm.", sent: "Thank you. Your message was sent.", notSent: "Your message could not be sent. Please call or email us instead.", backHome: "Back to the front page", hours: "Opening hours", forWhom: "Who it is for", matters: "Typical matters", otherAreas: "Other areas", readMore: "Read more", education: "Education", positions: "Positions of trust", languages: "Languages", fullMenu: "The whole menu", year: "Year", place: "Place", role: "Our role", nextProject: "Next project", allProjects: "All projects" },
  sv: { skip: "Till innehållet", menu: "Meny", mainNav: "Huvudmeny", footerNav: "Sidfot", trap: "Lämna tomt", testNote: "Testsida. Företaget och allt om det är påhittat.", prototypeNote: "Prototyp av {madeBy}. Inte offentlig.", formOff: "Formuläret är avstängt i prototypen.", conceptNote: "Koncept av Axivo, utifrån offentlig information. Det här är inte företagets webbplats.", sent: "Tack! Ditt meddelande har skickats.", notSent: "Meddelandet kunde inte skickas. Ring eller mejla oss i stället.", backHome: "Till startsidan", hours: "Öppettider", forWhom: "För vem", matters: "Typiska ärenden", otherAreas: "Andra områden", readMore: "Läs mer", education: "Utbildning", positions: "Förtroendeuppdrag", languages: "Språk", fullMenu: "Hela menyn", year: "År", place: "Plats", role: "Vår roll", nextProject: "Nästa projekt", allProjects: "Alla projekt" },
  fi: { skip: "Siirry sisältöön", menu: "Valikko", mainNav: "Päävalikko", footerNav: "Alatunniste", trap: "Jätä tyhjäksi", testNote: "Testisivusto. Yritys ja kaikki sen tiedot on keksitty.", prototypeNote: "Prototyyppi: {madeBy}. Ei julkinen.", formOff: "Lomake ei ole käytössä prototyypissä.", conceptNote: "Axivon konseptiluonnos julkisten tietojen pohjalta. Tämä ei ole yrityksen verkkosivusto.", sent: "Kiitos! Viestisi on lähetetty.", notSent: "Viestiä ei voitu lähettää. Soita tai lähetä sähköpostia.", backHome: "Etusivulle", hours: "Aukioloajat", forWhom: "Kenelle", matters: "Tyypillisiä toimeksiantoja", otherAreas: "Muut osaamisalueet", readMore: "Lue lisää", education: "Koulutus", positions: "Luottamustehtävät", languages: "Kielet", fullMenu: "Koko ruokalista", year: "Vuosi", place: "Paikka", role: "Roolimme", nextProject: "Seuraava kohde", allProjects: "Kaikki kohteet" },
};

export interface PageContext {
  content: SiteContent;
  design: SiteDesign;
  /** The way back to the site's root from this page: "./" or "../". */
  root: string;
  page: "home" | "about" | "publications" | "service" | "menu" | "projects" | "project" | "contact" | "privacy" | "notFound";
  /** On a service's own page: which service. */
  service?: number;
  /** On a project's own page: which project. */
  project?: number;
  /** Where the forms post on a published client site. */
  formAction?: string;
}

/** Longer headlines and longer words take a smaller display size, so the composition holds whatever the message is. */
export function displayTier(heading: string): 1 | 2 | 3 {
  const longest = Math.max(...heading.split(/\s+/).map((word) => word.length));
  if (heading.length > 84 || longest > 16) return 3;
  return heading.length > 52 || longest > 12 ? 2 : 1;
}

export function find(content: SiteContent, id: string | undefined): Asset | null {
  return id ? (content.assets.find((asset) => asset.id === id) ?? null) : null;
}

const STOCK_HOST = "https://images.unsplash.com/";

function imageUrl(asset: Asset, width: number, ratio?: number): string {
  if (!asset.src.startsWith(STOCK_HOST)) return asset.src;
  const crop = ratio ? `&h=${Math.round(width / ratio)}&fit=crop&crop=${asset.showsPerson ? "faces" : "entropy"}` : "";
  return `${asset.src}?w=${width}&q=72&auto=format${crop}`;
}

/**
 * A site's own picture that is taller than it is wide: a portrait. A stock picture is cropped to its place where
 * it is served, around the faces in it; a site's own picture is cropped by the browser, from the middle, and in a
 * wide place a portrait of a person then loses the head. The places that are wide by design give it an upright one.
 */
export function isTall(asset: Asset): boolean {
  return !asset.src.startsWith(STOCK_HOST) && asset.height > asset.width * 1.1;
}

/** The files a browser may choose from: stock pictures by address, a built site's own pictures as the build wrote them. */
function sourceSet(asset: Asset, widths: number[], ratio: number): string | undefined {
  if (asset.src.startsWith(STOCK_HOST)) return widths.map((width) => `${imageUrl(asset, width, ratio)} ${width}w`).join(", ");
  return asset.variants?.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
}

/**
 * `sizes` with its widths multiplied: by one number, or by one for each entry. A picture is cropped to
 * fill its place, so one that is wider in shape than the place (a landscape photo in a portrait
 * frame) is drawn wider than the frame is.
 */
export function widerSizes(sizes: string, by: number | number[]): string {
  const entries: string[] = [];
  let depth = 0;
  let entry = "";
  for (const char of sizes) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      entries.push(entry);
      entry = "";
    } else entry += char;
  }
  entries.push(entry);
  return entries
    .map((text, n) => {
      const trimmed = text.trim();
      const factor = Array.isArray(by) ? (by[n] ?? by[by.length - 1]) : by;
      if (!(factor > 1.02)) return trimmed;
      // The width is what follows the last space outside brackets; before it, the condition.
      let at = -1;
      depth = 0;
      for (let i = 0; i < trimmed.length; i += 1) {
        if (trimmed[i] === "(") depth += 1;
        if (trimmed[i] === ")") depth -= 1;
        if (trimmed[i] === " " && depth === 0) at = i;
      }
      return `${trimmed.slice(0, at + 1)}calc(${trimmed.slice(at + 1)} * ${Math.round(factor * 100) / 100})`;
    })
    .join(", ");
}

/**
 * A hero's photo behind the words fills the whole section: as wide as the screen, and about twice
 * as tall as wide on a phone, where the words stack.
 */
const FULL_HERO: Place = { sizes: "(max-width: 520px) 100vw, (max-width: 820px) 100vw, 100vw", frame: [0.5, 0.9, 1.5] };

interface Place {
  sizes: string;
  frame?: number | number[];
}

/** Where a direction's hero photo is drawn: its own place beside the words, or (`full`) behind them. */
export function heroPlace(design: SiteDesign, sizes: string, frame?: number | number[], full: Place = FULL_HERO): Place {
  return design.hero === "full" ? full : { sizes, frame };
}

/**
 * `sizes` is how wide the picture's place is (read from the stylesheet), so the browser fetches the
 * narrowest file that fills it. `frame` is the place's shape, width over height, when the stylesheet
 * gives it another than `ratio`: one number, or one for each entry of `sizes`; "own" when the picture
 * keeps its own shape and is never cropped. `width` and `height` only hold its shape before it loads.
 */
export function Picture({ asset, ratio, sizes, frame, widths, first, className }: { asset: Asset; ratio: number; sizes: string; frame?: number | number[] | "own"; widths: number[]; first?: boolean; className?: string }) {
  const largest = widths[widths.length - 1];
  const shape = asset.width / asset.height;
  const frames = frame ?? ratio;
  // Only a built site's own pictures: a stock picture is cropped to the ratio where it is served.
  const drawn = asset.variants && frames !== "own" ? widerSizes(sizes, Array.isArray(frames) ? frames.map((one) => shape / one) : shape / frames) : sizes;
  return (
    // Static HTML for a published site, with no framework behind it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={imageUrl(asset, largest, ratio)}
      srcSet={sourceSet(asset, widths, ratio)}
      sizes={drawn}
      // A picture that keeps its own shape keeps the upload's exactly, whichever width is fetched (a narrower file's height is rounded to a whole pixel).
      style={asset.variants && frames === "own" ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
      alt={asset.alt}
      width={largest}
      height={Math.round(largest / ratio)}
      loading={first ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={first ? "high" : undefined}
      referrerPolicy="no-referrer"
    />
  );
}

export function Headline({ text, turn, as: Tag = "h1" }: { text: string; turn?: string; as?: "h1" | "h2" }) {
  if (!turn || !text.endsWith(turn)) return <Tag>{text}</Tag>;
  return (
    <Tag>
      {text.slice(0, text.length - turn.length)}
      {/* One voice: the turn only starts its own line on wide screens, in the same type and colour. */}
      <span className="turn">{turn}</span>
    </Tag>
  );
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/** The one thing the firm wants a visitor to do, wherever it appears. */
export function Action({ context, className = "button" }: { context: PageContext; className?: string }) {
  const { content, root, page } = context;
  const { action } = content.promise;
  if (action.by === "phone" && content.business.phone) return <a className={`${className} button--phone`} href={tel(content.business.phone)}>{action.label}</a>;
  if (action.by === "booking" && content.business.booking) return <a className={`${className} button--booking`} href={content.business.booking.href} rel="noopener">{action.label}</a>;
  return <a className={className} href={page === "home" ? "#form" : `${root}#form`}>{action.label}</a>;
}

function Menu({ context, footer }: { context: PageContext; footer?: boolean }) {
  const { content, root, page } = context;
  const at = (target: PageContext["page"]) => (page === target ? ("page" as const) : undefined);
  const home = page === "home" ? "" : root;
  if (footer) {
    return (
      <ul>
        {content.menuPage ? <li><a href={`${root}${content.menuPage.slug}/`} aria-current={at("menu")}>{content.menuPage.menuLabel}</a></li> : null}
        {content.projects ? <li><a href={`${root}${content.projects.slug}/`} aria-current={page === "projects" || page === "project" ? "page" : undefined}>{content.projects.menuLabel}</a></li> : null}
        <li><a href={`${root}${content.about.slug}/`} aria-current={at("about")}>{content.about.menuLabel}</a></li>
        {content.publications ? <li><a href={`${root}${content.publications.slug}/`} aria-current={at("publications")}>{content.publications.menuLabel}</a></li> : null}
        <li><a href={`${root}${content.contact.slug}/`} aria-current={at("contact")}>{content.contact.menuLabel}</a></li>
        <li><a href={`${root}${content.privacy.slug}/`} aria-current={at("privacy")}>{content.privacy.menuLabel}</a></li>
      </ul>
    );
  }
  return (
    <ul>
      {content.menuPage ? <li><a href={`${root}${content.menuPage.slug}/`} aria-current={at("menu")}>{content.menuPage.menuLabel}</a></li> : <li><a href={`${home}#services`}>{content.menu.servicesLabel}</a></li>}
      {content.projects ? <li><a href={`${root}${content.projects.slug}/`} aria-current={page === "projects" || page === "project" ? "page" : undefined}>{content.projects.menuLabel}</a></li> : null}
      <li><a href={`${root}${content.about.slug}/`} aria-current={at("about")}>{content.about.menuLabel}</a></li>
      {content.publications ? <li><a href={`${root}${content.publications.slug}/`} aria-current={at("publications")}>{content.publications.menuLabel}</a></li> : <li><a href={`${home}#questions`}>{content.menu.questionsLabel}</a></li>}
      <li><a href={`${root}${content.contact.slug}/`} aria-current={at("contact")}>{content.contact.menuLabel}</a></li>
    </ul>
  );
}

export function Frame({ context, children }: { context: PageContext; children: ReactNode }) {
  const { content, design, root } = context;
  const chrome = CHROME[content.language];
  const { business } = content;
  return (
    <>
      <a className="skip" href="#main">{chrome.skip}</a>
      {content.client ? null : <p className="test-note">{content.prototype ? chrome.prototypeNote.replace("{madeBy}", content.prototype.madeBy) : content.concept ? chrome.conceptNote : chrome.testNote}</p>}
      <header className="site-header">
        <a className="mark" href={root}>{business.name}</a>
        <nav className="menu-wide" aria-label={chrome.mainNav}>
          <Menu context={context} />
          <Action context={context} className="button button--small" />
        </nav>
        <details className="menu-narrow">
          <summary>{chrome.menu}</summary>
          <nav aria-label={chrome.mainNav}>
            <Menu context={context} />
            <Action context={context} className="button button--small" />
          </nav>
        </details>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <p className="footer-mark" style={design.direction === "statement" ? ({ "--n": business.name.length } as CSSProperties) : undefined}>{business.name}</p>
        <div className="footer-details">
          {business.address ? <p>{business.address}</p> : null}
          {business.phone ? <p><a href={tel(business.phone)}>{business.phone}</a></p> : null}
          {business.email ? <p><a href={`mailto:${business.email}`}>{business.email}</a></p> : null}
          {business.hours ? <p>{business.hours}</p> : null}
        </div>
        <nav aria-label={chrome.footerNav}><Menu context={context} footer /></nav>
        {business.legalName ? <p className="footer-legal">{business.legalName}{business.businessId ? `, ${business.businessId}` : ""}</p> : null}
      </footer>
      {content.promise.action.by === "phone" && business.phone ? <a className="call-bar" href={tel(business.phone)}>{content.promise.action.label}</a> : null}
      {design.direction === "clinic" && content.promise.action.by === "booking" && business.booking ? <a className="book-bar" href={business.booking.href} rel="noopener">{content.promise.action.label}</a> : null}
    </>
  );
}

function SectionHead({ label, heading, id }: { label: string; heading: string; id?: string }) {
  return (
    <div className="section-head">
      <p className="label">{label}</p>
      <h2 id={id}>{heading}</h2>
    </div>
  );
}

function ContactForm({ content, formId, formAction }: { content: SiteContent; formId: string; formAction?: string }) {
  const { form } = content;
  const chrome = CHROME[content.language];
  const off = Boolean(content.prototype);
  const action = formAction && /^https:\/\/[^\s"<>]+$/.test(formAction) ? formAction : "/api/contact";
  return (
    <form className="form" method="post" action={action}>
      <input type="hidden" name="form" value={formId} />
      <div className="field">
        <label htmlFor={`${formId}-name`}>{form.nameLabel}</label>
        <input id={`${formId}-name`} name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor={`${formId}-email`}>{form.emailLabel}</label>
        <input id={`${formId}-email`} name="email" type="email" autoComplete="email" required />
      </div>
      {form.phoneLabel ? (
        <div className="field">
          <label htmlFor={`${formId}-phone`}>{form.phoneLabel}</label>
          <input id={`${formId}-phone`} name="phone" type="tel" autoComplete="tel" />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${formId}-message`}>{form.messageLabel}</label>
        <textarea id={`${formId}-message`} name="message" rows={4} required />
      </div>
      <div className="trap" aria-hidden="true">
        <label htmlFor={`${formId}-website`}>{chrome.trap}</label>
        <input id={`${formId}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="consent">{form.consent.text}</p>
      <button className="button button--send" type="submit" disabled={off}>{form.send}</button>
      <p className="next">{off ? chrome.formOff : form.whatHappensNext.text}</p>
    </form>
  );
}

export function Reasons({ content, heading }: { content: SiteContent; heading?: string }) {
  return (
    <section className="reasons" aria-label={content.promise.whoFor.text}>
      {heading ? <h2>{heading}</h2> : null}
      <ul className="reason-list" data-count={content.reasons.items.length}>
        {content.reasons.items.map((reason) => (
          <li key={reason.title.text}>
            <strong>{reason.title.text}</strong>
            <span>{reason.text.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The longest word in a name: a long Finnish compound needs a smaller size before it has to break. */
export function longestWord(text: string): number {
  return Math.max(0, ...text.split(/[\s/–-]+/).map((word) => word.length));
}

export function Services({ content }: { content: SiteContent }) {
  const { services } = content;
  const one = services.items.length === 1;
  return (
    <section className={one ? "services services--one" : "services"} aria-labelledby="services">
      <SectionHead id="services" label={services.label} heading={services.heading.text} />
      <div className="ledger">
        {services.items.map((service) => (
          <div className={service.page ? "ledger-row ledger-row--page" : "ledger-row"} key={service.name.text} data-long={longestWord(service.name.text) > 12 ? "" : undefined}>
            <h3>{service.page ? <a href={`${service.page.slug}/`}>{service.name.text}</a> : service.name.text}</h3>
            <p>{service.text.text}</p>
            {service.price ? <p className="price">{service.price.text}</p> : service.page ? <p className="more" aria-hidden="true">{CHROME[content.language].readMore}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function FirstSteps({ content }: { content: SiteContent }) {
  const { firstSteps } = content;
  return (
    <section className="steps-section" aria-labelledby="first-steps">
      <SectionHead id="first-steps" label={firstSteps.label} heading={firstSteps.heading.text} />
      <ol className="steps" data-count={firstSteps.items.length}>
        {firstSteps.items.map((step) => (
          <li key={step.title.text}>
            <h3>{step.title.text}</h3>
            <p>{step.text.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Only what is real. With nothing to show, this section does not exist. */
export function Proof({ content }: { content: SiteContent }) {
  const { proof } = content;
  const image = find(content, proof.imageId);
  if (!proof.quotes.length && !proof.credentials.length) return null;
  const onlyCredentials = !proof.quotes.length;
  return (
    <section className={onlyCredentials ? "proof proof--credentials" : image ? "proof proof--image" : "proof"} aria-label={proof.credentials[0]?.text ?? proof.quotes[0]?.who}>
      {image && !onlyCredentials ? (
        <figure className="proof-image">
          <Picture asset={image} ratio={5 / 4} sizes="(max-width: 820px) 100vw, 50vw" widths={[480, 800, 1200]} />
        </figure>
      ) : null}
      <div className="proof-words">
        {proof.quotes.map((quote) => (
          <figure className="quote" key={quote.who}>
            <blockquote>{quote.text.text}</blockquote>
            <figcaption>{quote.who}</figcaption>
          </figure>
        ))}
        {proof.credentials.length ? (
          <ul className="credentials">
            {proof.credentials.map((credential) => (
              <li key={credential.text}>{credential.text}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function Questions({ content }: { content: SiteContent }) {
  const { questions } = content;
  return (
    <section className="questions" aria-labelledby="questions">
      <SectionHead id="questions" label={questions.label} heading={questions.heading.text} />
      <div className="question-list">
        {questions.items.map((item, i) => (
          <details key={item.question.text} open={i === 0}>
            <summary>{item.question.text}</summary>
            <p>{item.answer.text}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Closing({ content, formAction }: { content: SiteContent; formAction?: string }) {
  const { closing } = content;
  return (
    <section className="closing" aria-labelledby="form">
      <div className="closing-words">
        <h2 id="form" tabIndex={-1}>{closing.heading.text}</h2>
        <p>{closing.text.text}</p>
        <div className="closing-details">
          {content.business.phone ? <p><a href={tel(content.business.phone)}>{content.business.phone}</a></p> : null}
          {content.business.email ? <p><a href={`mailto:${content.business.email}`}>{content.business.email}</a></p> : null}
        </div>
      </div>
      <ContactForm content={content} formId="home" formAction={formAction} />
    </section>
  );
}

export function AboutPage({ context }: { context: PageContext }) {
  const { content } = context;
  const { about } = content;
  const image = find(content, about.imageId);
  return (
    <Frame context={context}>
      <section className="page-intro" data-tier={displayTier(about.heading.text)}>
        <p className="label">{about.label}</p>
        <h1>{about.heading.text}</h1>
        <p className="page-lead">{about.lead.text}</p>
      </section>
      {image ? (
        isTall(image) ? (
          <figure className="wide-image wide-image--tall">
            <Picture asset={image} ratio={4 / 5} sizes="(max-width: 820px) calc(100vw - 40px), 38vw" widths={[480, 800, 1200]} first />
          </figure>
        ) : (
          <figure className="wide-image">
            <Picture asset={image} ratio={2} sizes="(max-width: 820px) 100vw, 100vw" frame={[4 / 3, 2]} widths={[800, 1400, 2000]} first />
          </figure>
        )
      ) : null}
      <section className="story" aria-label={about.label}>
        {about.story.map((paragraph) => (
          <p key={paragraph.text}>{paragraph.text}</p>
        ))}
      </section>
      {about.people.filter((person) => person.profile).map((person, i) => (
        <Profile key={person.name} context={context} person={person} index={i} />
      ))}
      {about.people.some((person) => !person.profile) ? (
        <section className="people" aria-labelledby="people">
          <h2 id="people" className="label">{about.peopleLabel}</h2>
          <ul className="people-list" data-count={about.people.filter((person) => !person.profile).length}>
            {about.people.filter((person) => !person.profile).map((person) => {
              const photo = find(content, person.imageId);
              return (
                <li key={person.name} className={photo ? "person" : "person person--no-photo"}>
                  {photo ? <Picture asset={photo} ratio={4 / 5} sizes="(max-width: 560px) calc(100vw - 40px), (max-width: 820px) 46vw, 40vw" widths={[480, 800]} /> : null}
                  <h3>{person.name}</h3>
                  <p>{person.role.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <section className="end-action" aria-label={content.closing.heading.text}>
        <h2>{content.closing.heading.text}</h2>
        {content.promise.action.by === "phone" ? <a className="button" href={`${context.root}${content.contact.slug}/`}>{content.form.send}</a> : <Action context={context} />}
      </section>
    </Frame>
  );
}

type Person = SiteContent["about"]["people"][number];

/** An expert's profile on the About page: who they are in their own words, then their record as a CV lists it. */
function Profile({ context, person, index }: { context: PageContext; person: Person; index: number }) {
  const { content } = context;
  const chrome = CHROME[content.language];
  const profile = person.profile!;
  const photo = find(content, person.imageId);
  const record = [
    { key: "education", heading: chrome.education, items: profile.education },
    { key: "positions", heading: chrome.positions, items: profile.positions },
  ].filter((part) => part.items.length);
  return (
    <section className={photo ? "profile" : "profile profile--no-photo"} aria-labelledby={`profile-${index}`}>
      <div className="profile-who">
        {photo ? <Picture asset={photo} ratio={4 / 5} sizes="(max-width: 820px) 100vw, 30vw" widths={[480, 800]} /> : null}
        <h2 id={`profile-${index}`}>{person.name}</h2>
        <p className="profile-role">{person.role.text}</p>
        {profile.languages ? (
          <p className="profile-languages">
            <span className="label">{chrome.languages}</span> {profile.languages.text}
          </p>
        ) : null}
      </div>
      <div className="profile-words">
        {profile.bio.map((paragraph) => (
          <p key={paragraph.text}>{paragraph.text}</p>
        ))}
        {record.map((part) => (
          <div className="profile-record" key={part.key}>
            <h3 className="label">{part.heading}</h3>
            <ul>
              {part.items.map((item) => (
                <li key={item.text}>{item.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** A service's own page: what it is, who it is for and the matters it covers, then the way to the other areas. */
export function ServicePage({ context }: { context: PageContext }) {
  const { content, root } = context;
  const chrome = CHROME[content.language];
  const service = content.services.items[context.service ?? 0];
  const page = service.page!;
  const others = content.services.items.filter((item) => item !== service);
  return (
    <Frame context={context}>
      <section className="page-intro" data-tier={displayTier(service.name.text)}>
        <p className="label">
          <a href={`${root}#services`}>{content.services.label}</a>
        </p>
        <h1>{service.name.text}</h1>
        <p className="page-lead">{service.text.text}</p>
      </section>
      {page.whoFor || page.matters.length ? (
        <section className="area" aria-label={service.name.text}>
          {page.whoFor ? (
            <div className="area-part">
              <h2 className="label">{chrome.forWhom}</h2>
              <p className="area-for">{page.whoFor.text}</p>
            </div>
          ) : null}
          {page.matters.length ? (
            <div className="area-part">
              <h2 className="label">{chrome.matters}</h2>
              <ul className="area-matters">
                {page.matters.map((matter) => (
                  <li key={matter.text}>{matter.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      {others.length ? (
        <nav className="area-others" aria-labelledby="other-areas">
          <h2 id="other-areas" className="label">{chrome.otherAreas}</h2>
          <ul>
            {others.map((item) => (
              <li key={item.name.text}>{item.page ? <a href={`${root}${item.page.slug}/`}>{item.name.text}</a> : <a href={`${root}#services`}>{item.name.text}</a>}</li>
            ))}
          </ul>
        </nav>
      ) : null}
      <section className="end-action" aria-label={content.closing.heading.text}>
        <h2>{content.closing.heading.text}</h2>
        {content.promise.action.by === "phone" ? <a className="button" href={`${root}${content.contact.slug}/`}>{content.form.send}</a> : <Action context={context} />}
      </section>
    </Frame>
  );
}

export function ContactPage({ context }: { context: PageContext }) {
  const { content } = context;
  const { contact, business } = content;
  return (
    <Frame context={context}>
      <section className="contact-page" data-tier={displayTier(contact.heading.text)}>
        <div className="contact-words">
          <h1>{contact.heading.text}</h1>
          <p className="page-lead">{contact.text.text}</p>
          {content.promise.action.by === "phone" && business.phone ? <Action context={context} /> : null}
          <div className="contact-details">
            <h2 className="label">{contact.detailsLabel}</h2>
            {business.address ? <p>{business.address}</p> : null}
            {business.phone ? <p><a href={tel(business.phone)}>{business.phone}</a></p> : null}
            {business.email ? <p><a href={`mailto:${business.email}`}>{business.email}</a></p> : null}
            {business.openingHours ? <OpeningHours content={content} /> : business.hours ? <p>{business.hours}</p> : null}
          </div>
        </div>
        <ContactForm content={content} formId="contact" formAction={context.formAction} />
      </section>
    </Frame>
  );
}

type Project = NonNullable<SiteContent["projects"]>["items"][number];

function projectMeta(project: Project): string {
  return [project.year, project.place].filter(Boolean).join(" · ");
}

/** The portfolio: every project as a picture and its name, the way into each project's own page. */
export function ProjectsPage({ context }: { context: PageContext }) {
  const { content, root } = context;
  const projects = content.projects!;
  return (
    <Frame context={context}>
      <section className="page-intro" data-tier={displayTier(projects.heading.text)}>
        <p className="label">{projects.label}</p>
        <h1>{projects.heading.text}</h1>
        {projects.lead ? <p className="page-lead">{projects.lead.text}</p> : null}
      </section>
      <ul className="project-grid" data-count={projects.items.length}>
        {projects.items.map((project, i) => {
          const cover = find(content, project.imageIds[0]);
          return (
            <li key={project.slug} className={`project-card project-card--${(i % 4) + 1}`}>
              <a href={`${root}${project.slug}/`}>
                {cover ? (
                  <span className="project-frame">
                    <Picture asset={cover} ratio={[4 / 5, 4 / 3, 4 / 3, 4 / 5][i % 4]} sizes="(max-width: 820px) 100vw, 50vw" widths={[480, 800, 1200]} first={i < 2} />
                  </span>
                ) : null}
                <span className="project-name">{project.name.text}</span>
                {projectMeta(project) ? <span className="project-meta">{projectMeta(project)}</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
      <section className="end-action" aria-label={content.closing.heading.text}>
        <h2>{content.closing.heading.text}</h2>
        <Action context={context} />
      </section>
    </Frame>
  );
}

/** One project: its name and facts, the first picture wide, the story, then the rest of the pictures and the way to the next one. */
export function ProjectPage({ context }: { context: PageContext }) {
  const { content, root } = context;
  const chrome = CHROME[content.language];
  const projects = content.projects!;
  const index = context.project ?? 0;
  const project = projects.items[index];
  const next = projects.items.length > 1 ? projects.items[(index + 1) % projects.items.length] : null;
  const [first, ...rest] = project.imageIds.map((id) => find(content, id)).filter((asset): asset is Asset => Boolean(asset));
  const facts = [
    { key: "year", label: chrome.year, value: project.year },
    { key: "place", label: chrome.place, value: project.place },
    { key: "role", label: chrome.role, value: project.role?.text },
  ].filter((fact) => fact.value);
  return (
    <Frame context={context}>
      <section className="page-intro project-intro" data-tier={displayTier(project.name.text)}>
        <p className="label">
          <a href={`${root}${projects.slug}/`}>{projects.label}</a>
        </p>
        <h1>{project.name.text}</h1>
        {facts.length ? (
          <dl className="project-facts">
            {facts.map((fact) => (
              <div key={fact.key}>
                <dt className="label">{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
      {first ? (
        <figure className="wide-image project-lead-image">
          <Picture asset={first} ratio={16 / 9} sizes="(max-width: 820px) 100vw, 100vw" frame={[4 / 3, 2]} widths={[800, 1400, 2000]} first />
        </figure>
      ) : null}
      {project.text.length ? (
        <section className="story" aria-label={project.name.text}>
          {project.text.map((paragraph) => (
            <p key={paragraph.text}>{paragraph.text}</p>
          ))}
        </section>
      ) : null}
      {rest.length ? (
        <div className="project-pictures" data-count={rest.length}>
          {rest.map((asset, i) => (
            <figure key={asset.id} className={`project-picture project-picture--${(i % 3) + 1}`}>
              <Picture asset={asset} ratio={[4 / 5, 4 / 3, 3 / 2][i % 3]} sizes={`(max-width: 820px) calc(100vw - 40px), ${rest.length === 1 ? "62vw" : ["47vw", "38vw", "62vw"][i % 3]}`} widths={[480, 800, 1200]} />
            </figure>
          ))}
        </div>
      ) : null}
      <nav className="project-next" aria-label={chrome.nextProject}>
        {next ? (
          <a href={`${root}${next.slug}/`}>
            <span className="label">{chrome.nextProject}</span>
            <span className="project-next-name">{next.name.text}</span>
          </a>
        ) : null}
        <a className="link-action link-action--arrow" href={`${root}${projects.slug}/`}>{chrome.allProjects}</a>
      </nav>
      <section className="end-action" aria-label={content.closing.heading.text}>
        <h2>{content.closing.heading.text}</h2>
        <Action context={context} />
      </section>
    </Frame>
  );
}

/** Opening hours as a small timetable: the days, then the time, each line as the place wrote it. */
export function OpeningHours({ content, className = "hours" }: { content: SiteContent; className?: string }) {
  const lines = content.business.openingHours;
  if (!lines) return null;
  return (
    <dl className={className}>
      {lines.map((line) => (
        <div key={line.days}>
          <dt>{line.days}</dt>
          <dd>{line.time ?? ""}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A restaurant's whole menu: its groups as cards on the counter, each dish with its price and diet markings, then when to come. */
export function MenuPage({ context }: { context: PageContext }) {
  const { content } = context;
  const menu = content.menuPage!;
  const chrome = CHROME[content.language];
  const hours = content.business.openingHours;
  return (
    <Frame context={context}>
      <section className="page-intro" data-tier={displayTier(menu.heading.text)}>
        <p className="label">{menu.label}</p>
        <h1>{menu.heading.text}</h1>
      </section>
      {menu.groups.length > 2 ? (
        <nav className="menu-jump" aria-label={menu.label}>
          <ul>
            {menu.groups.map((group, g) => (
              <li key={group.heading}>
                <a href={`#menu-${g + 1}`}>{group.heading}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="menu-groups">
        {menu.groups.map((group, g) => (
          <section className="menu-group" key={group.heading} aria-labelledby={`menu-${g + 1}`}>
            <div className="menu-group-head">
              <h2 id={`menu-${g + 1}`}>{group.heading}</h2>
              {group.text ? <p>{group.text.text}</p> : null}
            </div>
            <ul className="menu-lines">
              {group.items.map((item, i) => (
                <li key={`${item.name.text}-${i}`}>
                  <p className="menu-line">
                    <span className="menu-name">{item.name.text}</span>
                    {item.diets ? <span className="menu-diets">{item.diets}</span> : null}
                    <span className="menu-dots" aria-hidden="true" />
                    {item.price ? <span className="menu-price">{item.price.text}</span> : null}
                  </p>
                  {item.text ? <p className="menu-text">{item.text.text}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {menu.note ? <p className="menu-note">{menu.note.text}</p> : null}
      <section className="end-action menu-end" aria-label={content.closing.heading.text}>
        <div>
          <h2>{content.closing.heading.text}</h2>
          {hours ? (
            <div className="menu-hours">
              <p className="label">{chrome.hours}</p>
              <OpeningHours content={content} />
            </div>
          ) : content.business.hours ? (
            <p className="menu-hours">{content.business.hours}</p>
          ) : null}
        </div>
        <Action context={context} />
      </section>
    </Frame>
  );
}

/** Books, articles and talks, newest first within each group, each with its year beside it. */
export function PublicationsPage({ context }: { context: PageContext }) {
  const publications = context.content.publications!;
  return (
    <Frame context={context}>
      <section className="page-intro">
        <p className="label">{publications.label}</p>
        <h1>{publications.heading.text}</h1>
        {publications.lead ? <p className="page-lead">{publications.lead.text}</p> : null}
      </section>
      {publications.groups.map((group, g) => (
        <section className="pub-group" key={group.heading} aria-labelledby={`pubs-${g}`}>
          <h2 id={`pubs-${g}`}>{group.heading}</h2>
          <ol className="pub-list">
            {group.items.map((item, i) => (
              <li key={i}>
                <span className="pub-year">{item.year ?? ""}</span>
                <span className="pub-text">{item.href ? <a href={item.href} rel="noopener">{item.text.text}</a> : item.text.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </Frame>
  );
}

export function PrivacyPage({ context }: { context: PageContext }) {
  const { privacy } = context.content;
  return (
    <Frame context={context}>
      <section className="plain-page">
        <h1>{privacy.heading}</h1>
        {privacy.paragraphs.map((paragraph) => (
          <p key={paragraph.text}>{paragraph.text}</p>
        ))}
      </section>
    </Frame>
  );
}

/** Where the form sends a visitor afterwards, so a site with no scripts can still say what happened. */
export function FormResultPage({ context, sent }: { context: PageContext; sent: boolean }) {
  const { content, root } = context;
  const chrome = CHROME[content.language];
  const { phone, email } = content.business;
  return (
    <Frame context={context}>
      <section className="plain-page plain-page--missing">
        <h1>{sent ? chrome.sent : chrome.notSent}</h1>
        {sent ? <p>{content.form.whatHappensNext.text}</p> : null}
        {!sent && phone ? <p><a href={tel(phone)}>{phone}</a></p> : null}
        {!sent && email ? <p><a href={`mailto:${email}`}>{email}</a></p> : null}
        <a className="button" href={root}>{chrome.backHome}</a>
      </section>
    </Frame>
  );
}

export function NotFoundPage({ context }: { context: PageContext }) {
  const { notFound } = context.content;
  return (
    <Frame context={context}>
      <section className="plain-page plain-page--missing">
        <h1>{notFound.heading}</h1>
        <p>{notFound.text}</p>
        <a className="button" href={context.root}>{notFound.back}</a>
      </section>
    </Frame>
  );
}
