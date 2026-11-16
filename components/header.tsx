import Link from "next/link";
import { HelpCircle, ShieldCheck } from "lucide-react";
import { getRole } from "@/lib/role";
import { DEMO_ORG_NAME } from "@/lib/demo/constants";
import { RoleSwitcher } from "./role-switcher";
import { ResetDemoButton } from "./reset-demo-button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const NAV = [
  { href: "/submit", label: "Submit" },
  { href: "/submissions", label: "Submissions" },
  { href: "/review", label: "Review" },
  { href: "/brand", label: "Brand" },
  { href: "/audit", label: "Audit" },
];

export async function Header() {
  const role = await getRole();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          Verity
        </Link>
        <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
          Demo org: {DEMO_ORG_NAME}
        </span>
        <nav aria-label="Main" className="order-last flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Popover>
            <PopoverTrigger className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted cursor-pointer">
              <HelpCircle className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">How it works</span>
            </PopoverTrigger>
            <PopoverContent>
              <ol className="list-decimal space-y-1 pl-4">
                <li>As a <b>Creator</b>, submit a draft (or try a sample) and run the check.</li>
                <li>Every issue cites the brand rule or fact it breaks, with a suggested fix. Accept, edit or dispute each one.</li>
                <li>Switch to <b>Manager</b> to approve, request changes or escalate. Everything is audit-logged.</li>
              </ol>
            </PopoverContent>
          </Popover>
          <ResetDemoButton />
          <RoleSwitcher role={role} />
        </div>
      </div>
    </header>
  );
}
