"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Section, Surface } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { agencyBrandSchema, brandLogoUrl, DEFAULT_BRAND_COLOR, MAX_BRAND_LOGO_BYTES, shownBrand, type AgencyBrand } from "@/lib/domain/agency-brand";
import { errorMessage } from "@/lib/data/studio-store";

/**
 * The agency's own brand, which clients see instead of Studio OS: on the
 * prototype sites it builds and on the pages behind its preview links.
 * Owners change it; everyone in the studio sees it.
 */
export function AgencyBrandSection() {
  const state = useStudio();
  const store = useStudioStore();
  const toast = useToast();
  const info = state.status === "ready" && state.info.kind === "supabase" ? state.info : null;
  const owner = info?.role === "owner";
  const [brand, setBrand] = useState<AgencyBrand | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!info) return;
    let active = true;
    store.read((r) => (r.agencyBrand ? r.agencyBrand() : Promise.resolve({}))).then(
      (loaded) => active && setBrand(loaded),
      () => active && setBrand({}),
    );
    return () => {
      active = false;
    };
  }, [store, info]);
  if (!info) return null;
  const logoUrl = brand?.logoPath && process.env.NEXT_PUBLIC_SUPABASE_URL ? brandLogoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, brand.logoPath) : null;
  const shown = shownBrand(brand ?? {}, info.studio.name, () => logoUrl ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!brand) return;
    const parsed = agencyBrandSchema.safeParse(brand);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const stored = await store.run((r) => r.saveAgencyBrand!(parsed.data));
      setBrand(stored);
      toast.success("The agency brand was saved.");
    } catch (error) {
      toast.error(`The agency brand was not saved. ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    if (file.size > MAX_BRAND_LOGO_BYTES) return toast.error("The logo must be at most 512 KB.");
    setSaving(true);
    try {
      const path = await store.run((r) => r.uploadBrandLogo!(file));
      setBrand((current) => ({ ...(current ?? {}), logoPath: path }));
      toast.success("The logo is uploaded. Save to use it.");
    } catch (error) {
      toast.error(`The logo was not uploaded. ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const field = (key: "name" | "website" | "email", label: string, hint: string, placeholder: string) => (
    <Field id={`brand-${key}`} label={label} hint={hint} error={errors[key]}>
      <TextInput id={`brand-${key}`} value={brand?.[key] ?? ""} placeholder={placeholder} disabled={!owner || saving || !brand} invalid={Boolean(errors[key])} onChange={(e) => setBrand((b) => ({ ...(b ?? {}), [key]: e.target.value }))} />
    </Field>
  );

  return (
    <Section id="agency-brand" title="Agency brand">
      <Surface>
        <form onSubmit={save} className="flex flex-col gap-4 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            What your clients see instead of Studio OS: on the prototype sites you build and on the pages behind preview links. The client review page and mail to clients will use it too.
            {owner ? "" : " Only an owner can change it."}
          </p>
          {field("name", "Agency name", `Empty: the studio's name, ${info.studio.name}.`, info.studio.name)}
          {field("website", "Website", "Optional.", "https://agency.fi")}
          {field("email", "Contact e-mail", "Where clients can ask about a link, for example a new one when it has expired.", "hello@agency.fi")}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="brand-color" label="Colour" hint="Used for links and buttons on your pages." error={errors.color}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Pick a colour" value={brand?.color || DEFAULT_BRAND_COLOR} disabled={!owner || saving || !brand} onChange={(e) => setBrand((b) => ({ ...(b ?? {}), color: e.target.value.toUpperCase() }))} className="h-9 w-12 rounded border border-line" />
                <TextInput id="brand-color" value={brand?.color ?? ""} placeholder={DEFAULT_BRAND_COLOR} disabled={!owner || saving || !brand} invalid={Boolean(errors.color)} onChange={(e) => setBrand((b) => ({ ...(b ?? {}), color: e.target.value }))} />
              </div>
            </Field>
            <Field id="brand-logo" label="Logo" hint="PNG, JPEG or WebP, at most 512 KB. Public, as it is shown on link pages.">
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Current logo" className="h-9 max-w-32 object-contain" />
                ) : null}
                {owner ? (
                  <>
                    <Button size="xs" onClick={() => logoInput.current?.click()} disabled={saving || !brand}>
                      {logoUrl ? "Replace" : "Upload"}
                    </Button>
                    {logoUrl ? (
                      <Button size="xs" variant="ghost" onClick={() => setBrand((b) => ({ ...(b ?? {}), logoPath: undefined }))} disabled={saving}>
                        Remove
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <input id="brand-logo" ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </div>
            </Field>
          </div>
          <div className="rounded-[var(--radius-control)] border border-line px-4 py-3" aria-label="Preview">
            <p className="text-[11px] tracking-[0.04em] text-ink-subtle uppercase">Preview on a link page</p>
            <div className="mt-2 flex items-center gap-3">
              {shown.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown.logoUrl} alt="" className="h-7 max-w-28 object-contain" />
              ) : null}
              <span className="text-[14px] font-medium" style={{ color: shown.color }}>
                {shown.name}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              This link has expired. Ask {shown.name} for a new one{shown.email ? ` at ${shown.email}` : ""}.
            </p>
          </div>
          {owner ? (
            <div>
              <Button type="submit" variant="primary" disabled={saving || !brand} aria-busy={saving}>
                {saving ? "Saving…" : "Save brand"}
              </Button>
            </div>
          ) : null}
        </form>
      </Surface>
    </Section>
  );
}
