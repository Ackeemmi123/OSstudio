/**
 * Smooth scrolling for the layer: Lenis alone, on its own frame loop (about
 * 5 KB compressed, where the engine's version also brings GSAP to keep
 * scrubbed scenes in step, which the layer does not have). It is a layer on
 * native scrolling: the scrollbar, keyboard, find-in-page and anchors keep
 * working, touch keeps the device's own feel, and boxes that scroll on their
 * own (a long form field, a map) keep their own scrolling.
 */
import Lenis from "lenis";

export function startSmooth(seconds: number): () => void {
  const lenis = new Lenis({
    duration: seconds,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    anchors: true,
    autoRaf: true,
    allowNestedScroll: true,
  });
  document.documentElement.dataset.sgSmooth = "on";
  return () => {
    lenis.destroy();
    document.documentElement.dataset.sgSmooth = "off";
  };
}
