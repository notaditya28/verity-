"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { SAMPLES, type Channel, type Sample } from "@/lib/demo/samples";

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "instagram", label: "Instagram post (influencer)" },
  { value: "ad", label: "Ad" },
  { value: "email", label: "Email" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
];

const STAGES = ["Saving draft…", "Running rule checks…", "Checking facts and claims…", "Preparing results…"];

interface FormState {
  title: string;
  channel: Channel;
  goal: string;
  audience: string;
  cta: string;
  text: string;
  imageDataUrl?: string;
  altText: string;
  confidential: boolean;
}

const EMPTY: FormState = { title: "", channel: "instagram", goal: "", audience: "", cta: "", text: "", altText: "", confidential: false };

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function SubmitForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [stage, setStage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSample, setActiveSample] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function loadSample(s: Sample) {
    setError(null);
    setActiveSample(s.key);
    let imageDataUrl: string | undefined;
    if (s.imagePath) {
      try {
        const res = await fetch(s.imagePath);
        if (res.ok) imageDataUrl = await fileToDataUrl(await res.blob());
      } catch {
        /* image samples are optional */
      }
    }
    setForm({ title: s.title, channel: s.channel, goal: s.goal, audience: s.audience, cta: s.cta, text: s.text, imageDataUrl, altText: s.altText ?? "", confidential: !!s.confidential });
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return set("imageDataUrl", undefined);
    if (file.size > 1_500_000) {
      setError("Image is too large. Please use one under 1.5 MB.");
      e.target.value = "";
      return;
    }
    set("imageDataUrl", await fileToDataUrl(file));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage(0);
    const timer = setInterval(() => setStage((s) => (s === null ? s : Math.min(s + 1, STAGES.length - 1))), 1500);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, altText: form.altText || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Something went wrong. Please try again.");
      router.push(`/submissions/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage(null);
    } finally {
      clearInterval(timer);
    }
  }

  const busy = stage !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Diwali serum post" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel">Channel</Label>
            <Select id="channel" value={form.channel} onChange={(e) => set("channel", e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="goal">Goal</Label>
            <Input id="goal" value={form.goal} onChange={(e) => set("goal", e.target.value)} placeholder="What should it achieve?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audience">Audience</Label>
            <Input id="audience" value={form.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Who is it for?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cta">Call to action</Label>
            <Input id="cta" value={form.cta} onChange={(e) => set("cta", e.target.value)} placeholder="e.g. Shop now" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="text">Content</Label>
          <Textarea id="text" rows={8} value={form.text} onChange={(e) => set("text", e.target.value)} placeholder="Paste the post, ad copy, email or document text…" />
          <p className="text-xs text-muted-foreground">{form.text.length} / 5000 characters</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="image">Image (optional)</Label>
            <Input id="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={onImage} />
            {form.imageDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageDataUrl} alt={form.altText || "Uploaded image preview"} className="mt-2 max-h-40 rounded border" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alt">Image alt text</Label>
            <Input id="alt" value={form.altText} onChange={(e) => set("altText", e.target.value)} placeholder="Describe the image for screen readers" />
          </div>
        </div>

        <div className="space-y-1 rounded-lg border p-3">
          <label htmlFor="confidential" className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              id="confidential"
              type="checkbox"
              checked={form.confidential}
              onChange={(e) => set("confidential", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <b>Confidential (unreleased launch):</b> keep this off third-party AI. Rule, palette and alt-text checks run on our server; AI tone and
              claim checks and reading text inside images are skipped. This can&apos;t be switched off later.
            </span>
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            To keep just part of the text away from AI, wrap it in <code className="rounded bg-muted px-1">[[confidential]] … [[/confidential]]</code>.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Checking…" : "Check content"}
          </Button>
          {busy && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {STAGES[stage!]}
            </p>
          )}
        </div>
      </form>

      <aside aria-labelledby="samples-h" className="space-y-2">
        <h2 id="samples-h" className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Try a sample
        </h2>
        <p className="text-xs text-muted-foreground">Fills the form with a draft that has planted errors (one is clean).</p>
        <div className="flex flex-col gap-2">
          {SAMPLES.map((s, i) => (
            <Button
              key={s.key}
              type="button"
              variant={activeSample === s.key ? "default" : "outline"}
              className="justify-start"
              onClick={() => loadSample(s)}
              disabled={busy}
            >
              <span className="text-xs opacity-70">{i + 1}.</span> {s.label}
            </Button>
          ))}
        </div>
      </aside>
    </div>
  );
}
