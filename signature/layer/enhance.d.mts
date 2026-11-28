/** Types for `enhance.mjs`, the Signature layer's pure enhancer. */
export type PresetName = "calm" | "warm" | "editorial" | "bold";
export type ModuleName = "headline" | "rise" | "reveal" | "stack" | "cta" | "list" | "count";
export type Direction = "formal" | "editorial" | "statement" | "cafe" | "atelier" | "clinic";

export interface LayerRule {
  module: ModuleName;
  /** The site's own selector. */
  select: string;
  /** Apply only on pages where this selector matches something. */
  when?: string;
  /** Skip on pages where this selector matches something. */
  unless?: string;
  /** Selectors: `inner` (reveal), `end` (cta), `row` and `thumb` (list). */
  options?: Record<string, string>;
}

export interface LayerMap {
  name?: string;
  /** For preset "auto": the first entry whose selector matches the page decides. */
  presets?: { when: string; preset: PresetName }[];
  rules: LayerRule[];
  /** Per preset, tokens that replace the preset's own (see `src/layer/presets.ts`). */
  tokens?: Partial<Record<PresetName, Record<string, unknown>>>;
}

export interface SiteFile {
  path: string;
  text: string;
}

export interface LayerAsset {
  path: string;
  text: string;
  contentType: string;
}

export interface EnhanceOptions {
  preset: PresetName | "auto";
  map: "services" | "association" | LayerMap;
  /** Prefix for the injected addresses; left out, each page's relative way to the site's top ("./", "../"). */
  root?: string;
  /** The folder the layer's files go in. Default "signature". */
  dir?: string;
}

export interface EnhanceResult {
  /** The HTML files that changed, whole. */
  files: SiteFile[];
  /** The files to add to the site. */
  assets: LayerAsset[];
  /** The layer build these assets are from. */
  version: string;
}

export declare const PRESET_NAMES: PresetName[];
export declare const MODULE_NAMES: ModuleName[];
export declare const MAPS: { services: LayerMap; association: LayerMap };
/** Website Factory's directions and the preset each gets by default. */
export declare const DIRECTION_PRESETS: Record<Direction, PresetName>;
/** The preset every site of Website Factory's association system gets. */
export declare const ASSOCIATION_PRESET: PresetName;
export declare const VERSION: string;
export declare function presetForDirection(direction: string): PresetName;
export declare function enhanceSite(files: SiteFile[], options: EnhanceOptions): EnhanceResult;
