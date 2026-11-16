// Fictional demo brand "Lumina Skin". Not a real company; all data is invented.

type Category = "tone" | "terminology" | "claims" | "accessibility" | "visual" | "asci" | "messaging";
type Severity = "low" | "medium" | "high" | "critical";

export interface SeedRule {
  code: string;
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  checkType: "deterministic" | "ai";
  params?: Record<string, unknown>;
}

export const SEED_RULES: SeedRule[] = [
  {
    code: "T-01",
    category: "tone",
    title: "Warm, expert and inclusive voice",
    description:
      "Write like a knowledgeable friend: calm, warm and evidence-led. No fear-based, shaming or pressuring language about skin or bodies.",
    severity: "medium",
    checkType: "ai",
  },
  {
    code: "T-02",
    category: "tone",
    title: "No slang or all-caps hype",
    description:
      'Avoid slang and hype such as "OMG", "insane", "crazy", repeated exclamation marks ("!!") and words in ALL CAPS.',
    severity: "medium",
    checkType: "deterministic",
    params: {
      patterns: ["\\bOMG\\b", "!{2,}", "\\binsane\\b", "\\bcrazy\\b", "\\bobsessed\\b", "\\bslay(s|ing)?\\b"],
      allCapsMinLength: 4,
      allCapsAllow: ["SPF", "ASCI", "INR", "UVA", "UVB", "PA"],
    },
  },
  {
    code: "T-03",
    category: "tone",
    title: "No fairness or whitening language",
    description:
      'Never imply lighter skin is better. Use "radiant" or "brightening" instead of "fairness", "whitening" or "fair skin".',
    severity: "high",
    checkType: "deterministic",
  },
  {
    code: "T-04",
    category: "terminology",
    title: 'Say "affordable", never "cheap"',
    description: 'Describe price positively. Use "affordable" instead of "cheap".',
    severity: "low",
    checkType: "deterministic",
  },
  {
    code: "TERM-01",
    category: "terminology",
    title: 'Product name is "Lumina Vitamin C Serum"',
    description:
      'Always write the full product name "Lumina Vitamin C Serum". Never "Lumina VitC", "Vit-C serum" or other variants.',
    severity: "medium",
    checkType: "deterministic",
  },
  {
    code: "C-01",
    category: "claims",
    title: "No superlatives without an approved fact",
    description:
      'Superlatives such as "#1", "best", "top" or "number one" need an approved fact in the Fact Registry that supports them.',
    severity: "high",
    checkType: "deterministic",
    params: {
      patterns: ["#\\s?1\\b", "\\bno\\.?\\s?1\\b", "\\bnumber one\\b", "\\bbest\\b", "\\btop\\b", "\\bmost effective\\b"],
      supportingFacts: { "best-seller": "F-40", "best seller": "F-40", bestseller: "F-40" },
    },
  },
  {
    code: "C-02",
    category: "claims",
    title: "No guarantees of results",
    description:
      'Do not promise outcomes. Avoid "guaranteed", "100% results", "permanent" or fixed-time results such as "in 3 days".',
    severity: "high",
    checkType: "deterministic",
    params: {
      patterns: [
        "\\bguarantee(d|s)?\\b",
        "\\b100\\s?%\\s?(results?|effective)\\b",
        "\\bpermanent(ly)?\\b",
        "\\b(in|within)\\s+\\d+\\s+(days?|hours?)\\b",
        "\\bovernight results?\\b",
      ],
    },
  },
  {
    code: "C-03",
    category: "claims",
    title: "Prices must match the Fact Registry",
    description: "Any price or offer threshold stated in content must exactly match the current approved fact.",
    severity: "critical",
    checkType: "deterministic",
  },
  {
    code: "C-04",
    category: "claims",
    title: '"Clinically proven" only with an approved study',
    description:
      'Use "clinically proven" only when an approved clinical-study fact exists. Otherwise use an approved claim such as "dermatologically tested".',
    severity: "critical",
    checkType: "deterministic",
    params: { patterns: ["\\bclinically (proven|tested|shown)\\b"], factCode: "F-21" },
  },
  {
    code: "ASCI-01",
    category: "asci",
    title: "Paid influencer posts carry a clear disclosure",
    description:
      'Per the ASCI influencer guidelines, paid or gifted Instagram posts must show a clear label such as "#ad", "#collab" or "Paid partnership" upfront.',
    severity: "critical",
    checkType: "deterministic",
    params: {
      channels: ["instagram"],
      disclosures: ["#ad", "#collab", "#sponsored", "#partner", "paid partnership"],
    },
  },
  {
    code: "ASCI-02",
    category: "asci",
    title: "No claims to cure or treat medical conditions",
    description:
      "Cosmetics must not claim to cure, treat, heal or prevent medical conditions such as acne, eczema or pigmentation disorders.",
    severity: "critical",
    checkType: "deterministic",
    params: {
      patterns: ["\\bcur(e|es|ed|ing)\\b", "\\btreat(s|ed|ing|ment)?\\b", "\\bheal(s|ed|ing)?\\b", "\\beliminat(e|es|ed)\\b"],
    },
  },
  {
    code: "M-01",
    category: "messaging",
    title: "Only approved delivery promises",
    description:
      "Do not promise delivery times other than the approved ones in the Fact Registry (standard delivery 3–5 days).",
    severity: "high",
    checkType: "deterministic",
    params: {
      patterns: ["\\bnext[- ]day\\b", "\\bsame[- ]day\\b", "\\b24[- ]?(hour|hr)s?\\b", "\\bdelivered tomorrow\\b", "\\bovernight (delivery|shipping)\\b"],
      factCode: "F-30",
    },
  },
  {
    code: "M-02",
    category: "messaging",
    title: "Message matches goal, audience and CTA",
    description:
      "Content must clearly support the stated goal, speak to the stated audience and include the stated call to action.",
    severity: "medium",
    checkType: "ai",
  },
  {
    code: "A-01",
    category: "accessibility",
    title: "Images need alt text",
    description: "Every image must have descriptive alt text so screen-reader users get the same message.",
    severity: "medium",
    checkType: "deterministic",
  },
  {
    code: "A-02",
    category: "accessibility",
    title: "Text contrast at least WCAG 4.5:1",
    description: "Text in images must have a contrast ratio of at least 4.5:1 against its background (WCAG 2.1 AA).",
    severity: "high",
    checkType: "deterministic",
    params: { minRatio: 4.5 },
  },
  {
    code: "A-03",
    category: "accessibility",
    title: "Keep copy easy to read",
    description: "Aim for a Flesch reading-ease score of 50 or more: short sentences and everyday words.",
    severity: "low",
    checkType: "deterministic",
    params: { minScore: 50, minWords: 25 },
  },
  {
    code: "V-01",
    category: "visual",
    title: "Use only approved palette colours",
    description:
      "Dominant colours in images must be close to the approved palette (CIEDE2000 ΔE ≤ 12 from a palette colour).",
    severity: "medium",
    checkType: "deterministic",
    params: { maxDeltaE: 12, minShare: 0.08 },
  },
];

export interface SeedTerm {
  banned: string;
  preferred: string;
  ruleCode: string;
}

export const SEED_TERMS: SeedTerm[] = [
  { banned: "cheap", preferred: "affordable", ruleCode: "T-04" },
  { banned: "cheapest", preferred: "most affordable", ruleCode: "T-04" },
  { banned: "Lumina VitC", preferred: "Lumina Vitamin C Serum", ruleCode: "TERM-01" },
  { banned: "Vit-C serum", preferred: "Lumina Vitamin C Serum", ruleCode: "TERM-01" },
  { banned: "VitC serum", preferred: "Lumina Vitamin C Serum", ruleCode: "TERM-01" },
  { banned: "Vitamin-C serum", preferred: "Lumina Vitamin C Serum", ruleCode: "TERM-01" },
  { banned: "fairness", preferred: "radiance", ruleCode: "T-03" },
  { banned: "whitening", preferred: "brightening", ruleCode: "T-03" },
  { banned: "fair skin", preferred: "radiant skin", ruleCode: "T-03" },
];

export interface SeedFact {
  code: string;
  subject: string;
  attribute: string;
  value: string;
  unit: string | null;
  owner: string;
  sourceDoc: string;
  validFrom: string;
  validUntil: string | null;
}

export const SEED_FACTS: SeedFact[] = [
  {
    code: "F-12",
    subject: "Lumina Vitamin C Serum 30ml",
    attribute: "price",
    value: "449",
    unit: "INR",
    owner: "Pricing team",
    sourceDoc: "Price list Nov 2026 (PL-2611)",
    validFrom: "2026-11-01",
    validUntil: "2027-03-31",
  },
  {
    code: "F-13",
    subject: "Lumina Sunscreen SPF 50",
    attribute: "price",
    value: "599",
    unit: "INR",
    owner: "Pricing team",
    sourceDoc: "Price list Nov 2026 (PL-2611)",
    validFrom: "2026-11-01",
    validUntil: "2027-03-31",
  },
  {
    code: "F-14",
    subject: "Lumina Niacinamide Night Cream 50g",
    attribute: "price",
    value: "549",
    unit: "INR",
    owner: "Pricing team",
    sourceDoc: "Price list Nov 2026 (PL-2611)",
    validFrom: "2026-11-01",
    validUntil: "2027-03-31",
  },
  {
    code: "F-15",
    subject: "Lumina Vitamin C Serum",
    attribute: "vitamin C concentration",
    value: "10",
    unit: "%",
    owner: "R&D",
    sourceDoc: "Formulation sheet FS-VC-03",
    validFrom: "2026-01-01",
    validUntil: null,
  },
  {
    code: "F-20",
    subject: "All Lumina products",
    attribute: "dermatologically tested claim",
    value: "approved",
    unit: null,
    owner: "Regulatory",
    sourceDoc: "Derm test report DT-2026-07",
    validFrom: "2026-07-15",
    validUntil: null,
  },
  {
    code: "F-21",
    subject: "All Lumina products",
    attribute: "clinically proven claim",
    value: "NOT approved (no clinical study on file)",
    unit: null,
    owner: "Regulatory",
    sourceDoc: "Claims register CR-2026",
    validFrom: "2026-01-01",
    validUntil: null,
  },
  {
    code: "F-30",
    subject: "Delivery",
    attribute: "standard delivery time",
    value: "3–5",
    unit: "business days",
    owner: "Operations",
    sourceDoc: "Logistics SLA LS-2026",
    validFrom: "2026-04-01",
    validUntil: null,
  },
  {
    code: "F-31",
    subject: "Shipping",
    attribute: "free shipping threshold",
    value: "499",
    unit: "INR",
    owner: "Growth",
    sourceDoc: "Offer policy OP-2611",
    validFrom: "2026-11-01",
    validUntil: "2027-01-31",
  },
  {
    code: "F-40",
    subject: "Lumina Vitamin C Serum",
    attribute: "best-seller status on luminaskin website",
    value: "approved",
    unit: null,
    owner: "E-commerce",
    sourceDoc: "Sales report SR-Q3-2026",
    validFrom: "2026-10-01",
    validUntil: "2027-03-31",
  },
  {
    code: "F-41",
    subject: "Lumina Sunscreen SPF 50",
    attribute: "protection claim",
    value: "Broad spectrum SPF 50 PA++++",
    unit: null,
    owner: "Regulatory",
    sourceDoc: "SPF test report SP-2026-02",
    validFrom: "2026-02-01",
    validUntil: null,
  },
];

export const SEED_PALETTE = [
  { name: "Lumina Teal", hex: "#0E7C7B" },
  { name: "Ivory", hex: "#F7F3EA" },
  { name: "Charcoal", hex: "#2B2B2B" },
  { name: "Soft Gold", hex: "#C9A227" },
];

export const SEED_FONTS = ["Poppins", "Inter"];
