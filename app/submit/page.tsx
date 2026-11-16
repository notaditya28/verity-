import { SubmitForm } from "./submit-form";

export default function SubmitPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Submit content for a check</h1>
        <p className="text-sm text-muted-foreground">
          Verity checks it against Lumina Skin’s rules, Fact Registry, terminology and visual identity before it is published.
        </p>
      </div>
      <SubmitForm />
    </div>
  );
}
