"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight, Lightbulb, Loader2, TriangleAlert, Wand2 } from "lucide-react";

type Role = "creator" | "manager";

const PATHS: { title: string; time: string; role: Role; href: string; steps: string; icon: typeof Wand2 }[] = [
  {
    title: "Check a post",
    time: "2 min",
    role: "creator",
    href: "/submit",
    icon: Wand2,
    steps: "Pick sample 1 → Check content → read the cited findings → Accept all fixes → Apply → Submit for review. Then switch to Manager to approve.",
  },
  {
    title: "See Fact Drift in action",
    time: "1 min",
    role: "manager",
    href: "/brand#facts-h",
    icon: TriangleAlert,
    steps: "Click “Change F-12 to ₹499” → View drift → Send back for update. The approved post comes back with a C-03 fix to ₹499.",
  },
  {
    title: "See guideline insights",
    time: "1 min",
    role: "manager",
    href: "/insights",
    icon: Lightbulb,
    steps: "The top gap is a rule creators keep disputing. Open its evidence → Draft a clarification → Accept to create a new rule version.",
  },
];

/** Guided entry points for first-time visitors (judges). Each sets the role it needs, then opens the page. */
export function StartHere() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(role: Role, href: string) {
    document.cookie = `verity_role=${role}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    start(() => {
      router.push(href);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="start-h" className="space-y-3">
      <h2 id="start-h" className="text-lg font-semibold">Start here</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {PATHS.map((p) => (
          <button
            key={p.title}
            type="button"
            disabled={pending}
            onClick={() => go(p.role, p.href)}
            className="group flex cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
          >
            <span className="flex items-center gap-2 font-semibold">
              <p.icon className="h-5 w-5 text-primary" aria-hidden />
              {p.title}
              <span className="text-xs font-normal text-muted-foreground">({p.time})</span>
              {pending ? <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </span>
            <span className="text-sm text-muted-foreground">{p.steps}</span>
            <span className="text-xs">
              Opens as <b className="capitalize">{p.role}</b> (switched for you; change it any time in the header)
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
