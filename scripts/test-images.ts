// Offline checks for the image pipeline (no Gemini, no database): colour maths, palette and contrast on the real
// sample image, and the text rules on the text it contains. The text blocks below stand in for what Gemini vision
// returns. Usage: npx tsx scripts/test-images.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { contrastRatio, deltaE2000, hexToRgb } from "../lib/images/color";
import { dominantColours, measureTextBlocks } from "../lib/images/pixels";
import sharp from "sharp";
import { checkAltText, CONTRAST_TOLERANCE, imageTextFindings, runImageChecks } from "../lib/checks/image-checks";
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

  // Regression (Round 3): a compliant banner in brand colours on a light background. node-vibrant ignored the
  // ivory background (it filters near-white) and flagged anti-aliased blends as off-palette; text crops squeezed
  // into 96×96 under-measured contrast. Both must now pass cleanly.
  const compliantSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#F7F3EA"/>
<text x="400" y="230" text-anchor="middle" font-family="Arial" font-size="84" font-weight="700" fill="#2B2B2B">Festive Glow Sale</text>
<text x="400" y="370" text-anchor="middle" font-family="Arial" font-size="52" font-weight="700" fill="#0E7C7B">Lumina Vitamin C Serum</text>
<rect x="270" y="560" width="260" height="84" rx="42" fill="#0E7C7B"/><text x="400" y="616" text-anchor="middle" font-family="Arial" font-size="38" font-weight="700" fill="#FFFFFF">Shop now</text></svg>`;
  const compliant = await sharp(Buffer.from(compliantSvg)).png().toBuffer();
  const cc = await dominantColours(compliant);
  assert.equal(cc[0].hex, "#F7F3EA", "the ivory background is the dominant colour");
  assert.ok(cc[0].share > 0.8, `background share should be > 80%, got ${cc[0].share}`);
  const cb = await measureTextBlocks(compliant, [
    { text: "Festive Glow Sale", box: [200, 50, 300, 950], text_color: "#000000", background_color: "#FFFFFF" },
    { text: "Lumina Vitamin C Serum", box: [400, 100, 480, 900], text_color: "#000000", background_color: "#FFFFFF" },
    { text: "Shop now", box: [696, 335, 807, 665], text_color: "#000000", background_color: "#FFFFFF" },
  ]);
  const clean = runImageChecks({ altText: "Ivory festive sale banner for the Lumina Vitamin C Serum", description: null, colours: cc, blocks: cb }, ctx, SEED_PALETTE);
  assert.equal(clean.length, 0, `compliant banner should have no findings, got ${clean.map((f) => f.ruleCode).join(",")}`);

  // Measured contrast stays within the stated tolerance of the true value for large and small text.
  for (const [fg, bg2] of [["#0E7C7B", "#F7F3EA"], ["#767676", "#FFFFFF"], ["#FFD23F", "#F28C28"], ["#2B2B2B", "#F7F3EA"]]) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="${bg2}"/>
<text x="400" y="370" text-anchor="middle" font-family="Arial" font-size="52" font-weight="700" fill="${fg}">Lumina Vitamin C Serum</text>
<text x="400" y="470" text-anchor="middle" font-family="Arial" font-size="22" fill="${fg}">small regular text for a thin-stroke test</text></svg>`;
    const b2 = await sharp(Buffer.from(s)).png().toBuffer();
    const [big, small] = await measureTextBlocks(b2, [
      { text: "big", box: [400, 100, 480, 900], text_color: "#000000", background_color: "#FFFFFF" },
      { text: "small", box: [565, 150, 600, 850], text_color: "#000000", background_color: "#FFFFFF" },
    ]);
    const truth = contrastRatio(hexToRgb(fg), hexToRgb(bg2));
    for (const m of [big, small]) {
      const got = contrastRatio(hexToRgb(m.textHex), hexToRgb(m.backgroundHex));
      // Near the 4.5 threshold the absolute error must be within the tolerance; far from it, within 2%. Same verdict.
      assert.ok(Math.abs(got - truth) <= Math.max(CONTRAST_TOLERANCE, 0.02 * truth), `${fg} on ${bg2} (${m.text}): measured ${got.toFixed(2)}, true ${truth.toFixed(2)}`);
      if (Math.abs(truth - 4.5) > CONTRAST_TOLERANCE) assert.equal(got >= 4.5, truth >= 4.5, `${fg} on ${bg2} (${m.text}): verdict differs`);
    }
  }
  console.log("  compliant banner: no findings; measured contrast within ±" + CONTRAST_TOLERANCE + " (or 2%) of the true value, same verdict, for large and small text");

  console.log("images: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
