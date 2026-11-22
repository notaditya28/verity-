import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DbError } from "@/components/db-error";
import { getBrandData } from "@/lib/queries";
import { getRole } from "@/lib/role";
import { FactEditor } from "./fact-editor";
import { TryDrift } from "./try-drift";
import { SensitiveTerms } from "./sensitive-terms";
import { factHistory } from "@/lib/drift/queries";
import { displayValue } from "@/lib/drift/match";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { and, eq } from "drizzle-orm";

async function activeSensitiveTerms() {
  return getDb()
    .select({ id: schema.sensitiveTerms.id, term: schema.sensitiveTerms.term, note: schema.sensitiveTerms.note })
    .from(schema.sensitiveTerms)
    .where(and(eq(schema.sensitiveTerms.orgId, DEMO_ORG_ID), eq(schema.sensitiveTerms.active, true)))
    .orderBy(schema.sensitiveTerms.createdAt);
}

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  tone: "Tone",
  terminology: "Terminology",
  claims: "Claims",
  asci: "ASCI ad code",
  messaging: "Messaging",
  accessibility: "Accessibility",
  visual: "Visual identity",
};

export default async function BrandPage() {
  let data: Awaited<ReturnType<typeof getBrandData>>;
  let history: Awaited<ReturnType<typeof factHistory>>;
  let terms: Awaited<ReturnType<typeof activeSensitiveTerms>>;
  const isManager = (await getRole()) === "manager";
  try {
    [data, history, terms] = await Promise.all([getBrandData(), factHistory(), activeSensitiveTerms()]);
  } catch (err) {
    console.error(err);
    return <DbError what="brand guidelines" />;
  }
  const { rules, facts, asset, versions, versionById } = data;
  if (rules.length === 0) {
    return <DbError what="brand guidelines (no rules found)" />;
  }

  const grouped = Object.keys(CATEGORY_LABEL)
    .map((cat) => ({ cat, items: rules.filter((r) => r.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Brand source of truth</h1>
        <p className="text-sm text-muted-foreground">
          {rules.length} rules · {facts.length} facts · policy version v{versions[0]?.versionNumber ?? 1}
          {versions[0]?.note ? ` — ${versions[0].note}` : ""}
        </p>
      </div>

      <section aria-labelledby="palette-h" className="space-y-3">
        <h2 id="palette-h" className="text-lg font-semibold">Visual identity</h2>
        {asset ? (
          <div className="flex flex-wrap gap-4">
            {asset.palette.map((c) => (
              <div key={c.hex} className="flex items-center gap-2">
                <span className="h-10 w-10 rounded-md border" style={{ background: c.hex }} aria-hidden />
                <div className="text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.hex}</div>
                </div>
              </div>
            ))}
            <div className="text-sm">
              <div className="font-medium">Fonts</div>
              <div className="text-muted-foreground">{asset.fonts.join(", ")}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No visual identity on file.</p>
        )}
      </section>

      <section aria-labelledby="facts-h" className="space-y-3">
        <h2 id="facts-h" className="text-lg font-semibold">Fact Registry</h2>
        <p className="text-sm text-muted-foreground">
          {isManager
            ? "Editing a fact creates a new policy version. The old value is kept for the audit trail, and new checks use the new value."
            : "Switch to Manager in the header to edit facts. Every edit creates a new policy version."}
        </p>
        {isManager && facts.some((f) => f.code === "F-12") && <TryDrift currentValue={facts.find((f) => f.code === "F-12")!.value} />}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Attribute</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Valid</th>
                <th className="px-3 py-2">Ver.</th>
                {isManager && <th className="px-3 py-2"><span className="sr-only">Edit</span></th>}
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => (
                <tr key={f.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap font-mono font-medium">
                    {f.code}
                    {(history.get(f.code)?.length ?? 0) > 1 && (
                      <details className="mt-1 font-sans text-xs font-normal">
                        <summary className="cursor-pointer text-primary">History ({history.get(f.code)!.length})</summary>
                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                          {history.get(f.code)!.map((h) => (
                            <li key={h.id} className="whitespace-nowrap">
                              {h.current ? <b className="text-foreground">{displayValue(h)}</b> : <del>{displayValue(h)}</del>} from {h.validFrom} · v
                              {versionById.get(h.policyVersionId) ?? "?"}
                              {h.current ? " (current)" : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-2">{f.subject}</td>
                  <td className="px-3 py-2">{f.attribute}</td>
                  <td className="px-3 py-2 font-medium">
                    {f.unit === "INR" ? `₹${f.value}` : f.unit ? `${f.value} ${f.unit}` : f.value}
                  </td>
                  <td className="px-3 py-2">{f.owner}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.sourceDoc}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {f.validFrom} → {f.validUntil ?? "open"}
                  </td>
                  <td className="px-3 py-2">v{versionById.get(f.policyVersionId) ?? "?"}</td>
                  {isManager && (
                    <td className="px-3 py-2">
                      <FactEditor code={f.code} value={f.value} validUntil={f.validUntil} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="sensitive-h" className="space-y-3">
        <h2 id="sensitive-h" className="text-lg font-semibold">Sensitive terms (kept away from AI)</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Codenames, launch dates or partner names. Before any call to a third-party AI, each one is replaced with [SENSITIVE], on top of the
          personal-data masking. Rule checks still see the real text. Every change is audited without storing the term.
        </p>
        <SensitiveTerms terms={terms} isManager={isManager} />
      </section>

      <section aria-labelledby="rules-h" className="space-y-4">
        <h2 id="rules-h" className="text-lg font-semibold">Rules</h2>
        {grouped.map((g) => (
          <div key={g.cat} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABEL[g.cat]}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {g.items.map((r) => (
                <Card key={r.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{r.code}</span>
                      <Badge variant={r.severity}>{r.severity}</Badge>
                      <Badge variant="muted">{r.checkType === "ai" ? "AI check" : "Rule check"}</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">v{versionById.get(r.policyVersionId) ?? "?"}</span>
                    </div>
                    <CardTitle className="text-base">{r.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{r.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
