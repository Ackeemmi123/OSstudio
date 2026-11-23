/**
 * The atelier direction's home page: quiet, light and led by the work. One
 * sentence in a large light serif, the rooms themselves in an uneven gallery,
 * then how working together goes, set with thin rules. With no gallery, the
 * services take its place, so the page never shows an empty frame.
 */
import type { SiteContent } from "./content";
import { Action, Closing, Frame, Headline, Picture, Proof, Questions, Services, displayTier, find, type PageContext } from "./pages";

function Hero({ context }: { context: PageContext }) {
  const { content } = context;
  const { promise } = content;
  const image = find(content, promise.imageId);
  return (
    <section className={image ? "hero hero--wide" : "hero hero--type"} data-tier={displayTier(promise.headline.text)}>
      <p className="label hero-for">{promise.whoFor.text}</p>
      <Headline text={promise.headline.text} turn={promise.turn} />
      <div className="hero-body">
        <p className="hero-why">{promise.why.text}</p>
        <Action context={context} className="link-action link-action--arrow" />
      </div>
      {image ? (
        <figure className="hero-image">
          <Picture asset={image} ratio={16 / 7} sizes="100vw" widths={[800, 1400, 2000]} first />
        </figure>
      ) : null}
    </section>
  );
}

function Gallery({ content }: { content: SiteContent }) {
  const { gallery } = content;
  const shown = (gallery?.items ?? []).map((item) => ({ ...item, asset: find(content, item.imageId) })).filter((item) => item.asset);
  if (!gallery || shown.length < 2) return null;
  return (
    <section className="work" aria-labelledby="work">
      <div className="work-head">
        <h2 id="work">{gallery.heading.text}</h2>
        <p className="label">{gallery.label}</p>
      </div>
      <div className="work-grid" data-count={shown.length}>
        {shown.map((item, i) => (
          <figure key={item.imageId} className={`work-item work-item--${(i % 4) + 1}`}>
            <div className="work-frame">
              <Picture asset={item.asset!} ratio={[4 / 3, 4 / 5, 1, 16 / 10][i % 4]} sizes="(max-width: 820px) 100vw, 55vw" widths={[480, 800, 1200]} />
            </div>
            <figcaption>{item.caption.text}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Approach({ content }: { content: SiteContent }) {
  const { about, firstSteps } = content;
  return (
    <section className="approach" aria-labelledby="first-steps">
      <p className="approach-lead">{about.lead.text}</p>
      <p className="label">{firstSteps.label}</p>
      <h2 id="first-steps">{firstSteps.heading.text}</h2>
      <ol className="approach-steps" data-count={firstSteps.items.length}>
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

export function AtelierHome({ context }: { context: PageContext }) {
  const { content } = context;
  const hasGallery = (content.gallery?.items ?? []).filter((item) => find(content, item.imageId)).length >= 2;
  return (
    <Frame context={context}>
      <Hero context={context} />
      {hasGallery ? <Gallery content={content} /> : <Services content={content} />}
      <Approach content={content} />
      {hasGallery ? <Services content={content} /> : null}
      <Proof content={content} />
      <Questions content={content} />
      <Closing content={content} formAction={context.formAction} emphasise />
    </Frame>
  );
}
