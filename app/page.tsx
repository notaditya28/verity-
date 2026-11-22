import Link from "next/link";
import { ClipboardCheck, FileText, ListChecks, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartHere } from "@/components/start-here";

const STEPS = [
  { icon: FileText, title: "Submit", text: "A creator submits a post, ad, email or image with its goal, audience and call to action." },
  { icon: ListChecks, title: "Check", text: "Rule checks run first, then AI checks tone, messaging and claims against approved rules and facts." },
  { icon: ClipboardCheck, title: "Fix", text: "Every issue cites the rule or fact it breaks and suggests a fix. Accept, edit or dispute each one." },
  { icon: UserCheck, title: "Approve", text: "A manager approves, requests changes or escalates. Every step is versioned and audit-logged." },
];

export default function Home() {
  return (
    <div className="space-y-10 py-6">
      <section className="space-y-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Catch off-brand and non-compliant content before it ships.</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Verity checks drafts against your approved guidelines, Fact Registry, terminology and visual identity. No source, no hard flag.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/submit">Try the demo</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/brand">See the brand rules</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">No sign-in needed. Demo brand “Lumina Skin” is fictional.</p>
      </section>

      <StartHere />

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="How Verity works">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="font-semibold">{s.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
