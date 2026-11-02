# Website images (WF-2)

Each client has a private library of images for its website. A website spec
shows an image by referring to one of them; until it does, the image is a
placeholder, which blocks approval. A spec can be approved only when every
image it uses is a stored image **of the same client** whose **rights a
person approved**. The database checks this again at approval.

## Uploading

From the website spec, **Upload image** (on a placeholder, or as a new image):

1. **In the browser:** the file must be a real JPEG, PNG or WebP up to 15 MB.
   It is downscaled to at most 2560 px and re-encoded (WebP, or JPEG where the
   browser cannot encode WebP). Re-encoding removes all metadata, including
   camera details and GPS location. Original file names are never stored.
2. **On the server** (`POST /api/site-assets/upload`), before anything is
   stored, the bytes are checked (`src/lib/site-assets/inspect.ts`). The file
   name and declared type are not trusted.

| Check | Refused when |
| --- | --- |
| Size | Empty, or over 3 MB |
| File type | The bytes are not a PNG, JPEG or WebP signature |
| PNG structure | IHDR missing or not first, a chunk checksum wrong, no IEND, or bytes after IEND |
| JPEG structure | No frame header with dimensions, no end marker, or data after it |
| WebP structure | The RIFF size does not match the file, or no VP8/VP8L/VP8X dimensions |
| Consistency | The declared type differs from the bytes; the server's measurements are what is stored |
| Dimensions | A side under 200 px, or over 2560 px |

   Refusals answer `400` with the reason; nothing is stored. Not checked: a
   full decode of every pixel (no image library is used). A file with sound
   headers but corrupt compressed data can only ever be shown in an `<img>`
   from a private bucket, where it fails to display.
3. The server stores the file **as the signed-in person** (the Storage
   policies apply) and only the server's service role marks it checked. A
   file uploaded to Storage any other way is never checked: nobody can read,
   review or use it, and the purge deletes it after an hour.

## Rights and permission

Every image answers three separate questions, and a person decides its
rights in their own name, one image at a time:

| Question | Recorded |
| --- | --- |
| Copyright and licensing: who holds the rights? | Client owns, studio created, licensed, other; a licence note for licensed and other |
| Permission to use it on this client's website | Yes/no, and who gave permission and where it is recorded |
| Identifiable people: the lawful basis for showing them | Consent, contract, legitimate interests or other, and where it is documented |

Consent is one possible basis, not assumed: which applies depends on the
situation. Studio OS records what the person states; whether it is right is
for the studio and its adviser. An approved image cannot change; record other
rights by uploading it again.

## Storage

- Private bucket `site-assets`, at most 3 MB per file, JPEG, PNG and WebP only.
- Path `{studio}/{client}/{image}.{ext}`, set by the database.
- People read images through **signed links that last at most 15 minutes**
  (`SIGNED_URL_TTL_SECONDS`), created with their own session. Nothing is public.
- Nobody can change or delete a stored file through Storage.
- Limits: 200 images and 300 MB per client; 2000 images and 500 MB per studio
  (Supabase's free plan has 1 GB; raise the studio limit with a migration on
  a larger plan).

## Deleting

- **Delete** on an image (owners and members) hides it at once. While a
  version of this project's spec that is approved or waiting for approval
  uses it, Delete is disabled and says which version ("Used by approved spec
  v1"). The database refuses the deletion in any case, including for another
  project of the same client, and stays the final authority.
- **Remove from this spec** on a spec's image only takes it out of the draft;
  the stored image stays in the library.
- **Anonymising a client** marks all its images deleted.
- From that moment **no new link can be issued**. Links already handed out
  keep working until they expire, **at most 15 minutes** (Supabase cannot
  revoke a link).
- The files are physically deleted from Storage by the **purge**, within 24
  hours: Storage refuses deletes from SQL, so the database marks the rows and
  the purge removes the files through the Storage API, then the rows.

### The purge

- Daily: Vercel Cron calls `GET /api/storage/purge` (`vercel.json`) with
  `Authorization: Bearer $CRON_SECRET`. **Off until `CRON_SECRET` (at least 32
  characters) is set** in the Vercel project; it answers `503` until then.
- By hand: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run storage:purge`
  from an owner's machine. Prints counts only.
- Also removes uploads never checked within an hour.

## Where it lives

| Part | File |
| --- | --- |
| Limits, rights questions | `src/lib/site-assets/limits.ts` |
| Byte checks | `src/lib/site-assets/inspect.ts` |
| Upload route | `src/app/api/site-assets/upload/route.ts`, `src/server/site-assets/upload.ts` |
| Purge | `src/server/storage/purge.ts`, `src/app/api/storage/purge/route.ts`, `scripts/storage-purge.mjs` |
| Database, Storage policies | `supabase/migrations/20261031000100_site_assets.sql` |
| Editor | `src/components/site-spec/images-editor.tsx`, `asset-upload.tsx`, `process-image.ts` |
