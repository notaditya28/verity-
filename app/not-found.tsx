import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-2 py-10 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page or submission doesn’t exist. It may have been removed by “Reset demo”.</p>
      <p className="text-sm">
        <Link href="/submissions" className="font-medium text-primary underline-offset-4 hover:underline">
          Go to submissions
        </Link>{" "}
        ·{" "}
        <Link href="/submit" className="font-medium text-primary underline-offset-4 hover:underline">
          Check new content
        </Link>
      </p>
    </div>
  );
}
