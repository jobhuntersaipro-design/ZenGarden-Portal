"use client";

import { useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ImageIcon,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { deleteBuyerDocument, moveBuyerDocument } from "@/actions/buyer-documents";
import type { PresignBuyerDocumentsResponse } from "@/app/api/buyers/[id]/documents/presign/route";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
import { DocumentPreview } from "@/components/review/DocumentPreview";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/portal/Spinner";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import type { BuyerDocumentFolder, BuyerDocumentRow } from "@/lib/queries/buyer-documents";
import {
  BUYER_DOCUMENT_ACCEPT,
  MAX_BUYER_DOCUMENTS_PER_CALL,
  documentRejectionReason,
} from "@/lib/validation/buyer-files";
import { formatBytes } from "@/lib/validation/upload";

const ACTION =
  "h-control-md min-w-11 gap-xxs px-sm text-[length:var(--text-caption)] sm:h-control-sm sm:min-w-0";
const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

/** What the row calls the file, from its type rather than its name. */
function kindOf(mimeType: string): { name: string; Icon: typeof FileText } {
  if (mimeType === "application/pdf") return { name: "PDF", Icon: FileText };
  if (mimeType.startsWith("image/")) return { name: "Image", Icon: ImageIcon };
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return { name: "Excel", Icon: FileSpreadsheet };
  }
  return { name: "Word", Icon: FileText };
}

type UploadRow = { name: string; status: "uploading" | "done" | "failed"; reason?: string };

const downloadHref = (id: string) => `/api/buyer-documents/${id}/url?download=1`;

/**
 * The files staff keep against a buyer (2026-09-24): contracts, registration
 * certificates, price lists. Grouped by folder, A–Z, newest first inside each.
 *
 * PDFs and pictures open in a drawer beside the page; Word and Excel cannot be
 * drawn by a browser, so they download. Anyone who can read the buyer sees
 * the list; uploading, moving and deleting need `buyer.manage`, which the
 * routes and actions check again — the hidden buttons are not the permission.
 */
export function BuyerDocumentsCard({
  buyerId,
  folders,
  knownFolders,
  canManage,
}: {
  buyerId: string;
  folders: BuyerDocumentFolder[];
  /** Every folder name in use across buyers, offered when filing. */
  knownFolders: string[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [folderMissing, setFolderMissing] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<BuyerDocumentRow | null>(null);
  const [deleting, setDeleting] = useState<BuyerDocumentRow | null>(null);
  const [moving, setMoving] = useState<{ doc: BuyerDocumentRow; folder: string | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const total = folders.reduce((sum, entry) => sum + entry.documents.length, 0);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return folders;
    return folders
      .map((entry) => ({
        ...entry,
        documents: entry.name.toLowerCase().includes(needle)
          ? entry.documents
          : entry.documents.filter((doc) => doc.name.toLowerCase().includes(needle)),
      }))
      .filter((entry) => entry.documents.length > 0);
  }, [folders, query]);

  const setRow = (name: string, patch: Partial<UploadRow>) =>
    setUploads((rows) => rows.map((row) => (row.name === name ? { ...row, ...patch } : row)));

  const upload = async (files: File[]) => {
    if (!folder) {
      setFolderMissing(true);
      return;
    }
    if (files.length > MAX_BUYER_DOCUMENTS_PER_CALL) {
      toast.error(`Up to ${MAX_BUYER_DOCUMENTS_PER_CALL} files at a time.`);
      return;
    }
    // Refused in the browser first, with the same sentence the server uses,
    // so a wrong file never costs a round trip.
    const rows: UploadRow[] = files.map((file) => {
      const reason = documentRejectionReason(file);
      return reason
        ? { name: file.name, status: "failed", reason }
        : { name: file.name, status: "uploading" };
    });
    setUploads(rows);
    const sendable = files.filter((_, index) => rows[index].status === "uploading");
    if (sendable.length === 0) return;

    setUploading(true);
    try {
      const presign = await fetch(`/api/buyers/${buyerId}/documents/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder,
          files: sendable.map((file) => ({ name: file.name, type: file.type, size: file.size })),
        }),
      });
      const body = (await presign.json()) as PresignBuyerDocumentsResponse & { error?: string };
      if (!presign.ok) {
        for (const file of sendable) {
          setRow(file.name, { status: "failed", reason: body.error ?? "We couldn't start that upload" });
        }
        return;
      }
      for (const error of body.errors) setRow(error.name, { status: "failed", reason: error.reason });

      await Promise.all(
        body.files.map(async (slot) => {
          const file = sendable.find((candidate) => candidate.name === slot.name);
          if (!file) return;
          try {
            const put = await fetch(slot.url, {
              method: "PUT",
              headers: { "Content-Type": slot.type },
              body: file,
            });
            if (!put.ok) throw new Error(`Storage refused the file (${put.status})`);
            const done = await fetch(`/api/buyers/${buyerId}/documents/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                folder,
                key: slot.key,
                name: file.name,
                type: file.type,
                size: file.size,
              }),
            });
            if (!done.ok) {
              const detail = (await done.json().catch(() => ({}))) as { error?: string };
              throw new Error(detail.error ?? "We couldn't save that file");
            }
            setRow(file.name, { status: "done" });
          } catch (cause) {
            setRow(file.name, {
              status: "failed",
              reason:
                cause instanceof TypeError
                  ? "The upload was interrupted — check your connection"
                  : cause instanceof Error
                    ? cause.message
                    : "We couldn't upload that file",
            });
          }
        }),
      );
      await refresh();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
      setUploads((current) =>
        current.map((row) =>
          row.status === "uploading" ? { ...row, status: "failed", reason: "Not sent" } : row,
        ),
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const doneCount = uploads.filter((row) => row.status === "done").length;

  return (
    <section
      aria-labelledby="buyer-documents"
      className="rounded-lg border border-hairline bg-canvas p-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="min-w-0">
          <h2
            id="buyer-documents"
            className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink"
          >
            Documents
          </h2>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {total === 0
              ? "Contracts, registration papers, price lists — kept with this buyer. Staff only."
              : `${total} ${total === 1 ? "file" : "files"} in ${folders.length} ${
                  folders.length === 1 ? "folder" : "folders"
                } · staff only`}
          </p>
        </div>
        {canManage ? (
          <Button
            variant="secondary"
            onClick={() => {
              setUploadOpen((open) => !open);
              setUploads([]);
            }}
            aria-expanded={uploadOpen}
          >
            <Upload aria-hidden className="size-4" />
            Upload files
          </Button>
        ) : null}
      </div>

      {canManage && uploadOpen ? (
        <div className="mt-md flex flex-col gap-sm rounded-md border border-hairline bg-surface p-md">
          <div className="grid gap-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="flex min-w-0 flex-col gap-xxs">
              <span className={label}>Folder</span>
              <GrowingListPicker
                label="Folder"
                value={folder}
                known={knownFolders}
                required
                invalid={folderMissing}
                describedBy={folderMissing ? "folder-missing" : undefined}
                onChange={(value) => {
                  setFolder(value);
                  setFolderMissing(false);
                }}
              />
            </div>
            <Button
              disabled={uploading}
              pending={uploading}
              onClick={() => {
                if (!folder) {
                  setFolderMissing(true);
                  return;
                }
                fileInput.current?.click();
              }}
            >
              {uploading ? "Uploading…" : "Choose files"}
            </Button>
          </div>
          {folderMissing ? (
            <p id="folder-missing" role="alert" className="text-[length:var(--text-caption)] text-accent-red">
              Choose a folder first — or type a new one.
            </p>
          ) : (
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              PDF, images, Word or Excel, up to 25 MB each, {MAX_BUYER_DOCUMENTS_PER_CALL} at a time.
            </p>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={BUYER_DOCUMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose files to upload"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void upload(files);
            }}
          />
          {uploads.length > 0 ? (
            <ul aria-live="polite" className="flex flex-col gap-xxs">
              {uploads.map((row) => (
                <li
                  key={row.name}
                  className="flex min-w-0 items-start gap-xs text-[length:var(--text-body-sm)]"
                >
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                    {row.status === "uploading" ? (
                      <Spinner />
                    ) : (
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${
                          row.status === "done" ? "bg-accent-green" : "bg-accent-red"
                        }`}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink" title={row.name}>
                      {row.name}
                    </span>
                    <span className="block text-[length:var(--text-caption)] text-ink-tertiary">
                      {row.status === "uploading"
                        ? "Uploading…"
                        : row.status === "done"
                          ? `Saved in ${folder}`
                          : row.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {doneCount > 0 && !uploading ? (
            <p className="text-[length:var(--text-caption)] text-ink-secondary">
              {doneCount} {doneCount === 1 ? "file" : "files"} saved.
            </p>
          ) : null}
        </div>
      ) : null}

      {total > 6 ? (
        <Input
          aria-label="Search this buyer's documents"
          placeholder="Search files or folders…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-md h-control-md sm:h-control-sm sm:max-w-80"
        />
      ) : null}

      {total === 0 ? (
        <p className="mt-md rounded-md bg-surface p-md text-[length:var(--text-body-sm)] text-ink-secondary">
          No documents yet.
          {canManage ? " Upload the first — choose a folder like “Contracts” to keep them tidy." : ""}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div className="mt-md flex flex-col gap-md">
          {shown.map((entry) => (
            <div key={entry.name} className="min-w-0">
              <h3 className="flex items-center gap-xs text-[length:var(--text-body-sm)] font-semibold text-ink">
                <FolderOpen aria-hidden className="size-4 text-ink-tertiary" />
                <span className="min-w-0 truncate" title={entry.name}>
                  {entry.name}
                </span>
                <span className="font-normal text-ink-tertiary">{entry.documents.length}</span>
              </h3>
              <ul className="mt-xxs divide-y divide-hairline rounded-md border border-hairline">
                {entry.documents.map((doc) => {
                  const { name: kind, Icon } = kindOf(doc.mimeType);
                  return (
                    <li
                      key={doc.id}
                      className="flex flex-col gap-xs px-sm py-xs sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-xs">
                        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-tertiary" />
                        <div className="min-w-0">
                          {doc.preview ? (
                            <button
                              type="button"
                              onClick={() => setPreviewing(doc)}
                              title={doc.name}
                              className="block max-w-full truncate text-left text-[length:var(--text-body-sm)] text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              {doc.name}
                            </button>
                          ) : (
                            <a
                              href={downloadHref(doc.id)}
                              title={doc.name}
                              className="block max-w-full truncate text-[length:var(--text-body-sm)] text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              {doc.name}
                            </a>
                          )}
                          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                            {kind} · {formatBytes(doc.sizeBytes)} · {formatDate(doc.uploadedAt)} ·{" "}
                            {doc.uploadedBy}
                          </p>
                        </div>
                      </div>
                      {/* Icons alone below `sm`: three labelled buttons measured
                          wider than the card at 390 and pushed the last one
                          past its edge. Each keeps its name for a screen reader. */}
                      <div className="flex shrink-0 flex-wrap items-center gap-xxs pl-md sm:pl-0">
                        {doc.preview ? (
                          <Button
                            variant="secondary"
                            className={ACTION}
                            onClick={() => setPreviewing(doc)}
                            aria-label={`Preview ${doc.name}`}
                          >
                            <Eye aria-hidden className="size-3.5" />
                            <span className="max-sm:sr-only">Preview</span>
                          </Button>
                        ) : null}
                        <Button variant="secondary" className={ACTION} asChild>
                          <a href={downloadHref(doc.id)} aria-label={`Download ${doc.name}`}>
                            <Download aria-hidden className="size-3.5" />
                            <span className="max-sm:sr-only">Download</span>
                          </a>
                        </Button>
                        {canManage ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="secondary"
                                className="size-11 p-0 sm:size-8"
                                aria-label={`More for ${doc.name}`}
                              >
                                <MoreHorizontal aria-hidden className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="min-h-control-md sm:min-h-0"
                                onSelect={() => setMoving({ doc, folder: entry.name })}
                              >
                                Move to folder…
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="min-h-control-md text-accent-red sm:min-h-0"
                                onSelect={() => setDeleting(doc)}
                              >
                                Delete…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* The preview: a wide drawer, so a page reads at a useful size. */}
      <Sheet open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <SheetContent className="w-full sm:max-w-panel-xl">
          <SheetHeader>
            <SheetTitle className="truncate pr-lg" title={previewing?.name}>
              {previewing?.name}
            </SheetTitle>
            <SheetDescription>
              {previewing
                ? `${kindOf(previewing.mimeType).name} · ${formatBytes(previewing.sizeBytes)} · uploaded ${formatDate(previewing.uploadedAt)} by ${previewing.uploadedBy}`
                : null}
            </SheetDescription>
          </SheetHeader>
          {previewing ? (
            <div className="flex min-w-0 flex-col gap-sm p-md pt-0">
              <div>
                <Button variant="secondary" className={ACTION} asChild>
                  <a href={downloadHref(previewing.id)}>
                    <Download aria-hidden className="size-3.5" />
                    Download
                  </a>
                </Button>
              </div>
              <DocumentPreview
                key={previewing.id}
                documentId={previewing.id}
                originalName={previewing.name}
                urlEndpoint={`/api/buyer-documents/${previewing.id}/url`}
                download={
                  <Button variant="secondary" asChild>
                    <a href={downloadHref(previewing.id)}>Download</a>
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
              {deleting?.name} will be removed for everyone. This cannot be undone.
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
                  const result = await deleteBuyerDocument({ id: deleting.id });
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
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moving !== null} onOpenChange={(open) => !open && !busy && setMoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription className="break-words">{moving?.doc.name}</DialogDescription>
          </DialogHeader>
          <GrowingListPicker
            label="Folder"
            value={moving?.folder ?? null}
            known={knownFolders}
            required
            onChange={(value) => setMoving((current) => (current ? { ...current, folder: value } : current))}
          />
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button
              pending={busy}
              disabled={!moving?.folder}
              onClick={async () => {
                if (!moving?.folder) return;
                setBusy(true);
                try {
                  const result = await moveBuyerDocument({ id: moving.doc.id, folder: moving.folder });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setMoving(null);
                  await refresh();
                  toast.success(`Moved to ${result.data.folder}`);
                } catch {
                  toast.error("We couldn't reach the server. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Moving…" : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
