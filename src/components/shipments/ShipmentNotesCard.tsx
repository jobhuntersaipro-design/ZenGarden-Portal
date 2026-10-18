"use client";

import { useState, useTransition } from "react";
import type { Role } from "@/generated/prisma/enums";
import { addShipmentNote } from "@/actions/shipments";
import { Button } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/person";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates";
import { toast } from "@/lib/toast";

export interface ShipmentNote {
  id: string;
  text: string;
  at: string;
  author: string;
  image: string | null;
  role: Role | null;
}

/**
 * The team's notes on a shipment (2026-10-18), newest first, each with who
 * and when. The note typed on the create form is the oldest entry.
 */
export function ShipmentNotesCard({
  shipmentId,
  notes,
  canManage,
}: {
  shipmentId: string;
  notes: ShipmentNote[];
  canManage: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Notes{notes.length ? ` · ${notes.length}` : ""}
      </h2>
      {canManage ? (
        <form
          className="mb-md flex flex-col gap-xs"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              try {
                const result = await addShipmentNote({ shipmentId, text });
                if (!result.success) return void toast.error(result.error);
                setText("");
                toast.success("Note added");
              } catch {
                toast.error("We couldn't reach the server. Try again.");
              }
            });
          }}
        >
          <label htmlFor="shipment-note-new" className="sr-only">
            Add a note
          </label>
          <Textarea
            id="shipment-note-new"
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
      ) : null}
      {notes.length ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-xxs py-sm first:pt-0 last:pb-0">
              <p className="whitespace-pre-line break-words text-[length:var(--text-body-sm)] text-ink">{note.text}</p>
              <div className="flex flex-wrap items-center gap-x-xs text-[length:var(--text-caption)] text-ink-tertiary">
                <PersonChip name={note.author} image={note.image} role={note.role} size="sm" />
                <span>· {formatDateTime(note.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">No notes yet.</p>
      )}
    </section>
  );
}
