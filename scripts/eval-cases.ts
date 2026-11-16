// Hand-labelled evaluation set. These cases are separate from the five "Try a sample" drafts. Each label is what a
// brand reviewer should flag, written from the rule descriptions: "RULE" or "RULE/FACT". An empty list means the
// copy is compliant and any finding is a false positive.
import type { Channel } from "../lib/checks/types";

export interface EvalCase {
  id: string;
  channel: Channel;
  text: string;
  expected: string[];
}

export const RULE_CASES: EvalCase[] = [
  { id: "price-sunscreen", channel: "ad", text: "Our Lumina Sunscreen SPF 50 is now ₹549.", expected: ["C-03/F-13"] },
  { id: "price-night-cream-ok", channel: "ad", text: "Lumina Niacinamide Night Cream 50g, only ₹549 this week.", expected: [] },
  { id: "free-ship-threshold", channel: "ad", text: "Free shipping on orders above ₹399.", expected: ["C-03/F-31"] },
  { id: "next-day", channel: "ad", text: "Get it delivered tomorrow, anywhere in India.", expected: ["M-01"] },
  { id: "fast-delivery", channel: "email", text: "Your order arrives in 1–2 days.", expected: ["M-01"] },
  { id: "delivery-ok", channel: "email", text: "Standard delivery takes 3–5 business days.", expected: [] },
  { id: "cure-eczema", channel: "ad", text: "This cream will cure your eczema.", expected: ["ASCI-02"] },
  { id: "treats-acne-week", channel: "ad", text: "Treats acne in a week.", expected: ["ASCI-02", "C-02"] },
  { id: "clinical", channel: "ad", text: "Clinically proven to reduce wrinkles.", expected: ["C-04/F-21"] },
  { id: "derm-tested-ok", channel: "ad", text: "Dermatologically tested and gentle on sensitive skin.", expected: [] },
  { id: "best-sunscreen", channel: "ad", text: "The best sunscreen in India.", expected: ["C-01"] },
  { id: "no1-night-cream", channel: "ad", text: "The world's No. 1 night cream.", expected: ["C-01"] },
  { id: "bestseller-ok", channel: "ad", text: "The Lumina Vitamin C Serum is a best-seller on our website.", expected: [] },
  { id: "fairness", channel: "ad", text: "Get fairness with our serum.", expected: ["T-03"] },
  { id: "whitening", channel: "ad", text: "Skin whitening made easy.", expected: ["T-03"] },
  { id: "cheap", channel: "ad", text: "Don't settle for cheap serums.", expected: ["T-04"] },
  { id: "name-variant", channel: "ad", text: "Try the Vit C serum today.", expected: ["TERM-01"] },
  { id: "caps-hype", channel: "ad", text: "AMAZING DEAL!!! Grab it now.", expected: ["T-02"] },
  { id: "guarantee", channel: "ad", text: "Guaranteed results or your money back.", expected: ["C-02"] },
  { id: "vitc-percent", channel: "ad", text: "The Lumina Vitamin C Serum has 15% vitamin C.", expected: ["C-03/F-15"] },
  { id: "spf-wrong", channel: "ad", text: "Lumina Sunscreen SPF 30 protects all day.", expected: ["C-03/F-41"] },
  { id: "insta-no-disclosure", channel: "instagram", text: "Loving my Lumina Vitamin C Serum. Dermatologically tested and gentle.", expected: ["ASCI-01"] },
  { id: "insta-disclosed-ok", channel: "instagram", text: "#ad Loving my Lumina Vitamin C Serum. Dermatologically tested and gentle.", expected: [] },
  { id: "phone-ok", channel: "email", text: "Questions about your order? Call us on +91 98765 43210.", expected: [] },
  {
    id: "clean-long-ok",
    channel: "email",
    text: "Meet the Lumina Niacinamide Night Cream. It helps skin look smoother with regular use. It costs ₹549 for 50g, and standard delivery takes 3–5 business days.",
    expected: [],
  },
];

/** Cases only the AI judge can catch (tone, goal fit, claims with no fact). Expected = rule code or category. */
export interface AiEvalCase {
  id: string;
  channel: Channel;
  goal: string;
  audience: string;
  cta: string;
  text: string;
  /** Rule codes or categories (tone/messaging/claims); a hit on any of them counts. Empty = should stay clean. */
  expectAny: string[];
}

export const AI_CASES: AiEvalCase[] = [
  {
    id: "fear-tone",
    channel: "ad",
    goal: "Drive trials of the Vitamin C Serum",
    audience: "Adults 25–40",
    cta: "Shop now",
    text: "Tired of your dull, ugly skin? Everyone notices. Fix it before it's too late. Shop now.",
    expectAny: ["T-01", "tone"],
  },
  {
    id: "goal-mismatch",
    channel: "ad",
    goal: "Drive sunscreen trials among college students",
    audience: "College students 18–22",
    cta: "Order now",
    text: "Indulge in our luxurious Lumina Niacinamide Night Cream, a quiet evening ritual for mature skin.",
    expectAny: ["M-02", "messaging"],
  },
  {
    id: "unsupported-stat",
    channel: "ad",
    goal: "Drive sales of the Vitamin C Serum",
    audience: "Adults 22–35",
    cta: "Shop now",
    text: "The Lumina Vitamin C Serum reduces dark spots by 80% for every skin type. Shop now.",
    expectAny: ["claims"],
  },
  {
    id: "clean-ai",
    channel: "ad",
    goal: "Build awareness of the Vitamin C Serum",
    audience: "Skincare-curious adults 22–40",
    cta: "Shop now",
    text: "Meet the Lumina Vitamin C Serum: a 10% vitamin C formula, dermatologically tested, for brighter-looking skin with regular use. Shop now.",
    expectAny: [],
  },
];
