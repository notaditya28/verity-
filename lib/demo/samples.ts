// "Try a sample" drafts. Each has planted errors except #2, which should pass cleanly.
export type Channel = "instagram" | "ad" | "email" | "document" | "other";

export interface Sample {
  key: string;
  label: string;
  title: string;
  channel: Channel;
  goal: string;
  audience: string;
  cta: string;
  text: string;
  imagePath?: string;
  altText?: string;
}

export const SAMPLES: Sample[] = [
  {
    key: "hype",
    label: "Hype influencer post",
    title: "Influencer launch post — Vitamin C Serum",
    channel: "instagram",
    goal: "Drive launch-week sales of the Vitamin C Serum",
    audience: "Women 20–35 in metro cities, new to vitamin C",
    cta: "Shop via the link in bio",
    text: "OMG!! India's #1 serum, now just ₹399 😍 Guaranteed glow in 3 days! Shop the Lumina VitC via the link in bio.",
  },
  {
    key: "clean",
    label: "Clean, compliant post",
    title: "Vitamin C Serum — evergreen post",
    channel: "instagram",
    goal: "Build awareness of the Vitamin C Serum",
    audience: "Skincare-curious adults 22–40",
    cta: "Tap the link in bio to shop",
    text: "Meet the Lumina Vitamin C Serum: a 10% vitamin C formula, dermatologically tested, for brighter-looking skin with regular use. Now ₹449 for 30ml, with free shipping on orders above ₹499. Tap the link in bio to shop. #collab",
  },
  {
    key: "email",
    label: "Promo email",
    title: "November promo email",
    channel: "email",
    goal: "Convert newsletter subscribers into first-time buyers",
    audience: "Newsletter subscribers who have not purchased",
    cta: "Order today",
    text: "Subject: Your skin deserves the glow\n\nHi Priya,\n\nOur Vit-C serum is clinically proven to fade dark spots, and unlike cheap knock-offs it's made with 10% vitamin C. Order today for ₹449 and enjoy standard delivery in 3–5 days.\n\nQuestions? Reply to this email or call us on +91 98765 43210.\n\nWarm regards,\nTeam Lumina",
  },
  {
    key: "image",
    label: "Ad image (off-palette)",
    title: "Festive sale banner ad",
    channel: "ad",
    goal: "Drive festive-season sales of the Vitamin C Serum",
    audience: "Online shoppers 25–40",
    cta: "Shop now",
    text: "Festive glow is here. Shop now.",
    imagePath: "/samples/festive-ad.png",
  },
  {
    key: "medical",
    label: "Medical-claim ad",
    title: "Sunscreen performance ad",
    channel: "ad",
    goal: "Drive sunscreen trials among young adults",
    audience: "College students and young professionals 18–28",
    cta: "Order now",
    text: "Our Lumina Sunscreen SPF 50 cures acne and treats pigmentation! Order now and get next-day delivery anywhere in India. Just ₹599.",
  },
];
