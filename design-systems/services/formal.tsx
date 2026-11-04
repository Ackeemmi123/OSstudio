/**
 * The formal direction's home page: established and personal, on a full field
 * of colour. Rings widen across it, like a stone in still water. The year a firm
 * began becomes part of the composition, if the firm has said it.
 */
import type { SiteContent } from "./content";
import { Action, Closing, Emphasised, FirstSteps, Frame, Headline, Picture, Proof, Questions, Reasons, Services, displayTier, find, type PageContext } from "./pages";

/** The year a firm's own words say it began, if they do. */
export function foundingYear(text: string): string | null {
  return /\b(?:19|20)\d{2}\b/.exec(text)?.[0] ?? null;
}

function Hero({ context }: { context: PageContext }) {
  const { content } = context;
  const { promise } = content;
  const image = find(content, promise.imageId);
  return (
    <section className={image ? "hero hero--field" : "hero hero--field hero--type"} data-tier={displayTier(promise.headline.text)}>
      <div className="ringbox" aria-hidden="true" />
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
          <div className="frame">
            <Picture asset={image} ratio={3 / 4.3} sizes="(max-width: 900px) 70vw, 32vw" widths={[480, 800, 1000]} first />
          </div>
        </figure>
      ) : null}
    </section>
  );
}

function Memory({ content }: { content: SiteContent }) {
  const { about } = content;
  const year = foundingYear(about.lead.text);
  const image = find(content, about.imageId);
  return (
    <section className={year ? "memory" : "memory memory--no-year"} aria-labelledby="memory">
      {year ? <p className="memory-year" aria-hidden="true">{year}</p> : null}
      {image ? (
        <figure className="memory-image">
          <Picture asset={image} ratio={16 / 10} sizes="(max-width: 820px) 90vw, 50vw" widths={[800, 1200, 1500]} />
        </figure>
      ) : null}
      <div className="memory-head">
        <h2 id="memory"><Emphasised text={about.heading.text} /></h2>
        <p className="page-lead">{about.lead.text}</p>
      </div>
      <div className="memory-story">
        {about.story.map((paragraph) => (
          <p key={paragraph.text}>{paragraph.text}</p>
        ))}
      </div>
    </section>
  );
}

export function FormalHome({ context }: { context: PageContext }) {
  const { content } = context;
  return (
    <Frame context={context}>
      <Hero context={context} />
      <Reasons content={content} />
      <Services content={content} />
      <Memory content={content} />
      <FirstSteps content={content} />
      <Proof content={content} />
      <Questions content={content} />
      <Closing content={content} emphasise />
    </Frame>
  );
}
