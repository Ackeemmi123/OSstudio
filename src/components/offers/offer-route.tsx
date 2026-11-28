"use client";

import { ArrowLeft, Mail, Plus, Printer, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { LoadError } from "@/components/load-error";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { StatusLabel } from "@/components/ui/status";
import { EmptyState, Skeleton, Surface } from "@/components/ui/surface";
import { brandLogoUrl, shownBrand, type AgencyBrand } from "@/lib/domain/agency-brand";
import type { Client, Project, StudioSnapshot } from "@/lib/domain/types";
import {
  buildOffer,
  defaultIntro,
  defaultScope,
  euros,
  OFFER_WORDS,
  offerDate,
  offerEmail,
  offerMailto,
  percent,
  projectTitle,
  SIGNATURE_PRICES,
  STANDARD_PRICES,
  STANDARD_VAT_PERCENT,
  unpricedLines,
  type Offer,
  type OfferLanguage,
  type OfferLine,
  type OfferLineKind,
} from "@/lib/offers/offer";

/** Axivo Signature's two levels, as the offer form names them. Their price is set on each offer. */
const SIGNATURE_BUTTONS: { kind: OfferLineKind; label: string }[] = [
  { kind: "signature", label: "Axivo Signature" },
  { kind: "signature-custom", label: "Signature, made to measure" },
];

/** What a person types once and Studio OS does not hold: the company's legal details for the footer. */
const SENDER_KEY = "studio-os:offer-sender";
interface SenderDetails {
  legalName: string;
  businessId: string;
  phone: string;
  /** The work address to answer to; the sign-in address may be a private one. */
  email: string;
}

function readSender(): SenderDetails {
  try {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SENDER_KEY) : null;
    if (stored) return { legalName: "", businessId: "", phone: "", email: "", ...(JSON.parse(stored) as Partial<SenderDetails>) };
  } catch {
    // Storage may be off; the fields then start empty.
  }
  return { legalName: "", businessId: "", phone: "", email: "" };
}

/** The client's language: the one their website inquiry came in, else Finnish. */
function languageOf(client: Client, snapshot: StudioSnapshot): OfferLanguage {
  const inquiry = snapshot.inquiries.filter((i) => i.clientId === client.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  return inquiry?.locale ?? "fi";
}

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });

export function OfferRoute({ clientId, projectId }: { clientId: string; projectId: string | null }) {
  const state = useStudio();
  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <OfferSkeleton />;
  const client = state.snapshot.clients.find((c) => c.id === clientId);
  if (!client) {
    return (
      <Surface>
        <EmptyState icon={<SearchX />} title="Client not found" action={<ButtonLink href="/clients">Back to clients</ButtonLink>} />
      </Surface>
    );
  }
  const projects = state.snapshot.projects.filter((p) => p.clientId === client.id);
  const project = projects.find((p) => p.id === projectId) ?? projects[0] ?? null;
  return <OfferEditor client={client} project={project} snapshot={state.snapshot} />;
}

function OfferEditor({ client, project, snapshot }: { client: Client; project: Project | null; snapshot: StudioSnapshot }) {
  const id = useId();
  const state = useStudio();
  const store = useStudioStore();
  const info = state.status === "ready" && state.info.kind === "supabase" ? state.info : null;
  const me = info?.members.find((member) => member.userId === info.user.id);

  const [brand, setBrand] = useState<AgencyBrand>({});
  useEffect(() => {
    if (!info) return;
    let active = true;
    store.read((r) => (r.agencyBrand ? r.agencyBrand() : Promise.resolve({}))).then(
      (loaded) => active && setBrand(loaded),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [store, info]);
  const logoUrl = brand.logoPath && process.env.NEXT_PUBLIC_SUPABASE_URL ? brandLogoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, brand.logoPath) : null;
  const shown = shownBrand(brand, info?.studio.name ?? "", () => logoUrl ?? "");

  const [language, setLanguage] = useState<OfferLanguage>(() => languageOf(client, snapshot));
  const [pages, setPages] = useState(5);
  const [languages, setLanguages] = useState(1);
  const [scope, setScope] = useState(() => defaultScope(languageOf(client, snapshot), 5, 1));
  const [intro, setIntro] = useState(() => defaultIntro(languageOf(client, snapshot), client.contactPerson));
  const [title, setTitle] = useState(() => projectTitle(project?.name ?? "Website", languageOf(client, snapshot)));
  const [website, setWebsite] = useState<number>(STANDARD_PRICES.website);
  const [extras, setExtras] = useState<OfferLine[]>([]);
  const [upkeep, setUpkeep] = useState<{ monthly: number; yearly: number; chosen: "month" | "year" | "none" }>({ monthly: STANDARD_PRICES.monthly, yearly: STANDARD_PRICES.yearly, chosen: "month" });
  const [vat, setVat] = useState<number>(STANDARD_VAT_PERCENT);
  const [validDays, setValidDays] = useState(14);
  const [sender, setSender] = useState<SenderDetails>(readSender);

  // Selling Signature is not the same as switching it on: once the offer has it, show whether the client's
  // website has Axivo Signature motion ticked, so it is not sold and then forgotten.
  const sellsSignature = extras.some((line) => line.kind);
  const [signatureOn, setSignatureOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!sellsSignature || !project) return;
    let active = true;
    store.read((r) => (r.listStudioDesigns ? r.listStudioDesigns() : Promise.resolve([]))).then(
      (designs) => active && setSignatureOn(Boolean(designs.find((design) => design.projectId === project.id)?.brand.concept?.signatureMotion)),
      () => active && setSignatureOn(null),
    );
    return () => {
      active = false;
    };
  }, [sellsSignature, project, store]);

  function changeLanguage(next: OfferLanguage) {
    setLanguage(next);
    // The written parts follow the language; prices and lines stay.
    setScope(defaultScope(next, pages, languages));
    setIntro(defaultIntro(next, client.contactPerson));
    setTitle(projectTitle(project?.name ?? "Website", next));
  }
  function changeSize(nextPages: number, nextLanguages: number) {
    setPages(nextPages);
    setLanguages(nextLanguages);
    setScope(defaultScope(language, nextPages, nextLanguages));
  }
  function changeSender(next: Partial<SenderDetails>) {
    const merged = { ...sender, ...next };
    setSender(merged);
    try {
      window.localStorage.setItem(SENDER_KEY, JSON.stringify(merged));
    } catch {
      // Only a convenience.
    }
  }

  const fallbackEmail = shown.email || info?.user.email || "";
  const offer = useMemo(
    () =>
      buildOffer({
        language,
        date: today(),
        validDays,
        client: { name: client.name.replace(/\s*\(test\)\s*$/i, ""), contact: client.contactPerson, email: client.email },
        project: title,
        scope,
        website,
        upkeep,
        extras,
        vatPercent: vat,
        intro,
        from: {
          studio: shown.name,
          legalName: sender.legalName,
          businessId: sender.businessId,
          person: me?.displayName ?? "",
          email: sender.email.trim() || fallbackEmail,
          phone: sender.phone,
          website: shown.website ?? "",
        },
      }),
    [language, validDays, client, title, scope, website, upkeep, extras, vat, intro, shown.name, shown.website, sender, me?.displayName, fallbackEmail],
  );

  const unpriced = unpricedLines(offer);
  const back = `/clients/${encodeURIComponent(client.id)}`;
  return (
    <div className="offer-page">
      <style>{PRINT}</style>
      <div className="offer-chrome mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <ButtonLink href={back} variant="ghost" size="sm" className="-ml-2 mb-2">
            <ArrowLeft aria-hidden />
            {client.name}
          </ButtonLink>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-0.03em] text-ink">Offer</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">Starts from the published prices and what they include. Adjust it, save it as a PDF, then write the e-mail and attach the PDF. Nothing is stored or sent from here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unpriced.length ? (
            <Button variant="secondary" disabled data-testid="offer-email">
              <Mail aria-hidden />
              Write the e-mail
            </Button>
          ) : (
            <a href={offerMailto(offerEmail(offer))} className={buttonClasses("secondary", "md")} data-testid="offer-email" title={client.email ? `Opens your e-mail app with a message to ${client.email}` : "Opens your e-mail app; no address is recorded for this client"}>
              <Mail aria-hidden />
              Write the e-mail
            </a>
          )}
          <Button variant="primary" disabled={unpriced.length > 0} onClick={() => window.print()}>
            <Printer aria-hidden />
            Print or save as PDF
          </Button>
        </div>
        {unpriced.length ? (
          <p className="w-full text-right text-[13px] text-caution" role="status" data-testid="offer-unpriced">
            Set the price of {unpriced.map((line) => line.label.split(/[:,]/)[0] + (line.kind === "signature-custom" ? ", made to measure" : "")).join(" and ")} before you print or write the e-mail.
          </p>
        ) : null}
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
        <form className="offer-chrome flex flex-col gap-4" onSubmit={(event) => event.preventDefault()} aria-label="Offer details">
          <Surface className="flex flex-col gap-4 px-5 py-4">
            <Field id={`${id}-lang`} label="Language">
              <Select id={`${id}-lang`} value={language} onChange={(event) => changeLanguage(event.target.value as OfferLanguage)}>
                <option value="fi">Finnish</option>
                <option value="sv">Swedish</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field id={`${id}-title`} label="Project">
              <TextInput id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-pages`} label="Pages, at most">
                <TextInput id={`${id}-pages`} type="number" min={1} max={40} value={pages} onChange={(event) => changeSize(Number(event.target.value) || 1, languages)} />
              </Field>
              <Field id={`${id}-languages`} label="Languages">
                <TextInput id={`${id}-languages`} type="number" min={1} max={3} value={languages} onChange={(event) => changeSize(pages, Number(event.target.value) || 1)} />
              </Field>
            </div>
            <Field id={`${id}-scope`} label="Scope">
              <TextArea id={`${id}-scope`} rows={2} value={scope} onChange={(event) => setScope(event.target.value)} />
            </Field>
            <Field id={`${id}-intro`} label="Opening words">
              <TextArea id={`${id}-intro`} rows={4} value={intro} onChange={(event) => setIntro(event.target.value)} />
            </Field>
          </Surface>

          <Surface className="flex flex-col gap-4 px-5 py-4">
            <Field id={`${id}-website`} label="Website, once (€, VAT 0%)" hint="Published price: from about €1,000.">
              <TextInput id={`${id}-website`} type="number" min={0} step={50} value={website} onChange={(event) => setWebsite(Number(event.target.value) || 0)} />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium text-ink">Other one-off lines</legend>
              {extras.map((line, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-2">
                  {line.kind ? (
                    <span className="text-[13px] leading-snug text-ink" data-testid="offer-signature-line">
                      {OFFER_WORDS[language].lineKinds[line.kind]}
                    </span>
                  ) : (
                    <TextInput aria-label={`Line ${i + 1}`} value={line.label} placeholder="e.g. A second language" onChange={(event) => setExtras(extras.map((l, j) => (j === i ? { ...l, label: event.target.value } : l)))} />
                  )}
                  <TextInput
                    aria-label={line.kind ? `Price of ${SIGNATURE_BUTTONS.find((b) => b.kind === line.kind)?.label}` : `Price of line ${i + 1}`}
                    aria-invalid={line.kind && !(line.price > 0) ? true : undefined}
                    type="number"
                    min={0}
                    step={50}
                    placeholder={line.kind ? "Price" : undefined}
                    value={line.kind && !line.price ? "" : line.price}
                    onChange={(event) => setExtras(extras.map((l, j) => (j === i ? { ...l, price: Number(event.target.value) || 0 } : l)))}
                  />
                  <Button size="sm" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setExtras([...extras, { label: "", price: 0, unit: "once" }])}>
                  <Plus aria-hidden />
                  Add a line
                </Button>
                {SIGNATURE_BUTTONS.filter((button) => !extras.some((line) => line.kind === button.kind)).map((button) => (
                  <Button key={button.kind} size="sm" variant="secondary" onClick={() => setExtras([...extras, { label: "", price: SIGNATURE_PRICES[button.kind], unit: "once", kind: button.kind }])}>
                    <Plus aria-hidden />
                    {button.label}
                  </Button>
                ))}
              </div>
              {sellsSignature ? <p className="text-[12.5px] text-ink-subtle">Signature starts from €1,200, made-to-measure parts from €2,200 (VAT 0%). Change the price to fit the work. The client sees the line in the offer&apos;s language.</p> : null}
              {sellsSignature ? (
                <div className="flex flex-col gap-1 text-[12.5px]" data-testid="offer-signature-site">
                  {signatureOn ? (
                    <StatusLabel tone="positive" className="whitespace-normal">Axivo Signature motion is on for this client&apos;s website.</StatusLabel>
                  ) : project ? (
                    <>
                      <StatusLabel tone="caution" className="whitespace-normal">Not switched on yet for this client&apos;s website.</StatusLabel>
                      <p className="text-ink-subtle">
                        Tick &quot;Axivo Signature motion&quot; under Brand, or the client won&apos;t get it.{" "}
                        <Link href={`/clients/${encodeURIComponent(client.id)}/projects/${encodeURIComponent(project.id)}/site`} className="text-ink underline underline-offset-2">
                          Open the website
                        </Link>
                      </p>
                    </>
                  ) : (
                    <p className="text-ink-subtle">When the website is started, tick &quot;Axivo Signature motion&quot; under Brand, or the client won&apos;t get it.</p>
                  )}
                </div>
              ) : null}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium text-ink">Maintenance</legend>
              {(["month", "year", "none"] as const).map((choice) => (
                <label key={choice} className="flex items-center gap-2 text-[13.5px] text-ink">
                  <input type="radio" name={`${id}-upkeep`} checked={upkeep.chosen === choice} onChange={() => setUpkeep({ ...upkeep, chosen: choice })} />
                  {choice === "month" ? "Monthly" : choice === "year" ? "Yearly" : "No maintenance"}
                </label>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <Field id={`${id}-monthly`} label="€ a month">
                  <TextInput id={`${id}-monthly`} type="number" min={0} value={upkeep.monthly} onChange={(event) => setUpkeep({ ...upkeep, monthly: Number(event.target.value) || 0 })} />
                </Field>
                <Field id={`${id}-yearly`} label="€ a year">
                  <TextInput id={`${id}-yearly`} type="number" min={0} value={upkeep.yearly} onChange={(event) => setUpkeep({ ...upkeep, yearly: Number(event.target.value) || 0 })} />
                </Field>
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-vat`} label="VAT %">
                <TextInput id={`${id}-vat`} type="number" min={0} step={0.1} value={vat} onChange={(event) => setVat(Number(event.target.value) || 0)} />
              </Field>
              <Field id={`${id}-valid`} label="Valid for (days)">
                <TextInput id={`${id}-valid`} type="number" min={1} max={90} value={validDays} onChange={(event) => setValidDays(Number(event.target.value) || 14)} />
              </Field>
            </div>
          </Surface>

          <Surface className="flex flex-col gap-4 px-5 py-4">
            <p className="text-[12.5px] text-ink-subtle">Your company&apos;s details for the footer. Remembered on this browser.</p>
            <Field id={`${id}-legal`} label="Legal name">
              <TextInput id={`${id}-legal`} value={sender.legalName} placeholder="e.g. Axivo Ab" onChange={(event) => changeSender({ legalName: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-bid`} label="Business ID">
                <TextInput id={`${id}-bid`} value={sender.businessId} onChange={(event) => changeSender({ businessId: event.target.value })} />
              </Field>
              <Field id={`${id}-phone`} label="Your phone">
                <TextInput id={`${id}-phone`} value={sender.phone} onChange={(event) => changeSender({ phone: event.target.value })} />
              </Field>
            </div>
            <Field id={`${id}-email`} label="Your e-mail on the offer">
              <TextInput id={`${id}-email`} type="email" value={sender.email} placeholder={shown.email ?? info?.user.email ?? "name@agency.fi"} onChange={(event) => changeSender({ email: event.target.value })} />
            </Field>
          </Surface>
        </form>

        <OfferDocument offer={offer} color={shown.color} logoUrl={logoUrl} />
      </div>
    </div>
  );
}

/** The offer as the client reads it: one A4 page, two when the lists are long. */
export function OfferDocument({ offer, color, logoUrl }: { offer: Offer; color: string; logoUrl: string | null }) {
  const w = OFFER_WORDS[offer.language];
  const money = (value: number) => euros(value, offer.language);
  const from = offer.from;
  return (
    <article className="offer-doc mx-auto w-full max-w-[820px] rounded-[18px] border border-line bg-white px-10 py-12 text-[#151922] shadow-[0_24px_60px_-30px_rgba(16,24,40,.35)] sm:px-14" style={{ ["--c" as string]: color }} lang={offer.language} data-testid="offer-document">
      <header className="flex items-start justify-between gap-6 border-b border-[#e6e8ee] pb-8">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={from.studio} className="h-9 w-auto" />
          ) : (
            <span className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em]">
              <span className="inline-block size-3 rounded-full" style={{ background: color }} aria-hidden />
              {from.studio}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right text-[12.5px] text-[#5d6472]">
          <dt>{w.date}</dt>
          <dd className="text-[#151922]">{offerDate(offer.date, offer.language)}</dd>
          <dt>{w.valid}</dt>
          <dd className="text-[#151922]">{offerDate(offer.validUntil, offer.language)}</dd>
        </dl>
      </header>

      <section className="pt-8">
        <p className="text-[12px] font-semibold tracking-[0.12em] uppercase" style={{ color }}>
          {w.title}
        </p>
        <h2 className="mt-2 text-[34px] leading-[1.08] font-semibold tracking-[-0.03em]">
          {offer.project} · {offer.client.name}
        </h2>
        <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[#2c323d]">{offer.intro}</p>
      </section>

      <section className="mt-8 grid gap-6 rounded-[14px] bg-[#f6f7f9] p-5 text-[13px] sm:grid-cols-2">
        <div>
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-[#8a909c] uppercase">{w.to}</p>
          <p className="mt-1 font-semibold">{offer.client.name}</p>
          {offer.client.contact ? <p>{offer.client.contact}</p> : null}
          {offer.client.email ? <p className="text-[#5d6472]">{offer.client.email}</p> : null}
        </div>
        <div>
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-[#8a909c] uppercase">{w.from}</p>
          <p className="mt-1 font-semibold">{from.legalName || from.studio}</p>
          {from.person ? <p>{from.person}</p> : null}
          <p className="text-[#5d6472]">{[from.email, from.phone].filter(Boolean).join(" · ")}</p>
        </div>
      </section>

      <section className="mt-8">
        <p className="text-[12.5px] text-[#5d6472]">
          <span className="font-semibold text-[#151922]">{w.scope}:</span> {offer.scope}
        </p>
        <table className="mt-4 w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-[#151922] text-left text-[11.5px] tracking-[0.06em] text-[#5d6472] uppercase">
              <th className="py-2 font-semibold">{w.item}</th>
              <th className="py-2 text-right font-semibold">{w.price}</th>
            </tr>
          </thead>
          <tbody>
            {offer.lines.map((line, i) => (
              <tr key={i} className="border-b border-[#e6e8ee]">
                <td className="py-3">{line.label}</td>
                <td className="py-3 text-right tabular-nums">{money(line.price)}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-4 font-semibold">{w.onceTotal}</td>
              <td className="pt-4 text-right font-semibold tabular-nums">{money(offer.onceTotal)}</td>
            </tr>
            <tr className="text-[#5d6472]">
              <td className="py-1">{w.vat(percent(offer.vatPercent, offer.language))}</td>
              <td className="py-1 text-right tabular-nums">{money(offer.onceVat)}</td>
            </tr>
            <tr className="text-[#5d6472]">
              <td className="pb-3">{w.withVat}</td>
              <td className="pb-3 text-right tabular-nums">{money(offer.onceTotal + offer.onceVat)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="pb-3 text-[12.5px] text-[#5d6472]">
                <span className="font-semibold text-[#151922]">{w.paymentTitle}:</span> {w.payment}
              </td>
            </tr>
            {offer.recurring ? (
              <tr className="border-t border-[#e6e8ee]">
                <td className="pt-3">
                  <span className="font-semibold">{w.then}:</span> {offer.recurring.label}
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums" style={{ color }}>
                  {money(offer.recurring.price)}
                  {w.units[offer.recurring.unit]}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {offer.lines.some((line) => line.kind) ? (
        <section className="offer-keep mt-10" data-testid="offer-signature">
          {offer.lines.some((line) => line.kind === "signature") ? <List title={w.includedSignature} items={w.signatureItems} color={color} /> : null}
          {offer.lines.some((line) => line.kind === "signature-custom") ? <p className="mt-3 text-[12px] leading-relaxed text-[#5d6472]">{w.signatureCustomNote}</p> : null}
        </section>
      ) : null}

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <List title={w.includedSite} items={w.site} color={color} />
        <div>
          <List title={w.includedUpkeep} items={w.upkeep} color={color} />
          <p className="mt-3 text-[12px] leading-relaxed text-[#5d6472]">{w.upkeepTerms(money(offer.upkeep.monthly), money(offer.upkeep.yearly))}</p>
        </div>
      </section>

      <section className="offer-keep mt-10">
        <p className="text-[13px] font-semibold">{w.stepsTitle}</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-5">
          {w.steps.map((step, i) => (
            <li key={step} className="rounded-[12px] border border-[#e6e8ee] p-3 text-[12px] leading-snug [overflow-wrap:anywhere] hyphens-auto">
              <span className="mb-1 block text-[11px] font-semibold" style={{ color }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="offer-keep mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-[13px] font-semibold">{w.yours}</p>
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-[#2c323d]">
            {w.own.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-semibold">{w.accept}</p>
          <p className="mt-2 text-[13px] text-[#2c323d]">{w.acceptText}</p>
          <div className="mt-10 border-t border-[#151922] pt-1 text-[11.5px] text-[#5d6472]">{w.signature}</div>
        </div>
      </section>

      <footer className="mt-12 border-t border-[#e6e8ee] pt-5 text-[11.5px] leading-relaxed text-[#5d6472]">
        <p>
          {w.validText(offerDate(offer.validUntil, offer.language))} {w.contact}
        </p>
        <p className="mt-1">{[from.legalName || from.studio, from.businessId ? `${w.businessId} ${from.businessId}` : "", from.website.replace(/^https:\/\//, ""), from.email, from.phone].filter(Boolean).join(" · ")}</p>
      </footer>
    </article>
  );
}

function List({ title, items, color }: { title: string; items: readonly string[]; color: string }) {
  return (
    <div>
      <p className="text-[13px] font-semibold">{title}</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-[#2c323d]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="mt-[3px] inline-block size-3.5 shrink-0 rounded-full text-center text-[9px] leading-[14px] font-bold text-white" style={{ background: color }}>
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** On paper only the offer shows, on A4, without the app around it. */
const PRINT = `@media print{
@page{size:A4;margin:14mm}
body *{visibility:hidden}
.offer-doc,.offer-doc *{visibility:visible}
.offer-doc{position:absolute;left:0;top:0;width:100%;max-width:none;border:0;box-shadow:none;border-radius:0;padding:0}
.offer-keep{break-inside:avoid}
}`;

function OfferSkeleton() {
  return (
    <div aria-busy aria-label="Loading the offer" className="grid gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Skeleton className="h-96" />
      <Skeleton className="h-[640px]" />
    </div>
  );
}
