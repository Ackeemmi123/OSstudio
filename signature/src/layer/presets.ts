/**
 * The Signature layer's presets: how motion feels in an industry, as tokens.
 * A preset says which modules a site may use at all, and how long, how far
 * and on which curve things move. The layer writes them to the page as CSS
 * custom properties (`--sgl-*`), and layer.css animates with them.
 *
 * calm      law, clinics, experts: lines and blocks that rise a little and
 *           slowly. Nothing follows the pointer, nothing floats, and the page
 *           scrolls exactly as the browser scrolls it.
 * warm      cafés, restaurants: words that settle one by one with a slight
 *           turn, pictures that open from below, a soft overshoot.
 * editorial interior, architecture, studios: lines that rise out of masks,
 *           pictures unveiled slowly while they settle in their frames, lists
 *           with pictures under the pointer, stacked steps.
 * bold      statement brands: words that come up fast from their masks,
 *           pictures wiped in from the side, short and decided.
 */
export type ModuleName = "headline" | "rise" | "reveal" | "stack" | "cta" | "list" | "count" | "smooth";
export type PresetName = "calm" | "warm" | "editorial" | "bold";

export interface Preset {
  /** The modules this preset allows; rules for any other module are skipped. */
  modules: ModuleName[];
  headline: {
    /** Whether lines or single words arrive one after the other. */
    by: "line" | "word";
    /** Whether each word rises out of a mask (its own box), or simply fades up. */
    mask: boolean;
    /** How far below it starts (a CSS length; with a mask, 110% is "wholly hidden"). */
    y: string;
    /** A slight turn at the start, in degrees. */
    rotate: number;
    /** Starting opacity. */
    opacity: number;
    duration: number;
    /** Milliseconds between lines or words. */
    stagger: number;
    ease: string;
  };
  rise: { y: string; opacity: number; duration: number; stagger: number; ease: string };
  reveal: {
    /** The clip the picture's frame starts from (`none` for a plain fade). */
    clip: string;
    opacity: number;
    /** The picture starts this much larger inside its frame, and settles. */
    scale: number;
    duration: number;
    /** The picture keeps settling a little longer than its frame opens. */
    settle: number;
    ease: string;
  };
  /** Smooth scrolling: the seconds one wheel notch takes to land, or false for the browser's own. */
  smooth: number | false;
  /** How long a figure counts, in milliseconds. */
  count: number;
}

const OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export const PRESETS: Record<PresetName, Preset> = {
  calm: {
    modules: ["headline", "rise", "reveal"],
    headline: { by: "line", mask: false, y: "0.3em", rotate: 0, opacity: 0, duration: 1000, stagger: 110, ease: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    rise: { y: "0.6rem", opacity: 0, duration: 800, stagger: 60, ease: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    reveal: { clip: "none", opacity: 0, scale: 1.04, duration: 1200, settle: 1800, ease: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    smooth: false,
    count: 0,
  },
  warm: {
    modules: ["headline", "rise", "reveal", "cta", "count", "smooth"],
    headline: { by: "word", mask: false, y: "0.55em", rotate: -5, opacity: 0, duration: 900, stagger: 55, ease: "cubic-bezier(0.34, 1.45, 0.64, 1)" },
    rise: { y: "1.4rem", opacity: 0, duration: 800, stagger: 70, ease: "cubic-bezier(0.3, 1.25, 0.5, 1)" },
    reveal: { clip: "inset(100% 0 0 0)", opacity: 1, scale: 1.14, duration: 1100, settle: 1500, ease: "cubic-bezier(0.5, 0, 0.1, 1)" },
    smooth: 0.9,
    count: 1600,
  },
  editorial: {
    modules: ["headline", "rise", "reveal", "stack", "cta", "list", "count", "smooth"],
    headline: { by: "line", mask: true, y: "110%", rotate: 0, opacity: 1, duration: 1500, stagger: 120, ease: OUT },
    rise: { y: "1.6rem", opacity: 0, duration: 1300, stagger: 110, ease: OUT },
    reveal: { clip: "inset(0 0 100% 0)", opacity: 1, scale: 1.22, duration: 1600, settle: 2400, ease: "cubic-bezier(0.7, 0, 0.15, 1)" },
    smooth: 1.15,
    count: 2200,
  },
  bold: {
    modules: ["headline", "rise", "reveal", "stack", "cta", "list", "count", "smooth"],
    headline: { by: "word", mask: true, y: "110%", rotate: 4, opacity: 1, duration: 750, stagger: 38, ease: "cubic-bezier(0.2, 0.9, 0.1, 1)" },
    rise: { y: "2.2rem", opacity: 0, duration: 600, stagger: 55, ease: "cubic-bezier(0.2, 0.9, 0.1, 1)" },
    reveal: { clip: "inset(0 100% 0 0)", opacity: 1, scale: 1.3, duration: 800, settle: 1200, ease: "cubic-bezier(0.75, 0, 0.15, 1)" },
    smooth: 0.85,
    count: 1400,
  },
};
