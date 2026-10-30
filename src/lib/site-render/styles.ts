/**
 * The preview's stylesheet. Every value comes from the theme's custom
 * properties (theme.ts), so one stylesheet serves every brand. Layout
 * variants and the "on phones" hints use media queries, which respond to the
 * preview frame's width.
 *
 * Plain CSS in a string, placed in the document's <style>. It must never
 * contain "</style".
 */
export const PREVIEW_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--sp-bg);color:var(--sp-text);font-family:var(--sp-font-body);font-weight:var(--sp-weight-body);font-size:1rem;line-height:1.6}
h1,h2,h3,h4{font-family:var(--sp-font-heading);font-weight:var(--sp-weight-heading);line-height:1.15;margin:0 0 calc(0.5rem * var(--sp-space))}
h1{font-size:var(--sp-h1)}h2{font-size:var(--sp-h2)}h3{font-size:var(--sp-h4)}
p{margin:0 0 calc(1rem * var(--sp-space))}
.sp-wrap{max-width:1120px;margin:0 auto;padding:0 calc(1.5rem * var(--sp-space))}
.sp-header{border-bottom:1px solid var(--sp-border);background:var(--sp-bg)}
.sp-header-inner{display:flex;align-items:center;gap:1.5rem;min-height:4rem}
.sp-brand{font-family:var(--sp-font-heading);font-weight:var(--sp-weight-heading);font-size:1.15rem;margin-right:auto}
.sp-nav{display:flex;gap:1.25rem;list-style:none;margin:0;padding:0}
.sp-nav li{position:relative}
.sp-nav ul{list-style:none;margin:.25rem 0 0;padding:0 0 0 .75rem;font-size:.9rem}
.sp-nav [aria-current=page]{font-weight:600;text-decoration:underline;text-underline-offset:.3em}
.sp-menu{display:none;border:1px solid var(--sp-border);border-radius:var(--sp-radius);padding:.35rem .75rem;font-size:.9rem}
.sp-link{color:var(--sp-text);cursor:default}
.sp-button{display:inline-block;background:var(--sp-primary);color:var(--sp-on-primary);border-radius:var(--sp-radius);padding:calc(.65rem * var(--sp-space)) calc(1.25rem * var(--sp-space));font-weight:600;cursor:default}
.sp-button--secondary{background:transparent;color:var(--sp-text);border:1px solid var(--sp-border)}
.sp-buttons{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:calc(1rem * var(--sp-space))}
.sp-page-title{padding:calc(2.5rem * var(--sp-space)) 0 0}
.sp-section{padding:calc(4rem * var(--sp-space)) 0}
.sp-section + .sp-section{border-top:1px solid var(--sp-border)}
.sp-split{display:grid;grid-template-columns:1fr 1fr;gap:calc(2.5rem * var(--sp-space));align-items:center}
.sp-split--image-left .sp-image{order:-1}
.sp-hero{padding:calc(5.5rem * var(--sp-space)) 0}
.sp-hero--centered{text-align:center}.sp-hero--centered .sp-buttons{justify-content:center}
.sp-hero--full_bleed_image{position:relative;background:var(--sp-surface);color:var(--sp-on-surface)}
.sp-lead{font-size:1.2rem;color:var(--sp-muted);max-width:42rem}
.sp-hero--centered .sp-lead{margin-left:auto;margin-right:auto}
.sp-columns{columns:2;column-gap:calc(2.5rem * var(--sp-space))}
.sp-grid{display:grid;gap:calc(1.5rem * var(--sp-space));grid-template-columns:repeat(var(--sp-cols,3),minmax(0,1fr));margin-top:calc(1.5rem * var(--sp-space))}
.sp-grid--4{--sp-cols:4}.sp-grid--2{--sp-cols:2}.sp-grid--1{--sp-cols:1}
.sp-card{background:var(--sp-surface);color:var(--sp-on-surface);border-radius:var(--sp-radius);padding:calc(1.25rem * var(--sp-space))}
.sp-card p:last-child{margin-bottom:0}
.sp-list{list-style:none;margin:calc(1.5rem * var(--sp-space)) 0 0;padding:0}
.sp-list li{padding:calc(1rem * var(--sp-space)) 0;border-bottom:1px solid var(--sp-border)}
.sp-quote{margin:0;font-size:1.1rem}.sp-quote figcaption{margin-top:.5rem;color:var(--sp-muted);font-size:.95rem}
.sp-faq details{border-bottom:1px solid var(--sp-border);padding:calc(.9rem * var(--sp-space)) 0}
.sp-faq summary{font-weight:600;cursor:default}
.sp-faq dt{font-weight:600;margin-top:calc(1rem * var(--sp-space))}.sp-faq dd{margin:0}
.sp-cta{background:var(--sp-primary);color:var(--sp-on-primary)}
.sp-cta .sp-button{background:var(--sp-on-primary);color:var(--sp-primary)}
.sp-cta--card .sp-wrap > div{background:var(--sp-surface);color:var(--sp-on-surface);border-radius:var(--sp-radius);padding:calc(2rem * var(--sp-space))}
.sp-cta--card{background:transparent;color:inherit}
.sp-image{display:flex;align-items:center;justify-content:center;min-height:14rem;background:repeating-linear-gradient(45deg,var(--sp-surface),var(--sp-surface) 12px,var(--sp-bg) 12px,var(--sp-bg) 24px);border:1px dashed var(--sp-border);border-radius:var(--sp-radius);color:var(--sp-muted);font-size:.9rem;text-align:center;padding:1rem}
.sp-image--small{min-height:6rem}
.sp-figure{margin:0}.sp-figure img{display:block;width:100%;height:auto;border-radius:var(--sp-radius);object-fit:cover}
.sp-figure--small img{aspect-ratio:4/3}
.sp-form{display:grid;gap:calc(.9rem * var(--sp-space));max-width:36rem;margin-top:calc(1.5rem * var(--sp-space))}
.sp-form label{display:grid;gap:.3rem;font-size:.95rem}
.sp-form input,.sp-form textarea{font:inherit;padding:.6rem .75rem;border:1px solid var(--sp-border);border-radius:var(--sp-radius);background:var(--sp-bg);color:var(--sp-text)}
.sp-form .sp-consent{font-size:.85rem;color:var(--sp-muted)}
.sp-map{min-height:18rem}
.sp-footer{border-top:1px solid var(--sp-border);padding:calc(2rem * var(--sp-space)) 0;color:var(--sp-muted);font-size:.9rem}
.sp-footer-inner{display:flex;flex-wrap:wrap;gap:1rem 2rem;align-items:center}
.sp-footer .sp-nav{gap:1rem}
.sp-missing{display:inline-block;background:#FFF4D6;color:#5C3D00;border:1px dashed #C98A00;border-radius:4px;padding:.1rem .45rem;font:600 .8rem/1.4 system-ui,sans-serif}
@media (max-width:900px){.sp-grid--4{--sp-cols:2}.sp-grid{--sp-cols:2}}
@media (max-width:640px){
  .sp-nav-main .sp-nav{display:none}.sp-menu{display:inline-block}.sp-header .sp-button{display:none}
  .sp-split{grid-template-columns:1fr}.sp-split--image-left .sp-image{order:0}
  .sp-grid,.sp-grid--4,.sp-grid--2{--sp-cols:1}.sp-columns{columns:1}
  .sp-hero{padding:calc(3rem * var(--sp-space)) 0}
  [data-mobile=reverse] .sp-split{display:flex;flex-direction:column-reverse}
  [data-mobile=hide]{display:none}
}
`;
