/**
 * The association design system's one stylesheet, set from the spec's brand:
 * its colours, heading and body fonts, corners and spacing. Fonts are the
 * system's own or the visitor's installed ones; nothing is loaded from outside.
 */
import type { SiteSpec } from "@/lib/site-spec/schema";

const FALLBACK: Record<string, string> = {
  "courier new": '"Courier New",Courier,"Nimbus Mono PS","Liberation Mono",monospace',
  "system-ui": 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
};

function stack(family: string): string {
  return FALLBACK[family.toLowerCase()] ?? `"${family.replace(/"/g, "")}",system-ui,sans-serif`;
}

export function STYLES(spec: SiteSpec): string {
  const { colors, typography, radius, density } = spec.brand;
  const muted = colors.neutral[colors.neutral.length - 1] ?? colors.text;
  const radiusPx = radius === "none" ? "0" : radius === "soft" ? "4px" : "14px";
  const space = density === "compact" ? "48px" : density === "airy" ? "80px" : "64px";
  const scale = Number(typography.scale);
  return `
:root{--primary:${colors.primary};--secondary:${colors.secondary ?? colors.text};--accent:${colors.accent ?? colors.primary};--bg:${colors.background};--ink:${colors.text};--muted:${muted};
--card:color-mix(in srgb,var(--bg) 55%,#fff);--line:color-mix(in srgb,var(--ink) 16%,var(--bg));
--head:${stack(typography.heading.family)};--body:${stack(typography.body.family)};--hw:${typography.heading.weight};--bw:${typography.body.weight};
--r:${radiusPx};--space:${space};--h1:clamp(${Math.round(16 * scale ** 3)}px,5vw,${Math.round(18 * scale ** 5)}px);--h2:clamp(${Math.round(16 * scale ** 2)}px,3.2vw,${Math.round(16 * scale ** 3.4)}px)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:var(--bw) 17px/1.6 var(--body)}
a{color:var(--primary);text-underline-offset:3px}a:hover{color:var(--accent)}
:focus-visible{outline:2px solid var(--primary);outline-offset:3px}
img{max-width:100%;height:auto;display:block}
h1,h2,h3,summary,label,.btn,.nav,.brand,.when,.date,.role,.dl,dt{font-family:var(--head)}
h1,h2,h3{font-weight:var(--hw);letter-spacing:-.01em;line-height:1.2;overflow-wrap:break-word;hyphens:auto}
h1{font-size:var(--h1);margin:0 0 18px}h2{font-size:var(--h2);margin:0 0 18px}h3,.point h2,.person h2,.doc h2{font-size:19px;margin:0 0 6px}
p{margin:0 0 14px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}.narrow{max-width:780px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:16px;background:#fff;padding:8px 12px;z-index:9}
.top{background:var(--bg);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.bar{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:72px}
.brand{display:flex;align-items:center;gap:12px;color:var(--ink);text-decoration:none;font-weight:700;font-size:15px;line-height:1.15}
.brand img{width:64px;flex:none}@media (max-width:480px){.brand>*+span{display:none}}
.nav{display:flex;align-items:center;gap:4px;font-size:15px}
.nav a{color:var(--ink);text-decoration:none;padding:8px 10px;border-radius:var(--r)}.nav a:hover{background:var(--line)}
.nav a[aria-current=page]:not(.btn){text-decoration:underline;text-decoration-color:var(--primary);text-decoration-thickness:2px;text-underline-offset:6px}
.btn{display:inline-block;font-weight:700;font-size:15px;background:var(--primary);color:#fff!important;text-decoration:none;padding:12px 20px;border:2px solid var(--primary);border-radius:var(--r);cursor:pointer;text-align:center}
.btn:hover{background:var(--accent);border-color:var(--accent)}
.btn--line{background:transparent;color:var(--primary)!important}.btn--line:hover{background:var(--primary);color:#fff!important}
.btn--light{background:#fff;color:var(--primary)!important;border-color:#fff}.btn--light:hover{background:var(--bg);border-color:var(--bg)}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.nav .btn{padding:8px 14px;margin-left:8px}
.menu{display:none}
@media (max-width:920px){.nav{display:none}.menu{display:block;position:relative}
.menu summary{list-style:none;font-weight:700;cursor:pointer;padding:10px 14px;border:2px solid var(--ink);border-radius:var(--r)}
.menu summary::-webkit-details-marker{display:none}.menu[open] summary{background:var(--ink);color:var(--bg)}
.menu nav{position:absolute;right:0;top:54px;background:var(--card);border:1px solid var(--line);box-shadow:0 12px 30px rgba(0,0,0,.14);min-width:240px;padding:8px;display:flex;flex-direction:column;font-family:var(--head)}
.menu nav a{color:var(--ink);text-decoration:none;padding:12px 14px}.menu nav a.btn{color:#fff;margin-top:6px}}
.hero{padding:var(--space) 0;border-bottom:1px solid var(--line)}
.hero.has-media .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
.hero-media{width:100%;max-width:520px;margin-left:auto}
.lead{font-size:20px;max-width:36em}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
@media (max-width:820px){.hero{padding:36px 0 40px}.hero.has-media .hero-grid{grid-template-columns:1fr;gap:24px}.hero-media{order:-1;max-width:340px;margin:0 auto}}
.sec{padding:var(--space) 0}.sec+.sec,.hero+.sec,.band+.sec{border-top:1px solid var(--line)}
.pagehead{padding:56px 0 8px}.pagehead:last-child{padding-bottom:var(--space)}.pagehead+.sec{border-top:0;padding-top:24px}
.prose--lead p{font-size:19px;max-width:38em}
.prose ol{margin:0 0 14px;padding-left:26px}
.head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:26px;flex-wrap:wrap}.head h2{margin:0}
.points{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.points--grid_4{grid-template-columns:repeat(4,1fr)}.points--list{grid-template-columns:1fr}
@media (max-width:900px){.points,.points--grid_4{grid-template-columns:repeat(2,1fr)}}@media (max-width:520px){.points,.points--grid_4{grid-template-columns:1fr}}
.point{border-top:3px solid var(--secondary);padding-top:14px}.point p{color:var(--muted);font-size:16px;margin:0}
.band{background:var(--secondary);color:#fff;padding:var(--space) 0}.band a:not(.btn){color:#fff}
.band-grid{display:grid;grid-template-columns:1.4fr .6fr;gap:40px;align-items:center}.band p{max-width:40em;margin:0}
@media (max-width:760px){.band-grid{grid-template-columns:1fr;gap:20px}}
.events{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.event{display:grid;grid-template-columns:112px 1fr;gap:24px;padding:22px 0;border-bottom:1px solid var(--line)}
.date{border:2px solid var(--primary);color:var(--primary);text-align:center;padding:10px 6px;align-self:start;transform:rotate(-2deg)}
.date b{display:block;font-size:26px;line-height:1.1}.date span{font-size:13px}
.event.is-past .date{border-color:var(--muted);color:var(--muted);transform:none}
.event h3{margin-bottom:6px}.event p{margin:0;color:var(--muted)}.when{font-size:13px;color:var(--muted);margin:0 0 4px!important}
@media (max-width:520px){.event{grid-template-columns:84px 1fr;gap:16px}.date b{font-size:20px}}
.board{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
@media (max-width:900px){.board{grid-template-columns:repeat(2,1fr);gap:20px}}
.person img{width:100%;aspect-ratio:3/4;object-fit:cover;background:var(--line)}
.person{min-width:0}.person h3,.person h2{margin:14px 0 2px;overflow-wrap:anywhere}.role{color:var(--primary);font-weight:700;font-size:15px;margin:0 0 6px;overflow-wrap:anywhere;hyphens:auto}.person a{font-size:15px;overflow-wrap:anywhere}
.docs{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.doc{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}
.doc h3,.doc h2{font-size:18px;margin:0 0 2px}.doc p{color:var(--muted);font-size:15px;margin:0}.dl{font-weight:700;white-space:nowrap}
.accordion details{border-bottom:1px solid var(--line)}.accordion details:first-child{border-top:1px solid var(--line)}
.accordion summary{font-weight:700;font-size:18px;cursor:pointer;padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:16px}
.accordion summary::-webkit-details-marker{display:none}.accordion summary::after{content:"+";color:var(--primary)}
.accordion details[open] summary::after{content:"–"}.accordion .prose{padding:0 0 18px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start}@media (max-width:820px){.split{grid-template-columns:1fr;gap:32px}}
.split--contact{margin-top:28px}
.box{background:var(--card);border:1px solid var(--line);padding:26px;border-radius:var(--r)}
.details{margin:0 0 14px}.details div{margin:0 0 12px}.details dt{font-weight:700;font-size:15px}.details dd{margin:2px 0 0;overflow-wrap:anywhere}
.form{display:grid;gap:16px;max-width:560px}
label{font-weight:700;font-size:15px;display:block;margin-bottom:6px}
input,textarea{width:100%;font:inherit;padding:12px 14px;border:1px solid var(--muted);border-radius:var(--r);background:#fff;color:var(--ink)}
textarea{min-height:140px}
.check{display:flex;gap:12px;align-items:flex-start}.check input{width:22px;height:22px;margin-top:3px;flex:none}.check label{font-family:var(--body);font-weight:400;font-size:16px}
.nofile{display:flex;align-items:center;justify-content:center;text-align:center;aspect-ratio:3/4;padding:16px;background:var(--line);color:var(--muted);font-size:14px}
.trap{position:absolute;left:-9999px;height:1px;overflow:hidden}
.off{font-size:14px;color:var(--muted);margin:0}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
blockquote{margin:0 0 24px;font-size:20px}blockquote footer{font-size:15px;color:var(--muted)}
.foot{background:var(--secondary);color:#fff;padding:48px 0 28px;font-size:15px}.foot a{color:#fff}
.foot-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:32px}.foot img{width:150px;margin-bottom:12px}
.foot h2{font-size:15px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em}
.foot ul{list-style:none;margin:0;padding:0}.foot li{margin:0 0 6px}.foot .details dt{font-size:13px;font-weight:400}
.fine{border-top:1px solid rgba(255,255,255,.3);margin-top:32px;padding-top:16px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media (max-width:760px){.foot-grid{grid-template-columns:1fr}}
`.trim() + "\n";
}
