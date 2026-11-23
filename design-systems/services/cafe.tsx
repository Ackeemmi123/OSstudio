/**
 * The café direction's home page: a warm room you can walk into. What a guest
 * looks for comes first (open when, where), the menu reads like a card on the
 * counter, and the one thing priced for today is pinned to the photo like a
 * note. Everything comes from the content; nothing is drawn when it is missing.
 */
import type { SiteContent } from "./content";
import { Action, CHROME, Closing, Frame, Headline, Picture, Proof, Questions, displayTier, find, type PageContext } from "./pages";
import { Signature } from "./signature";

/** The first priced item is what the note on the photo shows; without one, the reassurance line, or nothing. */
function noteOf(content: SiteContent): { title: string; text: string; price?: string } | null {
  const priced = content.services.items.find((item) => item.price);
  if (priced) return { title: priced.name.text, text: priced.text.text, price: priced.price!.text };
  return null;
}

function VisitBar({ content }: { content: SiteContent }) {
  const { hours, address } = content.business;
  if (!hours && !address) return null;
  return (
    <div className="visit-bar">
      {hours ? (
        <p>
          <strong>{CHROME[content.language].hours}</strong> {hours}
        </p>
      ) : null}
      {address ? <p>{address}</p> : null}
    </div>
  );
}

function Hero({ context }: { context: PageContext }) {
  const { content, design } = context;
  const { promise } = content;
  const image = design.hero === "type" ? null : find(content, promise.imageId);
  const note = noteOf(content);
  return (
    <section className={image ? (design.hero === "full" ? "hero hero--arch hero--full" : "hero hero--arch") : "hero hero--type"} data-tier={displayTier(promise.headline.text)}>
      <div className="hero-words">
        <p className="label hero-for">{promise.whoFor.text}</p>
        <Headline text={promise.headline.text} turn={promise.turn} />
        <p className="hero-why">{promise.why.text}</p>
        <div className="hero-actions">
          <Action context={context} />
          {promise.secondAction ? <a className="button button--quiet" href="#visit">{promise.secondAction}</a> : null}
        </div>
        {promise.reassurance ? <p className="hero-reassurance">{promise.reassurance.text}</p> : null}
      </div>
      {image || note ? (
        <figure className="hero-image">
          {image ? (
            <div className="arch">
              <Picture asset={image} ratio={4 / 5} sizes="(max-width: 820px) 90vw, 44vw" widths={[480, 800, 1200]} first />
            </div>
          ) : null}
          {note ? (
            <figcaption className="pinned">
              <strong>{note.title}</strong>
              <span>{note.text}</span>
              {note.price ? <span className="pinned-price">{note.price}</span> : null}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
    </section>
  );
}

function MenuCard({ content }: { content: SiteContent }) {
  const { services } = content;
  const image = find(content, content.gallery?.items[0]?.imageId ?? content.proof.imageId);
  return (
    <section className="menu-card" aria-labelledby="services">
      <div className="menu-card-head">
        <p className="label">{services.label}</p>
        <h2 id="services">{services.heading.text}</h2>
        {image ? (
          <figure>
            <Picture asset={image} ratio={3 / 2} sizes="(max-width: 820px) 100vw, 45vw" widths={[480, 800, 1200]} />
          </figure>
        ) : null}
      </div>
      <ul className="menu-lines">
        {services.items.map((item) => (
          <li key={item.name.text}>
            <p className="menu-line">
              <span className="menu-name">{item.name.text}</span>
              <span className="menu-dots" aria-hidden="true" />
              {item.price ? <span className="menu-price">{item.price.text}</span> : null}
            </p>
            <p className="menu-text">{item.text.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Visit({ content }: { content: SiteContent }) {
  const { firstSteps, business, contact } = content;
  return (
    <section className="visit" aria-labelledby="visit">
      <div className="visit-head">
        <p className="label">{firstSteps.label}</p>
        <h2 id="visit">{firstSteps.heading.text}</h2>
        {business.hours || business.address ? (
          <div className="visit-card">
            {business.hours ? (
              <p>
                <span className="label">{CHROME[content.language].hours}</span>
                {business.hours}
              </p>
            ) : null}
            {business.address ? (
              <p>
                <span className="label">{contact.detailsLabel}</span>
                {business.address}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="visit-list">
        {firstSteps.items.map((item) => (
          <li key={item.title.text}>
            <h3>{item.title.text}</h3>
            <p>{item.text.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Story({ context }: { context: PageContext }) {
  const { content, root } = context;
  const { about } = content;
  return (
    <section className="cafe-story" aria-labelledby="story">
      <p className="label">{about.label}</p>
      <h2 id="story">{about.heading.text}</h2>
      <p className="cafe-story-lead">{about.lead.text}</p>
      <a className="link-action" href={`${root}${about.slug}/`}>{about.menuLabel}</a>
    </section>
  );
}

export function CafeHome({ context }: { context: PageContext }) {
  const { content } = context;
  return (
    <Frame context={context}>
      <VisitBar content={content} />
      <Hero context={context} />
      <MenuCard content={content} />
      <Signature context={context} />
      <Visit content={content} />
      <Proof content={content} />
      <Questions content={content} />
      <Closing content={content} formAction={context.formAction} />
      <Story context={context} />
    </Frame>
  );
}
