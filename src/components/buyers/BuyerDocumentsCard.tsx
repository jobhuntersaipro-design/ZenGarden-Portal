"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FolderPlus, Upload } from "lucide-react";
import { toast } from "sonner";
import { deleteBuyerDocument, moveBuyerDocument } from "@/actions/buyer-documents";
import type { PresignBuyerDocumentsResponse } from "@/app/api/buyers/[id]/documents/presign/route";
import {
  ACTION,
  DocumentFolderSection,
  downloadHref,
  kindOf,
  useFileDrop,
} from "@/components/buyers/DocumentFolderSection";
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
import { CONCEAL_MS } from "@/hooks/usePresence";
import { ProgressBar } from "@/components/upload/UploadQueue";
import { formatDate } from "@/lib/dates";
import type { BuyerDocumentFolder, BuyerDocumentRow } from "@/lib/queries/buyer-documents";
import {
  BUYER_DOCUMENT_ACCEPT,
  batchesOf,
  canonicalFolder,
  documentRejectionReason,
  folderSchema,
  withDraftFolders,
} from "@/lib/validation/buyer-files";
import { formatBytes } from "@/lib/validation/upload";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

type UploadRow = {
  id: string;
  name: string;
  folder: string;
  status: "uploading" | "done" | "failed";
  reason?: string;
  /** 0–100 while the bytes go up; a 25 MB contract is not a spinner's job. */
  progress?: number;
};

/**
 * The files staff keep against a buyer (2026-09-24): contracts, registration
 * certificates, price lists. Grouped by folder, A–Z, newest first inside each;
 * every folder collapses and pages its files ten at a time.
 *
 * Any number of files go up in one choice or one drop — sent to the presign
 * route in batches of ten, which is that route's limit per request and not the
 * reader's problem. A folder is made with its own "New folder" button rather
 * than by typing into a picker, and lives on this page until a file is filed
 * into it: a folder is a label on a file, so an empty one has nowhere to be
 * stored.
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
  /** Which folder the hidden file input is choosing for. */
  const target = useRef<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [folderMissing, setFolderMissing] = useState(false);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<BuyerDocumentRow | null>(null);
  const [deleting, setDeleting] = useState<BuyerDocumentRow | null>(null);
  const [moving, setMoving] = useState<{ doc: BuyerDocumentRow; folder: string | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  /** Deleted rows folding away before the refresh removes them. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * What the list held before an upload or a move, so the rows that arrived
   * with it can be tinted for a moment afterwards. Null when nothing has.
   */
  const [before, setBefore] = useState<ReadonlySet<string> | null>(null);
  const [moved, setMoved] = useState<string | null>(null);

  const listed = useMemo(
    () => withDraftFolders(folders, drafts, (name) => ({ name, documents: [] })),
    [folders, drafts],
  );
  const pickable = useMemo(
    () =>
      [...new Set([...listed.map((entry) => entry.name), ...knownFolders])].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    [listed, knownFolders],
  );
  const total = folders.reduce((sum, entry) => sum + entry.documents.length, 0);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!needle) return listed;
    return listed
      .map((entry) => ({
        ...entry,
        documents: entry.name.toLowerCase().includes(needle)
          ? entry.documents
          : entry.documents.filter((doc) => doc.name.toLowerCase().includes(needle)),
      }))
      .filter((entry) => entry.documents.length > 0);
  }, [listed, needle]);

  const fresh = useMemo(() => {
    const ids = new Set<string>();
    if (before) {
      for (const entry of folders) {
        for (const doc of entry.documents) if (!before.has(doc.id)) ids.add(doc.id);
      }
    }
    if (moved) ids.add(moved);
    return ids;
  }, [folders, before, moved]);
  /** The tint has played by then; the rows are ordinary again. */
  const settleFresh = () =>
    setTimeout(() => {
      setBefore(null);
      setMoved(null);
    }, 1800);
  const currentIds = () =>
    new Set(folders.flatMap((entry) => entry.documents.map((doc) => doc.id)));

  const setRow = (id: string, patch: Partial<UploadRow>) =>
    setUploads((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const expand = (name: string) =>
    setCollapsed((current) => {
      if (!current.has(name)) return current;
      const next = new Set(current);
      next.delete(name);
      return next;
    });

  /** One file: PUT to storage, then tell the server it arrived. */
  const send = async (row: UploadRow, file: File, slot: PresignBuyerDocumentsResponse["files"][number]) => {
    try {
      // XHR rather than fetch: fetch reports no upload progress.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", slot.url, true);
        xhr.setRequestHeader("Content-Type", slot.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setRow(row.id, { progress: Math.round((event.loaded / event.total) * 100) });
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Storage refused the file (${xhr.status})`));
        xhr.onerror = () => reject(new TypeError("network"));
        xhr.send(file);
      });
      const done = await fetch(`/api/buyers/${buyerId}/documents/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: row.folder,
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
      setRow(row.id, { status: "done" });
    } catch (cause) {
      setRow(row.id, {
        status: "failed",
        reason:
          cause instanceof TypeError
            ? "The upload was interrupted — check your connection"
            : cause instanceof Error
              ? cause.message
              : "We couldn't upload that file",
      });
    }
  };

  const upload = async (files: File[], into: string | null) => {
    if (!into) {
      setUploadOpen(true);
      setFolderMissing(true);
      return;
    }
    expand(into);
    const stamp = Date.now();
    // Refused in the browser first, with the same sentence the server uses,
    // so a wrong file never costs a round trip.
    const rows: UploadRow[] = files.map((file, index) => {
      const reason = documentRejectionReason(file);
      return {
        id: `${stamp}-${index}`,
        name: file.name,
        folder: into,
        status: reason ? "failed" : "uploading",
        reason: reason ?? undefined,
      };
    });
    setUploads(rows);
    const sendable = files
      .map((file, index) => ({ file, row: rows[index] }))
      .filter(({ row }) => row.status === "uploading");
    if (sendable.length === 0) return;

    setBefore(currentIds());
    setUploading(true);
    try {
      for (const batch of batchesOf(sendable)) {
        const presign = await fetch(`/api/buyers/${buyerId}/documents/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder: into,
            files: batch.map(({ file }) => ({ name: file.name, type: file.type, size: file.size })),
          }),
        });
        const body = (await presign.json()) as PresignBuyerDocumentsResponse & { error?: string };
        if (!presign.ok) {
          for (const { row } of batch) {
            setRow(row.id, { status: "failed", reason: body.error ?? "We couldn't start that upload" });
          }
          continue;
        }
        // The route answers by file name, and two files may share one, so
        // each answer is handed to the first file of that name still waiting.
        const waiting = [...batch];
        const take = (name: string) => {
          const index = waiting.findIndex(({ file }) => file.name === name);
          return index === -1 ? null : waiting.splice(index, 1)[0];
        };
        for (const error of body.errors) {
          const entry = take(error.name);
          if (entry) setRow(entry.row.id, { status: "failed", reason: error.reason });
        }
        await Promise.all(
          body.files.map((slot) => {
            const entry = take(slot.name);
            return entry ? send(entry.row, entry.file, slot) : undefined;
          }),
        );
      }
      await refresh();
      settleFresh();
    } catch {
      toast.error("We couldn't reach the server. Try again.");
      setUploads((current) =>
        current.map((row) =>
          row.status === "uploading" ? { ...row, status: "failed", reason: "Not sent" } : row,
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const chooseFiles = (into: string | null) => {
    if (!into) {
      setUploadOpen(true);
      setFolderMissing(true);
      return;
    }
    target.current = into;
    fileInput.current?.click();
  };

  const createFolder = () => {
    const parsed = folderSchema.safeParse(newName);
    if (!parsed.success) {
      setNewNameError(parsed.error.issues[0]?.message ?? "Name the folder.");
      return;
    }
    const name = canonicalFolder(parsed.data, pickable);
    const existing = listed.some((entry) => entry.name === name);
    if (!existing) setDrafts((current) => [...current, name]);
    expand(name);
    setFolder(name);
    setFolderMissing(false);
    setCreating(false);
    setNewName("");
    setNewNameError(null);
    toast.success(existing ? `${name} is already here` : `Folder ${name} created — add files to keep it`);
  };

  const panelDrop = useFileDrop((files) => void upload(files, folder), canManage && uploadOpen);
  const doneCount = uploads.filter((row) => row.status === "done").length;
  const failedCount = uploads.filter((row) => row.status === "failed").length;

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
          <div className="flex flex-wrap gap-xs">
            <Button
              variant="secondary"
              onClick={() => {
                setNewName("");
                setNewNameError(null);
                setCreating(true);
              }}
            >
              <FolderPlus aria-hidden className="size-4" />
              New folder
            </Button>
            <Button
              variant="secondary"
              onClick={() => setUploadOpen((open) => !open)}
              aria-expanded={uploadOpen}
            >
              <Upload aria-hidden className="size-4" />
              Upload files
            </Button>
          </div>
        ) : null}
      </div>

      {canManage && uploadOpen ? (
        <div className="mt-md flex flex-col gap-sm rounded-md border border-hairline bg-surface p-md">
          <div className="flex min-w-0 flex-col gap-xxs">
            <span className={label}>Folder</span>
            <div className="grid gap-xs sm:grid-cols-[minmax(0,1fr)_auto]">
              <GrowingListPicker
                label="Folder"
                value={folder}
                known={pickable}
                required
                invalid={folderMissing}
                describedBy={folderMissing ? "folder-missing" : undefined}
                onChange={(value) => {
                  setFolder(value);
                  setFolderMissing(false);
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setNewName("");
                  setNewNameError(null);
                  setCreating(true);
                }}
              >
                <FolderPlus aria-hidden className="size-4" />
                New folder
              </Button>
            </div>
            {folderMissing ? (
              <p
                id="folder-missing"
                role="alert"
                className="text-[length:var(--text-caption)] text-accent-red"
              >
                Choose a folder first — or make a new one.
              </p>
            ) : null}
          </div>
          <div
            {...panelDrop.handlers}
            className={`flex flex-col items-center gap-xs rounded-md border-2 border-dashed p-md text-center transition-colors ${
              panelDrop.over ? "border-focus bg-canvas" : "border-hairline-strong"
            }`}
          >
            <Upload aria-hidden className="size-5 text-ink-secondary" />
            <p className="text-[length:var(--text-body-sm)] text-ink">
              <span className="max-sm:hidden">
                {folder ? `Drop files here to add them to ${folder}` : "Drop files here"}
              </span>
              <span className="sm:hidden">
                {folder ? `Add files to ${folder}` : "Add files"}
              </span>
            </p>
            <Button disabled={uploading} pending={uploading} onClick={() => chooseFiles(folder)}>
              {uploading ? "Uploading…" : "Choose files"}
            </Button>
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              Select as many as you need — PDF, images, Word or Excel, up to 25 MB each.
            </p>
          </div>
        </div>
      ) : null}

      {canManage ? (
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={BUYER_DOCUMENT_ACCEPT}
          className="sr-only"
          // Driven by the buttons that name a folder. Left in the tree it
          // would be a second, unlabelled stop announcing "Choose File".
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared so choosing the same files again still fires a change.
            event.target.value = "";
            if (files.length > 0) void upload(files, target.current);
          }}
        />
      ) : null}

      {uploads.length > 0 ? (
        <div className="mt-md rounded-md border border-hairline p-sm">
          <div className="flex items-center justify-between gap-sm">
            <p className="text-[length:var(--text-caption)] text-ink-secondary">
              {uploading
                ? `Uploading ${uploads.length} ${uploads.length === 1 ? "file" : "files"} to ${uploads[0].folder}…`
                : `${doneCount} of ${uploads.length} saved in ${uploads[0].folder}${
                    failedCount > 0 ? ` · ${failedCount} not saved` : ""
                  }`}
            </p>
            {!uploading ? (
              <button
                type="button"
                onClick={() => setUploads([])}
                className="min-h-control-md rounded-sm px-xs text-[length:var(--text-caption)] text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-focus sm:min-h-0"
              >
                Clear
              </button>
            ) : null}
          </div>
          <ul aria-live="polite" className="mt-xs flex max-h-60 flex-col gap-xxs overflow-y-auto">
            {uploads.map((row) => (
              <li
                key={row.id}
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
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-ink" title={row.name}>
                    {row.name}
                  </span>
                  {row.status === "uploading" ? (
                    <div className="mt-xxs">
                      <ProgressBar value={row.progress ?? 0} fill="bg-ink" />
                    </div>
                  ) : null}
                  <span className="block text-[length:var(--text-caption)] text-ink-tertiary">
                    {row.status === "uploading"
                      ? `Uploading… ${row.progress ?? 0}%`
                      : row.status === "done"
                        ? `Saved in ${row.folder}`
                        : row.reason}
                  </span>
                </div>
              </li>
            ))}
          </ul>
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

      {listed.length === 0 ? (
        <p className="mt-md rounded-md bg-surface p-md text-[length:var(--text-body-sm)] text-ink-secondary">
          No documents yet.
          {canManage
            ? " Make a folder like “Contracts” with New folder, then add files to it."
            : ""}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div className="mt-md flex flex-col gap-xs">
          {shown.map((entry) => (
            <DocumentFolderSection
              // A new search starts every folder back on its first page.
              key={`${entry.name}\u0000${needle}`}
              name={entry.name}
              documents={entry.documents}
              // A search opens every folder it matched: a hit behind a
              // collapsed header would read as "nothing found".
              open={needle !== "" || !collapsed.has(entry.name)}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(entry.name)) next.delete(entry.name);
                  else next.add(entry.name);
                  return next;
                })
              }
              canManage={canManage}
              onAddFiles={() => {
                setFolder(entry.name);
                setFolderMissing(false);
                chooseFiles(entry.name);
              }}
              onDropFiles={(files) => void upload(files, entry.name)}
              onPreview={setPreviewing}
              onMove={(doc) => setMoving({ doc, folder: entry.name })}
              onDelete={setDeleting}
              leaving={leaving}
              fresh={fresh}
            />
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Name it for what goes in it — Contracts, SSM, Price lists. It is kept once a file is
              in it.
            </DialogDescription>
          </DialogHeader>
          <form
            id="new-folder"
            onSubmit={(event) => {
              event.preventDefault();
              createFolder();
            }}
            className="flex flex-col gap-xxs"
          >
            <Input
              autoFocus
              aria-label="Folder name"
              placeholder="Folder name"
              value={newName}
              aria-invalid={newNameError ? true : undefined}
              aria-describedby={newNameError ? "new-folder-error" : undefined}
              onChange={(event) => {
                setNewName(event.target.value);
                setNewNameError(null);
              }}
              className="h-control-md"
            />
            {newNameError ? (
              <p
                id="new-folder-error"
                role="alert"
                className="text-[length:var(--text-caption)] text-accent-red"
              >
                {newNameError}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-folder">
              Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                // The row starts folding as Delete is pressed, not when the
                // server answers: the action revalidates the page, and its
                // answer removes the row the moment it lands — before any
                // fold started afterwards could play (measured 2026-09-25).
                // If the delete is refused, the row simply opens again.
                const gone = deleting.id;
                setDeleting(null);
                setLeaving((current) => new Set(current).add(gone));
                const unfold = () =>
                  setLeaving((current) => {
                    const next = new Set(current);
                    next.delete(gone);
                    return next;
                  });
                try {
                  const [result] = await Promise.all([
                    deleteBuyerDocument({ id: gone }),
                    new Promise((resolve) => setTimeout(resolve, CONCEAL_MS)),
                  ]);
                  if (!result.success) {
                    unfold();
                    toast.error(result.error);
                    return;
                  }
                  await refresh();
                  unfold();
                  toast.success("File deleted");
                } catch {
                  unfold();
                  toast.error("We couldn't reach the server. Try again.");
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
            known={pickable}
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
                  setMoved(moving.doc.id);
                  await refresh();
                  settleFresh();
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
