# Client portal

One private link per client, from the brief to the launch. The client opens it
without signing in and sees, in their own language (Finnish, Swedish or
English, from the website spec's default language; Swedish until a spec
exists):

- where their website stands, in five steps (planning, draft, review,
  approved, live), and whose turn it is;
- a live preview of the latest review link, scaled into the page, with a
  button to open it full size;
- the brief's open questions, which they answer with their name;
- a place to send photos, logos and documents, each with written answers
  about who holds the rights and whether the people shown agreed;
- the address of the published site once it is live.

Signed-in workspaces only. Code: `src/server/portal/` (page, requests,
dependencies) and `src/app/p/[token]/route.ts`; database:
`supabase/migrations/20261129000100_client_portal.sql`.

## Making and stopping a link

On the client's Overview, **Client portal** → "Make the portal link". The link
is shown once; only its SHA-256 hash is stored. It expires after 90 days.
"Make a new link" turns the old one off, and "Turn off" closes it at once.
Owners and members can do both; viewers see only whether a link is open.

"E-mail it to the client" opens the person's own email app with a short
message and the link, in Finnish, Swedish or English. Studio OS sends nothing
to the client.

## What the client sends

| From the portal | Becomes |
| --------------- | ------- |
| Answers to open questions | One source, "Svar via kundportalen: name", with each question and answer. Answered questions are not asked again. |
| Files | The client's material, checked on the server like any upload (PDF, JPEG, PNG or WebP, at most 4 MB each, 10 per send). |
| Rights and consent answers | A note in the client's words, kept as the written record (see [site-images.md](site-images.md)). |

A link takes at most 40 files and 100 MB a day, so a leaked link cannot fill
the storage. Owners and members who keep "client events" on get an email when
the client answers or sends files; the email carries no client text.

## Asking the website draft's questions

When the AI website draft lists questions for the client, "Ask the client in
their portal (N)" adds each one as an open question on the client's brief.
The portal asks them the next time the client opens it. Questions already open
are not added twice.

## Security

- The page is server-rendered HTML with a nonce-based Content Security
  Policy and `noindex`.
- Review links (`/s/…`) may be framed by Studio OS's own pages only
  (`frame-ancestors 'self'`), so the preview works in the portal and nowhere
  else. The review bar is not drawn inside the preview.
- Every request checks the token's shape before it reaches the database;
  a closed, expired or unknown link gets the same answer.
- Anonymising a client removes its portal.
