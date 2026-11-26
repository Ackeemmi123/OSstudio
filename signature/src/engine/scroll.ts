/**
 * Smooth scrolling with Lenis, kept in step with ScrollTrigger so scrubbed
 * scenes never lag a frame behind. It is a layer on native scrolling: the
 * scrollbar, keyboard, find-in-page and anchors keep working, touch keeps the
 * device's own feel, and nothing runs for visitors who asked for less motion.
 */
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger } from "./motion";

let lenis: Lenis | null = null;
const tick = (time: number) => lenis?.raf(time * 1000);

export function startSmoothScroll(): void {
  if (lenis) return;
  lenis = new Lenis({
    // Long enough to feel weighted, short enough that the page never feels slow to answer.
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    anchors: true,
    autoRaf: false,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  document.documentElement.dataset.sgSmooth = "on";
}

export function stopSmoothScroll(): void {
  if (!lenis) return;
  gsap.ticker.remove(tick);
  lenis.destroy();
  lenis = null;
  document.documentElement.dataset.sgSmooth = "off";
}
