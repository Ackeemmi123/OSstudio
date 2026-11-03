# Website specs (SiteSpec v1)

A website spec describes the website a project will deliver: its goal and
audiences, brand, pages and their sections, copy in each language, images,
forms, search texts and the features it needs. It is **platform-neutral**:
nothing in it is specific to Duda, Webflow or any renderer. Studio OS owns it;
a renderer (or a person) will later build the site from an approved version.

This is Website Factory phase WF-1, with the internal preview (WF-3) and
images (WF-2). There is no external renderer, AI or publishing yet.

## Where it lives

| Part | File |
| ---- | ---- |
| Format (Zod schema) | `src/lib/site-spec/schema.ts` |
| Section kinds, variants, limits, editor fields | `src/lib/site-spec/catalog.ts` |
| Checks on save and before approval | `src/lib/site-spec/validate.ts` |
| First draft from the brief | `src/lib/site-spec/from-brief.ts` |
| Editing helpers | `src/lib/site-spec/edit.ts` |
| Lifecycle rules | `src/lib/domain/site-specs.ts` |
| Storage, access and database rules | `supabase/migrations/20261030000200_site_specs.sql` |
| Page | `/clients/<client>/projects/<project>/site`, linked from website project cards |

## Versions

- Each project has numbered versions (v1, v2, …), one row each in
  `site_specs`. Versions are kept; nobody can delete one.
- `specVersion: 1` inside the JSON is the **format** version. A future format
  gets its own schema and a conversion; v1 specs stay readable.
- A project has at most one **open** version (draft or waiting for approval)
  and at most one **approved** version.

| Step | Who | What changes |
| ---- | --- | ------------ |
| Start | Owner or member | v1 is built from the brief's **confirmed** values (goal, audience, products or services), each with its source. Unconfirmed values are listed and left out. After an approval, the next version starts as a copy of the approved one. |
| Edit | Owner or member | Only a draft's content. Every save must be a valid SiteSpec; it may still be incomplete. |
| Submit | Owner or member | Draft → waiting for approval. Only when nothing blocks approval. |
| Ask for changes | Owner or member | Back to draft, with an optional note shown on the draft. |
| Approve | Owner or member, in their own name | Waiting → approved. The earlier approved version becomes "replaced by a newer version" in the same transaction. |

Each step is recorded once in the project's activity (`site_spec.created`,
`.updated`, `.submitted`, `.changes_requested`, `.approved`), in the person's
name. Viewers read specs and their history but change nothing. Agents and the
service role have no access.

## Starting from a template

A first version starts from one of three templates (`src/lib/site-spec/templates.ts`):
services business, online shop or single page. The project type suggests one. A
template creates the pages, sections, menus, buttons, common headings and search
titles in the chosen languages, plus a privacy page and image placeholders. Only
confirmed brief values are copied, each with its source. Everything only a person
can write is an instruction in square brackets, shown in the preview and in English
for now. A whole field in brackets blocks approval. It uses no AI.

Each template follows its own journey, from the approved design references. A
services business tells the whole story on its home page, from promises and services
to how the start goes, proof and questions. A shop goes from wanting a product to
choosing one and knowing the terms before buying. A single page walks towards the
form at its end. Headings a visitor reads are written for the client, not fixed
words, except for questions and contact, which visitors look for. A section of
quotes asks for real words with permission, or for the section to be removed. Only
new drafts are affected: a draft already started keeps its structure.

An instruction can never pass as finished text: a whole field in brackets, or words
in brackets inside other text, blocks approval on the server. Finished standard
headings such as "Frequently asked questions" do not. Instructions can stay in
English, because no visitor ever reads them.

The services template has no separate Services page, so nothing is written twice.
A business with a lot to say about its services, or specific search needs, can still
add its own pages with Add page. Sections keep stable ids and buttons can already
lead to one, so the menu can later link to sections on the home page without changing
how a page is stored.

## Editing

A draft saves itself about 2 seconds after typing stops, one save at a time
(`src/lib/site-spec/autosave.ts`), and Submit saves anything still waiting
first. A draft that is not a valid spec is not stored until it is fixed, and if
someone else changed the draft, saving stops without overwriting anything and
the text stays on screen. The activity gets one "Edited" entry per 10 minutes of
editing, not one per save. Clicking a problem under "Before approval" goes to
its field (`data-spec-path` in the editors, `src/lib/site-spec/paths.ts`).

## Optional fields a design can use

Every one of these is optional, so existing specs stay valid and no migration is needed. They hold what a premium
page needs and a template can't invent:

- A small line above any section's heading.
- In a hero: the end of the heading to set apart, and an honest line under the buttons.
- A price on a service. Use only a price the client confirmed.
- An image beside testimonials, under the same image-rights rules as any other.
- A button can go to a section of a page, not only to the top.
- A form's send button, a note on what happens next, and its field labels in the website's own language.

An optional text can be left out, but one written in some languages only blocks approval. Bracketed instructions
in these fields block approval too. The live product catalogue is not part of the SiteSpec: clients manage it on
the shop platform.

## What blocks approval

`approvalBlockers()` lists, in plain language:

- a missing goal, audience or main call to action;
- the starting brand placeholders (a person must choose the brand);
- text or grey text contrast under 4.5:1, or the primary colour under 3:1, on the
  background, or button text that cannot reach 4.5:1 on the primary colour;
- leftover draft text: "lorem ipsum", TODO, TBD or FIXME, or a template's
  instruction in square brackets;
- a missing text in any of the website's languages: page titles, addresses,
  search titles and descriptions (unless a page is hidden from search),
  headings and texts that sections need, button labels, alternative texts,
  consent texts, the site name and default description;
- **a brief value that is not confirmed, or was confirmed again since it was
  used** (its `confirmedAt` differs);
- a suggestion (`proposal` source) that no person accepted;
- images that are placeholders, or whose stored image is not an approved
  image of this client ([site-images.md](site-images.md)).

When a brief value the spec copied was confirmed again since, "Before approval"
offers **Use the current values from the brief**: it brings the new wording
into the goal, audiences and text sections that came from the brief (a text
section keeps only the default language, so translations are written again).
Anything else stays a blocker until a person changes it.

The database repeats the brief check at approval
(`private.site_spec_brief_confirmed`), so an approval made around the app is
refused too.

The editor asks before leaving the page, reloading it, or opening another
version while there are unsaved changes.

## Sources

Content carries where it came from:

- `{ kind: "brief", field, confirmedAt }`: copied from a confirmed brief value.
- `{ kind: "person", by, at }`: written by a person in the editor. Editing a
  section or a strategy value makes it a person's.
- `{ kind: "proposal", runId, proposalId, acceptedBy? }`: reserved for agent
  suggestions (later phases). WF-1 never creates one.

## Database rules (`guard_site_spec`)

- Started as a draft, by a signed-in person, in their own name, for a
  website-type project of the same client and studio, with the next version
  number.
- Only a draft's content changes. Client, project, version, origin and author
  never change.
- Status moves only draft → waiting → approved, or waiting → draft.
  Approved → replaced happens only inside `apply_site_spec_changes()` while a
  newer version of the same project is approved.
- Approving needs `auth.uid()` and `approved_by` = the caller, and every brief
  source still confirmed as it was. Times are set by the database.
- Approving also needs a pass from the server. `POST /api/site-specs/approve`
  runs `approvalBlockers()` on what is stored, as the signed-in person, and only
  then records a pass (`record_site_spec_check`, service role only) for that
  person and the spec's exact content, valid for 5 minutes. The approval is then
  written as the person. So every rule in "What blocks approval" holds even if
  the app is bypassed; there is no override. The pass holds no client material.
- No delete, except by client anonymisation. Size up to 512 KB.

## Worth checking

`qualityWarnings()` (`src/lib/site-spec/checks.ts`) lists what deserves a second
look and stops nothing: test text, text that may not be translated, vague
alternative texts, duplicate or short search texts, pages nothing leads to, a
home page without the main call to action, lists without a heading, unused
images and forms, images too small for their place, and heavy pages. It also
looks for claims that need the client's confirmation (percentages, customer
numbers, awards, certifications, guarantees, rankings), pressure such as "last
chance", headings that could be on any website, a hero without a button or with a
very long heading, quotes with nobody named, three similar sections in a row, a
form that doesn't say what happens next, and a shop that doesn't mention delivery,
returns or payment. These match words, so they ask for a look and never block. The review
shows a short reminder of what no check can judge. The preview's templates are
checked for accessibility in CI (`tests/e2e/preview-accessibility.spec.ts`).

## Retention

Specs hold client copy, so anonymising a client deletes its specs
(`private.anonymise_client`, updated in the same migration), and an
anonymised client cannot get new ones. Their activity entries are cleared with
the rest of the client's activity.

## Staging and production

The migration is applied to the local test stack only. Applying it to staging
is a separate step that needs approval (`supabase db push --dry-run` first,
see [staging.md](staging.md)). Until then `npm run staging:check` with
`STAGING_DATABASE_URL` reports `20261030000200` as not applied; that is
expected. There is no production.

## Preview

Any saved version opens as a working website with **Preview**: see
[site-preview.md](site-preview.md).

## Not in WF-1

Duda or any external renderer, a job queue, AI suggestions,
client access and publishing. The local demo does not keep website specs; its
page says so.
