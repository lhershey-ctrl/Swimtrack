import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

const DIR = "../Data/";
const file = process.argv[2];
const maxPages = +(process.argv[3] || 1);

async function dump(path) {
  const data = new Uint8Array(readFileSync(DIR + path));
  const pdf = await getDocument({ data }).promise;
  console.log("=== " + path + " · pages:", pdf.numPages, "===");
  for (let p = 1; p <= Math.min(maxPages, pdf.numPages); p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = {};
    tc.items.forEach((it) => {
      if (!it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
    });
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a); // top to bottom
    console.log("--- page " + p + " (" + ys.length + " rows) ---");
    ys.forEach((y) => {
      // sort by x ascending; show x of first token to reveal columns
      const cells = rows[y].sort((a, b) => a.x - b.x);
      const line = cells.map((c) => Math.round(c.x) + ":" + c.s).join(" | ");
      console.log(line);
    });
  }
}
dump(file).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
