import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { build, FONT_FILES } from "../design-systems/services";
import { SITES } from "./sites";
import { STRESS_SITES } from "./sites/stress";

/**
 * Writes each invented firm's site to proof/out/<name>, as a hosting service
 * would receive it. Run with `npm run proof:build`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

function write(name: string, files: ReturnType<typeof build>) {
  const out = path.join(here, "out", name);
  rmSync(out, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(out, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.text);
  }
  mkdirSync(path.join(out, "fonts"), { recursive: true });
  for (const font of FONT_FILES) copyFileSync(path.join(here, "../design-systems/services/fonts", font), path.join(out, "fonts", font));
}

it("builds every site", () => {
  for (const [name, { site, brief }] of Object.entries(SITES)) {
    write(name, build(site));
    writeFileSync(path.join(here, "out", `${name}.facts.json`), JSON.stringify(brief.confirmedFacts));
  }
  for (const [name, site] of Object.entries(STRESS_SITES)) write(`stress-${name}`, build(site));
});
