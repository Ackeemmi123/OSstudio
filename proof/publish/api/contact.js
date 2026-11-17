import { handleContact, resendSender } from "../lib/contact.mjs";

/** Vercel's form endpoint for a client's site. Its secrets live in the project's settings. */
export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).end();
  const next = await handleContact(request.body ?? {}, process.env, resendSender(process.env.RESEND_API_KEY));
  return response.redirect(303, next);
}
