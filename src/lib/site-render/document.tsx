/**
 * The internal preview of one page: the render model as a complete HTML
 * document, with no scripts and no external requests. React renders the
 * body, so every text from the spec is escaped; the head is assembled here
 * from the theme (validated tokens) and the fixed stylesheet.
 *
 * Links and buttons do not navigate. The page picker around the preview
 * does that.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteSpec } from "@/lib/site-spec/schema";
import type { RenderImage, RenderItem, RenderLink, RenderNavItem, RenderPage, RenderSection, RenderText } from "./model";
import { PREVIEW_CSS } from "./styles";
import { themeCss } from "./theme";

function Text({ value, as: Tag = "span", className }: { value: RenderText | null; as?: "span" | "p" | "h1" | "h2" | "h3"; className?: string }) {
  if (!value) return null;
  if (value.text) return <Tag className={className}>{value.text}</Tag>;
  if (!value.missing) return null;
  return (
    <Tag className={className}>
      <span className="sp-missing">Missing: {value.missing}</span>
    </Tag>
  );
}

function Button({ link, secondary }: { link: RenderLink; secondary?: boolean }) {
  return (
    <span className={secondary ? "sp-button sp-button--secondary" : "sp-button"} title={link.href}>
      {link.label.text || (link.label.missing ? <span className="sp-missing">Missing: {link.label.missing}</span> : link.href)}
    </span>
  );
}

function Buttons({ links }: { links: RenderLink[] }) {
  if (!links.length) return null;
  return (
    <div className="sp-buttons">
      {links.map((link, i) => (
        <Button key={i} link={link} secondary={i > 0} />
      ))}
    </div>
  );
}

/** A stored image, or, while there is no file, a labelled box with its alternative text. */
function ImageBox({ image, small }: { image: RenderImage | null; small?: boolean }) {
  if (!image) return null;
  if (image.file) {
    return (
      <figure className={small ? "sp-figure sp-figure--small" : "sp-figure"}>
        {/* Static markup for the sandboxed preview frame: next/image needs the app's runtime. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.file.url} alt={image.alt} width={image.file.width} height={image.file.height} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {image.missing ? <span className="sp-missing">Missing: {image.missing}</span> : null}
      </figure>
    );
  }
  return (
    <div className={small ? "sp-image sp-image--small" : "sp-image"} role="img" aria-label={image.alt || image.description || "Image"}>
      <span>
        {image.description || "Image"}
        {image.missing ? (
          <>
            <br />
            <span className="sp-missing">Missing: {image.missing}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

function Nav({ items, label, className }: { items: RenderNavItem[]; label: string; className?: string }) {
  const list = (entries: RenderNavItem[]): ReactNode => (
    <ul className="sp-nav">
      {entries.map((item) => (
        <li key={item.pageId}>
          <span className="sp-link" aria-current={item.current ? "page" : undefined} title={item.href}>
            {item.label.text}
          </span>
          {item.children.length ? list(item.children) : null}
        </li>
      ))}
    </ul>
  );
  if (!items.length) return null;
  return (
    <nav aria-label={label} className={className}>
      {list(items)}
    </nav>
  );
}

function Items({ section }: { section: RenderSection }) {
  const { items, kind, variant } = section;
  if (kind === "faq") {
    if (variant === "two_column") {
      return (
        <dl className="sp-columns">
          {items.map((item) => (
            <div key={item.id}>
              <dt>
                <Text value={item.title} />
              </dt>
              <dd>
                <Text value={item.body} as="p" />
              </dd>
            </div>
          ))}
        </dl>
      );
    }
    return (
      <div>
        {items.map((item) => (
          <details key={item.id}>
            <summary>
              <Text value={item.title} />
            </summary>
            <Text value={item.body} as="p" />
          </details>
        ))}
      </div>
    );
  }
  if (kind === "testimonials") {
    return (
      <div className={`sp-grid ${variant === "carousel" ? "sp-grid--1" : "sp-grid--2"}`}>
        {items.map((item) => (
          <figure key={item.id} className="sp-card sp-quote">
            <blockquote>
              <Text value={item.body} as="p" />
            </blockquote>
            {item.meta ? <figcaption>{item.meta}</figcaption> : null}
          </figure>
        ))}
      </div>
    );
  }
  const card = (item: RenderItem) => (
    <>
      {item.image || kind === "team" ? <ImageBox image={item.image} small /> : null}
      <Text value={item.title} as="h3" />
      <Text value={item.body} as="p" />
    </>
  );
  if (variant === "list") {
    return (
      <ul className="sp-list">
        {items.map((item) => (
          <li key={item.id}>{card(item)}</li>
        ))}
      </ul>
    );
  }
  const grid = variant === "grid_4" ? "sp-grid sp-grid--4" : variant === "detailed" ? "sp-grid sp-grid--2" : "sp-grid";
  return (
    <div className={grid}>
      {items.map((item) => (
        <div key={item.id} className="sp-card">
          {card(item)}
        </div>
      ))}
    </div>
  );
}

function Section({ section, first }: { section: RenderSection; first: boolean }) {
  const heading = first && section.kind === "hero" ? "h1" : "h2";
  const className = `sp-section sp-${section.kind} sp-${section.kind}--${section.variant}`;
  const common = { id: section.id, className, "data-mobile": section.mobile ?? undefined, "aria-label": section.heading?.text ? undefined : section.label };

  switch (section.kind) {
    case "hero":
    case "text_media": {
      const imageSide = section.variant === "split_image_left" || section.variant === "image_left" ? "sp-split sp-split--image-left" : "sp-split";
      const split = section.image && section.variant !== "centered" && section.variant !== "full_bleed_image";
      const copy = (
        <div>
          <Text value={section.heading} as={heading} />
          {section.kind === "hero" ? <Text value={section.subheading} as="p" className="sp-lead" /> : <Text value={section.body} as="p" />}
          <Buttons links={section.buttons} />
        </div>
      );
      return (
        <section {...common}>
          <div className={split ? `sp-wrap ${imageSide}` : "sp-wrap"}>
            {copy}
            {split ? <ImageBox image={section.image} /> : null}
          </div>
          {!split && section.image ? (
            <div className="sp-wrap" style={{ marginTop: "2rem" }}>
              <ImageBox image={section.image} />
            </div>
          ) : null}
        </section>
      );
    }
    case "text":
      return (
        <section {...common}>
          <div className="sp-wrap">
            <Text value={section.heading} as="h2" />
            <Text value={section.body} as="p" className={section.variant === "two_column" ? "sp-columns" : undefined} />
          </div>
        </section>
      );
    case "gallery":
      return (
        <section {...common}>
          <div className="sp-wrap">
            <Text value={section.heading} as="h2" />
            <div className="sp-grid">
              {section.images.map((image) => (
                <ImageBox key={image.id} image={image} small={section.variant === "masonry"} />
              ))}
            </div>
          </div>
        </section>
      );
    case "cta":
      return (
        <section {...common}>
          <div className="sp-wrap">
            <div>
              <Text value={section.heading} as="h2" />
              <Text value={section.body} as="p" />
              <Buttons links={section.buttons} />
            </div>
          </div>
        </section>
      );
    case "contact":
      return (
        <section {...common}>
          <div className="sp-wrap">
            <Text value={section.heading} as="h2" />
            <Text value={section.body} as="p" />
            {section.form && section.variant !== "details_only" ? (
              <form className="sp-form" aria-label={section.form.purpose}>
                {section.form.fields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {field.name === "message" ? <textarea name={field.name} rows={4} disabled /> : <input name={field.name} type={field.name === "email" ? "email" : field.name === "date" ? "date" : field.name === "phone" ? "tel" : "text"} disabled />}
                  </label>
                ))}
                <Text value={section.form.consent} as="p" className="sp-consent" />
                <span className="sp-button">Send</span>
              </form>
            ) : null}
          </div>
        </section>
      );
    case "map":
      return (
        <section {...common}>
          <div className="sp-wrap">
            <Text value={section.heading} as="h2" />
            <div className="sp-image sp-map" role="img" aria-label="Map">
              Map (not loaded in the preview)
            </div>
          </div>
        </section>
      );
    default:
      return (
        <section {...common}>
          <div className="sp-wrap">
            <Text value={section.heading} as="h2" />
            <Items section={section} />
          </div>
        </section>
      );
  }
}

function Body({ model }: { model: RenderPage }) {
  const heroFirst = model.sections[0]?.kind === "hero";
  return (
    <>
      <header className="sp-header">
        <div className="sp-wrap sp-header-inner">
          <Text value={model.siteName} className="sp-brand" />
          <Nav items={model.mainNav} label="Main" className="sp-nav-main" />
          <span className="sp-menu" aria-hidden="true">
            Menu
          </span>
          {model.primaryCta ? <Button link={model.primaryCta} /> : null}
        </div>
      </header>
      <main>
        {heroFirst ? null : (
          <div className="sp-wrap sp-page-title">
            <Text value={model.page.title} as="h1" />
          </div>
        )}
        {model.sections.map((section, i) => (
          <Section key={section.id} section={section} first={i === 0} />
        ))}
      </main>
      <footer className="sp-footer">
        <div className="sp-wrap sp-footer-inner">
          <Text value={model.siteName} />
          <Nav items={model.footerNav} label="Footer" />
          {model.locales.length > 1 ? <span>{model.locales.map((l) => l.label).join(" · ")}</span> : null}
        </div>
      </footer>
    </>
  );
}

/** The whole preview page as an HTML document. */
export function renderPreviewDocument(spec: SiteSpec, model: RenderPage): string {
  const css = `${themeCss(spec.brand)}\n${PREVIEW_CSS}`;
  if (/<\/style/i.test(css)) throw new Error("The preview stylesheet cannot contain a closing style tag.");
  const title = renderToStaticMarkup(<>{model.page.seoTitle.text || model.page.title.text || model.siteName.text || "Preview"}</>);
  const description = renderToStaticMarkup(<meta name="description" content={model.page.seoDescription.text} />);
  const body = renderToStaticMarkup(<Body model={model} />);
  return [
    "<!doctype html>",
    `<html lang="${model.lang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${title}</title>`,
    model.page.seoDescription.text ? description : "",
    `<style>${css}</style>`,
    "</head>",
    `<body>${body}</body>`,
    "</html>",
  ].join("\n");
}
