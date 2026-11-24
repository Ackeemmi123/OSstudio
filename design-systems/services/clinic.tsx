/**
 * The clinic direction's home page: a calm reception. The words and a soft
 * photo come first, with a card at the desk that says when the place is open
 * and how to book. Treatments read as a price list with their length, then
 * how a visit goes. On a phone the way to book stays at hand. Everything
 * comes from the content; nothing is drawn when it is missing.
 */
import type { SiteContent } from "./content";
import { Action, CHROME, Closing, Frame, Headline, OpeningHours, Picture, Proof, Questions, displayTier, find, type PageContext } from "./pages";
import { Signature } from "./signature";

function Desk({ context }: { context: PageContext }) {
  const { content } = context;
  const { business } = content;
  const chrome = CHROME[content.language];
  if (!business.openingHours && !business.hours && !business.address && !(business.phone && content.promise.action.by !== "phone")) return null;
  return (
    <aside className="desk" aria-label={chrome.hours}>
      {business.openingHours ? (
        <div className="desk-part">
          <p className="label">{chrome.hours}</p>
          <OpeningHours content={content} />
        </div>
      ) : business.hours ? (
        <div className="desk-part">
          <p className="label">{chrome.hours}</p>
          <p>{business.hours}</p>
        </div>
      ) : null}
      {business.address ? <p className="desk-address">{business.address}</p> : null}
      {business.phone && content.promise.action.by !== "phone" ? <a className="desk-phone" href={`tel:${business.phone.replace(/[^\d+]/g, "")}`}>{business.phone}</a> : null}
    </aside>
  );
}

function Hero({ context }: { context: PageContext }) {
  const { content, design } = context;
  const { promise } = content;
  const image = design.hero === "type" ? null : find(content, promise.imageId);
  return (
    <section className={image ? (design.hero === "full" ? "hero hero--soft hero--full" : "hero hero--soft") : "hero hero--type"} data-tier={displayTier(promise.headline.text)}>
      <div className="hero-words">
        <p className="label hero-for">{promise.whoFor.text}</p>
        <Headline text={promise.headline.text} turn={promise.turn} />
        <p className="hero-why">{promise.why.text}</p>
        <div className="hero-actions">
          <Action context={context} />
        </div>
        {promise.reassurance ? <p className="hero-reassurance">{promise.reassurance.text}</p> : null}
      </div>
      {image ? (
        <figure className="hero-image">
          <Picture asset={image} ratio={4 / 5} sizes="(max-width: 820px) 100vw, 42vw" widths={[480, 800, 1200]} first />
        </figure>
      ) : null}
      <Desk context={context} />
    </section>
  );
}

/** Treatments as a price list: name, length and price on one line, what it is underneath. */
function Treatments({ content }: { content: SiteContent }) {
  const { services } = content;
  return (
    <section className="treatments" aria-labelledby="services">
      <div className="treatments-head">
        <p className="label">{services.label}</p>
        <h2 id="services">{services.heading.text}</h2>
      </div>
      <ul className="treatment-list">
        {services.items.map((item) => (
          <li key={item.name.text} className={item.page ? "treatment treatment--page" : "treatment"}>
            <div className="treatment-line">
              <h3>{item.page ? <a href={`${item.page.slug}/`}>{item.name.text}</a> : item.name.text}</h3>
              {item.duration ? <span className="treatment-time">{item.duration}</span> : null}
              {item.price ? <span className="treatment-price">{item.price.text}</span> : null}
            </div>
            <p>{item.text.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How a visit goes, as a quiet sequence; the reasons sit beside it as what the client can count on. */
function Visit({ content }: { content: SiteContent }) {
  const { firstSteps, reasons } = content;
  return (
    <section className="visit-flow" aria-labelledby="first-steps">
      <div className="visit-flow-head">
        <p className="label">{firstSteps.label}</p>
        <h2 id="first-steps">{firstSteps.heading.text}</h2>
      </div>
      <ol className="visit-steps" data-count={firstSteps.items.length}>
        {firstSteps.items.map((step) => (
          <li key={step.title.text}>
            <h3>{step.title.text}</h3>
            <p>{step.text.text}</p>
          </li>
        ))}
      </ol>
      <ul className="care-list" aria-label={content.promise.whoFor.text}>
        {reasons.items.map((reason) => (
          <li key={reason.title.text}>
            <strong>{reason.title.text}</strong>
            <span>{reason.text.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClinicHome({ context }: { context: PageContext }) {
  const { content } = context;
  return (
    <Frame context={context}>
      <Hero context={context} />
      <Treatments content={content} />
      <Signature context={context} />
      <Visit content={content} />
      <Proof content={content} />
      <Questions content={content} />
      <Closing content={content} formAction={context.formAction} />
    </Frame>
  );
}
