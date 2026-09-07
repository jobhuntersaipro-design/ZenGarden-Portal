"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteUpload } from "@/actions/purchase-orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Only ever rendered on an upload that never became an order. No typed
 * confirmation: an upload is work in progress, not a sales record, and the
 * file can be uploaded again. A confirmed order keeps the heavier,
 * super-admin-only delete on its detail page.
 */
export function DeleteUploadButton({
  extractionId,
  fileName,
}: {
  extractionId: string;
  fileName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Delete upload ${fileName}`}
        title={`Delete upload ${fileName}`}
        onClick={(event) => {
          // The whole row is a link to the review screen; deleting must not
          // navigate there on the way.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className="rounded-sm p-xxs text-ink-tertiary hover:text-accent-red focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this upload?</DialogTitle>
            <DialogDescription>
              Removes {fileName} and everything read from it. The file itself is
              deleted too, so it would have to be uploaded again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="bg-ink text-canvas hover:bg-ink-deep"
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await deleteUpload(extractionId);
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success("Upload deleted");
              }}
            >
              Delete upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
