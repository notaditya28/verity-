"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

type UiRole = "creator" | "manager";

export function RoleSwitcher({ role }: { role: UiRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setRole(next: UiRole) {
    if (next === role) return;
    document.cookie = `verity_role=${next}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    startTransition(() => {
      router.push(next === "manager" ? "/review" : "/submit");
      router.refresh();
    });
  }

  return (
    <div role="radiogroup" aria-label="Current role" className="flex rounded-md border p-0.5 text-sm">
      {(["creator", "manager"] as const).map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={role === r}
          disabled={pending}
          onClick={() => setRole(r)}
          className={cn(
            "rounded px-2.5 py-1 capitalize transition-colors cursor-pointer",
            role === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
