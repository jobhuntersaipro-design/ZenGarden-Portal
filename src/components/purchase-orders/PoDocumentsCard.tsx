"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { deletePurchaseOrderDocument } from "@/actions/purchase-order-documents";
import type { PresignedPurchaseOrderDocument } from "@/app/api/purchase-orders/[id]/documents/presign/route";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import { toast } from "@/lib/toast";
import type { PurchaseOrderDocumentRow } from "@/lib/queries/purchase-order-documents";
import { formatBytes } from "@/lib/validation/upload";
import {
  MAX_PO_DOCUMENT_BYTES,
  PO_DOCUMENT_ACCEPT,
  PO_DOCUMENT_CONTENTS,
  PO_DOCUMENT_SIGNATURE_BYTES,
  poDocumentContentsReason,
  poDocumentRejectionReason,
  resolvePoDocumentType,
} from "@/lib/validation/po-files";

const ACTION =
  "h-control-md min-w-11 gap-xxs px-sm text-[length:var(--text-caption)] sm:h-control-sm sm:min-w-0";

const downloadHref = (purchaseOrderId: string, documentId: string) =>
  `/api/purchase-orders/${purchaseOrderId}/documents/${documentId}/url?download=1`;

const readPrefix = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.slice(0, PO_DOCUMENT_SIGNATURE_BYTES).arrayBuffer());

/**
 * Files kept on this order. Separate from the original scan above and from
 * the documents on the buyer's account: a file saved here is a row of this
 * order only.
 *
 * Anyone who can open the order sees the list and can open or download.
 * Uploading and deleting need `po.document`, which the routes and the action
 * check again.
 */
export function PoDocumentsCard({
  purchaseOrderId,
  documents,
  canManage,
}: {
  purchaseOrderId: string;
  documents: PurchaseOrderDocumentRow[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState<PurchaseOrderDocumentRow | null>(null);
  const [deleting, setDeleting] = useState<PurchaseOrderDocumentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setError(null);
    const declared = poDocumentRejectionReason(file);
    if (declared) {
      setError(declared);
      return;
    }
    const type = resolvePoDocumentType(file.name, file.type);
    if (!type || poDocumentContentsReason(type, await readPrefix(file))) {
      setError(PO_DOCUMENT_CONTENTS);
      return;
    }

    setUploading(true);
    try {
      const presign = await fetch(`/api/purchase-orders/${purchaseOrderId}/documents/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: file.name, type: file.type, size: file.size }],
        }),
      });
      const signed = (await presign.json().catch(() => ({}))) as PresignedPurchaseOrderDocument & {
        error?: string;
      };
      if (!presign.ok) {
        setError(signed.error ?? "We couldn't start that upload.");
        return;
      }
      const put = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": signed.type },
        body: file,
      });
      if (!put.ok) {
        setError("Storage refused the file. Try again.");
        return;
      }
      const done = await fetch(`/api/purchase-orders/${purchaseOrderId}/documents/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: signed.key,
          name: file.name,
          type: file.type,
          size: file.size,
        }),
      });
      if (!done.ok) {
        const detail = (await done.json().catch(() => ({}))) as { error?: string };
        setError(detail.error ?? "We couldn't save that file.");
        return;
      }
      await refresh();
      toast.success("File saved on this order");
    } catch {
      setError("The upload was interrupted — check your connection.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="mt-lg min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Documents</h2>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Files kept on this order, separate from the original purchase order and from the
        buyer&apos;s account. PDF, JPG or PNG, up to {formatBytes(MAX_PO_DOCUMENT_BYTES)}.
      </p>

      {canManage ? (
        <div className="mt-sm">
          <Button
            type="button"
            className={`${ACTION} shrink-0`}
            disabled={uploading}
            pending={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden className="size-3.5" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={PO_DOCUMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-sm rounded-sm border border-accent-red px-sm py-xs text-[length:var(--text-body-sm)] text-accent-red"
        >
          {error}
        </p>
      ) : null}

      {documents.length === 0 ? (
        <p className="mt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
          No documents on this order yet.
        </p>
      ) : (
        <ul className="mt-sm flex min-w-0 flex-col">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex min-w-0 flex-wrap items-center gap-sm border-b border-hairline py-xs"
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <p className="truncate text-[length:var(--text-body-sm)] text-ink" title={document.name}>
                  {document.name}
                </p>
                <p className="truncate text-[length:var(--text-caption)] text-ink-tertiary">
                  {document.uploadedBy} · {formatDate(document.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-xs">
                <Button
                  type="button"
                  variant="secondary"
                  className={ACTION}
                  onClick={() => setPreviewing(document)}
                >
                  Open
                </Button>
                <Button variant="secondary" className={ACTION} asChild>
                  <a href={downloadHref(purchaseOrderId, document.id)}>
                    <Download aria-hidden className="size-3.5" />
                    Download
                  </a>
                </Button>
                {canManage ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className={ACTION}
                    onClick={() => setDeleting(document)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <SheetContent className="w-full sm:max-w-panel-xl">
          <SheetHeader>
            <SheetTitle className="truncate pr-lg" title={previewing?.name}>
              {previewing?.name}
            </SheetTitle>
            <SheetDescription>
              {previewing
                ? `${formatBytes(previewing.sizeBytes)} · ${formatDate(previewing.createdAt)} · ${previewing.uploadedBy}`
                : null}
            </SheetDescription>
          </SheetHeader>
          {previewing ? (
            <div className="flex min-w-0 flex-col gap-sm p-md pt-0">
              <DocumentPreview
                key={previewing.id}
                documentId={previewing.id}
                originalName={previewing.name}
                urlEndpoint={`/api/purchase-orders/${purchaseOrderId}/documents/${previewing.id}/url`}
                download={
                  <Button variant="secondary" asChild>
                    <a href={downloadHref(purchaseOrderId, previewing.id)}>Download</a>
                  </Button>
                }
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
            <DialogDescription className="break-words">
              {deleting
                ? `${deleting.name} will be removed from this order. The buyer's account documents are not affected. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                try {
                  const result = await deletePurchaseOrderDocument({
                    id: deleting.id,
                    purchaseOrderId,
                  });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setDeleting(null);
                  await refresh();
                  toast.success("File deleted");
                } catch {
                  toast.error("We couldn't reach the server. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
