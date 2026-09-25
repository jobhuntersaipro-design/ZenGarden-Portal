"use client";

import { useId, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  ImageIcon,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { Reveal } from "@/components/portal/Reveal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePresence } from "@/hooks/usePresence";
import { formatDate } from "@/lib/dates";
import { pageRange } from "@/lib/queries/pagination";
import type { BuyerDocumentRow } from "@/lib/queries/buyer-documents";
import { formatBytes } from "@/lib/validation/upload";

export const DOCUMENTS_PAGE_SIZE = 10;

export const ACTION =
  "h-control-md min-w-11 gap-xxs px-sm text-[length:var(--text-caption)] sm:h-control-sm sm:min-w-0";

export const downloadHref = (id: string) => `/api/buyer-documents/${id}/url?download=1`;

/** What the row calls the file, from its type rather than its name. */
export function kindOf(mimeType: string): { name: string; Icon: typeof FileText } {
  if (mimeType === "application/pdf") return { name: "PDF", Icon: FileText };
  if (mimeType.startsWith("image/")) return { name: "Image", Icon: ImageIcon };
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return { name: "Excel", Icon: FileSpreadsheet };
  }
  return { name: "Word", Icon: FileText };
}

/**
 * Drag events fire per child element, so a depth count keeps the highlight
 * from flickering as the pointer crosses the rows inside.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  if (!enabled) return { over: false, handlers: {} };
  const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");
  return {
    over,
    handlers: {
      onDragEnter: (event: React.DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (event: React.DragEvent) => {
        if (carriesFiles(event)) event.preventDefault();
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}

/**
 * One folder: a header that collapses it, its files a page at a time, and —
 * for someone who may upload — a drop target and an "Add files" button that
 * file straight into it, so choosing the folder and the files is one act.
 *
 * Paged in the browser rather than the URL, like the PO activity feed: the
 * card is one of several on the buyer's page, and a `?page=` round trip would
 * re-render all of them to show the next ten files of one folder.
 */
export function DocumentFolderSection({
  name,
  documents,
  open,
  onToggle,
  canManage,
  onAddFiles,
  onDropFiles,
  onPreview,
  onMove,
  onDelete,
  leaving,
  fresh,
}: {
  name: string;
  documents: BuyerDocumentRow[];
  /** Rows folding away after a delete, before the refresh takes them. */
  leaving: ReadonlySet<string>;
  /** Rows that have just arrived or moved here, tinted for a moment. */
  fresh: ReadonlySet<string>;
  open: boolean;
  onToggle: () => void;
  canManage: boolean;
  onAddFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onPreview: (doc: BuyerDocumentRow) => void;
  onMove: (doc: BuyerDocumentRow) => void;
  onDelete: (doc: BuyerDocumentRow) => void;
}) {
  const bodyId = useId();
  const [page, setPage] = useState(1);
  const { from, to, pages } = pageRange(page, DOCUMENTS_PAGE_SIZE, documents.length);
  // A folder that shrinks under the reader — a file moved or deleted — must
  // not strand them on a page that no longer exists.
  const current = Math.min(page, pages);
  const shown = documents.slice(
    (current - 1) * DOCUMENTS_PAGE_SIZE,
    current * DOCUMENTS_PAGE_SIZE,
  );
  const drop = useFileDrop(onDropFiles, canManage);
  // Folds rather than cuts, so the folders below are walked, not thrown.
  const { mounted, closing, appear } = usePresence(open);
  const FolderIcon = open ? FolderOpen : Folder;

  const step =
    "inline-flex min-h-control-md items-center rounded-sm px-sm text-[length:var(--text-body-sm)] text-ink transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:text-ink-disabled sm:min-h-control-sm";

  return (
    <div
      {...drop.handlers}
      className={`min-w-0 rounded-md border transition-colors ${
        drop.over ? "border-focus bg-surface" : "border-hairline"
      }`}
    >
      <div className="flex items-center gap-xxs pr-xs">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-control-md min-w-0 flex-1 items-center gap-xs rounded-md px-sm text-left text-[length:var(--text-body-sm)] font-semibold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronRight
            aria-hidden
            className={`size-4 shrink-0 text-ink-tertiary transition-transform ${open ? "rotate-90" : ""}`}
          />
          <FolderIcon aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
          <span className="min-w-0 truncate" title={name}>
            {name}
          </span>
          <span className="shrink-0 font-normal text-ink-tertiary">
            {documents.length} {documents.length === 1 ? "file" : "files"}
          </span>
        </button>
        {canManage ? (
          <Button
            variant="secondary"
            className={ACTION}
            onClick={onAddFiles}
            aria-label={`Add files to ${name}`}
          >
            <Upload aria-hidden className="size-3.5" />
            <span className="max-sm:sr-only">Add files</span>
          </Button>
        ) : null}
      </div>

      {mounted ? (
        <Reveal closing={closing} appear={appear}>
        <div id={bodyId} className="border-t border-hairline">
          {documents.length === 0 ? (
            <p className="px-sm py-md text-[length:var(--text-body-sm)] text-ink-secondary">
              {drop.over
                ? `Drop to add them to ${name}.`
                : "No files yet. Drop files here or use Add files — the folder is kept once a file is in it."}
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {shown.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  leaving={leaving.has(doc.id)}
                  fresh={fresh.has(doc.id)}
                  canManage={canManage}
                  onPreview={onPreview}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
          {documents.length > DOCUMENTS_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-sm border-t border-hairline px-sm py-xxs">
              <span className="tabular-nums text-[length:var(--text-caption)] text-ink-secondary">
                {from}–{to} of {documents.length}
              </span>
              <div className="flex items-center gap-xs">
                <button
                  type="button"
                  className={step}
                  disabled={current <= 1}
                  onClick={() => setPage(current - 1)}
                >
                  Previous
                </button>
                <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                  Page {current} of {pages}
                </span>
                <button
                  type="button"
                  className={step}
                  disabled={current >= pages}
                  onClick={() => setPage(current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
        </Reveal>
      ) : null}
    </div>
  );
}

function DocumentRow({
  doc,
  leaving,
  fresh,
  canManage,
  onPreview,
  onMove,
  onDelete,
}: {
  doc: BuyerDocumentRow;
  leaving: boolean;
  fresh: boolean;
  canManage: boolean;
  onPreview: (doc: BuyerDocumentRow) => void;
  onMove: (doc: BuyerDocumentRow) => void;
  onDelete: (doc: BuyerDocumentRow) => void;
}) {
  const { name: kind, Icon } = kindOf(doc.mimeType);
  const nameClass =
    "block max-w-full truncate text-left text-[length:var(--text-body-sm)] text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  return (
    // A deleted row folds away rather than vanishing, and a row that has just
    // arrived is tinted for a moment, so the eye lands where the action went.
    <li className={fresh ? "animate-just-changed" : undefined}>
    <Reveal closing={leaving} appear={fresh} className="flex flex-col gap-xs px-sm py-xs sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-xs">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-tertiary" />
        <div className="min-w-0">
          {doc.preview ? (
            <button type="button" onClick={() => onPreview(doc)} title={doc.name} className={nameClass}>
              {doc.name}
            </button>
          ) : (
            <a href={downloadHref(doc.id)} title={doc.name} className={nameClass}>
              {doc.name}
            </a>
          )}
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {kind} · {formatBytes(doc.sizeBytes)} · {formatDate(doc.uploadedAt)} · {doc.uploadedBy}
          </p>
        </div>
      </div>
      {/* Icons alone below `sm`: three labelled buttons measured wider than
          the card at 390 and pushed the last one past its edge. Each keeps
          its name for a screen reader. */}
      <div className="flex shrink-0 flex-wrap items-center gap-xxs pl-md sm:pl-0">
        {doc.preview ? (
          <Button
            variant="secondary"
            className={ACTION}
            onClick={() => onPreview(doc)}
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
              <DropdownMenuItem className="min-h-control-md sm:min-h-0" onSelect={() => onMove(doc)}>
                Move to folder…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-control-md text-accent-red sm:min-h-0"
                onSelect={() => onDelete(doc)}
              >
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </Reveal>
    </li>
  );
}
