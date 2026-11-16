# Verity

**Pre-publication brand-compliance gate.** A brand stores its source of truth once: versioned rules, a Fact Registry and its visual identity. Verity checks every draft against them before it goes live. Each issue cites the rule or fact it breaks and suggests a fix, and a human approves.

> Core principle: **no source, no hard flag.** If the AI can't cite a valid retrieved rule or fact, the finding is downgraded to `needs_human_verification`.

Live demo: _link added after first deploy_ · No sign-in needed · Demo brand "Lumina Skin" is fictional.

## Setup
```bash
cp .env.example .env.local   # fill in DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL
npm install
npm run db:push              # create tables in Supabase
npm run seed                 # seed the Lumina Skin demo org
npm run dev
```

## Tech stack
Next.js (App Router) · TypeScript · Tailwind + shadcn-style UI · PostgreSQL on Supabase via Drizzle · Gemini (`@google/genai`) · zod

_Full README (how to try it in 60 seconds, architecture diagram, screenshots, limitations) arrives in M6._
