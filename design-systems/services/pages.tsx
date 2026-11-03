/**
 * The services design system's pages. These are compositions, not a list of
 * generic blocks: each one decides from the content what to show and how, so a
 * firm with no photo or one service still gets a page designed for that. The
 * only words of its own are in CHROME.
 */
import type { ReactNode } from "react";
import type { Asset, SiteContent } from "./content";

type Language = SiteContent["language"];

/** The system's own words: its interface, never anything about the business. */
export const CHROME: Record<Language, { skip: string; menu: string; mainNav: string; footerNav: string; trap: string; testNote: string }> = {
  en: { skip: "Skip to content", menu: "Menu", mainNav: "Main", footerNav: "Footer", trap: "Leave this empty", testNote: "Test site. This business and everything about it are invented." },
  sv: { skip: "Till innehållet", menu: "Meny", mainNav: "Huvudmeny", footerNav: "Sidfot", trap: "Lämna tomt", testNote: "Testsida. Företaget och allt om det är påhittat." },
  fi: { skip: "Siirry sisältöön", menu: "Valikko", mainNav: "Päävalikko", footerNav: "Alatunniste", trap: "Jätä tyhjäksi", testNote: "Testisivusto. Yritys ja kaikki sen tiedot on keksitty." },
};

export interface PageContext {
  content: SiteContent;
  /** The way back to the site's root from this page: "./" or "../". */
  root: string;
  page: "home" | "about" | "contact" | "privacy" | "notFound";
}

/** Longer headlines and longer words take a smaller display size, so the composition holds whatever the message is. */
export function displayTier(heading: string): 1 | 2 | 3 {
  const longest = Math.max(...heading.split(/\s+/).map((word) => word.length));
  if (heading.length > 84 || longest > 16) return 3;
  return heading.length > 52 || longest > 12 ? 2 : 1;
}

function find(content: SiteContent, id: string | undefined): Asset | null {
  return id ? (content.assets.find((asset) => asset.id === id) ?? null) : null;
}

const STOCK_HOST = "https://images.unsplash.com/";

function imageUrl(asset: Asset, width: number, ratio?: number): string {
  if (!asset.src.startsWith(STOCK_HOST)) return asset.src;
  const crop = ratio ? `&h=${Math.round(width / ratio)}&fit=crop&crop=${asset.showsPerson ? "faces" : "entropy"}` : "";
  return `${asset.src}?w=${width}&q=72&auto=format${crop}`;
}

function Picture({ asset, ratio, sizes, widths, first, className }: { asset: Asset; ratio: number; sizes: string; widths: number[]; first?: boolean; className?: string }) {
  const largest = widths[widths.length - 1];
  return (
    // Static HTML for a published site, with no framework behind it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={imageUrl(asset, largest, ratio)}
      srcSet={asset.src.startsWith(STOCK_HOST) ? widths.map((width) => `${imageUrl(asset, width, ratio)} ${width}w`).join(", ") : undefined}
      sizes={sizes}
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

function Headline({ text, turn, as: Tag = "h1" }: { text: string; turn?: string; as?: "h1" | "h2" }) {
  if (!turn || !text.endsWith(turn)) return <Tag>{text}</Tag>;
  return (
    <Tag>
      {text.slice(0, text.length - turn.length)}
      <em>{turn}</em>
    </Tag>
  );
}

function tel(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/** The one thing the firm wants a visitor to do, wherever it appears. */
function Action({ context, className = "button" }: { context: PageContext; className?: string }) {
  const { content, root, page } = context;
  const { action } = content.promise;
  if (action.by === "phone" && content.business.phone) return <a className={`${className} button--phone`} href={tel(content.business.phone)}>{action.label}</a>;
  return <a className={className} href={page === "home" ? "#form" : `${root}#form`}>{action.label}</a>;
}

function Menu({ context, footer }: { context: PageContext; footer?: boolean }) {
  const { content, root, page } = context;
  const at = (target: PageContext["page"]) => (page === target ? ("page" as const) : undefined);
  const home = page === "home" ? "" : root;
  if (footer) {
    return (
      <ul>
        <li><a href={`${root}${content.about.slug}/`} aria-current={at("about")}>{content.about.menuLabel}</a></li>
        <li><a href={`${root}${content.contact.slug}/`} aria-current={at("contact")}>{content.contact.menuLabel}</a></li>
        <li><a href={`${root}${content.privacy.slug}/`} aria-current={at("privacy")}>{content.privacy.menuLabel}</a></li>
      </ul>
    );
  }
  return (
    <ul>
      <li><a href={`${home}#services`}>{content.menu.servicesLabel}</a></li>
      <li><a href={`${root}${content.about.slug}/`} aria-current={at("about")}>{content.about.menuLabel}</a></li>
      <li><a href={`${home}#questions`}>{content.menu.questionsLabel}</a></li>
      <li><a href={`${root}${content.contact.slug}/`} aria-current={at("contact")}>{content.contact.menuLabel}</a></li>
    </ul>
  );
}

function Frame({ context, children }: { context: PageContext; children: ReactNode }) {
  const { content, root } = context;
  const chrome = CHROME[content.language];
  const { business } = content;
  return (
    <>
      <a className="skip" href="#main">{chrome.skip}</a>
      <p className="test-note">{chrome.testNote}</p>
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
        <p className="footer-mark">{business.name}</p>
        <div className="footer-details">
          {business.address ? <p>{business.address}</p> : null}
          {business.phone ? <p><a href={tel(business.phone)}>{business.phone}</a></p> : null}
          <p><a href={`mailto:${business.email}`}>{business.email}</a></p>
          {business.hours ? <p>{business.hours}</p> : null}
        </div>
        <nav aria-label={chrome.footerNav}><Menu context={context} footer /></nav>
        {business.legalName ? <p className="footer-legal">{business.legalName}{business.businessId ? `, ${business.businessId}` : ""}</p> : null}
      </footer>
      {content.promise.action.by === "phone" && business.phone ? <a className="call-bar" href={tel(business.phone)}>{content.promise.action.label}</a> : null}
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

function ContactForm({ content, formId }: { content: SiteContent; formId: string }) {
  const { form } = content;
  const chrome = CHROME[content.language];
  return (
    <form className="form" method="post" action="/api/contact">
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
      <button className="button button--send" type="submit">{form.send}</button>
      <p className="next">{form.whatHappensNext.text}</p>
    </form>
  );
}

function Hero({ context }: { context: PageContext }) {
  const { content } = context;
  const { promise } = content;
  const image = find(content, promise.imageId);
  return (
    <section className={image ? "hero hero--image" : "hero hero--type"} data-tier={displayTier(promise.headline.text)}>
      <p className="label hero-for">{promise.whoFor.text}</p>
      <Headline text={promise.headline.text} turn={promise.turn} />
      <p className="hero-why">{promise.why.text}</p>
      <div className="hero-actions">
        <Action context={context} />
        {promise.secondAction ? <a className="link-action" href="#services">{promise.secondAction}</a> : null}
      </div>
      {promise.reassurance ? <p className="hero-reassurance">{promise.reassurance.text}</p> : null}
      {image ? (
        <figure className="hero-image">
          <Picture asset={image} ratio={4 / 5} sizes="(max-width: 820px) 85vw, 42vw" widths={[480, 800, 1200]} first />
        </figure>
      ) : null}
    </section>
  );
}

function Reasons({ content }: { content: SiteContent }) {
  return (
    <section className="reasons" aria-label={content.promise.whoFor.text}>
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

function Services({ content }: { content: SiteContent }) {
  const { services } = content;
  const one = services.items.length === 1;
  return (
    <section className={one ? "services services--one" : "services"} aria-labelledby="services">
      <SectionHead id="services" label={services.label} heading={services.heading.text} />
      <div className="ledger">
        {services.items.map((service) => (
          <div className="ledger-row" key={service.name.text}>
            <h3>{service.name.text}</h3>
            <p>{service.text.text}</p>
            {service.price ? <p className="price">{service.price.text}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function FirstSteps({ content }: { content: SiteContent }) {
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
function Proof({ content }: { content: SiteContent }) {
  const { proof } = content;
  const image = find(content, proof.imageId);
  if (!proof.quotes.length && !proof.credentials.length) return null;
  const onlyCredentials = !proof.quotes.length;
  return (
    <section className={onlyCredentials ? "proof proof--credentials" : image ? "proof proof--image" : "proof"} aria-label={proof.credentials[0]?.text ?? proof.quotes[0]?.who}>
      {image && !onlyCredentials ? (
        <figure className="proof-image">
          <Picture asset={image} ratio={5 / 4} sizes="(max-width: 820px) 100vw, 40vw" widths={[480, 800, 1200]} />
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

function Questions({ content }: { content: SiteContent }) {
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

function Closing({ content }: { content: SiteContent }) {
  const { closing } = content;
  return (
    <section className="closing" aria-labelledby="form">
      <div className="closing-words">
        <h2 id="form" tabIndex={-1}>{closing.heading.text}</h2>
        <p>{closing.text.text}</p>
        <div className="closing-details">
          {content.business.phone ? <p><a href={tel(content.business.phone)}>{content.business.phone}</a></p> : null}
          <p><a href={`mailto:${content.business.email}`}>{content.business.email}</a></p>
        </div>
      </div>
      <ContactForm content={content} formId="home" />
    </section>
  );
}

export function HomePage({ context }: { context: PageContext }) {
  const { content } = context;
  return (
    <Frame context={context}>
      <Hero context={context} />
      <Reasons content={content} />
      <Services content={content} />
      <FirstSteps content={content} />
      <Proof content={content} />
      <Questions content={content} />
      <Closing content={content} />
    </Frame>
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
        <figure className="wide-image">
          <Picture asset={image} ratio={2} sizes="100vw" widths={[800, 1400, 2000]} first />
        </figure>
      ) : null}
      <section className="story" aria-label={about.label}>
        {about.story.map((paragraph) => (
          <p key={paragraph.text}>{paragraph.text}</p>
        ))}
      </section>
      {about.people.length ? (
        <section className="people" aria-labelledby="people">
          <h2 id="people" className="label">{about.peopleLabel}</h2>
          <ul className="people-list" data-count={about.people.length}>
            {about.people.map((person) => {
              const photo = find(content, person.imageId);
              return (
                <li key={person.name} className={photo ? "person" : "person person--no-photo"}>
                  {photo ? <Picture asset={photo} ratio={4 / 5} sizes="(max-width: 820px) 100vw, 40vw" widths={[480, 800]} /> : null}
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
            <p><a href={`mailto:${business.email}`}>{business.email}</a></p>
            {business.hours ? <p>{business.hours}</p> : null}
          </div>
        </div>
        <ContactForm content={content} formId="contact" />
      </section>
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
