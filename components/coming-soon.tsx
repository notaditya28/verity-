import Link from "next/link";

export function ComingSoon({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        This screen lands in {milestone}. Meanwhile, see the seeded <Link className="underline" href="/brand">brand rules and facts</Link>.
      </p>
    </div>
  );
}
