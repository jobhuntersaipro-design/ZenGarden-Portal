"use client";

import { useRef, useState } from "react";
import { Download, Eye, Upload } from "lucide-react";
import { deleteShipmentDocument, setCustomsLabel } from "@/actions/shipments";
import type { PresignedShipmentDocument } from "@/app/api/shipments/[id]/documents/presign/route";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { ChecklistDots } from "@/components/shipments/ChecklistDots";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ShipmentDocType } from "@/generated/prisma/enums";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import type { ChecklistSlot } from "@/lib/shipments/checklist";
import { CUSTOMS_LABELS, SLOT_LABEL } from "@/lib/shipments/checklist";
import { toast } from "@/lib/toast";
import { formatBytes } from "@/lib/validation/upload";
import { PO_DOCUMENT_CONTENTS, PO_DOCUMENT_SIGNATURE_BYTES, poDocumentContentsReason } from "@/lib/validation/po-files";
import { SHIPMENT_FILE_ACCEPT, shipmentFileRejection, shipmentFileType } from "@/lib/validation/shipment-files";

export type ShipmentDoc = {
  id: string;
  type: ShipmentDocType;
  label: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: string;
  supersededAt: string | null;
};

const ACTION = "h-control-md min-w-11 gap-xxs px-sm text-[length:var(--text-caption)] sm:h-control-sm sm:min-w-0";

const NOTE: Partial<Record<ChecklistSlot["state"], string>> = {
  optional: "Optional — for reference",
  not_needed: "Not needed for this shipment",
  missing: "Missing",
};

/**
 * One row per paper, in the flow's order (Phase 63 §4.4). Replace keeps the
 * old file under "Earlier versions"; Delete removes only the current one.
 */
export function ShipmentDocumentsCard({
  shipmentId,
  slots,
  documents,
  canManage,
}: {
  shipmentId: string;
  slots: ChecklistSlot[];
  documents: ShipmentDoc[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [previewing, setPreviewing] = useState<ShipmentDoc | null>(null);
  const [deleting, setDeleting] = useState<ShipmentDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const urlOf = (doc: ShipmentDoc) => `/api/shipments/${shipmentId}/documents/${doc.id}/url`;

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Documents</h2>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Staff only — buyers never see these. PDF, JPG or PNG, up to 25 MB.
      </p>
      <ul className="mt-sm flex min-w-0 flex-col">
        {slots
          .filter((slot) => slot.key !== "BOOKING")
          .map((slot) => {
            const type = slot.key as ShipmentDocType;
            const files = documents.filter((d) => d.type === type);
            return (
              <SlotRow
                key={type}
                shipmentId={shipmentId}
                slot={slot}
                current={files.find((d) => !d.supersededAt) ?? null}
                earlier={files.filter((d) => d.supersededAt)}
                canManage={canManage}
                onPreview={setPreviewing}
                onDelete={setDeleting}
                onSaved={refresh}
              />
            );
          })}
      </ul>

      <Sheet open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <SheetContent className="w-full sm:max-w-panel-xl">
          <SheetHeader>
            <SheetTitle className="truncate pr-lg" title={previewing?.originalName}>
              {previewing?.originalName}
            </SheetTitle>
            <SheetDescription>
              {previewing
                ? `${SLOT_LABEL[previewing.type]} · ${formatBytes(previewing.sizeBytes)} · ${previewing.uploadedByName} · ${formatDate(previewing.uploadedAt)}`
                : null}
            </SheetDescription>
          </SheetHeader>
          {previewing ? (
            <div className="flex min-w-0 flex-col gap-sm p-md pt-0">
              <DocumentPreview
                key={previewing.id}
                documentId={previewing.id}
                originalName={previewing.originalName}
                urlEndpoint={urlOf(previewing)}
                download={
                  <Button variant="secondary" asChild>
                    <a href={`${urlOf(previewing)}?download=1`}>Download</a>
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
                ? `${deleting.originalName} will be removed and the ${SLOT_LABEL[deleting.type].toLowerCase()} slot left empty. Earlier versions stay. This cannot be undone.`
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
                  const result = await deleteShipmentDocument({ id: deleting.id });
                  if (!result.success) return void toast.error(result.error);
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

function SlotRow({
  shipmentId,
  slot,
  current,
  earlier,
  canManage,
  onPreview,
  onDelete,
  onSaved,
}: {
  shipmentId: string;
  slot: ChecklistSlot;
  current: ShipmentDoc | null;
  earlier: ShipmentDoc[];
  canManage: boolean;
  onPreview: (doc: ShipmentDoc) => void;
  onDelete: (doc: ShipmentDoc) => void;
  onSaved: () => Promise<void>;
}) {
  const type = slot.key as ShipmentDocType;
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const urlOf = (doc: ShipmentDoc) => `/api/shipments/${shipmentId}/documents/${doc.id}/url`;
  const name = SLOT_LABEL[type];

  const upload = async (file: File) => {
    setError(null);
    const reason = shipmentFileRejection(file);
    const mime = shipmentFileType(file.name, file.type);
    if (reason || !mime) return setError(reason);
    const prefix = new Uint8Array(await file.slice(0, PO_DOCUMENT_SIGNATURE_BYTES).arrayBuffer());
    if (poDocumentContentsReason(mime, prefix)) return setError(PO_DOCUMENT_CONTENTS);
    setUploading(true);
    try {
      const presign = await fetch(`/api/shipments/${shipmentId}/documents/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
      });
      const signed = (await presign.json().catch(() => ({}))) as PresignedShipmentDocument & { error?: string };
      if (!presign.ok) return setError(signed.error ?? "We couldn't start that upload.");
      const put = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": signed.type }, body: file });
      if (!put.ok) return setError("Storage refused the file. Try again.");
      const done = await fetch(`/api/shipments/${shipmentId}/documents/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: signed.key,
          name: file.name,
          type: file.type,
          size: file.size,
          docType: type,
          label: type === "CUSTOMS_FORM" ? (current?.label ?? "K2") : null,
        }),
      });
      if (!done.ok) {
        const detail = (await done.json().catch(() => ({}))) as { error?: string };
        return setError(detail.error ?? "We couldn't save that file.");
      }
      await onSaved();
      toast.success(current ? `${name} replaced` : `${name} saved`);
    } catch {
      setError("The upload was interrupted — check your connection.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <li
      className={`flex min-w-0 flex-col gap-xs border-b border-hairline py-sm last:border-b-0 ${dragging ? "bg-surface-soft" : ""}`}
      onDragOver={canManage ? (e) => (e.preventDefault(), setDragging(true)) : undefined}
      onDragLeave={canManage ? () => setDragging(false) : undefined}
      onDrop={
        canManage
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void upload(file);
            }
          : undefined
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-sm">
        <div className="flex min-w-0 flex-1 basis-full items-start gap-sm sm:basis-0">
          <span className="mt-xxs">
            <ChecklistDots slots={[slot]} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--text-body-sm)] font-medium text-ink">
              {name}
              {type === "CUSTOMS_FORM" && current?.label ? ` (${current.label})` : ""}
            </p>
            {current ? (
              <>
                <p className="truncate text-[length:var(--text-body-sm)] text-ink-secondary" title={current.originalName}>
                  {current.originalName}
                </p>
                <p className="truncate text-[length:var(--text-caption)] text-ink-tertiary">
                  {current.uploadedByName} · {formatDate(current.uploadedAt)}
                </p>
              </>
            ) : (
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">{NOTE[slot.state]}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          {type === "CUSTOMS_FORM" && current && canManage ? (
            <select
              aria-label="Customs form type"
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] sm:h-control-sm sm:text-[length:var(--text-body-sm)]"
              value={current.label ?? ""}
              onChange={async (e) => {
                const result = await setCustomsLabel({ id: current.id, label: e.target.value || null });
                if (!result.success) toast.error(result.error);
                else await onSaved();
              }}
            >
              <option value="">Type…</option>
              {CUSTOMS_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
          {current ? (
            <>
              <Button type="button" variant="secondary" className={ACTION} onClick={() => onPreview(current)} aria-label={`Preview ${current.originalName}`}>
                <Eye aria-hidden className="size-3.5" />
                <span className="max-sm:sr-only">Preview</span>
              </Button>
              <Button variant="secondary" className={ACTION} asChild>
                <a href={`${urlOf(current)}?download=1`} aria-label={`Download ${current.originalName}`}>
                  <Download aria-hidden className="size-3.5" />
                  <span className="max-sm:sr-only">Download</span>
                </a>
              </Button>
            </>
          ) : null}
          {canManage && slot.state !== "not_needed" ? (
            <>
              <Button
                type="button"
                variant={current ? "secondary" : "default"}
                className={ACTION}
                pending={uploading}
                disabled={uploading}
                onClick={() => input.current?.click()}
              >
                <Upload aria-hidden className="size-3.5" />
                {uploading ? "Uploading…" : current ? "Replace" : "Upload"}
              </Button>
              <input
                ref={input}
                type="file"
                accept={SHIPMENT_FILE_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </>
          ) : null}
          {canManage && current ? (
            <Button type="button" variant="destructive" className={ACTION} onClick={() => onDelete(current)}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-[length:var(--text-body-sm)] text-accent-red">
          {error}
        </p>
      ) : null}
      {earlier.length ? (
        <details className="pl-lg">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-[length:var(--text-caption)] text-brand-link sm:min-h-0">
            Earlier versions ({earlier.length})
          </summary>
          <ul className="mt-xxs flex flex-col gap-xxs">
            {earlier.map((doc) => (
              <li key={doc.id} className="flex min-w-0 flex-wrap items-center gap-xs text-[length:var(--text-caption)] text-ink-tertiary">
                <span className="min-w-0 truncate" title={doc.originalName}>
                  {doc.originalName} · {doc.uploadedByName} · {formatDate(doc.uploadedAt)}
                </span>
                <a
                  href={`${urlOf(doc)}?download=1`}
                  className="inline-flex min-h-11 items-center text-brand-link underline-offset-2 hover:underline sm:min-h-0"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
