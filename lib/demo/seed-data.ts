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
      patterns: ["\\bOMG\\b[!?.,]*\\s*", "!{2,}", "\\binsane(ly)?\\b", "\\bcrazy\\b", "\\bobsessed\\b", "\\bslay(s|ing)?\\b"],
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
      // "#1"-style claims (optionally with "India's" etc.), plain superlatives, and best-seller claims
      rankPattern: "(?:\\b(?:india|the world|the country|asia)['’]?s\\s+)?(?:#\\s?1|\\bno\\.?\\s?1|\\bnumber one)\\b",
      patterns: [
        "\\b(?:the\\s+)?best\\b(?![- ]?sell)(?!\\s+(?:wishes|regards)\\b)",
        "\\btop(?:-rated)?\\b(?!\\s+(?:up|of|off|it)\\b)",
        "\\bmost effective\\b",
      ],
      bestSellerPattern: "\\bbest[- ]?sell(?:er|ing)\\b",
      supportingFact: "F-40",
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
    title: "Prices and product numbers must match the Fact Registry",
    description:
      "Any price, offer threshold, concentration or SPF stated in content must exactly match the current approved fact.",
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
    params: {
      patterns: ["\\bclinically (proven|tested|shown)\\b"],
      factCode: "F-21",
      alternativeFactCode: "F-20",
      alternative: "dermatologically tested",
    },
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
      // "cure"/"heal" are always flagged; "treat"/"eliminate"/"get rid of" only next to a condition word
      alwaysVerbs: ["cure", "cures", "cured", "curing", "heal", "heals", "healed", "healing"],
      conditionVerbs: ["treat", "treats", "treated", "treating", "eliminate", "eliminates", "eliminated", "get rid of", "gets rid of"],
      conditions: {
        acne: "blemishes",
        pimples: "blemishes",
        pimple: "blemishes",
        breakouts: "blemishes",
        eczema: "dryness and redness",
        psoriasis: "dryness and redness",
        dermatitis: "dryness and redness",
        rosacea: "redness",
        pigmentation: "dark spots",
        hyperpigmentation: "dark spots",
        melasma: "dark spots",
        scars: "the look of marks",
      },
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
      patterns: [
        "\\b(?:next|same)[- ]day(?:\\s+(?:delivery|shipping|dispatch))?\\b",
        "\\b24[- ]?(?:hour|hr)s?\\s+(?:delivery|shipping|dispatch)\\b",
        "\\bdelivered tomorrow\\b",
        "\\bovernight (?:delivery|shipping)\\b",
      ],
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
  { banned: "Vit C serum", preferred: "Lumina Vitamin C Serum", ruleCode: "TERM-01" },
  { banned: "Lumina Vit C", preferred: "Lumina Vitamin C Serum", ruleCode: "TERM-01" },
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
    // Round 3 demo: a time-limited offer that expires during the final-round window, to show expiry drift.
    code: "F-32",
    subject: "Festive sale on Lumina Niacinamide Night Cream",
    attribute: "festive discount",
    value: "15",
    unit: "%",
    owner: "Growth",
    sourceDoc: "Festive offer brief OB-2611",
    validFrom: "2026-11-14",
    validUntil: "2026-11-23",
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

/**
 * Round 3: fictional, already-approved posts (with full history) that correctly quote facts. They are the content that
 * Fact Drift finds when a fact changes or expires. Labelled "Demo history (fictional)" in the UI.
 */
export interface SeedApprovedPost {
  title: string;
  channel: "instagram" | "ad" | "email" | "document" | "other";
  goal: string;
  audience: string;
  cta: string;
  text: string;
  daysAgo: number;
}

export const SEED_APPROVED_POSTS: SeedApprovedPost[] = [
  {
    title: "Vitamin C Serum price post (approved)",
    channel: "instagram",
    goal: "Drive sales of the Vitamin C Serum",
    audience: "Skincare-curious adults 22–40",
    cta: "Tap the link in bio",
    text: "#collab Our Lumina Vitamin C Serum is now ₹449 for 30ml. It has 10% vitamin C and is dermatologically tested. Tap the link in bio.",
    daysAgo: 6,
  },
  {
    title: "Free-shipping banner (approved)",
    channel: "ad",
    goal: "Lift average order value",
    audience: "Returning customers",
    cta: "Shop now",
    text: "Free shipping on orders above ₹499. Stock up on the Lumina Sunscreen SPF 50 and shop now.",
    daysAgo: 5,
  },
  {
    title: "Delivery FAQ email (approved)",
    channel: "email",
    goal: "Answer delivery questions before checkout",
    audience: "First-time buyers",
    cta: "Reply with any question",
    text: "Standard delivery takes 3–5 business days anywhere in India. Questions? Reply to this email and our team will help.",
    daysAgo: 4,
  },
  {
    title: "Festive offer post (approved)",
    channel: "instagram",
    goal: "Drive festive-season sales of the Night Cream",
    audience: "Women 25–40 in metro cities",
    cta: "Shop the festive sale",
    text: "#collab Festive sale: enjoy a 15% discount on the Lumina Niacinamide Night Cream. Shop the festive sale now.",
    daysAgo: 3,
  },
];

/** Round 3: org-specific words masked before any third-party AI call (fictional). */
export const SEED_SENSITIVE_TERMS = [
  { term: "Project Aurora", note: "unreleased product codename" },
  { term: "GlowMart", note: "retail partner (launch not announced)" },
];

/** Round 3: one confidential draft (checked locally at seed time) and one draft with a withheld section (unchecked). */
export const SEED_PRIVACY_DRAFTS = [
  {
    key: "confidential",
    title: "Project Aurora launch teaser",
    channel: "instagram" as const,
    goal: "Build anticipation for an unreleased product",
    audience: "Existing customers",
    cta: "Join the waitlist",
    text: "#collab Something new is coming from Lumina Skin. Project Aurora lands on 15 Dec. Guaranteed glow in 7 days! Join the waitlist via the link in bio.",
    confidential: true,
  },
  {
    key: "withheld",
    title: "Partner newsletter draft",
    channel: "email" as const,
    goal: "Tell partners about the winter range",
    audience: "Retail partners",
    cta: "Reply to confirm stock",
    text: "Hi team,\n\nOur winter range arrives next month. [[confidential]]Our new retinol night serum launches on 15 Jan, exclusively with GlowMart.[[/confidential]] The Lumina Vitamin C Serum stays at ₹449 for customers.\n\nQuestions? Call Asha on +91 98765 43210 or reply to confirm stock.\n\nTeam Lumina",
    confidential: false,
  },
];
