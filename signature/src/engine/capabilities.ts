/**
 * What this visitor's device and settings allow. Every effect asks here first,
 * so a visitor who asked for less motion, saves data, or has a weak device
 * gets the same content without what they cannot use.
 */

export interface Capabilities {
  /** The visitor asked their system for less motion. */
  reducedMotion: boolean;
  /** The visitor asked their browser to save data. */
  saveData: boolean;
  /** Few cores or little memory: effects run lighter. */
  lowPower: boolean;
  /** WebGL is worth trying (motion welcome, data not saved). Whether the hardware is good is learnt when a shader starts. */
  webgl: boolean;
  /** A mouse or trackpad, not only touch. */
  finePointer: boolean;
}

export interface CapabilityOptions {
  /** Treat software WebGL as good enough. For tests and demos only. */
  forceWebGL?: boolean;
}

/** Renderers that draw on the CPU: SwiftShader (Chrome), llvmpipe and softpipe (Mesa), Microsoft's basic driver. */
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

const REDUCED = "(prefers-reduced-motion: reduce)";

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/**
 * What the device and the visitor's settings allow. Cheap: it creates no
 * WebGL context (that costs a tenth of a second on a phone); a shader checks
 * the real hardware when it starts.
 */
export function readCapabilities(): Capabilities {
  const hints = navigator as Navigator & NavigatorHints;
  const cores = navigator.hardwareConcurrency || 8;
  const memory = hints.deviceMemory ?? 8;
  return {
    reducedMotion: matchMedia(REDUCED).matches,
    saveData: hints.connection?.saveData === true,
    lowPower: cores <= 4 || memory <= 4,
    webgl: !matchMedia(REDUCED).matches && hints.connection?.saveData !== true,
    finePointer: matchMedia("(pointer: fine)").matches,
  };
}

/** Calls back whenever the visitor turns reduced motion on or off, and returns how to stop listening. */
export function onReducedMotionChange(callback: (reduced: boolean) => void): () => void {
  const query = matchMedia(REDUCED);
  const listener = (event: MediaQueryListEvent) => callback(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
