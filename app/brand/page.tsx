import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DbError } from "@/components/db-error";
import { getBrandData } from "@/lib/queries";

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
  try {
    data = await getBrandData();
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
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => (
                <tr key={f.id} className="border-t align-top">
                  <td className="px-3 py-2 font-mono font-medium">{f.code}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
