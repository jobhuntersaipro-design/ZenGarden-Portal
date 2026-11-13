"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, Eye, Pencil, Plus, Upload } from "lucide-react";
import { linkBookingToShipment } from "@/actions/shipments";
import { deleteShipmentDocument, renameShipmentDocument, setCustomsLabel } from "@/actions/shipments";
import type { DocumentUrlResponse } from "@/app/api/documents/[documentId]/url/route";
import type { PresignedShipmentDocument } from "@/app/api/shipments/[id]/documents/presign/route";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { DOT, slotSentence } from "@/components/shipments/ChecklistDots";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ShipmentDocType } from "@/generated/prisma/enums";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import { CUSTOMS_LABELS, SLOT_LABEL, SLOT_SOURCE, docTitle, type ChecklistSlot } from "@/lib/shipments/checklist";
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

/** The shipment's current booking, filed as row 2. Its own record; this card only shows it. */
export type DocsBooking = {
  id: string;
  bookingNumber: string | null;
  originalName: string;
  uploadedByName: string;
  uploadedAt: string;
};

const ACTION = "h-control-md min-w-11 gap-xxs px-sm text-[length:var(--text-caption)] sm:h-control-sm sm:min-w-0";
const NAME_MAX = 80;

type Previewing = { id: string; endpoint: string; name: string; meta: string };
type Deleting = { name: string; sentence: string; run: () => Promise<{ success: boolean; error?: string }> };

/** What an empty slot says: who provides it. No due dates (2026-10-17). */
function emptyNote(slot: ChecklistSlot): { text: string; tone: string } {
  if (slot.state === "optional") return { text: SLOT_SOURCE[slot.key], tone: "text-ink-tertiary" };
  return { text: `Missing · ${SLOT_SOURCE[slot.key]}`, tone: "text-ink-secondary" };
}

/** Presign → PUT → complete. Returns the reason it failed, or null. */
async function uploadFile(
  shipmentId: string,
  file: File,
  body: { docType: ShipmentDocType; label: string | null; replaces?: string },
): Promise<string | null> {
  const reason = shipmentFileRejection(file);
  const mime = shipmentFileType(file.name, file.type);
  if (reason || !mime) return reason;
  const prefix = new Uint8Array(await file.slice(0, PO_DOCUMENT_SIGNATURE_BYTES).arrayBuffer());
  if (poDocumentContentsReason(mime, prefix)) return PO_DOCUMENT_CONTENTS;
  try {
    const presign = await fetch(`/api/shipments/${shipmentId}/documents/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
    });
    const signed = (await presign.json().catch(() => ({}))) as PresignedShipmentDocument & { error?: string };
    if (!presign.ok) return signed.error ?? "We couldn't start that upload.";
    const put = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": signed.type }, body: file });
    if (!put.ok) return "Storage refused the file. Try again.";
    const done = await fetch(`/api/shipments/${shipmentId}/documents/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: signed.key, name: file.name, type: file.type, size: file.size, ...body }),
    });
    if (!done.ok) {
      const detail = (await done.json().catch(() => ({}))) as { error?: string };
      return detail.error ?? "We couldn't save that file.";
    }
    return null;
  } catch {
    return "The upload was interrupted — check your connection.";
  }
}

/**
 * One row per paper, in the flow's order (Phase 63 §4.4), then any paper with
 * no slot of its own ("Add another document"). Replace keeps the old file
 * under "Earlier versions"; Delete removes only the current one.
 */
export function ShipmentDocumentsCard({
  shipmentId,
  slots,
  documents,
  booking,
  canManage,
}: {
  shipmentId: string;
  slots: ChecklistSlot[];
  documents: ShipmentDoc[];
  booking: DocsBooking | null;
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [previewing, setPreviewing] = useState<Previewing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<number[]>([]);
  const docUrl = (doc: ShipmentDoc) => `/api/shipments/${shipmentId}/documents/${doc.id}/url`;

  const previewDoc = (doc: ShipmentDoc) =>
    setPreviewing({
      id: doc.id,
      endpoint: docUrl(doc),
      name: doc.originalName,
      meta: `${docTitle(doc)} · ${formatBytes(doc.sizeBytes)} · ${doc.uploadedByName} · ${formatDate(doc.uploadedAt)}`,
    });
  const deleteDoc = (doc: ShipmentDoc) =>
    setDeleting({
      name: doc.originalName,
      sentence:
        doc.type === "OTHER"
          ? `${doc.originalName} will be removed. Earlier versions stay. This cannot be undone.`
          : `${doc.originalName} will be removed and the ${SLOT_LABEL[doc.type].toLowerCase()} slot left empty. Earlier versions stay. This cannot be undone.`,
      run: () => deleteShipmentDocument({ id: doc.id }),
    });

  // "Other" papers: one row per name, the current file and its earlier versions.
  const others = documents
    .filter((d) => d.type === "OTHER" && !d.supersededAt)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const rowProps = { shipmentId, canManage, onPreview: previewDoc, onDelete: deleteDoc, onSaved: refresh };

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Documents</h2>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Staff only — buyers never see these. PDF, JPG or PNG, up to 25 MB.
      </p>
      <ul className="mt-sm flex min-w-0 flex-col">
        {slots
          .filter((slot) => slot.key !== "PURCHASE_ORDER")
          .map((slot) => {
            if (slot.key === "BOOKING") {
              return (
                <BookingRow
                  key="BOOKING"
                  slot={slot}
                  booking={booking}
                  canManage={canManage}
                  onPreview={setPreviewing}
                  onDelete={setDeleting}
                />
              );
            }
            const type = slot.key as ShipmentDocType;
            const files = documents.filter((d) => d.type === type);
            return (
              <SlotRow
                key={type}
                {...rowProps}
                slot={slot}
                current={files.find((d) => !d.supersededAt) ?? null}
                earlier={files.filter((d) => d.supersededAt)}
              />
            );
          })}
        {others.map((doc) => (
          <OtherRow
            key={doc.id}
            {...rowProps}
            current={doc}
            earlier={documents.filter((d) => d.type === "OTHER" && d.supersededAt && d.label === doc.label)}
          />
        ))}
        {drafts.map((n) => (
          <DraftRow
            key={n}
            shipmentId={shipmentId}
            onCancel={() => setDrafts((all) => all.filter((x) => x !== n))}
            onSaved={async () => {
              await refresh();
              setDrafts((all) => all.filter((x) => x !== n));
            }}
          />
        ))}
      </ul>
      {canManage ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-sm h-control-md gap-xxs sm:h-control-sm"
          onClick={() => setDrafts((all) => [...all, Date.now()])}
        >
          <Plus aria-hidden className="size-3.5" />
          Add another document
        </Button>
      ) : null}

      <Sheet open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <SheetContent className="w-full sm:max-w-panel-xl">
          <SheetHeader>
            <SheetTitle className="truncate pr-lg" title={previewing?.name}>
              {previewing?.name}
            </SheetTitle>
            <SheetDescription>{previewing?.meta}</SheetDescription>
          </SheetHeader>
          {previewing ? (
            <div className="flex min-w-0 flex-col gap-sm p-md pt-0">
              <DocumentPreview
                key={previewing.id}
                documentId={previewing.id}
                originalName={previewing.name}
                urlEndpoint={previewing.endpoint}
                download={<DownloadButton endpoint={previewing.endpoint} name={previewing.name} label />}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
            <DialogDescription className="break-words">{deleting?.sentence}</DialogDescription>
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
                  const result = await deleting.run();
                  if (!result.success) return void toast.error(result.error ?? "We couldn't delete that.");
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

/** Download through a JSON link route: the shipment route redirects, the booking route answers `{ url }`. */
function DownloadButton({ endpoint, name, label }: { endpoint: string; name: string; label?: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className={label ? undefined : ACTION}
      pending={pending}
      aria-label={`Download ${name}`}
      onClick={async () => {
        setPending(true);
        try {
          const response = await fetch(`${endpoint}?download=1`);
          if (!response.ok) throw new Error("no url");
          if (response.redirected) return void (window.location.href = response.url);
          const { url } = (await response.json()) as DocumentUrlResponse;
          window.location.href = url;
        } catch {
          toast.error("We couldn't fetch that file.");
        } finally {
          setPending(false);
        }
      }}
    >
      {label ? null : <Download aria-hidden className="size-3.5" />}
      <span className={label ? undefined : "max-sm:sr-only"}>Download</span>
    </Button>
  );
}

/** Dot, title, then the file (or what is missing), then the row's buttons. */
function RowShell({
  dot,
  title,
  body,
  actions,
  error,
  after,
  onDropFile,
}: {
  dot: { state: ChecklistSlot["state"]; sentence: string };
  title: ReactNode;
  body: ReactNode;
  actions: ReactNode;
  error: string | null;
  after?: ReactNode;
  onDropFile?: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <li
      className={`flex min-w-0 flex-col gap-xs border-b border-hairline py-sm last:border-b-0 ${dragging ? "bg-surface-soft" : ""}`}
      onDragOver={onDropFile ? (e) => (e.preventDefault(), setDragging(true)) : undefined}
      onDragLeave={onDropFile ? () => setDragging(false) : undefined}
      onDrop={
        onDropFile
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) onDropFile(file);
            }
          : undefined
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-sm">
        <div className="flex min-w-0 flex-1 basis-full items-start gap-sm sm:basis-0">
          <span
            title={dot.sentence}
            aria-label={dot.sentence}
            className={`mt-xs block size-2.5 shrink-0 rounded-full border-2 ${DOT[dot.state]}`}
          />
          <div className="min-w-0 flex-1">
            {title}
            {body}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-xs">{actions}</div>
      </div>
      {error ? (
        <p role="alert" className="text-[length:var(--text-body-sm)] text-accent-red">
          {error}
        </p>
      ) : null}
      {after}
    </li>
  );
}

function FileLines({ name, by, at }: { name: string; by: string; at: string }) {
  return (
    <>
      <p className="truncate text-[length:var(--text-body-sm)] text-ink-secondary" title={name}>
        {name}
      </p>
      <p className="truncate text-[length:var(--text-caption)] text-ink-tertiary">
        {by} · {formatDate(at)}
      </p>
    </>
  );
}

const TITLE = "text-[length:var(--text-body-sm)] font-medium text-ink";

type RowProps = {
  shipmentId: string;
  canManage: boolean;
  onPreview: (doc: ShipmentDoc) => void;
  onDelete: (doc: ShipmentDoc) => void;
  onSaved: () => Promise<void>;
};

/** Upload / Replace with its hidden input, shared by every file row. */
function useUpload(shipmentId: string, onSaved: () => Promise<void>) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (file: File, body: Parameters<typeof uploadFile>[2], done: string) => {
    setError(null);
    setUploading(true);
    try {
      const reason = await uploadFile(shipmentId, file, body);
      if (reason) return setError(reason);
      await onSaved();
      toast.success(done);
    } finally {
      setUploading(false);
    }
  };
  return { input, uploading, error, setError, run };
}

function UploadButton({
  replace,
  uploading,
  input,
  onFile,
}: {
  replace: boolean;
  uploading: boolean;
  input: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant={replace ? "secondary" : "default"}
        className={ACTION}
        pending={uploading}
        disabled={uploading}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden className="size-3.5" />
        {uploading ? "Uploading…" : replace ? "Replace" : "Upload"}
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
          if (file) onFile(file);
        }}
      />
    </>
  );
}

function FileActions({ doc, url, onPreview }: { doc: ShipmentDoc; url: string; onPreview: (doc: ShipmentDoc) => void }) {
  return (
    <>
      <Button type="button" variant="secondary" className={ACTION} onClick={() => onPreview(doc)} aria-label={`Preview ${doc.originalName}`}>
        <Eye aria-hidden className="size-3.5" />
        <span className="max-sm:sr-only">Preview</span>
      </Button>
      <Button variant="secondary" className={ACTION} asChild>
        <a href={`${url}?download=1`} aria-label={`Download ${doc.originalName}`}>
          <Download aria-hidden className="size-3.5" />
          <span className="max-sm:sr-only">Download</span>
        </a>
      </Button>
    </>
  );
}

function Earlier({ docs, urlOf }: { docs: ShipmentDoc[]; urlOf: (doc: ShipmentDoc) => string }) {
  if (!docs.length) return null;
  return (
    <details className="pl-lg">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-[length:var(--text-caption)] text-brand-link sm:min-h-0">
        Earlier versions ({docs.length})
      </summary>
      <ul className="mt-xxs flex flex-col gap-xxs">
        {docs.map((doc) => (
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
}: RowProps & { slot: ChecklistSlot; current: ShipmentDoc | null; earlier: ShipmentDoc[] }) {
  const type = slot.key as ShipmentDocType;
  const up = useUpload(shipmentId, onSaved);
  const urlOf = (doc: ShipmentDoc) => `/api/shipments/${shipmentId}/documents/${doc.id}/url`;
  const name = SLOT_LABEL[slot.key];
  const upload = (file: File) =>
    up.run(
      file,
      { docType: type, label: type === "CUSTOMS_FORM" ? (current?.label ?? null) : null },
      current ? `${name} replaced` : `${name} saved`,
    );

  return (
    <RowShell
      dot={{ state: slot.state, sentence: slotSentence(slot) }}
      title={
        <p className={TITLE}>
          {name}
          {type === "CUSTOMS_FORM" && current?.label ? ` (${current.label})` : ""}
        </p>
      }
      body={
        current ? (
          <FileLines name={current.originalName} by={current.uploadedByName} at={current.uploadedAt} />
        ) : (
          <p className={`text-[length:var(--text-caption)] ${emptyNote(slot).tone}`}>{emptyNote(slot).text}</p>
        )
      }
      error={up.error}
      onDropFile={canManage ? upload : undefined}
      after={<Earlier docs={earlier} urlOf={urlOf} />}
      actions={
        <>
          {type === "CUSTOMS_FORM" && current && canManage ? (
            <select
              aria-label="Customs form type"
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] sm:h-control-sm sm:text-[length:var(--text-body-sm)]"
              value={current.label ?? ""}
              onChange={async (e) => {
                const result = await setCustomsLabel({
                  id: current.id,
                  label: (e.target.value || null) as (typeof CUSTOMS_LABELS)[number] | null,
                });
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
          {current ? <FileActions doc={current} url={urlOf(current)} onPreview={onPreview} /> : null}
          {canManage ? <UploadButton replace={!!current} uploading={up.uploading} input={up.input} onFile={upload} /> : null}
          {canManage && current ? (
            <Button type="button" variant="destructive" className={ACTION} onClick={() => onDelete(current)}>
              Delete
            </Button>
          ) : null}
        </>
      }
    />
  );
}

/** Row 2: the booking linked to this shipment, read from its own record. */
function BookingRow({
  slot,
  booking,
  canManage,
  onPreview,
  onDelete,
}: {
  slot: ChecklistSlot;
  booking: DocsBooking | null;
  canManage: boolean;
  onPreview: (p: Previewing) => void;
  onDelete: (d: Deleting) => void;
}) {
  const endpoint = booking ? `/api/booking-confirmations/${booking.id}/url` : "";
  const title = booking?.bookingNumber ? `Booking ${booking.bookingNumber}` : SLOT_LABEL.BOOKING;
  return (
    <RowShell
      dot={{ state: slot.state, sentence: slotSentence(slot) }}
      title={
        booking ? (
          <Link href={`/booking-confirmations/${booking.id}`} className={`${TITLE} underline-offset-2 hover:underline`}>
            {title}
          </Link>
        ) : (
          <p className={TITLE}>{SLOT_LABEL.BOOKING}</p>
        )
      }
      body={
        booking ? (
          <FileLines name={booking.originalName} by={booking.uploadedByName} at={booking.uploadedAt} />
        ) : (
          <p className={`text-[length:var(--text-caption)] ${emptyNote(slot).tone}`}>{emptyNote(slot).text}</p>
        )
      }
      error={null}
      actions={
        <>
          {booking ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className={ACTION}
                aria-label={`Preview ${booking.originalName}`}
                onClick={() =>
                  onPreview({
                    id: booking.id,
                    endpoint,
                    name: booking.originalName,
                    meta: `${title} · ${booking.uploadedByName} · ${formatDate(booking.uploadedAt)}`,
                  })
                }
              >
                <Eye aria-hidden className="size-3.5" />
                <span className="max-sm:sr-only">Preview</span>
              </Button>
              <DownloadButton endpoint={endpoint} name={booking.originalName} />
            </>
          ) : null}
          {canManage ? (
            <Button variant={booking ? "secondary" : "default"} className={ACTION} asChild>
              <Link href="/booking-confirmations/upload">
                <Upload aria-hidden className="size-3.5" />
                {booking ? "Replace" : "Upload"}
              </Link>
            </Button>
          ) : null}
          {canManage && booking ? (
            <Button
              type="button"
              variant="destructive"
              className={ACTION}
              onClick={() =>
                onDelete({
                  name: title,
                  sentence: `${title} will be taken off this shipment and the booking slot left empty. The booking confirmation itself stays under Booking confirmations.`,
                  run: () => linkBookingToShipment({ bookingId: booking.id, shipmentId: null }),
                })
              }
            >
              Delete
            </Button>
          ) : null}
        </>
      }
    />
  );
}

/** A saved paper with no slot of its own: the name typed for it is its title. */
function OtherRow({
  shipmentId,
  current,
  earlier,
  canManage,
  onPreview,
  onDelete,
  onSaved,
}: RowProps & { current: ShipmentDoc; earlier: ShipmentDoc[] }) {
  const up = useUpload(shipmentId, onSaved);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(current.label ?? "");
  const [saving, setSaving] = useState(false);
  const urlOf = (doc: ShipmentDoc) => `/api/shipments/${shipmentId}/documents/${doc.id}/url`;
  const title = docTitle(current);
  const upload = (file: File) =>
    up.run(file, { docType: "OTHER", label: current.label, replaces: current.id }, `${title} replaced`);

  const rename = async () => {
    const trimmed = name.trim();
    if (!trimmed) return up.setError("Give the document a name.");
    setSaving(true);
    try {
      const result = await renameShipmentDocument({ id: current.id, label: trimmed });
      if (!result.success) return up.setError(result.error);
      up.setError(null);
      setEditing(false);
      await onSaved();
      toast.success("Document renamed");
    } catch {
      up.setError("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RowShell
      dot={{ state: "done", sentence: `${title}: uploaded` }}
      title={
        editing ? (
          <form
            className="flex min-w-0 flex-wrap items-center gap-xs"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <Input
              aria-label="Document name"
              value={name}
              maxLength={NAME_MAX}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 basis-48"
            />
            <Button type="submit" className={ACTION} pending={saving}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={ACTION}
              onClick={() => (setEditing(false), setName(current.label ?? ""), up.setError(null))}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <p className={`${TITLE} break-words`}>{title}</p>
        )
      }
      body={<FileLines name={current.originalName} by={current.uploadedByName} at={current.uploadedAt} />}
      error={up.error}
      onDropFile={canManage ? upload : undefined}
      after={<Earlier docs={earlier} urlOf={urlOf} />}
      actions={
        <>
          <FileActions doc={current} url={urlOf(current)} onPreview={onPreview} />
          {canManage && !editing ? (
            <Button type="button" variant="secondary" className={ACTION} onClick={() => setEditing(true)} aria-label={`Rename ${title}`}>
              <Pencil aria-hidden className="size-3.5" />
              <span className="max-sm:sr-only">Rename</span>
            </Button>
          ) : null}
          {canManage ? <UploadButton replace uploading={up.uploading} input={up.input} onFile={upload} /> : null}
          {canManage ? (
            <Button type="button" variant="destructive" className={ACTION} onClick={() => onDelete(current)}>
              Delete
            </Button>
          ) : null}
        </>
      }
    />
  );
}

/** A new "other" paper before it is saved: a name, then a file. Cancel saves nothing. */
function DraftRow({
  shipmentId,
  onCancel,
  onSaved,
}: {
  shipmentId: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { input, uploading, error, setError, run } = useUpload(shipmentId, onSaved);
  const [name, setName] = useState("");
  const pick = () => {
    if (!name.trim()) return setError("Give the document a name.");
    setError(null);
    input.current?.click();
  };
  return (
    <RowShell
      dot={{ state: "missing", sentence: "New document: not uploaded yet" }}
      title={
        <Input
          aria-label="Document name"
          placeholder="Document name, e.g. Telex release"
          value={name}
          maxLength={NAME_MAX}
          autoFocus
          aria-invalid={error === "Give the document a name." || undefined}
          onChange={(e) => setName(e.target.value)}
        />
      }
      body={
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          {name.length}/{NAME_MAX} · PDF, JPG or PNG, up to 25 MB
        </p>
      }
      error={error}
      onDropFile={(file) =>
        name.trim()
          ? void run(file, { docType: "OTHER", label: name.trim() }, `${name.trim()} saved`)
          : setError("Give the document a name.")
      }
      actions={
        <>
          <Button type="button" className={ACTION} pending={uploading} disabled={uploading} onClick={pick}>
            <Upload aria-hidden className="size-3.5" />
            {uploading ? "Uploading…" : "Upload"}
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
              if (file) void run(file, { docType: "OTHER", label: name.trim() }, `${name.trim()} saved`);
            }}
          />
          <Button type="button" variant="secondary" className={ACTION} disabled={uploading} onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
    />
  );
}
