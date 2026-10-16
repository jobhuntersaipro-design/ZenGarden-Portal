"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { addPoNote } from "@/actions/stages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * A note on an order on its own (Phase 66). Lands at the top of Notes and
 * activity once the action's revalidation answers. Staff only.
 */
export function AddNoteForm({ poId }: { poId: string }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mb-md flex flex-col gap-xs"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          try {
            const result = await addPoNote(poId, text);
            if (result.success) {
              setText("");
              toast.success("Note added");
            } else {
              toast.error(result.error);
            }
          } catch {
            toast.error("We couldn't reach the server. Try again.");
          }
        });
      }}
    >
      <label htmlFor="po-note" className="sr-only">
        Add a note
      </label>
      <Textarea
        id="po-note"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Add a note for the team…"
        maxLength={2000}
        rows={2}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" pending={pending} disabled={!text.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}
