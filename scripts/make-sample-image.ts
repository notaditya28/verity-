// Generates public/samples/festive-ad.png for sample 4: an off-palette orange banner with low-contrast yellow
// text and a wrong price (₹399; the Fact Registry says ₹449). Usage: npx tsx scripts/make-sample-image.ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const W = 800;
const H = 800;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#F28C28"/>
  <circle cx="680" cy="120" r="90" fill="#F6A04D"/>
  <circle cx="110" cy="700" r="70" fill="#F6A04D"/>
  <text x="400" y="230" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="700" fill="#FFD23F">Festive Glow Sale</text>
  <text x="400" y="370" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" fill="#FFE9A8">Lumina Vitamin C Serum</text>
  <text x="400" y="470" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#FFD23F">now just ₹399</text>
  <rect x="270" y="560" width="260" height="84" rx="42" fill="#0E7C7B"/>
  <text x="400" y="616" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF">Shop now</text>
</svg>`;

async function main() {
  const out = path.join(process.cwd(), "public", "samples", "festive-ad.png");
  mkdirSync(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(out);
  console.log("wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
