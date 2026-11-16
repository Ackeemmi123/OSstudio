import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { build } from "../../design-systems/association";

/**
 * Builds each real client's site from the website spec saved from Studio OS.
 * Client material stays in git-ignored proof/concepts/<client>: spec.json (the
 * spec as Studio OS holds it), site.json (files behind images and documents,
 * and whether it is a prototype) and the files themselves.
 *
 *   npx vitest run -c vitest.proof.config.mts proof/clients/build.render.ts
 *
 * Writes proof/out/clients/<client>. Clients without a spec.json are skipped.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const material = path.join(here, "../concepts");

it("builds every client site that has a saved spec", () => {
  const clients = existsSync(material) ? readdirSync(material).filter((name) => existsSync(path.join(material, name, "spec.json"))) : [];
  for (const name of clients) {
    const folder = path.join(material, name);
    const spec = JSON.parse(readFileSync(path.join(folder, "spec.json"), "utf8"));
    const site = JSON.parse(readFileSync(path.join(folder, "site.json"), "utf8"));
    const files = build(spec, { files: site.files, documents: site.documents, smallLogo: site.smallLogo, status: site.status, today: new Date() });
    const out = path.join(here, "../out/clients", name);
    rmSync(out, { recursive: true, force: true });
    for (const file of files) {
      mkdirSync(path.dirname(path.join(out, file.path)), { recursive: true });
      writeFileSync(path.join(out, file.path), file.text);
    }
    for (const file of [...Object.values(site.files as Record<string, string>), ...Object.values((site.documents ?? {}) as Record<string, string>)]) {
      const source = path.join(folder, file);
      if (!existsSync(source)) throw new Error(`${name}: missing ${file}`);
      mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
      copyFileSync(source, path.join(out, file));
    }
  }
});
