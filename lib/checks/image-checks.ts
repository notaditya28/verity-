// Image checks (pure, no network): alt text (A-01), contrast (A-02), palette (V-01) and the text rules applied to
// text read from the image. Image findings have no text span: their fix is advice, except A-01, whose fix is the
// proposed alt text (applied to the next version's alt text when accepted).
import { contrastRatio, deltaE2000, hexToRgb } from "../images/color";
import { runDeterministicChecksWithUsages } from "./deterministic";
import { ruleEvidence } from "./format";
import type { Channel, CheckContext, DraftFinding, DraftUsage, EngineRule } from "./types";

export interface ImageFacts {
  altText: string | null;
  /** Model-written description, used to propose alt text. Null when the image could not be read. */
  description: string | null;
  colours: { hex: string; share: number }[];
  blocks: { text: string; textHex: string; backgroundHex: string; method: "measured" | "estimated" }[];
  /** No text boxes (confidential: the image wasn't read), so estimate contrast from the dominant colour pairs. */
  estimateContrast?: boolean;
}

const GENERIC_ALT = /^(image|img|photo|picture|banner|graphic|ad|untitled|screenshot)?\s*\d*$|\.(png|jpe?g|webp|gif)$/i;

function num(r: EngineRule, key: string, fallback: number) {
  const v = r.params[key];
  return typeof v === "number" ? v : fallback;
}

function finding(r: EngineRule, f: Partial<DraftFinding> & Pick<DraftFinding, "explanation">): DraftFinding {
  return {
    ruleCode: r.code,
    factCode: null,
    source: "rule",
    category: r.category,
    severity: r.severity,
    label: null,
    spanStart: null,
    spanEnd: null,
    quote: null,
    evidence: ruleEvidence(r),
    suggestedFix: null,
    confidence: 1,
    ...f,
  };
}

export function checkAltText(r: EngineRule, img: ImageFacts): DraftFinding[] {
  const alt = img.altText?.trim() ?? "";
  const proposed = img.description ? img.description.slice(0, 250) : null;
  if (!alt) {
    return [
      finding(r, {
        explanation: "The image has no alt text, so screen-reader users miss its message.",
        suggestedFix: proposed,
      }),
    ];
  }
  if (alt.length < 15 || GENERIC_ALT.test(alt)) {
    return [
      finding(r, {
        quote: alt,
        explanation: `The alt text “${alt}” is too short or generic to describe the image.`,
        suggestedFix: proposed,
      }),
    ];
  }
  return [];
}

/** How far below the minimum a measured contrast can be and still count as borderline (see test-images.ts). */
export const CONTRAST_TOLERANCE = 0.1;

export function checkContrast(r: EngineRule, img: ImageFacts, palette: { name: string; hex: string }[]): DraftFinding[] {
  const min = num(r, "minRatio", 4.5);
  const out: DraftFinding[] = [];
  for (const b of img.blocks) {
    const fg = hexToRgb(b.textHex);
    const bg = hexToRgb(b.backgroundHex);
    const ratio = contrastRatio(fg, bg);
    if (ratio >= min) continue;
    // Measurement of thin, anti-aliased text can read up to ~0.05 low, so a ratio just under the minimum is
    // reported as borderline (needs a human look) rather than as a hard failure.
    const borderline = b.method === "measured" && ratio >= min - CONTRAST_TOLERANCE;
    // Suggest the palette colour with the best contrast on this background.
    const best = palette
      .map((p) => ({ ...p, ratio: contrastRatio(hexToRgb(p.hex), bg) }))
      .sort((x, y) => y.ratio - x.ratio)[0];
    out.push(
      finding(r, {
        quote: b.text,
        ...(borderline ? { severity: "medium" as const, label: "needs_human_verification" as const } : {}),
        explanation: `Text in the image has a contrast ratio of ${ratio.toFixed(2)}:1 (${b.textHex} on ${b.backgroundHex}, ${
          b.method === "measured" ? "measured from the pixels" : "estimated by the image reader"
        }). It needs at least ${min}:1.${borderline ? ` This is within the ${CONTRAST_TOLERANCE} measurement tolerance, so check it by eye.` : ""}`,
        suggestedFix: best
          ? best.ratio >= min
            ? `In the image, set “${b.text}” in ${best.name} (${best.hex}), which gives ${best.ratio.toFixed(2)}:1 on this background.`
            : `In the image, change the background behind “${b.text}” to a palette colour. No palette colour reaches ${min}:1 on ${b.backgroundHex}.`
          : `Raise the contrast of “${b.text}” to at least ${min}:1.`,
        confidence: borderline ? 0.6 : b.method === "measured" ? 0.95 : 0.7,
      }),
    );
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Offline contrast estimate for images whose text wasn't read (confidential mode): the most dominant colour is taken as
 * the background and every other colour covering ≥ 1% as possible text. Pairs below the minimum are flagged as
 * "needs human verification" at medium severity, because we can't tell which colours are text.
 */
export function checkContrastEstimate(r: EngineRule, img: ImageFacts): DraftFinding[] {
  const min = num(r, "minRatio", 4.5);
  const [bg, ...rest] = img.colours;
  if (!bg) return [];
  const out: DraftFinding[] = [];
  for (const c of rest) {
    if (c.share < 0.01) continue;
    const ratio = contrastRatio(hexToRgb(c.hex), hexToRgb(bg.hex));
    if (ratio >= min) continue;
    out.push(
      finding(r, {
        severity: "medium",
        label: "needs_human_verification",
        explanation: `Estimated without reading the image (confidential): if ${c.hex} is used for text on the ${bg.hex} background, the contrast is ${ratio.toFixed(2)}:1, below ${min}:1. Check the text colours by eye.`,
        suggestedFix: `If ${c.hex} is text, change it or the background so the ratio reaches ${min}:1.`,
        confidence: 0.5,
      }),
    );
    if (out.length >= 2) break;
  }
  return out;
}

export function checkPalette(r: EngineRule, img: ImageFacts, palette: { name: string; hex: string }[]): DraftFinding[] {
  if (!palette.length) return [];
  const maxDe = num(r, "maxDeltaE", 12);
  const minShare = num(r, "minShare", 0.08);
  const reported: string[] = [];
  const out: DraftFinding[] = [];
  for (const c of img.colours) {
    if (c.share < minShare) continue;
    const rgb = hexToRgb(c.hex);
    const nearest = palette.map((p) => ({ ...p, de: deltaE2000(rgb, hexToRgb(p.hex)) })).sort((x, y) => x.de - y.de)[0];
    if (nearest.de <= maxDe) continue;
    // Don't report two near-identical off-palette colours.
    if (reported.some((h) => deltaE2000(rgb, hexToRgb(h)) < maxDe)) continue;
    reported.push(c.hex);
    out.push(
      finding(r, {
        explanation: `${c.hex} covers about ${Math.round(c.share * 100)}% of the image and is not a brand colour. The nearest palette colour is ${nearest.name} (${nearest.hex}), ΔE2000 ${nearest.de.toFixed(1)}, above the limit of ${maxDe}.`,
        suggestedFix: `Replace ${c.hex} in the image with ${nearest.name} (${nearest.hex}) or another palette colour.`,
      }),
    );
    if (out.length >= 3) break;
  }
  return out;
}

/** Text rules applied to text read from the image. Whole-post rules (disclosure, readability) stay on the body text. */
const BODY_ONLY_RULES = new Set(["ASCI-01", "A-03"]);

export function imageTextFindings(extractedText: string, channel: Channel, ctx: CheckContext): DraftFinding[] {
  return imageTextCheck(extractedText, channel, ctx).findings;
}

/** Image-text findings plus the facts the image text relies on (spans are offsets in the extracted text). */
export function imageTextCheck(extractedText: string, channel: Channel, ctx: CheckContext): { findings: DraftFinding[]; usages: DraftUsage[] } {
  if (!extractedText.trim()) return { findings: [], usages: [] };
  // Line breaks in an image are layout, not sentence ends: "Lumina Vitamin C Serum" / "now just ₹399" is one
  // message. Joining lines lets a price match the product named on the line above. Same length, so quotes match.
  const asText = extractedText.replace(/\n/g, " ");
  const { findings: raw, usages } = runDeterministicChecksWithUsages({ text: asText, channel }, ctx);
  const findings = raw
    .filter((f) => !f.ruleCode || !BODY_ONLY_RULES.has(f.ruleCode))
    .map((f) => {
      const q = f.quote ?? "";
      let fix: string | null = null;
      if (f.suggestedFix !== null && f.spanStart !== null && f.spanEnd !== null) {
        if (f.spanStart === f.spanEnd) fix = `In the image, add “${f.suggestedFix.trim()}”.`;
        else if (f.suggestedFix === "") fix = `In the image, remove “${q}”.`;
        else fix = `In the image, change “${q}” to “${f.suggestedFix}”.`;
      } else if (f.suggestedFix) fix = f.suggestedFix;
      return { ...f, spanStart: null, spanEnd: null, explanation: `In the image: ${f.explanation}`, suggestedFix: fix };
    });
  return { findings, usages };
}

export function runImageChecks(img: ImageFacts, ctx: CheckContext, palette: { name: string; hex: string }[]): DraftFinding[] {
  const active = new Map(ctx.rules.filter((r) => r.active).map((r) => [r.code, r]));
  const out: DraftFinding[] = [];
  const a01 = active.get("A-01");
  const a02 = active.get("A-02");
  const v01 = active.get("V-01");
  if (a01) out.push(...checkAltText(a01, img));
  if (a02) out.push(...(img.estimateContrast && !img.blocks.length ? checkContrastEstimate(a02, img) : checkContrast(a02, img, palette)));
  if (v01) out.push(...checkPalette(v01, img, palette));
  return out;
}
