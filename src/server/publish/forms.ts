/**
 * A published site's form: the visitor's message is mailed to the client's
 * contact and never stored. A spam field, a size limit and at most 20
 * messages an hour per site. The visitor is sent back to the site's own
 * "sent" or "not sent" page.
 */
const FIELDS = ["name", "email", "phone", "company", "date", "message"] as const;
const LABELS: Record<(typeof FIELDS)[number], string> = { name: "Namn", email: "E-post", phone: "Telefon", company: "Organisation", date: "Datum", message: "Meddelande" };
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

const back = (siteUrl: string, page: "sent" | "not-sent") => new Response(null, { status: 303, headers: { location: `${siteUrl.replace(/\/$/, "")}/${page}/`, "cache-control": "no-store" } });

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
  if (value("website")) return back(siteUrl, "sent");
  if (target.limited || !target.recipient) return back(siteUrl, "not-sent");

  const entries = FIELDS.map((field) => [field, value(field).slice(0, field === "message" ? 5000 : 300)] as const).filter(([, v]) => v);
  if (!entries.length || entries.every(([field]) => field === "name")) return back(siteUrl, "not-sent");
  const email = entries.find(([field]) => field === "email")?.[1];
  const replyTo = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? email : undefined;
  const text = [
    `Ett nytt meddelande från webbplatsen ${target.siteName ?? ""}.`,
    "",
    ...entries.map(([field, v]) => `${LABELS[field]}: ${field === "message" ? `\n${v}` : v}`),
    "",
    value("consent") ? "Personen godkände samtyckestexten." : "",
    replyTo ? "Svara direkt på det här mejlet för att svara personen." : "",
  ]
    .filter((line, i, all) => line || all[i - 1])
    .join("\n");
  const sent = await deps.send({ to: target.recipient, replyTo, subject: `Nytt meddelande från ${target.siteName ?? "webbplatsen"}`.slice(0, 150), text }).catch(() => false);
  return back(siteUrl, sent ? "sent" : "not-sent");
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
