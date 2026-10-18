"use client";

import { useState, useTransition } from "react";
import type { Role } from "@/generated/prisma/enums";
import { addShipmentNote, deleteShipmentNote, editShipmentNote } from "@/actions/shipments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PersonChip } from "@/components/ui/person";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates";
import { toast } from "@/lib/toast";

export interface ShipmentNote {
  id: string;
  text: string;
  at: string;
  editedAt: string | null;
  author: string;
  image: string | null;
  role: Role | null;
  /** The viewer wrote it, or is a super admin. */
  canChange: boolean;
}

const OFFLINE = "We couldn't reach the server. Try again.";

/**
 * The team's notes on a shipment (2026-10-18), newest first, each with who
 * and when. Its author, or a super admin, can edit or delete a note.
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
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, setDeleting] = useState<ShipmentNote | null>(null);
  const [removing, startRemoving] = useTransition();

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
                toast.error(OFFLINE);
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
          {notes.map((note) =>
            editing?.id === note.id ? (
              <li key={note.id} className="py-sm first:pt-0 last:pb-0">
                <form
                  className="flex flex-col gap-xs"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startSaving(async () => {
                      try {
                        const result = await editShipmentNote(editing);
                        if (!result.success) return void toast.error(result.error);
                        setEditing(null);
                        toast.success("Note saved");
                      } catch {
                        toast.error(OFFLINE);
                      }
                    });
                  }}
                >
                  <label htmlFor={`shipment-note-${note.id}`} className="sr-only">
                    Edit note
                  </label>
                  <Textarea
                    id={`shipment-note-${note.id}`}
                    value={editing.text}
                    onChange={(event) => setEditing({ id: note.id, text: event.target.value })}
                    maxLength={2000}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end gap-xs">
                    <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      pending={saving}
                      disabled={!editing.text.trim() || editing.text.trim() === note.text}
                    >
                      Save
                    </Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={note.id} className="flex flex-col gap-xxs py-sm first:pt-0 last:pb-0">
                <p className="whitespace-pre-line break-words text-[length:var(--text-body-sm)] text-ink">{note.text}</p>
                <div className="flex flex-wrap items-center gap-x-xs text-[length:var(--text-caption)] text-ink-tertiary">
                  <PersonChip name={note.author} image={note.image} role={note.role} size="sm" />
                  <span>· {formatDateTime(note.at)}</span>
                  {note.editedAt ? <span title={`Edited ${formatDateTime(note.editedAt)}`}>· edited</span> : null}
                  {note.canChange ? (
                    <span className="ml-auto flex gap-xxs">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={editing !== null}
                        onClick={() => setEditing({ id: note.id, text: note.text })}
                      >
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(note)}>
                        Delete
                      </Button>
                    </span>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">No notes yet.</p>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !removing && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription className="line-clamp-3 whitespace-pre-line break-words">
              {deleting?.text}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={removing} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={removing}
              onClick={() =>
                deleting &&
                startRemoving(async () => {
                  try {
                    const result = await deleteShipmentNote({ id: deleting.id });
                    if (!result.success) return void toast.error(result.error);
                    setDeleting(null);
                    toast.success("Note deleted");
                  } catch {
                    toast.error(OFFLINE);
                  }
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
