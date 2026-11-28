/**
 * A published site's form: the visitor's message is mailed to the client's
 * contact and never stored. A spam field, a size limit and at most 20
 * messages an hour per site. The visitor is sent back to the site's own
 * "sent" or "not sent" page.
 */
const FIELDS = ["name", "email", "phone", "company", "date", "message"] as const;
type Field = (typeof FIELDS)[number];

/**
 * The mail to the client, in the site's language. The form says which (a hidden
 * "lang" field); a form without it, from a site built before, is Swedish as it
 * always was.
 */
const MAIL = {
  sv: {
    labels: { name: "Namn", email: "E-post", phone: "Telefon", company: "Organisation", date: "Datum", message: "Meddelande" },
    intro: (site: string) => `Ett nytt meddelande från webbplatsen ${site}.`,
    consent: "Personen godkände samtyckestexten.",
    reply: "Svara direkt på det här mejlet för att svara personen.",
    subject: (site: string) => `Nytt meddelande från ${site}`,
    theSite: "webbplatsen",
  },
  fi: {
    labels: { name: "Nimi", email: "Sähköposti", phone: "Puhelin", company: "Organisaatio", date: "Päivämäärä", message: "Viesti" },
    intro: (site: string) => `Uusi viesti verkkosivustolta ${site}.`,
    consent: "Lähettäjä hyväksyi suostumustekstin.",
    reply: "Voit vastata lähettäjälle suoraan vastaamalla tähän sähköpostiin.",
    subject: (site: string) => `Uusi viesti: ${site}`,
    theSite: "verkkosivusto",
  },
  en: {
    labels: { name: "Name", email: "Email", phone: "Phone", company: "Organisation", date: "Date", message: "Message" },
    intro: (site: string) => `A new message from the website ${site}.`,
    consent: "The sender accepted the consent text.",
    reply: "Reply to this email to answer the sender directly.",
    subject: (site: string) => `New message from ${site}`,
    theSite: "the website",
  },
} satisfies Record<string, { labels: Record<Field, string>; intro: (site: string) => string; consent: string; reply: string; subject: (site: string) => string; theSite: string }>;
type MailLanguage = keyof typeof MAIL;
const KEY = /^[A-Za-z0-9_-]{24,64}$/;

export interface FormTarget {
  limited: boolean;
  recipient?: string | null;
  siteName?: string;
  siteUrl?: string;
}

export interface FormDeps {
  take: (key: string) => Promise<FormTarget | null>;
  send: (mail: { to: string; replyTo?: string; subject: string; text: string }) => Promise<boolean>;
}

/** Back to the site's own sent or not-sent page; on a site in several languages, in the language the visitor used. */
const back = (siteUrl: string, page: "sent" | "not-sent", language = "") => new Response(null, { status: 303, headers: { location: `${siteUrl.replace(/\/$/, "")}/${/^(sv|fi|en)$/.test(language) ? `${language}/` : ""}${page}/`, "cache-control": "no-store" } });

export async function handleForm(key: string, form: FormData | null, deps: FormDeps): Promise<Response> {
  if (!KEY.test(key) || !form) return new Response("Not found.", { status: 404 });
  const value = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
  };
  const target = await deps.take(key);
  if (!target) return new Response("Not found.", { status: 404 });
  const siteUrl = target.siteUrl ?? "/";
  // A bot fills the hidden field; it is told the message was sent.
  if (value("website")) return back(siteUrl, "sent", value("back"));
  if (target.limited || !target.recipient) return back(siteUrl, "not-sent", value("back"));

  const lang = value("lang");
  const words = MAIL[Object.hasOwn(MAIL, lang) ? (lang as MailLanguage) : "sv"];
  const entries = FIELDS.map((field) => [field, value(field).slice(0, field === "message" ? 5000 : 300)] as const).filter(([, v]) => v);
  if (!entries.length || entries.every(([field]) => field === "name")) return back(siteUrl, "not-sent", value("back"));
  const email = entries.find(([field]) => field === "email")?.[1];
  const replyTo = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? email : undefined;
  const text = [
    words.intro(target.siteName ?? ""),
    "",
    ...entries.map(([field, v]) => `${words.labels[field]}: ${field === "message" ? `\n${v}` : v}`),
    "",
    value("consent") ? words.consent : "",
    replyTo ? words.reply : "",
  ]
    .filter((line, i, all) => line || all[i - 1])
    .join("\n");
  const sent = await deps.send({ to: target.recipient, replyTo, subject: words.subject(target.siteName ?? words.theSite).slice(0, 150), text }).catch(() => false);
  return back(siteUrl, sent ? "sent" : "not-sent", value("back"));
}

/** One message through Resend. */
export async function sendWithResend(apiKey: string, from: string, mail: { to: string; replyTo?: string; subject: string; text: string }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
  });
  return response.ok;
}
