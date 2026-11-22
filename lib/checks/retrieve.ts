import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { EngineFact, EngineRule } from "./types";

export interface Retrieved {
  rules: EngineRule[];
  facts: EngineFact[];
  /** Per-sentence top matches, kept for the audit log. */
  trace: { sentence: string; rules: string[]; facts: string[] }[];
}

/**
 * Retrieval seam. The MVP uses Postgres full-text search + pg_trgm (the policy set is tiny).
 * A pgvector retriever can implement the same interface later.
 */
export interface Retriever {
  retrieve(orgId: string, text: string, policy: { rules: EngineRule[]; facts: EngineFact[] }): Promise<Retrieved>;
}

const TOP_K = 5;
const MAX_SENTENCES = 12;
const MIN_SCORE = 0.05;

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^a-z0-9₹%]/gi, "").length >= 4)
    .slice(0, MAX_SENTENCES);
}

/** Letters-only OR query for to_tsquery (safe: only [a-z] survives). */
function orQuery(sentence: string): string {
  const words = [...new Set(sentence.toLowerCase().match(/[a-z]{3,}/g) ?? [])];
  return words.join(" | ");
}

export const pgTextRetriever: Retriever = {
  async retrieve(orgId, text, policy) {
    const db = getDb();
    const sentences = splitSentences(text);
    const trace = await Promise.all(
      sentences.map(async (s) => {
        const q = orQuery(s);
        const tsRule = q
          ? sql`ts_rank(to_tsvector('english', title || ' ' || description), to_tsquery('english', ${q}))`
          : sql`0`;
        const tsFact = q
          ? sql`ts_rank(to_tsvector('english', subject || ' ' || attribute || ' ' || value), to_tsquery('english', ${q}))`
          : sql`0`;
        const [ruleRows, factRows] = await Promise.all([
          db.execute<{ code: string; score: number }>(sql`
            select code, (${tsRule} + word_similarity(${s}, title || ' ' || description)) as score
            from rules where org_id = ${orgId} and active and current
            order by score desc limit ${TOP_K}`),
          db.execute<{ code: string; score: number }>(sql`
            select code, (${tsFact} + word_similarity(${s}, subject || ' ' || attribute || ' ' || value)) as score
            from facts where org_id = ${orgId} and current
            order by score desc limit ${TOP_K}`),
        ]);
        return {
          sentence: s,
          rules: [...ruleRows].filter((r) => Number(r.score) >= MIN_SCORE).map((r) => r.code),
          facts: [...factRows].filter((r) => Number(r.score) >= MIN_SCORE).map((r) => r.code),
        };
      }),
    );

    const ruleCodes = new Set(trace.flatMap((t) => t.rules));
    // Tone and messaging rules apply to every piece of content, so AI-judged rules are always in scope.
    for (const r of policy.rules) if (r.checkType === "ai") ruleCodes.add(r.code);
    const factCodes = new Set(trace.flatMap((t) => t.facts));

    return {
      rules: policy.rules.filter((r) => ruleCodes.has(r.code)),
      facts: policy.facts.filter((f) => factCodes.has(f.code)),
      trace,
    };
  },
};
