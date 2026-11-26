import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const [out, ...files] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage();
const data = files.map((f) => "data:image/png;base64," + readFileSync(f).toString("base64"));
const png = await p.evaluate(async (srcs) => {
  const imgs = await Promise.all(srcs.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
  const H = 520, gap = 8; const ws = imgs.map((i) => Math.round(i.naturalWidth * H / i.naturalHeight));
  const c = document.createElement("canvas"); c.width = ws.reduce((a, w) => a + w + gap, 0); c.height = H;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, H);
  let at = 0; imgs.forEach((i, k) => { x.drawImage(i, at, 0, ws[k], H); at += ws[k] + gap; });
  return c.toDataURL("image/png");
}, data);
writeFileSync(out, Buffer.from(png.split(",")[1], "base64"));
await b.close();
