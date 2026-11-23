// Pixel analysis with sharp. No network and no server-only import, so scripts can test it offline.
import sharp from "sharp";
import { deltaE2000, hexToRgb, rgbToHex, textColours, type Rgb } from "./color";

/** A text block as reported by the image reader: box is [ymin, xmin, ymax, xmax] normalised to 0–1000. */
export interface TextBlockInput {
  text: string;
  box: number[];
  text_color: string;
  background_color: string;
}

export interface DominantColour {
  hex: string;
  share: number;
}

/**
 * Dominant colours by true pixel share: downscale, bucket every pixel (4 bits per channel), then merge buckets
 * that look the same (CIEDE2000 < 8) into clusters, weighted by pixel count. A colour's share is the real
 * fraction of the image it covers, so a white or ivory background counts, and anti-aliased edge blends stay small.
 */
export async function dominantColours(buffer: Buffer, max = 6): Promise<DominantColour[]> {
  const { data, info } = await sharp(buffer).resize(160, 160, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
    total++;
  }
  if (!total) return [];
  const clusters: { n: number; r: number; g: number; b: number; rep: Rgb }[] = [];
  for (const e of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb: Rgb = [e.r / e.n, e.g / e.n, e.b / e.n];
    const c = clusters.find((x) => deltaE2000(x.rep, rgb) < 8);
    if (c) {
      c.n += e.n;
      c.r += e.r;
      c.g += e.g;
      c.b += e.b;
    } else clusters.push({ ...e, rep: rgb });
  }
  return clusters
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => ({ hex: rgbToHex([c.r / c.n, c.g / c.n, c.b / c.n]), share: c.n / total }));
}

export interface MeasuredBlock {
  text: string;
  textHex: string;
  backgroundHex: string;
  /** "measured" = clustered from the pixels inside the box; "estimated" = the model's colour estimate. */
  method: "measured" | "estimated";
}

/** Measures text and background colours inside each text block's box (k-means, k = 2, on the crop). */
export async function measureTextBlocks(buffer: Buffer, blocks: TextBlockInput[]): Promise<MeasuredBlock[]> {
  const meta = await sharp(buffer).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const out: MeasuredBlock[] = [];
  for (const b of blocks.slice(0, 6)) {
    if (!b.text.trim()) continue;
    let measured: { background: Rgb; foreground: Rgb } | null = null;
    if (b.box.length === 4 && W && H) {
      const [ymin, xmin, ymax, xmax] = b.box.map((v) => Math.max(0, Math.min(1000, v)));
      const left = Math.floor((xmin / 1000) * W);
      const top = Math.floor((ymin / 1000) * H);
      const width = Math.min(W - left, Math.ceil(((xmax - xmin) / 1000) * W));
      const height = Math.min(H - top, Math.ceil(((ymax - ymin) / 1000) * H));
      if (width >= 4 && height >= 4) {
        try {
          // Downscale by area (≈40k pixels max), not into a square: a wide, short text line squeezed into 96×96
          // would blur its strokes into the background and understate the contrast.
          const scale = Math.min(1, Math.sqrt(40_000 / (width * height)));
          const { data, info } = await sharp(buffer)
            .extract({ left, top, width, height })
            .resize(Math.max(4, Math.round(width * scale)), Math.max(4, Math.round(height * scale)), { fit: "fill", kernel: "nearest" })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          const px: Rgb[] = [];
          for (let i = 0; i + 2 < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
          const res = textColours(px);
          // Need a real second cluster (the glyphs) for the measurement to mean anything.
          if (res && res.foregroundShare >= 0.03) measured = res;
        } catch {
          measured = null;
        }
      }
    }
    out.push(
      measured
        ? { text: b.text, textHex: rgbToHex(measured.foreground), backgroundHex: rgbToHex(measured.background), method: "measured" }
        : { text: b.text, textHex: rgbToHex(hexToRgb(b.text_color)), backgroundHex: rgbToHex(hexToRgb(b.background_color)), method: "estimated" },
    );
  }
  return out;
}
