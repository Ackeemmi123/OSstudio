# Inquiry contract fixtures (v1)

Invented test inquiries for the website handoff contract
(`src/lib/inquiries/contract.ts`). Every name, address and message is made up
and marked `(TEST)`; email addresses use the reserved `example.com` domain and
the IP address is from the documentation range `192.0.2.0/24`.

| File | What it is | Studio OS answer |
| --- | --- | --- |
| `dry-run-customer.json` | The dry run's fictional customer: every optional field filled in. | Accepted |
| `dry-run-minimal.json` | Only what the website always sends; every optional field left out, no IP. | Accepted |
| `empty-optional-strings.json` | Optional fields sent as `""` instead of left out. | `400 invalid`, naming `contact.company`, `contact.website`, `projectType`, `budget`, `timeline`, `desiredDate` |

`submittedAt` is fixed, so the fixtures validate only when checked against
that time. `src/lib/inquiries/fixtures.test.ts` does that, and
`npm run staging:inquiry -- --fixture <name>` sends one of them to staging with
a fresh `submissionId`, `submittedAt` and desired date.

The Axivo website builds its payload in `buildInquiryPayload`
(`src/lib/contact/studio-os.server.ts` there), which leaves empty optional
fields out. Its tests can compare against these files.
