// Pixel analysis with sharp + node-vibrant. No network and no server-only import, so scripts can test it offline.
import sharp from "sharp";
import { Vibrant } from "node-vibrant/node";
import { hexToRgb, rgbToHex, twoMeans, type Rgb } from "./color";

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

/** Dominant colours via node-vibrant on a downscaled copy. Share = swatch population / total population. */
export async function dominantColours(buffer: Buffer): Promise<DominantColour[]> {
  const small = await sharp(buffer).resize(256, 256, { fit: "inside" }).removeAlpha().png().toBuffer();
  const palette = await Vibrant.from(small).getPalette();
  const swatches = Object.values(palette).filter((s): s is NonNullable<typeof s> => !!s && s.population > 0);
  const total = swatches.reduce((n, s) => n + s.population, 0);
  if (!total) return [];
  return swatches
    .map((s) => ({ hex: s.hex.toUpperCase(), share: s.population / total }))
    .sort((a, b) => b.share - a.share);
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
          const { data, info } = await sharp(buffer)
            .extract({ left, top, width, height })
            .resize(96, 96, { fit: "inside" })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          const px: Rgb[] = [];
          for (let i = 0; i + 2 < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
          const res = twoMeans(px);
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
