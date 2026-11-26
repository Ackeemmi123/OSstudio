# Offers

A written offer for a client, made in Studio OS during or right after the
sales call. It starts from the published prices and what they include, in the
client's language, and is printed or saved as a PDF. Nothing is stored or sent:
the person sends the PDF themselves.

"Write the e-mail" opens the person's own e-mail app with a short cover
message in the offer's language: the greeting, the one-off price and the
upkeep, the date the offer is valid until, and how to go ahead (reply, and the
agreement follows). The person attaches the PDF and sends it.

Open it from the client page ("Offer", next to "Edit details"), before any
project exists, or from a website project ("Offer", next to "Website spec").
Address: `/clients/<id>/offer`, optionally `?project=<id>`.

Code: `src/lib/offers/offer.ts` (words, prices, sums, formats, the cover
e-mail; tested in `offer.test.ts`) and `src/components/offers/offer-route.tsx` (editor and the
printable document).

## What it starts from

| Field | Default |
| ----- | ------- |
| Language | The client's language from their latest website inquiry, else Finnish. Finnish, Swedish or English. |
| Website, once | €1,000, VAT 0% shown separately |
| Upkeep | €49 a month or €490 a year, or none |
| VAT | 25.5% |
| Valid for | 14 days |
| Scope | "Website, up to 5 pages, 1 language", in the offer's language |
| Greeting | The contact person's first name, in the offer's language |
| Sender | The signed-in person and the studio's brand details |

Extra one-off lines (a second language, copywriting, photos) can be added
with a price; they count towards the one-off total and its VAT. Every field
can be changed before printing.

The document lists what the website and the upkeep include, the upkeep terms
(at least 12 months), and the payment terms from the customer agreement:
half on signing and half when the site is published, 14 days from the
invoice date, and up to five changes before launch.

## Sender details

The sender's legal name, business ID, phone and e-mail are remembered on this
browser only (`localStorage`, key `studio-os:offer-sender`), so a work address
can be used instead of a sign-in address. Leaving the e-mail empty uses the studio's
brand e-mail, else the person's sign-in address.

## Changing the prices or terms

Prices are `STANDARD_PRICES` and `STANDARD_VAT_PERCENT`; the wording in all
three languages is `OFFER_WORDS`. A test checks that every language has every
word and that the payment and upkeep terms match the customer agreement, so a
change to the agreement means a change to the test as well.
