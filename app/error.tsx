"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Catch-all for unexpected errors while rendering a page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-medium">Something went wrong while loading this page.</p>
      <p>Try again in a moment. If the demo data looks broken, press “Reset demo” in the header.</p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
