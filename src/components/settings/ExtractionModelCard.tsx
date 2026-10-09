"use client";

import { useState, useTransition } from "react";
import { setExtractionModel } from "@/actions/extraction-model";
import { Button } from "@/components/ui/button";
import { EXTRACTION_MODELS } from "@/lib/extraction/model-options";
import { toast } from "@/lib/toast";

const SELECT =
  "h-control-md sm:h-control-sm w-full sm:max-w-72 rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] sm:text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus";

export function ExtractionModelCard({ current }: { current: string }) {
  const [choice, setChoice] = useState(current);
  const [pending, startTransition] = useTransition();
  // A model set by EXTRACTION_MODEL that isn't on the list still shows.
  const listed = EXTRACTION_MODELS.some((m) => m.id === current);

  function save() {
    startTransition(async () => {
      const result = await setExtractionModel(choice).catch(() => ({
        success: false as const,
        error: "We couldn't reach the server. Try again.",
      }));
      if (result.success) toast.success("Model saved — the next upload uses it");
      else toast.error(result.error);
    });
  }

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-xs font-display text-[length:var(--text-heading-sm)] text-ink">
        Document reading
      </h2>
      <p className="mb-md text-[length:var(--text-body-sm)] text-ink-secondary">
        The Claude model that reads uploaded purchase orders and booking
        confirmations. Only you can see this.
      </p>
      <label htmlFor="extraction-model" className="mb-xxs block text-[length:var(--text-body-sm)] text-ink">
        Model
      </label>
      <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
        <select
          id="extraction-model"
          className={SELECT}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={pending}
        >
          {!listed && <option value={current}>{current}</option>}
          {EXTRACTION_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.id}
            </option>
          ))}
        </select>
        <Button onClick={save} pending={pending} disabled={choice === current}>
          Save
        </Button>
      </div>
    </section>
  );
}
