/**
 * The review bar a client sees on a preview link: comment on any part of a
 * page, see the comments and answers, and approve the version in writing.
 * Plain script with no library, added to each page as it is served. It
 * builds every element with textContent, so nothing a person typed is ever
 * read as HTML. Words are in the site's language (Finnish, Swedish or English),
 * in the agency's brand.
 */
import type { ShownBrand } from "@/lib/domain/agency-brand";
import { APPROVAL_STATEMENTS, type ReviewLanguage } from "./review";

const STYLE = `
#rv-bar,#rv-panel{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;box-sizing:border-box}
#rv-bar *,#rv-panel *{box-sizing:border-box}
#rv-bar{position:fixed;right:16px;bottom:16px;z-index:2147483646;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e2e2e2;border-radius:999px;padding:6px 6px 6px 14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.28),0 2px 6px rgba(0,0,0,.06)}
#rv-bar .rv-brand{font-weight:600;color:var(--rv);margin-right:6px}
#rv-bar button,#rv-panel button{font:inherit;border:1px solid var(--rv);color:var(--rv);background:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;transition:background .15s,color .15s,transform .15s}
#rv-bar button:hover,#rv-panel button:hover{transform:translateY(-1px)}
#rv-bar button[aria-pressed=true],#rv-panel button.rv-main{background:var(--rv);color:#fff}
#rv-bar .rv-ok{color:#1f6b3a;font-weight:600;padding:0 8px}
#rv-panel .rv-big{font-size:28px;line-height:1;margin:2px 0 8px;color:#1f6b3a}
#rv-panel p{margin:0 0 8px}
#rv-panel{position:fixed;right:16px;bottom:76px;z-index:2147483647;width:min(380px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;background:#fff;border:1px solid #e2e2e2;border-radius:16px;padding:18px;box-shadow:0 18px 48px -16px rgba(0,0,0,.35);animation:rv-in .2s ease-out}
@keyframes rv-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#rv-panel{animation:none}#rv-bar button:hover,#rv-panel button:hover{transform:none}}
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
if(window.self!==window.top)return;
var C=CONFIG,W=C.words,api="/api/site-reviews/"+C.token,prefix="/s/"+C.token,state={comments:[],approval:null,questions:[],answered:false},mode=false,hovered=null,panel=null;
function el(tag,props,kids){var e=document.createElement(tag);if(props)for(var k in props){if(k==="text")e.textContent=props[k];else if(k==="cls")e.className=props[k];else e.setAttribute(k,props[k]);}(kids||[]).forEach(function(c){if(c)e.appendChild(c);});return e;}
function page(){var p=location.pathname;if(p.indexOf(prefix)===0)p=p.slice(prefix.length);return p||"/";}
function remember(k,v){try{if(v===undefined)return localStorage.getItem("rv-"+k)||"";localStorage.setItem("rv-"+k,v);}catch(e){return "";}}
function load(){return fetch(api,{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(s){if(s){state=s;draw();}}).catch(function(){});}
function send(path,body){return fetch(api+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok)throw new Error(r.status===429?W.tooMany:r.status===409?W.already:r.status===400?(W["bad"+path.slice(1)]||W.failed):W.failed);return j;});});}
var bar=el("div",{id:"rv-bar",role:"region","aria-label":W.region});bar.style.setProperty("--rv",C.color);
function close(){if(panel){panel.remove();panel=null;}}
function open(title,body){close();panel=el("div",{id:"rv-panel",role:"dialog","aria-label":title});panel.style.setProperty("--rv",C.color);panel.appendChild(el("h2",{text:title}));body.forEach(function(b){panel.appendChild(b);});document.body.appendChild(panel);var f=panel.querySelector("input,textarea");if(f)f.focus();}
function field(id,label,type,value){var w=el("div");w.appendChild(el("label",{"for":id,text:label}));var i=type==="textarea"?el("textarea",{id:id}):el("input",{id:id,type:type});if(value)i.value=value;w.appendChild(i);return w;}
function trap(){var t=el("div",{cls:"rv-trap","aria-hidden":"true"});t.appendChild(el("input",{id:"rv-website",type:"text",tabindex:"-1",autocomplete:"off"}));return t;}
function row(buttons){return el("div",{cls:"rv-row"},buttons);}
function error(msg){var e=panel&&panel.querySelector(".rv-err");if(!e&&panel){e=el("p",{cls:"rv-err",role:"alert"});panel.appendChild(e);}if(e)e.textContent=msg;}
function val(id){var e=document.getElementById(id);return e?e.value:"";}
function describe(t){var words=(t.getAttribute("alt")||t.textContent||"").replace(/\\s+/g," ").trim();return (t.tagName.toLowerCase()+(words?": "+words.slice(0,120):"")).slice(0,300);}
function commentOn(target){setMode(false);var what=describe(target);open(W.commentTitle,[el("p",{cls:"rv-quiet",text:W.onPage+" "+page()+(what?" · "+what:"")}),field("rv-body",W.whatChange,"textarea"),field("rv-author",W.yourName,"text",remember("name")),trap(),row([el("button",{type:"button",text:W.cancel}),el("button",{type:"button",cls:"rv-main",text:W.send})])]);var b=panel.querySelectorAll("button");b[0].onclick=close;b[1].onclick=function(){b[1].disabled=true;remember("name",val("rv-author"));send("/comments",{page:page(),target:what,body:val("rv-body"),author:val("rv-author"),website:val("rv-website")}).then(function(){close();load();}).catch(function(e){b[1].disabled=false;error(e.message);});};}
function list(){var here=page(),items=state.comments.slice().sort(function(a,b){return (a.page===here?0:1)-(b.page===here?0:1);});var ul=el("ul");if(!items.length)ul.appendChild(el("li",{cls:"rv-quiet",text:W.noComments}));items.forEach(function(c){var li=el("li");li.appendChild(el("div",{cls:"rv-quiet",text:c.page+(c.target?" · "+c.target:"")+(c.status==="resolved"?" · "+W.resolved:"")}));li.appendChild(el("div",{text:c.body}));li.appendChild(el("div",{cls:"rv-quiet",text:"— "+c.author}));if(c.reply)li.appendChild(el("div",{text:C.name+": "+c.reply}));ul.appendChild(li);});open(W.commentsTitle,[ul,row([el("button",{type:"button",text:W.close})])]);panel.querySelector("button").onclick=close;}
function approve(){var box=el("input",{id:"rv-agree",type:"checkbox"});var check=el("div",{cls:"rv-check"},[box,el("label",{"for":"rv-agree",text:C.statement})]);open(W.approveTitle,[el("p",{cls:"rv-quiet",text:W.approveNote}),field("rv-name",W.name,"text",remember("name")),field("rv-role",W.role,"text"),field("rv-email",W.email,"email"),check,trap(),row([el("button",{type:"button",text:W.cancel}),el("button",{type:"button",cls:"rv-main",text:W.approve})])]);var b=panel.querySelectorAll("button");b[0].onclick=close;b[1].onclick=function(){if(!box.checked){error(W.tick);return;}b[1].disabled=true;remember("name",val("rv-name"));send("/approval",{name:val("rv-name"),role:val("rv-role"),email:val("rv-email"),agree:true,lang:C.lang,website:val("rv-website")}).then(function(){var who=val("rv-name").trim().split(/\s+/)[0];close();load();open(W.thanks+(who?", "+who:"")+"!",[el("p",{cls:"rv-big","aria-hidden":"true",text:"✓"}),el("p",{text:W.approved}),row([el("button",{type:"button",cls:"rv-main",text:W.close})])]);panel.querySelector("button").onclick=close;}).catch(function(e){b[1].disabled=false;error(e.message);});};}
function questions(){var qs=state.questions||[];var fields=qs.map(function(q,i){return field("rv-q"+i,q,"textarea");});open(W.questionsTitle,[el("p",{cls:"rv-quiet",text:W.questionsNote})].concat(fields,[field("rv-qname",W.yourName,"text",remember("name")),trap(),row([el("button",{type:"button",text:W.cancel}),el("button",{type:"button",cls:"rv-main",text:W.sendAnswers})])]));var b=panel.querySelectorAll(".rv-row button");b[0].onclick=close;b[1].onclick=function(){var answers=qs.map(function(q,i){return val("rv-q"+i);});if(!answers.some(function(x){return x.trim();})){error(W.answerOne);return;}b[1].disabled=true;remember("name",val("rv-qname"));send("/answers",{author:val("rv-qname"),answers:answers,website:val("rv-website")}).then(function(){close();state.questions=[];state.answered=true;open(W.thanks+"!",[el("p",{text:W.gotAnswers}),row([el("button",{type:"button",cls:"rv-main",text:W.close})])]);panel.querySelector("button").onclick=close;draw();}).catch(function(e){b[1].disabled=false;error(e.message);});};}
function setMode(on){mode=on;document.documentElement.style.cursor=on?"crosshair":"";if(!on&&hovered){hovered.classList.remove("rv-hover");hovered=null;}draw();}
var PICK="h1,h2,h3,h4,h5,h6,p,li,img,figure,blockquote,a,button,td,th,label,section";
function pick(e){var t=e.target;if(!t||!t.closest||t.closest("#rv-bar,#rv-panel"))return null;return t.closest(PICK);}
document.addEventListener("mouseover",function(e){if(!mode)return;var t=pick(e);if(hovered&&hovered!==t)hovered.classList.remove("rv-hover");hovered=t;if(t)t.classList.add("rv-hover");},true);
document.addEventListener("click",function(e){if(!mode)return;var t=pick(e);if(!t)return;e.preventDefault();e.stopPropagation();t.classList.remove("rv-hover");commentOn(t);},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape"){if(mode)setMode(false);close();}});
function draw(){bar.textContent="";bar.appendChild(el("span",{cls:"rv-brand",text:C.name}));var c=el("button",{type:"button","aria-pressed":String(mode),text:mode?W.clickPart:W.comment});c.onclick=function(){close();setMode(!mode);};bar.appendChild(c);var n=state.comments.length,l=el("button",{type:"button",text:W.comments+" ("+n+")"});l.onclick=list;bar.appendChild(l);if(state.questions&&state.questions.length){var q=el("button",{type:"button",text:W.questions+" ("+state.questions.length+")"});q.onclick=questions;bar.appendChild(q);}if(state.approval){bar.appendChild(el("span",{cls:"rv-ok",text:W.approvedBy+" "+state.approval.name}));}else{var a=el("button",{type:"button",cls:"rv-main",text:W.approve});a.style.background=C.color;a.style.color="#fff";a.onclick=approve;bar.appendChild(a);}}
function welcome(){if(remember("welcomed")||state.approval)return;remember("welcomed","1");open(W.welcomeTitle,[el("p",{text:W.welcome1}),el("p",{text:W.welcome2}),row([el("button",{type:"button",cls:"rv-main",text:W.start})])]);panel.querySelector("button").onclick=close;}
document.body.appendChild(bar);draw();load().then(welcome);
})();`;

/** Every word the bar shows, in each language a site can have. */
export const BAR_WORDS: Record<ReviewLanguage, Record<string, string>> = {
  fi: {
    region: "Tarkastus", failed: "Jokin meni pieleen. Yrittäkää uudelleen.", tooMany: "Liian monta viestiä lyhyessä ajassa. Yrittäkää myöhemmin uudelleen.", already: "Tämä on jo tehty.",
    badcomments: "Kirjoittakaa kommentti ja nimenne.", badapproval: "Kirjoittakaa nimenne ja sähköpostinne ja rastittakaa hyväksyntä.", badanswers: "Vastatkaa ainakin yhteen kysymykseen ja kirjoittakaa nimenne.",
    commentTitle: "Kommentti", onPage: "Sivulla", whatChange: "Mitä pitäisi muuttaa?", yourName: "Nimenne", cancel: "Peruuta", send: "Lähetä",
    noComments: "Ei vielä kommentteja.", resolved: "Korjattu", commentsTitle: "Kommentit", close: "Sulje",
    approveTitle: "Hyväksy verkkosivusto", approveNote: "Hyväksyntä koskee juuri tätä versiota. Myöhemmät muutokset vaativat uuden hyväksynnän.", name: "Nimi", role: "Rooli", email: "Sähköposti", approve: "Hyväksy",
    tick: "Rastittakaa hyväksyntä.", thanks: "Kiitos", approved: "Verkkosivusto on hyväksytty. Olemme yhteydessä, kun se on julkaistu.",
    questionsTitle: "Muutama kysymys meiltä", questionsNote: "Vastatkaa siihen, mihin haluatte, omin sanoin. Vastaukset auttavat meitä kertomaan teistä sivuilla.", sendAnswers: "Lähetä vastaukset", answerOne: "Vastatkaa ainakin yhteen kysymykseen.", gotAnswers: "Saimme vastauksenne.",
    clickPart: "Klikatkaa kohtaa", comment: "Kommentoi", comments: "Kommentit", questions: "Kysymyksiä teille", approvedBy: "Hyväksynyt",
    welcomeTitle: "Tervetuloa", welcome1: "Tämä on uusien verkkosivujenne esikatselu. Klikkailkaa ympäriinsä kuin kävijä.", welcome2: "Jos haluatte muuttaa jotain, painakaa Kommentoi ja klikatkaa kohtaa, jota muutos koskee. Kun olette tyytyväisiä, painakaa Hyväksy.", start: "Aloitetaan",
  },
  sv: {
    region: "Granskning", failed: "Något gick fel. Försök igen.", tooMany: "För många meddelanden på kort tid. Försök igen senare.", already: "Det här är redan gjort.",
    badcomments: "Skriv en kommentar och ditt namn.", badapproval: "Skriv ditt namn och din e-post, och kryssa i godkännandet.", badanswers: "Svara på minst en fråga och skriv ditt namn.",
    commentTitle: "Kommentar", onPage: "På sidan", whatChange: "Vad ska ändras?", yourName: "Ditt namn", cancel: "Avbryt", send: "Skicka",
    noComments: "Inga kommentarer ännu.", resolved: "Löst", commentsTitle: "Kommentarer", close: "Stäng",
    approveTitle: "Godkänn webbplatsen", approveNote: "Godkännandet gäller exakt den här versionen. Ändringar efteråt kräver ett nytt godkännande.", name: "Namn", role: "Roll", email: "E-post", approve: "Godkänn",
    tick: "Kryssa i godkännandet.", thanks: "Tack", approved: "Webbplatsen är godkänd. Vi hör av oss när den är publicerad.",
    questionsTitle: "Några frågor från oss", questionsNote: "Svara på det ni vill, i era egna ord. Svaren hjälper oss att berätta om er på sidan.", sendAnswers: "Skicka svaren", answerOne: "Svara på minst en fråga.", gotAnswers: "Vi har fått era svar.",
    clickPart: "Klicka på något", comment: "Kommentera", comments: "Kommentarer", questions: "Frågor till er", approvedBy: "Godkänd av",
    welcomeTitle: "Välkommen", welcome1: "Det här är ett förhandsutkast av er nya webbplats. Klicka runt som en besökare.", welcome2: "Vill ni ändra något: tryck på Kommentera och klicka på det som ska ändras. När ni är nöjda: tryck på Godkänn.", start: "Kom igång",
  },
  en: {
    region: "Review", failed: "Something went wrong. Please try again.", tooMany: "Too many messages in a short time. Please try again later.", already: "This is already done.",
    badcomments: "Write a comment and your name.", badapproval: "Write your name and e-mail, and tick the approval.", badanswers: "Answer at least one question, and write your name.",
    commentTitle: "Comment", onPage: "On the page", whatChange: "What should change?", yourName: "Your name", cancel: "Cancel", send: "Send",
    noComments: "No comments yet.", resolved: "Resolved", commentsTitle: "Comments", close: "Close",
    approveTitle: "Approve the website", approveNote: "The approval covers exactly this version. Later changes need a new approval.", name: "Name", role: "Role", email: "E-mail", approve: "Approve",
    tick: "Tick the approval.", thanks: "Thank you", approved: "The website is approved. We will be in touch when it is live.",
    questionsTitle: "A few questions from us", questionsNote: "Answer what you like, in your own words. Your answers help us tell your story on the site.", sendAnswers: "Send the answers", answerOne: "Answer at least one question.", gotAnswers: "We have your answers.",
    clickPart: "Click a part", comment: "Comment", comments: "Comments", questions: "Questions for you", approvedBy: "Approved by",
    welcomeTitle: "Welcome", welcome1: "This is a preview of your new website. Click around as a visitor would.", welcome2: "To change something, press Comment and click the part it is about. When you are happy, press Approve.", start: "Start",
  },
};

/** The site's language from its page, as the build wrote it in <html lang>. Swedish when it is missing or unknown. */
export function pageLanguage(html: string): ReviewLanguage {
  const lang = html.match(/<html[^>]*\slang="([a-z]{2})/i)?.[1]?.toLowerCase();
  return lang === "fi" || lang === "en" ? lang : "sv";
}

/** The bar's markup for one link, to add before </body>, in the site's language. */
export function reviewBar(token: string, brand: ShownBrand, lang: ReviewLanguage = "sv"): string {
  const config = JSON.stringify({ token, lang, name: brand.name, color: /^#[0-9A-Fa-f]{6}$/.test(brand.color) ? brand.color : "#1F2A37", statement: APPROVAL_STATEMENTS[lang], words: BAR_WORDS[lang] }).replace(/</g, "\\u003c");
  return `<style>${STYLE}</style><script>${SCRIPT.replace("CONFIG", config)}</script>`;
}

/** The page with the review bar added before its closing body tag (or at the end). */
export function withReviewBar(html: string, bar: string): string {
  const at = html.lastIndexOf("</body>");
  return at === -1 ? html + bar : html.slice(0, at) + bar + html.slice(at);
}
