# Website specs (SiteSpec v1)

A website spec describes the website a project will deliver: its goal and
audiences, brand, pages and their sections, copy in each language, images,
forms, search texts and the features it needs. It is **platform-neutral**:
nothing in it is specific to Duda, Webflow or any renderer. Studio OS owns it;
a renderer (or a person) will later build the site from an approved version.

This is Website Factory phase WF-1. There is no renderer, preview, AI,
image upload or publishing yet.

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

## What blocks approval

`approvalBlockers()` lists, in plain language:

- a missing goal, audience or main call to action;
- the starting brand placeholders (a person must choose the brand);
- text contrast under 4.5:1, or the primary colour under 3:1, on the background;
- a missing text in any of the website's languages: page titles, addresses,
  search titles and descriptions (unless a page is hidden from search),
  headings and texts that sections need, button labels, alternative texts,
  consent texts, the site name and default description;
- **a brief value that is not confirmed, or was confirmed again since it was
  used** (its `confirmedAt` differs);
- a suggestion (`proposal` source) that no person accepted;
- placeholder images. Image upload arrives with asset storage (WF-2), so in
  WF-1 a spec with images cannot be approved yet.

The database repeats the brief check at approval
(`private.site_spec_brief_confirmed`), so an approval made around the app is
refused too.

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
- No delete, except by client anonymisation. Size up to 512 KB.

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

## Not in WF-1

Duda or any renderer, previews, a job queue, AI suggestions, image upload,
client access and publishing. The local demo does not keep website specs; its
page says so.
