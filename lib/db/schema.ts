import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- enums ----------
export const ruleCategory = pgEnum("rule_category", [
  "tone",
  "terminology",
  "claims",
  "accessibility",
  "visual",
  "asci",
  "messaging",
]);
export const severity = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const checkType = pgEnum("check_type", ["deterministic", "ai"]);
export const channel = pgEnum("channel", ["instagram", "ad", "email", "document", "other"]);
export const submissionStatus = pgEnum("submission_status", [
  "draft",
  "in_review",
  "changes_requested",
  "escalated",
  "approved",
]);
export const role = pgEnum("role", ["creator", "manager", "system"]);
export const checkStatus = pgEnum("check_status", ["running", "completed", "partial", "failed"]);
export const aiStatus = pgEnum("ai_status", ["pending", "completed", "failed", "skipped"]);
export const findingSource = pgEnum("finding_source", ["rule", "ai"]);
export const claimLabel = pgEnum("claim_label", [
  "supported",
  "contradicted",
  "unsupported",
  "needs_human_verification",
]);
export const creatorDecision = pgEnum("creator_decision", ["pending", "accepted", "edited", "disputed"]);
export const decisionAction = pgEnum("decision_action", ["approve", "request_changes", "escalate"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- tables ----------
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const policyVersions = pgTable("policy_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    category: ruleCategory("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: severity("severity").notNull(),
    checkType: checkType("check_type").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
  },
  (t) => [index("rules_org_code_idx").on(t.orgId, t.code)],
);

export const terms = pgTable("terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  banned: text("banned").notNull(),
  preferred: text("preferred"),
  ruleCode: text("rule_code").notNull(),
});

export const facts = pgTable(
  "facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    subject: text("subject").notNull(),
    attribute: text("attribute").notNull(),
    value: text("value").notNull(),
    unit: text("unit"),
    owner: text("owner").notNull(),
    sourceDoc: text("source_doc").notNull(),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until"),
    // Facts are versioned: an edit inserts a new row with a new policy version; old rows stay for audit
    // (and for Round 3 Fact Drift Alerts). `current` marks the live row per code.
    current: boolean("current").notNull().default(true),
    policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
  },
  (t) => [index("facts_org_code_idx").on(t.orgId, t.code)],
);

export const brandAssets = pgTable("brand_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  palette: jsonb("palette").$type<{ name: string; hex: string }[]>().notNull(),
  fonts: jsonb("fonts").$type<string[]>().notNull(),
  logoUrl: text("logo_url"),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  channel: channel("channel").notNull(),
  goal: text("goal").notNull().default(""),
  audience: text("audience").notNull().default(""),
  cta: text("cta").notNull().default(""),
  status: submissionStatus("status").notNull().default("draft"),
  createdByRole: role("created_by_role").notNull().default("creator"),
  currentVersion: integer("current_version").notNull().default(1),
  // Round 3: seeded, fictional history (shown as "Demo history (fictional)").
  demoHistory: boolean("demo_history").notNull().default(false),
  // Round 3: confidential (unreleased) content is never sent to a third-party AI.
  confidential: boolean("confidential").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissionVersions = pgTable(
  "submission_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    text: text("text").notNull().default(""),
    // Images are stored inline as data URLs for the MVP (no object storage). Max ~1.5 MB enforced in the API.
    imageUrl: text("image_url"),
    altText: text("alt_text"),
    extractedText: text("extracted_text"),
    visualDescription: text("visual_description"),
    // Text blocks (with measured colours) and dominant colours from the image, so re-checks don't re-read it.
    imageAnalysis: jsonb("image_analysis").$type<{
      blocks: { text: string; textHex: string; backgroundHex: string; method: "measured" | "estimated" }[];
      colours: { hex: string; share: number }[];
    }>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("submission_versions_unique").on(t.submissionId, t.versionNumber)],
);

export const checks = pgTable("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionVersionId: uuid("submission_version_id")
    .notNull()
    .references(() => submissionVersions.id, { onDelete: "cascade" }),
  policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id),
  promptVersion: text("prompt_version"),
  model: text("model"),
  status: checkStatus("status").notNull().default("running"),
  aiStatus: aiStatus("ai_status").notNull().default("pending"),
  error: text("error"),
  redactions: jsonb("redactions").$type<{ type: string; count: number }[]>().notNull().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const findings = pgTable(
  "findings",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  checkId: uuid("check_id").notNull().references(() => checks.id, { onDelete: "cascade" }),
  ruleCode: text("rule_code"),
  factCode: text("fact_code"),
  source: findingSource("source").notNull(),
  category: ruleCategory("category").notNull(),
  severity: severity("severity").notNull(),
  label: claimLabel("label"),
  spanStart: integer("span_start"),
  spanEnd: integer("span_end"),
  quote: text("quote"),
  explanation: text("explanation").notNull(),
  evidence: text("evidence"),
  suggestedFix: text("suggested_fix"),
  confidence: real("confidence").notNull().default(1),
  creatorDecision: creatorDecision("creator_decision").notNull().default("pending"),
  editedFix: text("edited_fix"),
  disputeReason: text("dispute_reason"),
  },
  (t) => [index("findings_rule_code_idx").on(t.ruleCode), index("findings_check_idx").on(t.checkId)],
);

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  role: role("role").notNull(),
  action: decisionAction("action").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    actorRole: role("actor_role").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created_idx").on(t.orgId, t.createdAt)],
);

// ---------- Round 3: Fact Drift ----------
export const factUsageSource = pgEnum("fact_usage_source", ["rule", "ai", "image_text"]);
export const driftReason = pgEnum("drift_reason", ["changed", "expired"]);
export const driftDetection = pgEnum("drift_detection", ["usage", "scan"]);
export const driftStatus = pgEnum("drift_status", ["open", "sent_back", "dismissed", "resolved"]);

/**
 * Every place a check saw content rely on a fact — correct or not. Findings only exist for mismatches, so without
 * this a post that correctly says "₹449" would leave no trace, and drift couldn't find it when F-12 changes.
 */
export const factUsages = pgTable(
  "fact_usages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    checkId: uuid("check_id").notNull().references(() => checks.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    submissionVersionId: uuid("submission_version_id")
      .notNull()
      .references(() => submissionVersions.id, { onDelete: "cascade" }),
    factCode: text("fact_code").notNull(),
    // The exact fact row (version) the content was compared with.
    factId: uuid("fact_id").references(() => facts.id, { onDelete: "cascade" }),
    matchedText: text("matched_text").notNull(),
    spanStart: integer("span_start"),
    spanEnd: integer("span_end"),
    source: factUsageSource("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("fact_usages_org_fact_idx").on(t.orgId, t.factId), index("fact_usages_version_idx").on(t.submissionVersionId)],
);

export const driftAlerts = pgTable(
  "drift_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    factCode: text("fact_code").notNull(),
    oldFactId: uuid("old_fact_id")
      .notNull()
      .references(() => facts.id, { onDelete: "cascade" }),
    newFactId: uuid("new_fact_id").references(() => facts.id, { onDelete: "cascade" }), // null when the fact expired
    reason: driftReason("reason").notNull(),
    submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    submissionVersionId: uuid("submission_version_id")
      .notNull()
      .references(() => submissionVersions.id, { onDelete: "cascade" }),
    matchedText: text("matched_text").notNull(),
    detection: driftDetection("detection").notNull(),
    status: driftStatus("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("drift_alerts_old_fact_submission_unique").on(t.oldFactId, t.submissionId),
    index("drift_alerts_org_status_idx").on(t.orgId, t.status),
  ],
);

// ---------- Round 3: Confidential mode + AI-use log ----------
export const aiPurpose = pgEnum("ai_purpose", ["judge", "vision", "clarification"]);
export const aiCallStatus = pgEnum("ai_call_status", ["ok", "error", "timeout", "skipped_confidential"]);

/** One row per external AI call (or per confidential check kept local). The raw payload is never stored. */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade" }),
    checkId: uuid("check_id").references(() => checks.id, { onDelete: "cascade" }),
    purpose: aiPurpose("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version"),
    charsSent: integer("chars_sent").notNull().default(0),
    imageSent: boolean("image_sent").notNull().default(false),
    redactionCounts: jsonb("redaction_counts").$type<{ type: string; count: number }[]>().notNull().default([]),
    withheldSections: integer("withheld_sections").notNull().default(0),
    sensitiveTermsMasked: integer("sensitive_terms_masked").notNull().default(0),
    payloadSha256: text("payload_sha256"),
    status: aiCallStatus("status").notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_org_created_idx").on(t.orgId, t.createdAt), index("ai_calls_submission_idx").on(t.submissionId)],
);

/** Org-specific words that must never reach a third-party AI (codenames, launch dates, partner names). */
export const sensitiveTerms = pgTable(
  "sensitive_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("sensitive_terms_org_idx").on(t.orgId)],
);

export type AiCall = typeof aiCalls.$inferSelect;
export type SensitiveTerm = typeof sensitiveTerms.$inferSelect;
export type FactUsage = typeof factUsages.$inferSelect;
export type DriftAlert = typeof driftAlerts.$inferSelect;

export type Rule = typeof rules.$inferSelect;
export type Fact = typeof facts.$inferSelect;
export type Term = typeof terms.$inferSelect;
export type BrandAsset = typeof brandAssets.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SubmissionVersion = typeof submissionVersions.$inferSelect;
export type Check = typeof checks.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Role = (typeof role.enumValues)[number];
