/**
 * The editorial direction's home page: a carefully set journal, written by a
 * person you could phone. It has its own order, and it leans on the founder
 * when there is a photo of them, and on the words when there is not.
 */
import type { SiteContent } from "./content";
import { Action, Closing, FirstSteps, Frame, Headline, Picture, Proof, Questions, Reasons, Services, displayTier, find, type PageContext } from "./pages";
import { Signature } from "./signature";

function Hero({ context }: { context: PageContext }) {
  const { content, design } = context;
  const { promise, about } = content;
  const image = design.hero === "type" ? null : find(content, promise.imageId);
  const pictured = about.people.find((person) => person.imageId && person.imageId === promise.imageId);
  return (
    <section className={image ? (design.hero === "full" ? "hero hero--spread hero--full" : "hero hero--spread") : "hero hero--type"} data-tier={displayTier(promise.headline.text)}>
      <p className="label hero-for">{promise.whoFor.text}</p>
      <Headline text={promise.headline.text} turn={promise.turn} />
      {image ? (
        <figure className="hero-image">
          <div className="frame">
            <Picture asset={image} ratio={4 / 4.5} sizes="(max-width: 980px) 85vw, 42vw" widths={[480, 800, 1200]} first />
          </div>
          {promise.reassurance ? <p className="hero-note">{promise.reassurance.text}</p> : null}
          {pictured ? <figcaption>{pictured.name}, {pictured.role.text}</figcaption> : null}
        </figure>
      ) : null}
      <div className="hero-body">
        <p className="hero-why">{promise.why.text}</p>
        <div className="hero-actions">
          <Action context={context} />
          {promise.secondAction ? <a className="link-action" href="#services">{promise.secondAction}</a> : null}
        </div>
        {!image && promise.reassurance ? <p className="hero-reassurance">{promise.reassurance.text}</p> : null}
      </div>
    </section>
  );
}

function Letter({ content }: { content: SiteContent }) {
  const { about } = content;
  const founder = about.people[0];
  const portrait = find(content, founder?.imageId);
  return (
    <section className={portrait ? "letter" : "letter letter--words"} aria-label={about.label}>
      {portrait ? (
        <figure className="cameo">
          <Picture asset={portrait} ratio={4 / 5} sizes="(max-width: 760px) 60vw, 26vw" widths={[480, 800]} />
        </figure>
      ) : null}
      <div className="letter-words">
        <p className="letter-lead">{about.lead.text}</p>
        <div className="letter-story">
          {about.story.map((paragraph) => (
            <p key={paragraph.text}>{paragraph.text}</p>
          ))}
        </div>
        {founder ? (
          <p className="signature">
            {founder.name}
            <small>{founder.role.text}</small>
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function EditorialHome({ context }: { context: PageContext }) {
  const { content } = context;
  return (
    <Frame context={context}>
      <Hero context={context} />
      <Reasons content={content} heading={content.about.heading.text} />
      <Signature context={context} />
      <Proof content={content} />
      <Services content={content} />
      <FirstSteps content={content} />
      <Letter content={content} />
      <Questions content={content} />
      <Closing content={content} formAction={context.formAction} />
    </Frame>
  );
}
