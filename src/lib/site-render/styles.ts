/**
 * The preview's stylesheet. Every value comes from the theme's custom
 * properties (theme.ts), so one stylesheet serves every brand. Layout
 * variants and the "on phones" hints use media queries, which respond to the
 * preview frame's width.
 *
 * It aims to look like a finished, art-directed website, not a wireframe: large
 * editorial type, generous space, a different composition for each kind of
 * section, and designed panels where photographs will go. Grey text only ever
 * sits on the page background, where the checks guarantee its contrast.
 *
 * Plain CSS in a string, placed in the document's <style>. It must never
 * contain "</style".
 */
export const PREVIEW_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{margin:0;background:var(--sp-bg);color:var(--sp-text);font-family:var(--sp-font-body);font-weight:var(--sp-weight-body);font-size:1.0625rem;line-height:1.65}
h1,h2,h3,h4{font-family:var(--sp-font-heading);font-weight:var(--sp-weight-heading);margin:0;text-wrap:balance}
h1{font-size:clamp(2.6rem,6.4vw,calc(var(--sp-h1) * 1.85));line-height:1.02;letter-spacing:-.028em}
h2{font-size:clamp(1.9rem,3.8vw,calc(var(--sp-h2) * 1.5));line-height:1.08;letter-spacing:-.02em}
h3{font-size:calc(var(--sp-h4) * 1.08);line-height:1.25;letter-spacing:-.01em}
p{margin:0 0 calc(1rem * var(--sp-space));text-wrap:pretty}
.sp-wrap{max-width:1240px;margin:0 auto;padding:0 clamp(1.25rem,5vw,4.5rem)}

.sp-header{background:var(--sp-bg);position:relative;z-index:2}
.sp-header-inner{display:flex;align-items:center;gap:2.25rem;min-height:5.5rem}
.sp-brand{font-family:var(--sp-font-heading);font-weight:var(--sp-weight-heading);font-size:1.3rem;line-height:1.15;letter-spacing:-.02em;margin-right:auto}
.sp-nav{display:flex;gap:2rem;list-style:none;margin:0;padding:0;font-size:.95rem}
.sp-nav li{position:relative}
.sp-nav ul{list-style:none;margin:.25rem 0 0;padding:0 0 0 .75rem;font-size:.9rem}
.sp-nav [aria-current=page]{box-shadow:0 2px 0 0 currentColor;padding-bottom:.2rem}
.sp-menu{display:none;border:1px solid currentColor;border-radius:var(--sp-radius);padding:.35rem .9rem;font-size:.9rem}
.sp-link{color:inherit;cursor:default}

.sp-button{display:inline-flex;align-items:center;gap:.6rem;background:var(--sp-primary);color:var(--sp-on-primary);border-radius:var(--sp-radius);padding:.85rem 1.5rem;font-weight:600;font-size:.98rem;letter-spacing:-.005em;cursor:default;white-space:nowrap}
.sp-button::after{content:"\\2192"}
.sp-header .sp-button{padding:.6rem 1.15rem;font-size:.92rem}.sp-header .sp-button::after{content:none}
.sp-button--secondary{background:transparent;color:inherit;box-shadow:inset 0 0 0 1px currentColor}
.sp-buttons{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:calc(2rem * var(--sp-space))}

.sp-page-title{padding-top:calc(5rem * var(--sp-space));padding-bottom:calc(1rem * var(--sp-space))}
.sp-section{padding:calc(6.5rem * var(--sp-space)) 0}
.sp-split{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:clamp(2.5rem,6vw,6rem);align-items:center}
.sp-split--image-left{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.sp-split--image-left .sp-image,.sp-split--image-left .sp-figure{order:-1}

.sp-image{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:.5rem;width:100%;aspect-ratio:4/5;padding:1rem;overflow:hidden;background:linear-gradient(150deg,color-mix(in srgb,var(--sp-primary) 92%,#000) 0%,var(--sp-primary) 45%,color-mix(in srgb,var(--sp-accent) 72%,var(--sp-primary)) 100%);border-radius:var(--sp-radius);font-size:.8rem;line-height:1.35}
.sp-image::before{content:"";position:absolute;inset:-30% -30% auto auto;width:75%;aspect-ratio:1;border-radius:50%;background:color-mix(in srgb,var(--sp-accent) 55%,transparent)}
.sp-image > span{position:relative;display:inline-block;max-width:100%;background:var(--sp-bg);color:var(--sp-text);padding:.35rem .6rem;border-radius:min(var(--sp-radius),6px)}
.sp-image--small{aspect-ratio:1/1}
.sp-figure{margin:0}.sp-figure img{display:block;width:100%;height:100%;aspect-ratio:4/5;border-radius:var(--sp-radius);object-fit:cover}
.sp-figure--small img{aspect-ratio:1/1}

.sp-hero{padding:calc(4.5rem * var(--sp-space)) 0 calc(7rem * var(--sp-space))}
.sp-lead{font-size:clamp(1.15rem,1.7vw,1.4rem);line-height:1.5;color:var(--sp-muted);max-width:38rem;margin-top:calc(1.75rem * var(--sp-space))}
.sp-hero--centered{text-align:center;padding-top:calc(7rem * var(--sp-space))}
.sp-hero--centered .sp-buttons{justify-content:center}
.sp-hero--centered .sp-lead{margin-left:auto;margin-right:auto}
.sp-hero--centered h1{max-width:18ch;margin-left:auto;margin-right:auto}
.sp-hero-media{margin-top:calc(4.5rem * var(--sp-space))}
.sp-hero-media .sp-image,.sp-hero-media .sp-figure img{aspect-ratio:21/9}
.sp-hero--full_bleed_image{position:relative;min-height:min(46rem,92vh);display:flex;align-items:flex-end;padding:calc(9rem * var(--sp-space)) 0 calc(5rem * var(--sp-space));background:var(--sp-primary);color:var(--sp-on-primary);overflow:hidden}
.sp-hero--full_bleed_image > .sp-wrap:first-child{position:relative;z-index:1;width:100%}
.sp-hero--full_bleed_image h1{font-size:clamp(3rem,8vw,calc(var(--sp-h1) * 2.3));max-width:15ch}
.sp-hero--full_bleed_image .sp-lead{color:inherit}
.sp-hero--full_bleed_image .sp-button{background:var(--sp-on-primary);color:var(--sp-primary)}
.sp-hero--full_bleed_image .sp-hero-media{position:absolute;inset:0;margin:0;padding:0;max-width:none}
.sp-hero--full_bleed_image .sp-hero-media .sp-image,.sp-hero--full_bleed_image .sp-hero-media .sp-figure,.sp-hero--full_bleed_image .sp-hero-media .sp-figure img{width:100%;height:100%;aspect-ratio:auto;border-radius:0}
.sp-hero--full_bleed_image .sp-hero-media .sp-figure img{opacity:.45}
.sp-hero--full_bleed_image .sp-hero-media .sp-image{align-items:flex-end;justify-content:flex-start;padding:1.25rem clamp(1.25rem,5vw,4.5rem)}

.sp-text_media h2{margin-bottom:calc(1.5rem * var(--sp-space))}
.sp-text_media p{font-size:clamp(1.1rem,1.5vw,1.25rem);line-height:1.55}
.sp-text .sp-wrap{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(2rem,6vw,6rem);align-items:start}
.sp-text p{font-size:clamp(1.2rem,2vw,1.6rem);line-height:1.42;letter-spacing:-.01em;margin:0}
.sp-columns{columns:2;column-gap:calc(2.5rem * var(--sp-space))}
.sp-text--two_column .sp-wrap{grid-template-columns:minmax(0,1fr)}
.sp-text--two_column p{font-size:1.0625rem;line-height:1.65;letter-spacing:0}
.sp-text--two_column h2{margin-bottom:calc(1.5rem * var(--sp-space))}

.sp-grid{display:grid;gap:clamp(2rem,4vw,3.5rem) clamp(1.5rem,3vw,3rem);grid-template-columns:repeat(var(--sp-cols,3),minmax(0,1fr));margin-top:calc(3.5rem * var(--sp-space));counter-reset:sp-item}
.sp-grid--4{--sp-cols:4}.sp-grid--2{--sp-cols:2}.sp-grid--1{--sp-cols:1}
.sp-card{color:inherit;counter-increment:sp-item;border-top:1px solid currentColor;padding-top:1.25rem}
.sp-card h3{margin-bottom:.65rem}
.sp-card p:last-child{margin-bottom:0}
.sp-features .sp-card{border-top-width:2px}
.sp-features .sp-card h3{font-size:clamp(1.3rem,2vw,1.7rem);letter-spacing:-.015em;margin-bottom:1rem}
.sp-services .sp-card::before{content:counter(sp-item,decimal-leading-zero);display:block;margin-bottom:2.25rem;font-size:.85rem;font-feature-settings:"tnum";letter-spacing:.04em}

.sp-services{background:var(--sp-surface);color:var(--sp-on-surface)}
.sp-services--detailed .sp-card{padding-bottom:1.5rem}
.sp-services--detailed .sp-card h3{font-size:clamp(1.4rem,2.4vw,2rem);letter-spacing:-.018em}

.sp-list{list-style:none;margin:calc(3.5rem * var(--sp-space)) 0 0;padding:0;counter-reset:sp-item}
.sp-list li{counter-increment:sp-item;display:grid;grid-template-columns:5rem minmax(0,4fr) minmax(0,7fr);gap:1rem 2rem;padding:calc(1.75rem * var(--sp-space)) 0;border-top:1px solid currentColor;align-items:baseline}
.sp-list li::before{content:counter(sp-item,decimal-leading-zero);font-size:.85rem;font-feature-settings:"tnum";letter-spacing:.04em}
.sp-list li h3{margin:0}.sp-list li p{margin:0}

.sp-testimonials .sp-grid{align-items:start}
.sp-quote{margin:0;border-top:0;padding-top:0}
.sp-quote blockquote{margin:0}
.sp-quote blockquote p{font-family:var(--sp-font-heading);font-size:clamp(1.35rem,2.5vw,2.1rem);line-height:1.25;letter-spacing:-.015em;margin:0}
.sp-quote blockquote::before{content:"\\201C";display:block;font-family:var(--sp-font-heading);font-size:4rem;line-height:.8;height:2.25rem;color:var(--sp-accent)}
.sp-quote figcaption{margin-top:1.5rem;font-size:.95rem;color:var(--sp-muted)}
.sp-testimonials--carousel{text-align:center}
.sp-testimonials--carousel .sp-grid{max-width:56rem;margin-left:auto;margin-right:auto}

.sp-faq .sp-wrap{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(2rem,6vw,6rem);align-items:start}
.sp-faq details{border-top:1px solid currentColor;padding:calc(1.35rem * var(--sp-space)) 0}
.sp-faq details:last-child{border-bottom:1px solid currentColor}
.sp-faq summary{font-weight:600;cursor:default;font-size:1.1rem;list-style:none;display:flex;justify-content:space-between;gap:1.5rem}
.sp-faq summary::after{content:"+";font-weight:400}
.sp-faq details p{margin:.75rem 0 0}
.sp-faq .sp-columns{columns:1;margin:0}
.sp-faq dl.sp-columns > div{border-top:1px solid currentColor;padding:calc(1.35rem * var(--sp-space)) 0}
.sp-faq dt{font-weight:600;font-size:1.1rem}.sp-faq dd{margin:.5rem 0 0}.sp-faq dd p{margin:0}

.sp-cta{background:var(--sp-primary);color:var(--sp-on-primary);padding:calc(8rem * var(--sp-space)) 0}
.sp-cta h2{font-size:clamp(2.4rem,6vw,calc(var(--sp-h1) * 1.7));line-height:1.03;letter-spacing:-.028em;max-width:18ch}
.sp-cta p{font-size:clamp(1.1rem,1.6vw,1.3rem);max-width:36rem;margin-top:1.5rem}
.sp-cta .sp-button{background:var(--sp-on-primary);color:var(--sp-primary)}
.sp-cta--card{background:transparent;color:inherit;padding:calc(4rem * var(--sp-space)) 0}
.sp-cta--card .sp-wrap > div{background:var(--sp-surface);color:var(--sp-on-surface);border-radius:var(--sp-radius);padding:clamp(2.5rem,6vw,5.5rem)}
.sp-cta--card h2{font-size:clamp(1.9rem,4vw,calc(var(--sp-h2) * 1.6))}
.sp-cta--card .sp-button{background:var(--sp-primary);color:var(--sp-on-primary)}

.sp-gallery .sp-grid{grid-auto-flow:dense}
.sp-gallery--grid .sp-image:first-child,.sp-gallery--grid .sp-figure:first-child{grid-column:span 2;grid-row:span 2}
.sp-gallery--grid .sp-image:first-child{aspect-ratio:auto;min-height:100%}
.sp-gallery .sp-image{aspect-ratio:1/1}
.sp-gallery--masonry .sp-image:nth-child(2),.sp-gallery--masonry .sp-figure:nth-child(2){margin-top:4rem}

.sp-team .sp-card{border-top:0;padding-top:0}
.sp-team .sp-image,.sp-team .sp-figure{margin-bottom:1.25rem}
.sp-team .sp-image{aspect-ratio:4/5}
.sp-team .sp-figure img{aspect-ratio:4/5}

.sp-contact .sp-wrap{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:1.5rem clamp(2rem,6vw,6rem);align-items:start}
.sp-contact h2{grid-column:1}.sp-contact .sp-wrap > p{grid-column:1;margin:0;font-size:1.15rem}
.sp-contact .sp-form{grid-column:2;grid-row:1 / span 3}
.sp-form{display:grid;gap:calc(1.5rem * var(--sp-space));width:100%}
.sp-form label{display:grid;gap:.35rem;font-size:.9rem;font-weight:600}
.sp-form input,.sp-form textarea{font:inherit;font-weight:400;padding:.8rem 0;border:0;border-bottom:1px solid currentColor;border-radius:0;background:transparent;color:inherit;width:100%}
.sp-form .sp-consent{font-size:.85rem;color:var(--sp-muted);margin:0}
.sp-form .sp-button{justify-self:start}
.sp-map{aspect-ratio:21/9;margin-top:calc(2.5rem * var(--sp-space))}

.sp-footer{background:var(--sp-text);color:var(--sp-bg);padding:calc(4.5rem * var(--sp-space)) 0;font-size:.95rem}
.sp-footer-inner{display:flex;flex-wrap:wrap;gap:1.5rem 2.5rem;align-items:baseline}
.sp-footer-inner > span:first-child{font-family:var(--sp-font-heading);font-weight:var(--sp-weight-heading);font-size:clamp(1.5rem,3vw,2.4rem);letter-spacing:-.02em;margin-right:auto}
.sp-footer .sp-nav{gap:1.5rem}

.sp-missing{display:inline-block;background:#FFF4D6;color:#5C3D00;border:1px dashed #C98A00;border-radius:4px;padding:.1rem .45rem;font:600 .8rem/1.4 system-ui,sans-serif;letter-spacing:0}
@media (max-width:900px){
  .sp-grid,.sp-grid--4{--sp-cols:2}
  .sp-text .sp-wrap,.sp-faq .sp-wrap,.sp-contact .sp-wrap{grid-template-columns:minmax(0,1fr)}
  .sp-contact .sp-form{grid-column:1;grid-row:auto}
  .sp-list li{grid-template-columns:3rem minmax(0,1fr)}.sp-list li p{grid-column:2}
  .sp-gallery--grid .sp-image:first-child{aspect-ratio:16/9;min-height:0}
}
@media (max-width:640px){
  .sp-nav-main .sp-nav{display:none}.sp-menu{display:inline-block}.sp-header .sp-button{display:none}
  .sp-header-inner{min-height:4.5rem;gap:1rem}.sp-brand{font-size:1.15rem}
  .sp-split,.sp-split--image-left{grid-template-columns:minmax(0,1fr)}.sp-split--image-left .sp-image,.sp-split--image-left .sp-figure{order:0}
  .sp-grid,.sp-grid--4,.sp-grid--2{--sp-cols:1}.sp-columns{columns:1}
  .sp-section{padding:calc(4rem * var(--sp-space)) 0}
  .sp-hero{padding:calc(2.5rem * var(--sp-space)) 0 calc(4rem * var(--sp-space))}
  .sp-hero--full_bleed_image{padding:calc(6rem * var(--sp-space)) 0 calc(3rem * var(--sp-space))}
  .sp-hero-media .sp-image,.sp-hero-media .sp-figure img{aspect-ratio:4/3}
  .sp-gallery--grid .sp-image:first-child,.sp-gallery--grid .sp-figure:first-child{grid-column:auto;grid-row:auto}
  .sp-gallery--grid .sp-image:first-child{aspect-ratio:1/1}
  .sp-gallery--masonry .sp-image:nth-child(2),.sp-gallery--masonry .sp-figure:nth-child(2){margin-top:0}
  [data-mobile=reverse] .sp-split{display:flex;flex-direction:column-reverse}
  [data-mobile=hide]{display:none}
}
`;
