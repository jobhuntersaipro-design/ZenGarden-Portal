"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteUpload } from "@/actions/purchase-orders";
import { RowDeleteButton } from "@/components/purchase-orders/RowDeleteButton";
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
 * super-admin-only delete in `DeletePoDialog`.
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
      <RowDeleteButton
        label={`Delete upload ${fileName}`}
        onOpen={() => setOpen(true)}
      />

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
