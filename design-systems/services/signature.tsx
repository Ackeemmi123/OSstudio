/**
 * The signature part: the one section only this firm has, chosen by the
 * concept (siteDesign.signature) from what its own material holds. It is the
 * same markup in every direction; each direction's type, colours and motion
 * give it their own voice through the stylesheet.
 */
import type { SiteContent } from "./content";
import { find, Picture, type PageContext } from "./pages";

const QUOTE: Record<SiteContent["language"], [string, string]> = { sv: ["”", "”"], fi: ["”", "”"], en: ["“", "”"] };

function Head({ label, heading }: { label: string; heading: string }) {
  return (
    <div className="section-head">
      <p className="label">{label}</p>
      <h2 id="signature">{heading}</h2>
    </div>
  );
}

export function Signature({ context }: { context: PageContext }) {
  const { content, design } = context;
  const kind = design.signature;
  const parts = content.signature;
  if (!kind || !parts) return null;

  if (kind === "year" && parts.year) {
    const { year } = parts;
    return (
      <section className="sig sig--year" aria-labelledby="signature">
        <p className="sig-year" aria-hidden="true">{year.year}</p>
        <div className="sig-body">
          <h2 id="signature">{year.heading.text}</h2>
          {year.events.length ? (
            <ol className="sig-events">
              {year.events.map((event) => (
                <li key={event.when + event.text.text}>
                  <strong>{event.when}</strong> {event.text.text}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>
    );
  }

  if (kind === "ownerLine" && parts.ownerLine) {
    const owner = parts.ownerLine;
    const portrait = find(content, owner.imageId);
    const [open, close] = QUOTE[content.language];
    return (
      <section className={portrait ? "sig sig--owner" : "sig sig--owner sig--words"} aria-label={owner.who}>
        <figure>
          <blockquote>
            <p>{open}{owner.text.text}{close}</p>
          </blockquote>
          <figcaption>
            {portrait ? <Picture asset={portrait} ratio={1} sizes="6rem" widths={[240]} className="sig-portrait" /> : null}
            <span>
              {owner.who}
              {owner.role ? <small>{owner.role}</small> : null}
            </span>
          </figcaption>
        </figure>
      </section>
    );
  }

  if (kind === "everyday" && parts.everyday) {
    const { everyday } = parts;
    return (
      <section className="sig sig--everyday" aria-labelledby="signature">
        <Head label={everyday.label} heading={everyday.heading.text} />
        <ol className="sig-days" data-count={everyday.items.length}>
          {everyday.items.map((item) => {
            const asset = find(content, item.imageId);
            return (
              <li key={item.imageId}>
                {asset ? (
                  <div className="sig-frame">
                    <Picture asset={asset} ratio={4 / 5} sizes="(max-width: 820px) 80vw, 24vw" widths={[480, 800]} />
                  </div>
                ) : null}
                {item.when ? <p className="sig-when">{item.when}</p> : null}
                <p>{item.text.text}</p>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  if (kind === "area" && parts.area) {
    const { area } = parts;
    return (
      <section className="sig sig--area" aria-labelledby="signature">
        <div className="sig-lead">
          <Head label={area.label} heading={area.heading.text} />
          {area.text ? <p>{area.text.text}</p> : null}
        </div>
        <ol className="sig-places">
          {area.places.map((place) => (
            <li key={place.name}>
              <span className="sig-place">{place.name}</span>
              {place.note ? <span className="sig-place-note">{place.note.text}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (kind === "numbers" && parts.numbers) {
    const { numbers } = parts;
    return (
      <section className="sig sig--numbers" aria-label={numbers.label}>
        <p className="label">{numbers.label}</p>
        <dl className="sig-numbers" data-count={numbers.items.length}>
          {numbers.items.map((item) => (
            <div key={item.value + item.text.text}>
              <dt>{item.text.text}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  if (kind === "season" && parts.season) {
    const { season } = parts;
    return (
      <section className="sig sig--season" aria-labelledby="signature">
        <div className="sig-card">
          <p className="label">{season.label}</p>
          <h2 id="signature">{season.title.text}</h2>
          <p>{season.text.text}</p>
          {season.price ? <p className="sig-price">{season.price.text}</p> : null}
        </div>
      </section>
    );
  }
  return null;
}
