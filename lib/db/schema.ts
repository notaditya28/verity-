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

export const findings = pgTable("findings", {
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
});

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

export type Rule = typeof rules.$inferSelect;
export type Fact = typeof facts.$inferSelect;
export type Term = typeof terms.$inferSelect;
export type BrandAsset = typeof brandAssets.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SubmissionVersion = typeof submissionVersions.$inferSelect;
export type Check = typeof checks.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Role = (typeof role.enumValues)[number];
