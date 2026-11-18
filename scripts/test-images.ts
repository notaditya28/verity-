// Offline checks for the image pipeline (no Gemini, no database): colour maths, palette and contrast on the real
// sample image, and the text rules on the text it contains. The text blocks below stand in for what Gemini vision
// returns. Usage: npx tsx scripts/test-images.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio, deltaE2000, hexToRgb } from "../lib/images/color";
import { dominantColours, measureTextBlocks } from "../lib/images/pixels";
import { checkAltText, imageTextFindings, runImageChecks } from "../lib/checks/image-checks";
import { SEED_FACTS, SEED_PALETTE, SEED_RULES, SEED_TERMS } from "../lib/demo/seed-data";

const ctx = {
  rules: SEED_RULES.map((r) => ({ ...r, params: r.params ?? {}, active: true })),
  terms: SEED_TERMS,
  facts: SEED_FACTS,
  today: "2026-11-16",
};

async function main() {
  // WCAG contrast reference values.
  assert.equal(contrastRatio(hexToRgb("#000000"), hexToRgb("#FFFFFF")).toFixed(1), "21.0");
  assert.equal(contrastRatio(hexToRgb("#777777"), hexToRgb("#FFFFFF")).toFixed(2), "4.48");
  // CIEDE2000: identical = 0, symmetric, and a known pair (Sharma et al. test data, pair 1 converted to sRGB is not
  // exact, so check order of magnitude on clearly different and clearly similar colours instead).
  assert.equal(deltaE2000(hexToRgb("#0E7C7B"), hexToRgb("#0E7C7B")), 0);
  const a = deltaE2000(hexToRgb("#F28C28"), hexToRgb("#C9A227"));
  assert.ok(Math.abs(a - deltaE2000(hexToRgb("#C9A227"), hexToRgb("#F28C28"))) < 1e-9);
  assert.ok(a > 12, `orange vs Soft Gold should be off-palette, got ${a}`);
  assert.ok(deltaE2000(hexToRgb("#0E7C7B"), hexToRgb("#107E7D")) < 2);

  const buf = readFileSync(path.join(process.cwd(), "public", "samples", "festive-ad.png"));
  const colours = await dominantColours(buf);
  console.log("dominant colours:", colours.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join(", "));

  // Boxes as Gemini would return them ([ymin, xmin, ymax, xmax] on a 0–1000 scale) for the 800×800 sample.
  const blocks = await measureTextBlocks(buf, [
    { text: "Festive Glow Sale", box: [200, 50, 300, 950], text_color: "#FFD23F", background_color: "#F28C28" },
    { text: "now just ₹399", box: [530, 230, 610, 770], text_color: "#FFD23F", background_color: "#F28C28" },
    { text: "Shop now", box: [715, 370, 785, 630], text_color: "#FFFFFF", background_color: "#0E7C7B" },
  ]);
  for (const b of blocks) {
    console.log(`  ${b.text}: ${b.textHex} on ${b.backgroundHex} (${b.method}) → ${contrastRatio(hexToRgb(b.textHex), hexToRgb(b.backgroundHex)).toFixed(2)}:1`);
  }

  const extracted = "Festive Glow Sale\nLumina Vitamin C Serum\nnow just ₹399\nShop now";
  const image = runImageChecks({ altText: null, description: "Orange festive banner for Lumina Vitamin C Serum.", colours, blocks }, ctx, SEED_PALETTE);
  const text = imageTextFindings(extracted, "ad", ctx);
  for (const f of [...image, ...text]) console.log(`  [${f.severity}] ${f.ruleCode}${f.factCode ? "/" + f.factCode : ""} ${f.explanation.slice(0, 110)}`);

  assert.ok(image.some((f) => f.ruleCode === "A-01"), "missing alt text should be flagged");
  assert.ok(image.some((f) => f.ruleCode === "V-01"), "orange background should be off-palette");
  const contrast = image.filter((f) => f.ruleCode === "A-02");
  assert.ok(contrast.some((f) => f.quote === "Festive Glow Sale"), "yellow on orange should fail contrast");
  assert.ok(!contrast.some((f) => f.quote === "Shop now"), "white on teal should pass contrast");
  assert.ok(
    text.some((f) => f.ruleCode === "C-03" && f.factCode === "F-12" && f.label === "contradicted"),
    "₹399 on the line below the product name should contradict F-12",
  );
  assert.ok(text.every((f) => f.spanStart === null), "image findings have no text span");

  // A loose box around the whole "Shop now" button (as gemini-3.5-flash-lite returned it) includes orange corners;
  // the text must still be measured as white on teal (passes), not a white/orange blend (false failure).
  const [loose] = await measureTextBlocks(buf, [{ text: "Shop now", box: [696, 335, 807, 665], text_color: "#FFFFFF", background_color: "#0E7C7B" }]);
  const looseRatio = contrastRatio(hexToRgb(loose.textHex), hexToRgb(loose.backgroundHex));
  console.log(`  loose Shop now box: ${loose.textHex} on ${loose.backgroundHex} → ${looseRatio.toFixed(2)}:1`);
  assert.ok(looseRatio >= 4.5, `loose button box should still pass, got ${looseRatio.toFixed(2)}`);

  // Alt text: good alt passes, generic alt fails.
  const a01 = ctx.rules.find((r) => r.code === "A-01")!;
  assert.equal(checkAltText(a01, { altText: "Orange banner announcing the festive sale of Lumina Vitamin C Serum", description: null, colours: [], blocks: [] }).length, 0);
  assert.equal(checkAltText(a01, { altText: "banner.png", description: null, colours: [], blocks: [] }).length, 1);

  console.log("images: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
