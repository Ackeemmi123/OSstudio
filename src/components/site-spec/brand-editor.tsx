"use client";

import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { StatusLabel } from "@/components/ui/status";
import { DENSITIES, RADII, TYPE_SCALES } from "@/lib/site-spec/catalog";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { CONTRAST_MINIMUM, contrastRatio } from "@/lib/site-spec/validate";
import type { SpecEditing } from "./site-spec-editor";
import { SourceTag } from "./strategy-editor";

type ColorKey = "primary" | "secondary" | "accent" | "background" | "text";
const COLORS: { key: ColorKey; label: string; optional?: boolean }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary", optional: true },
  { key: "accent", label: "Accent", optional: true },
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
];

const isHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

function Contrast({ label, a, b, minimum }: { label: string; a: string; b: string; minimum: number }) {
  if (!isHex(a) || !isHex(b)) return null;
  const ratio = contrastRatio(a, b);
  return (
    <StatusLabel tone={ratio >= minimum ? "positive" : "critical"}>
      {label}: {ratio.toFixed(1)}:1 {ratio >= minimum ? "passes" : `needs ${minimum}:1`}
    </StatusLabel>
  );
}

export function BrandEditor({ spec, editing }: { spec: SiteSpec; editing: SpecEditing }) {
  const { editable, change, personSource } = editing;
  const brand = spec.brand;
  /** Any change to the brand is a person's choice of brand. */
  const brandChange = (edit: (s: SiteSpec) => void) =>
    change((s) => {
      edit(s);
      s.brand.source = personSource();
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {brand.source ? <SourceTag source={brand.source} /> : <p className="text-[13px] text-caution">These are starting placeholders. Choose the brand before approval.</p>}
        {editable && !brand.source ? (
          <Button size="xs" onClick={() => brandChange(() => undefined)}>
            Keep these
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {COLORS.map(({ key, label, optional }) => {
          const value = brand.colors[key] ?? "";
          return (
            <Field key={key} id={`brand-${key}`} label={label} hint={optional ? "Optional" : undefined}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="size-7 shrink-0 rounded border border-line" style={{ background: isHex(value) ? value : "transparent" }} />
                <TextInput
                  id={`brand-${key}`}
                  value={value}
                  placeholder="#000000"
                  maxLength={7}
                  disabled={!editable}
                  onChange={(e) =>
                    brandChange((s) => {
                      const next = e.target.value.trim();
                      if (optional && !next) delete s.brand.colors[key];
                      else s.brand.colors[key] = next;
                    })
                  }
                />
              </div>
            </Field>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4">
        <Contrast label="Text on background" a={brand.colors.text} b={brand.colors.background} minimum={CONTRAST_MINIMUM.text} />
        <Contrast label="Primary on background" a={brand.colors.primary} b={brand.colors.background} minimum={CONTRAST_MINIMUM.interface} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["heading", "body"] as const).map((role) => (
          <div key={role} className="contents">
            <Field id={`font-${role}`} label={role === "heading" ? "Heading font" : "Body font"}>
              <TextInput
                id={`font-${role}`}
                value={brand.typography[role].family}
                maxLength={60}
                disabled={!editable}
                onChange={(e) => brandChange((s) => void (s.brand.typography[role].family = e.target.value))}
              />
            </Field>
            <Field id={`weight-${role}`} label="Weight">
              <Select
                id={`weight-${role}`}
                value={brand.typography[role].weight}
                disabled={!editable}
                onChange={(e) => brandChange((s) => void (s.brand.typography[role].weight = Number(e.target.value)))}
              >
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="brand-scale" label="Type scale">
          <Select id="brand-scale" value={brand.typography.scale} disabled={!editable} onChange={(e) => brandChange((s) => void (s.brand.typography.scale = e.target.value as SiteSpec["brand"]["typography"]["scale"]))}>
            {TYPE_SCALES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="brand-radius" label="Corners">
          <Select id="brand-radius" value={brand.radius} disabled={!editable} onChange={(e) => brandChange((s) => void (s.brand.radius = e.target.value as SiteSpec["brand"]["radius"]))}>
            {RADII.map((v) => (
              <option key={v} value={v}>
                {v === "none" ? "Square" : v === "soft" ? "Slightly rounded" : "Round"}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="brand-density" label="Spacing">
          <Select id="brand-density" value={brand.density} disabled={!editable} onChange={(e) => brandChange((s) => void (s.brand.density = e.target.value as SiteSpec["brand"]["density"]))}>
            {DENSITIES.map((v) => (
              <option key={v} value={v}>
                {v === "compact" ? "Compact" : v === "regular" ? "Regular" : "Airy"}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );
}
