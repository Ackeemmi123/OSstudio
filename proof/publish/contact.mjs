/**
 * What happens when a visitor sends a client's contact form. It stores nothing:
 * the message is passed to the client by email, and the visitor is sent to a
 * page that says what happened. Sending is passed in, so it can be tested.
 */
const LIMITS = { name: 200, email: 254, phone: 40, message: 5000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value, max) => String(value ?? "").replace(/\r/g, "").trim().slice(0, max);

/** Returns the page to send the visitor to. A filled spam trap looks like success, so bots learn nothing. */
export async function handleContact(fields, env, send) {
  if (clean(fields.website, 200)) return "/sent/";
  const name = clean(fields.name, LIMITS.name).replace(/\n/g, " ");
  const email = clean(fields.email, LIMITS.email);
  const phone = clean(fields.phone, LIMITS.phone).replace(/\n/g, " ");
  const message = clean(fields.message, LIMITS.message);
  if (!name || !message || !EMAIL.test(email)) return "/not-sent/";
  if (!env.CONTACT_TO || !env.CONTACT_FROM || !env.RESEND_API_KEY) return "/not-sent/";
  const text = [`Nimi / Name: ${name}`, `Sähköposti / Email: ${email}`, phone ? `Puhelin / Phone: ${phone}` : "", "", message].filter((line, i) => i !== 2 || line).join("\n");
  try {
    await send({ from: env.CONTACT_FROM, to: env.CONTACT_TO, reply_to: email, subject: `Verkkosivujen viesti: ${name}`, text });
    return "/sent/";
  } catch {
    // The visitor's words are never logged.
    return "/not-sent/";
  }
}

export function resendSender(apiKey, doFetch = fetch) {
  return async (mail) => {
    const response = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(mail),
    });
    if (!response.ok) throw new Error(`Sending failed with status ${response.status}`);
  };
}
