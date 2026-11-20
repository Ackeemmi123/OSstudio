/**
 * The statement direction's home page: type-led, for a firm whose visitor needs
 * one thing now. It has its own order and composition, and draws no photo: the
 * words are the image. A site's motif, if it has one, adds to this without
 * changing what the page says.
 */
import type { CSSProperties } from "react";
import type { SiteContent } from "./content";
import { Action, Closing, FirstSteps, Frame, Headline, Proof, Questions, Reasons, Services, displayTier, type PageContext } from "./pages";

/** A line set to fill the page's width. The CSS works out the size from how many letters it has. */
const fit = (text: string) => ({ "--n": text.length }) as CSSProperties;

const LONGEST_POSTER_LINE = 24;

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).filter(Boolean);

/** A headline as lines for a poster, or null if it would not read well set that way. */
export function posterLines(headline: string, turn?: string): string[] | null {
  const body = turn && headline.endsWith(turn) ? headline.slice(0, -turn.length).trim() : headline;
  const lines = [...sentences(body), ...(turn ? [turn] : [])];
  if (lines.length < 2 || lines.length > 3 || lines.some((line) => line.length > LONGEST_POSTER_LINE)) return null;
  return lines;
}

/** One word for each step, when the heading is written that way. Otherwise null. */
export function stepWords(heading: string, steps: number): string[] | null {
  const words = sentences(heading);
  return words.length === steps ? words : null;
}

function Hero({ context }: { context: PageContext }) {
  const { content } = context;
  const { promise, business } = content;
  const lines = posterLines(promise.headline.text, promise.turn);
  return (
    <section className="hero hero--poster" data-tier={displayTier(promise.headline.text)}>
      <div className="hero-meta">
        <p className="label hero-for">{promise.whoFor.text}</p>
        {business.hours ? <p className="label">{business.hours}</p> : null}
      </div>
      {lines ? (
        <h1>
          {lines.map((line, i) => {
            const last = promise.turn && i === lines.length - 1;
            const Tag = last ? "em" : "span";
            return (
              <Tag key={line} className={i === 0 && line.endsWith("?") ? "poster poster--question" : "poster"} style={fit(line)}>
                {line}{" "}
              </Tag>
            );
          })}
        </h1>
      ) : (
        <Headline text={promise.headline.text} turn={promise.turn} />
      )}
      <div className="hero-under">
        <p className="hero-why">{promise.why.text}</p>
        <div className="hero-call">
          <Action context={context} />
          {promise.reassurance ? <p className="hero-reassurance">{promise.reassurance.text}</p> : null}
          {promise.secondAction ? <a className="link-action" href="#form">{promise.secondAction}</a> : null}
        </div>
      </div>
    </section>
  );
}

/** Each step stacks over the last as you scroll, when the heading gives each one a word. */
function Steps({ content }: { content: SiteContent }) {
  const { firstSteps } = content;
  const words = stepWords(firstSteps.heading.text, firstSteps.items.length);
  if (!words) return <FirstSteps content={content} />;
  return (
    <section className="stack" aria-labelledby="first-steps">
      <h2 id="first-steps" className="label stack-label">{firstSteps.label}</h2>
      <ol>
        {firstSteps.items.map((step, i) => (
          <li key={step.title.text}>
            <p className="stack-word" aria-hidden="true" style={fit(words[i])}>{words[i]}</p>
            <h3>{step.title.text}</h3>
            <p>{step.text.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Crew({ content }: { content: SiteContent }) {
  const { about } = content;
  return (
    <section className="crew" aria-labelledby="crew">
      <h2 id="crew">{about.heading.text}</h2>
      <div className="crew-words">
        <p className="page-lead">{about.lead.text}</p>
        {about.story.map((paragraph) => (
          <p key={paragraph.text}>{paragraph.text}</p>
        ))}
      </div>
    </section>
  );
}

/** A run of pipe between two sections, in the colour of the one it feeds. Only for a site with this motif. */
function Pipe({ side, from, to }: { side: "left" | "right"; from: string; to: string }) {
  return (
    <div className={`pipe pipe--${side}`} aria-hidden="true" style={{ "--from": `var(--${from})`, "--to": `var(--${to})` } as CSSProperties}>
      <i />
    </div>
  );
}

/** A measuring scale across a section's edge, for a firm whose work starts with measuring. */
function Scale({ from, to }: { from: string; to: string }) {
  return <div className="scale" aria-hidden="true" style={{ "--from": `var(--${from})`, "--to": `var(--${to})` } as CSSProperties}><i /></div>;
}

export function StatementHome({ context }: { context: PageContext }) {
  const { content, design } = context;
  const piped = design.motif === "pipe";
  const scaled = design.motif === "scale";
  return (
    <Frame context={context}>
      <Hero context={context} />
      {piped ? <Pipe side="right" from="deep" to="signal" /> : null}
      <Reasons content={content} />
      {piped ? <Pipe side="left" from="signal" to="paper" /> : null}
      {scaled ? <Scale from="paper" to="ink" /> : null}
      <Services content={content} />
      {piped ? <Pipe side="right" from="paper" to="deep" /> : null}
      {scaled ? <Scale from="paper" to="ink" /> : null}
      <Steps content={content} />
      <Crew content={content} />
      <Proof content={content} />
      <Questions content={content} />
      {piped ? <Pipe side="left" from="paper" to="deep" /> : null}
      <Closing content={content} formAction={context.formAction} />
    </Frame>
  );
}
