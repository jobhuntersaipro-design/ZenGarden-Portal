"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { advanceStage, revertStage } from "@/actions/stages";
import type { PoStage } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { stageLabel } from "@/lib/po-stages";

/**
 * The page's one dark pill, plus — for super admins only — a real secondary
 * button immediately to its left. Move back rewrites history, so it gets the
 * weight of a button and the friction of a confirmation (design reference §3.6).
 */
export function LifecycleActions({
  poId,
  next,
  previous,
  canMoveBack,
}: {
  poId: string;
  next: PoStage | null;
  previous: PoStage | null;
  canMoveBack: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [backNote, setBackNote] = useState("");
  const [backOpen, setBackOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const showMoveBack = canMoveBack && previous !== null;
  if (!next && !showMoveBack) return null;

  return (
    <div className="flex flex-col items-end gap-xxs">
      <div className="flex items-center gap-sm">
        {showMoveBack ? (
          <>
            <Button variant="secondary" onClick={() => setBackOpen(true)}>
              Move back
            </Button>
            <Dialog open={backOpen} onOpenChange={setBackOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Move back to {stageLabel(previous)}?</DialogTitle>
                  <DialogDescription>
                    This move is recorded in the timeline with your name.
                  </DialogDescription>
                </DialogHeader>
                <label
                  htmlFor="back-note"
                  className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
                >
                  Why are you moving it back?
                </label>
                <Textarea
                  id="back-note"
                  rows={2}
                  value={backNote}
                  onChange={(event) => setBackNote(event.target.value)}
                />
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  A note is required when moving back
                </p>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setBackOpen(false)}>
                    Cancel
                  </Button>
                  {/* Not a second dark pill on the page: the drawer-save button. */}
                  <Button
                    variant="secondary"
                    className="bg-ink text-canvas hover:bg-ink-deep"
                    disabled={!backNote.trim() || pending}
                    onClick={async () => {
                      setPending(true);
                      const result = await revertStage(poId, backNote);
                      setPending(false);
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      setBackOpen(false);
                      setBackNote("");
                      toast.success(`Moved back to ${stageLabel(result.data.stage)}`);
                      router.refresh();
                    }}
                  >
                    Move back
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}

        {next ? (
          <Popover>
            <PopoverTrigger asChild>
              {/* The label always names the stage it moves to. */}
              <Button>Advance to {stageLabel(next)}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-md shadow-md">
              <Textarea
                aria-label="Note for the timeline"
                rows={2}
                placeholder="Add a note for the timeline"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                className="mt-sm w-full"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  const result = await advanceStage(poId, note);
                  setPending(false);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setNote("");
                  toast.success(`Moved to ${stageLabel(result.data.stage)}`);
                  router.refresh();
                }}
              >
                Confirm
              </Button>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {showMoveBack ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          Move back is super admin only · asks for confirmation and a note
        </p>
      ) : null}
    </div>
  );
}
