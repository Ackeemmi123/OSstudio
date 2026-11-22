/**
 * The review bar a client sees on a preview link: comment on any part of a
 * page, see the comments and answers, and approve the version in writing.
 * Plain script with no library, added to each page as it is served. It
 * builds every element with textContent, so nothing a person typed is ever
 * read as HTML. Words are Swedish with English below, in the agency's brand.
 */
import type { ShownBrand } from "@/lib/domain/agency-brand";
import { APPROVAL_STATEMENT } from "./review";

const STYLE = `
#rv-bar,#rv-panel{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;box-sizing:border-box}
#rv-bar *,#rv-panel *{box-sizing:border-box}
#rv-bar{position:fixed;right:16px;bottom:16px;z-index:2147483646;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 32px);background:#fff;border:1px solid #d9d9d9;border-top:3px solid var(--rv);border-radius:10px;padding:8px 10px;box-shadow:0 4px 18px rgba(0,0,0,.14)}
#rv-bar .rv-brand{font-weight:600;color:var(--rv);margin-right:6px}
#rv-bar button,#rv-panel button{font:inherit;border:1px solid var(--rv);color:var(--rv);background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer}
#rv-bar button[aria-pressed=true],#rv-panel button.rv-main{background:var(--rv);color:#fff}
#rv-bar .rv-ok{color:#1f6b3a;font-weight:600}
#rv-panel{position:fixed;right:16px;bottom:76px;z-index:2147483647;width:min(380px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;background:#fff;border:1px solid #d9d9d9;border-radius:10px;padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.18)}
#rv-panel h2{font-size:15px;margin:0 0 8px}
#rv-panel label{display:block;font-size:13px;margin:8px 0 2px}
#rv-panel input[type=text],#rv-panel input[type=email],#rv-panel textarea{width:100%;font:inherit;border:1px solid #bdbdbd;border-radius:6px;padding:6px 8px}
#rv-panel textarea{min-height:90px}
#rv-panel .rv-check{display:flex;gap:8px;align-items:flex-start;margin-top:10px}
#rv-panel .rv-check input{margin-top:4px}
#rv-panel .rv-quiet{color:#5f5f5f;font-size:12.5px}
#rv-panel .rv-row{display:flex;gap:6px;justify-content:flex-end;margin-top:12px}
#rv-panel .rv-err{color:#a1261a;font-size:13px;margin-top:8px}
#rv-panel ul{list-style:none;margin:0;padding:0}
#rv-panel li{border-top:1px solid #ececec;padding:8px 0}
#rv-panel .rv-trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.rv-hover{outline:2px dashed var(--rv)!important;outline-offset:2px;cursor:crosshair!important}
@media print{#rv-bar,#rv-panel{display:none}}
`;

/** The script; `CONFIG` is replaced with the link's settings as JSON. */
const SCRIPT = `(function(){
var C=CONFIG,api="/api/site-reviews/"+C.token,prefix="/s/"+C.token,state={comments:[],approval:null,questions:[],answered:false},mode=false,hovered=null,panel=null;
function el(tag,props,kids){var e=document.createElement(tag);if(props)for(var k in props){if(k==="text")e.textContent=props[k];else if(k==="cls")e.className=props[k];else e.setAttribute(k,props[k]);}(kids||[]).forEach(function(c){if(c)e.appendChild(c);});return e;}
function page(){var p=location.pathname;if(p.indexOf(prefix)===0)p=p.slice(prefix.length);return p||"/";}
function remember(k,v){try{if(v===undefined)return localStorage.getItem("rv-"+k)||"";localStorage.setItem("rv-"+k,v);}catch(e){return "";}}
function load(){return fetch(api,{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(s){if(s){state=s;draw();}}).catch(function(){});}
function send(path,body){return fetch(api+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok)throw new Error(j.error||"Något gick fel. Something went wrong.");return j;});});}
var bar=el("div",{id:"rv-bar",role:"region","aria-label":"Granskning"});bar.style.setProperty("--rv",C.color);
function close(){if(panel){panel.remove();panel=null;}}
function open(title,body){close();panel=el("div",{id:"rv-panel",role:"dialog","aria-label":title});panel.style.setProperty("--rv",C.color);panel.appendChild(el("h2",{text:title}));body.forEach(function(b){panel.appendChild(b);});document.body.appendChild(panel);var f=panel.querySelector("input,textarea");if(f)f.focus();}
function field(id,label,type,value){var w=el("div");w.appendChild(el("label",{"for":id,text:label}));var i=type==="textarea"?el("textarea",{id:id}):el("input",{id:id,type:type});if(value)i.value=value;w.appendChild(i);return w;}
function trap(){var t=el("div",{cls:"rv-trap","aria-hidden":"true"});t.appendChild(el("input",{id:"rv-website",type:"text",tabindex:"-1",autocomplete:"off"}));return t;}
function row(buttons){return el("div",{cls:"rv-row"},buttons);}
function error(msg){var e=panel&&panel.querySelector(".rv-err");if(!e&&panel){e=el("p",{cls:"rv-err",role:"alert"});panel.appendChild(e);}if(e)e.textContent=msg;}
function val(id){var e=document.getElementById(id);return e?e.value:"";}
function describe(t){var words=(t.getAttribute("alt")||t.textContent||"").replace(/\\s+/g," ").trim();return (t.tagName.toLowerCase()+(words?": "+words.slice(0,120):"")).slice(0,300);}
function commentOn(target){setMode(false);var what=describe(target);open("Kommentar · Comment",[el("p",{cls:"rv-quiet",text:"På sidan "+page()+(what?" · "+what:"")}),field("rv-body","Vad ska ändras? What should change?","textarea"),field("rv-author","Ditt namn · Your name","text",remember("name")),trap(),row([el("button",{type:"button",text:"Avbryt"}),el("button",{type:"button",cls:"rv-main",text:"Skicka · Send"})])]);var b=panel.querySelectorAll("button");b[0].onclick=close;b[1].onclick=function(){b[1].disabled=true;remember("name",val("rv-author"));send("/comments",{page:page(),target:what,body:val("rv-body"),author:val("rv-author"),website:val("rv-website")}).then(function(){close();load();}).catch(function(e){b[1].disabled=false;error(e.message);});};}
function list(){var here=page(),items=state.comments.slice().sort(function(a,b){return (a.page===here?0:1)-(b.page===here?0:1);});var ul=el("ul");if(!items.length)ul.appendChild(el("li",{cls:"rv-quiet",text:"Inga kommentarer ännu. No comments yet."}));items.forEach(function(c){var li=el("li");li.appendChild(el("div",{cls:"rv-quiet",text:c.page+(c.target?" · "+c.target:"")+(c.status==="resolved"?" · Löst":"")}));li.appendChild(el("div",{text:c.body}));li.appendChild(el("div",{cls:"rv-quiet",text:"— "+c.author}));if(c.reply)li.appendChild(el("div",{text:C.name+": "+c.reply}));ul.appendChild(li);});open("Kommentarer · Comments",[ul,row([el("button",{type:"button",text:"Stäng · Close"})])]);panel.querySelector("button").onclick=close;}
function approve(){var box=el("input",{id:"rv-agree",type:"checkbox"});var check=el("div",{cls:"rv-check"},[box,el("label",{"for":"rv-agree",text:C.statement})]);open("Godkänn webbplatsen · Approve",[el("p",{cls:"rv-quiet",text:"Godkännandet gäller exakt den här versionen. Ändringar efteråt kräver ett nytt godkännande."}),field("rv-name","Namn · Name","text",remember("name")),field("rv-role","Roll · Role","text"),field("rv-email","E-post · E-mail","email"),check,trap(),row([el("button",{type:"button",text:"Avbryt"}),el("button",{type:"button",cls:"rv-main",text:"Godkänn · Approve"})])]);var b=panel.querySelectorAll("button");b[0].onclick=close;b[1].onclick=function(){if(!box.checked){error("Kryssa i godkännandet. Tick the approval.");return;}b[1].disabled=true;remember("name",val("rv-name"));send("/approval",{name:val("rv-name"),role:val("rv-role"),email:val("rv-email"),agree:true,website:val("rv-website")}).then(function(){close();load();}).catch(function(e){b[1].disabled=false;error(e.message);});};}
function questions(){var qs=state.questions||[];var fields=qs.map(function(q,i){return field("rv-q"+i,q,"textarea");});open("Några frågor från oss · A few questions",[el("p",{cls:"rv-quiet",text:"Svara på det ni vill, i era egna ord. Svaren hjälper oss att berätta om er på sidan. Answer what you like, in your own words."})].concat(fields,[field("rv-qname","Ditt namn · Your name","text",remember("name")),trap(),row([el("button",{type:"button",text:"Avbryt"}),el("button",{type:"button",cls:"rv-main",text:"Skicka svaren · Send"})])]));var b=panel.querySelectorAll(".rv-row button");b[0].onclick=close;b[1].onclick=function(){var answers=qs.map(function(q,i){return val("rv-q"+i);});if(!answers.some(function(x){return x.trim();})){error("Svara på minst en fråga. Answer at least one question.");return;}b[1].disabled=true;remember("name",val("rv-qname"));send("/answers",{author:val("rv-qname"),answers:answers,website:val("rv-website")}).then(function(){close();state.questions=[];state.answered=true;open("Tack! · Thank you",[el("p",{text:"Vi har fått era svar. We have your answers."}),row([el("button",{type:"button",cls:"rv-main",text:"Stäng · Close"})])]);panel.querySelector("button").onclick=close;draw();}).catch(function(e){b[1].disabled=false;error(e.message);});};}
function setMode(on){mode=on;document.documentElement.style.cursor=on?"crosshair":"";if(!on&&hovered){hovered.classList.remove("rv-hover");hovered=null;}draw();}
var PICK="h1,h2,h3,h4,h5,h6,p,li,img,figure,blockquote,a,button,td,th,label,section";
function pick(e){var t=e.target;if(!t||!t.closest||t.closest("#rv-bar,#rv-panel"))return null;return t.closest(PICK);}
document.addEventListener("mouseover",function(e){if(!mode)return;var t=pick(e);if(hovered&&hovered!==t)hovered.classList.remove("rv-hover");hovered=t;if(t)t.classList.add("rv-hover");},true);
document.addEventListener("click",function(e){if(!mode)return;var t=pick(e);if(!t)return;e.preventDefault();e.stopPropagation();t.classList.remove("rv-hover");commentOn(t);},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape"){if(mode)setMode(false);close();}});
function draw(){bar.textContent="";bar.appendChild(el("span",{cls:"rv-brand",text:C.name}));var c=el("button",{type:"button","aria-pressed":String(mode),text:mode?"Klicka på något · Click a part":"Kommentera · Comment"});c.onclick=function(){close();setMode(!mode);};bar.appendChild(c);var n=state.comments.length,l=el("button",{type:"button",text:"Kommentarer ("+n+")"});l.onclick=list;bar.appendChild(l);if(state.questions&&state.questions.length){var q=el("button",{type:"button",text:"Frågor till er ("+state.questions.length+")"});q.onclick=questions;bar.appendChild(q);}if(state.approval){bar.appendChild(el("span",{cls:"rv-ok",text:"Godkänd av "+state.approval.name}));}else{var a=el("button",{type:"button",text:"Godkänn · Approve"});a.onclick=approve;bar.appendChild(a);}}
document.body.appendChild(bar);draw();load();
})();`;

/** The bar's markup for one link, to add before </body>. */
export function reviewBar(token: string, brand: ShownBrand): string {
  const config = JSON.stringify({ token, name: brand.name, color: /^#[0-9A-Fa-f]{6}$/.test(brand.color) ? brand.color : "#1F2A37", statement: APPROVAL_STATEMENT }).replace(/</g, "\\u003c");
  return `<style>${STYLE}</style><script>${SCRIPT.replace("CONFIG", config)}</script>`;
}

/** The page with the review bar added before its closing body tag (or at the end). */
export function withReviewBar(html: string, bar: string): string {
  const at = html.lastIndexOf("</body>");
  return at === -1 ? html + bar : html.slice(0, at) + bar + html.slice(at);
}
