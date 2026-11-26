import "../src/engine/engine.css";
import { boot } from "../src/engine";

// `?webgl` lets tests and demos run the shader on software WebGL; real visitors never need it.
const params = new URLSearchParams(location.search);
// `?quality=0|1|2` fixes the 3D quality instead of measuring, to compare the levels.
const quality = ["0", "1", "2"].includes(params.get("quality") ?? "") ? (Number(params.get("quality")) as 0 | 1 | 2) : undefined;
const capabilities = boot({ forceWebGL: params.has("webgl"), quality });

const html = document.documentElement;
const status = (key: string, text: string) => {
  const element = document.querySelector<HTMLElement>(`[data-sg-status="${key}"]`);
  if (element) element.textContent = text;
};

function render() {
  const motion = html.dataset.sgMotion === "on";
  status("motion", motion ? "På" : "Av, eftersom du har bett om mindre rörelse");
  status("smooth", html.dataset.sgSmooth === "on" ? "På" : motion ? "Startar när du börjar scrolla" : "Av, vanlig scroll");
  const live = document.querySelector('[data-sg="ink-field"]')?.classList.contains("is-live");
  const webgl = html.dataset.sgWebgl;
  if (webgl === "on") status("webgl", live ? "På: bläcket ritas av grafikkortet" : "På: startar strax");
  else if (webgl === "pending") status("webgl", "Startar när sidan har laddat");
  else if (!motion) status("webgl", "Av: stillbild, eftersom du har bett om mindre rörelse");
  else if (capabilities.saveData) status("webgl", "Av: stillbild, för att spara data");
  else status("webgl", "Av: stillbild, enheten saknar snabb grafik");
}

render();
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => requestAnimationFrame(render));
const field = document.querySelector('[data-sg="ink-field"]');
if (field) new MutationObserver(render).observe(field, { attributes: true, attributeFilter: ["class"] });
new MutationObserver(render).observe(html, { attributes: true, attributeFilter: ["data-sg-webgl", "data-sg-smooth", "data-sg-motion"] });
