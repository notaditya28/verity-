// Pure colour maths: hex/RGB/Lab conversion, CIEDE2000 colour difference and WCAG 2.1 contrast.
export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function srgbToLinear(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB → CIE L*a*b* (D65). */
export function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005). */
export function deltaE2000(rgb1: Rgb, rgb2: Rgb): number {
  const [L1, a1, b1] = rgbToLab(rgb1);
  const [L2, a2, b2] = rgbToLab(rgb2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

const d2 = (p: Rgb, q: Rgb) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

/**
 * Finds the text and background colours in a crop around a text block.
 * k-means with k = 3 (seeded with the darkest pixel, the lightest pixel and the pixel furthest from both):
 * the largest cluster is the background; of the other clusters covering ≥ 3% of the crop, the text is the one with
 * the highest contrast against the background. A third cluster absorbs anti-aliasing or shapes that a loose box
 * catches (e.g. the corners of a button), so they don't get blended into the text colour.
 */
export function textColours(pixels: Rgb[], iterations = 10): { background: Rgb; foreground: Rgb; foregroundShare: number } | null {
  if (pixels.length < 6) return null;
  let dark = pixels[0];
  let light = pixels[0];
  for (const p of pixels) {
    if (luminance(p) < luminance(dark)) dark = p;
    if (luminance(p) > luminance(light)) light = p;
  }
  let third = pixels[0];
  let best = -1;
  for (const p of pixels) {
    const d = Math.min(d2(p, dark), d2(p, light));
    if (d > best) {
      best = d;
      third = p;
    }
  }
  const K = 3;
  let c: Rgb[] = [dark, light, third];
  let assign = new Array<number>(pixels.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    assign = pixels.map((p) => {
      let k = 0;
      for (let j = 1; j < K; j++) if (d2(p, c[j]) < d2(p, c[k])) k = j;
      return k;
    });
    const sums = Array.from({ length: K }, () => [0, 0, 0, 0]);
    pixels.forEach((p, i) => {
      const s = sums[assign[i]];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    });
    c = c.map((old, k) => (sums[k][3] ? ([sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]] as Rgb) : old));
  }
  const counts = c.map((_, k) => assign.filter((a) => a === k).length);
  const bgIdx = counts.indexOf(Math.max(...counts));
  const bg = c[bgIdx];
  const candidates = c
    .map((col, k) => ({ k, col, share: counts[k] / pixels.length }))
    .filter((x) => x.k !== bgIdx && x.share >= 0.03);
  if (!candidates.length) return null;
  const text = candidates.sort((x, y) => contrastRatio(y.col, bg) - contrastRatio(x.col, bg))[0];
  // Anti-aliased glyph edges pull the text centroid towards the background, so use the half of the text pixels
  // furthest from the background (the solid glyph cores). This avoids understating the contrast.
  const fgPixels = pixels.filter((_, i) => assign[i] === text.k).sort((p, q) => d2(q, bg) - d2(p, bg));
  const core = fgPixels.slice(0, Math.max(1, Math.ceil(fgPixels.length / 2)));
  const fg = core.reduce<Rgb>((s, p) => [s[0] + p[0] / core.length, s[1] + p[1] / core.length, s[2] + p[2] / core.length], [0, 0, 0]);
  return { background: bg, foreground: fg, foregroundShare: text.share };
}
