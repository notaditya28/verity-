// Removes personal data before any text is sent to an LLM. The deterministic checks run on the original text.
const PATTERNS: { type: string; re: RegExp; token: string }[] = [
  { type: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, token: "[EMAIL]" },
  { type: "phone", re: /(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, token: "[PHONE]" },
  { type: "aadhaar", re: /(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/g, token: "[ID]" },
  { type: "pan", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, token: "[ID]" },
];

export interface RedactionResult {
  text: string;
  redactions: { type: string; count: number }[];
}

export function redact(input: string): RedactionResult {
  let text = input;
  const redactions: { type: string; count: number }[] = [];
  for (const p of PATTERNS) {
    let count = 0;
    text = text.replace(p.re, () => {
      count++;
      return p.token;
    });
    if (count) redactions.push({ type: p.type, count });
  }
  return { text, redactions };
}
