# Website Factory: first end-to-end proof

Can a brief become a complete private website Axivo would be proud to sell? The
plan and its gates are in the proposal:
https://claude.ai/artifact/2mwGmAdLm9yAVezxn4unq4

It runs from files. It has no database, no Studio OS screens, and nothing here
is published. Every business, person and quote is invented, and each page says so.

    npm run proof:build        # writes each site to proof/out
    npm run proof:test         # content contract and design system tests
    npm run proof:qa           # QA in a real browser, with reports in proof/out/reports
    npm run proof:qa:planted   # checks that QA catches planted defects

    npm run proof:preview      # packs the three sites for a private link, with forms off

To look at a site: `python3 -m http.server 3210 --directory proof/out`

## What is here

- `design-systems/services`: the design system. One content file in, one static
  site out, with no scripts. It imports nothing from Studio OS.
- `design-systems/services/statement.tsx`: the home page of the bold, type-led
  direction, with its own order and composition. A site can add one motif from
  its trade, such as `pipe`, which draws the pipe and rising water.
- `proof/sites`: three invented firms, written by hand for Gate 1, and awkward
  stress cases. `briefs.ts` holds the briefs AI drafting will later start from.
- `proof/qa`: the QA runner and the planted defects.
- `proof/outreach`: the reusable outreach template, one A4 sheet and one email per
  firm. Firm details and concepts stay in git-ignored `proof/concepts`.
- `proof/publish`: a client site's working contact form and the step that packs it
  for hosting. It refuses test sites and concepts, and it publishes nothing itself.
- `proof/baseline.md`: what the proof is measured against. Still to be answered.

## Known limits of this stage

- Test sites and concepts have no working form. A client site gets one from `proof/publish`,
  which needs a Resend key and has not yet sent a real message.
- Photos are Unsplash stock loaded by address, for internal review only. A real
  site needs the client's own, in the site's folder, with an image step to size them.
- Lighthouse and hosted checks wait for private hosting (step 6).
- The Swedish copy has not been read by a native speaker. The owner has read the Finnish.
- Motion is checked in Chrome only: that it hides no words and stops when a
  visitor asks their device for reduced motion. Whether it feels right is a person's call.
- QA uses the machine's own Chrome, and does not yet run in CI.
