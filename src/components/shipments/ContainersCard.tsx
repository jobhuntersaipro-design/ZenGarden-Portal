"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { createContainer, deleteContainer, deleteContainerMedia, updateContainer } from "@/actions/containers";
import { ContainerGallery, type GalleryItem } from "@/components/shipments/ContainerGallery";
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
import { Textarea } from "@/components/ui/textarea";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate, formatDateTime } from "@/lib/dates";
import { toast } from "@/lib/toast";
import {
  CONTAINER_MEDIA_ACCEPT,
  CONTAINER_SIGNATURE_BYTES,
  containerMediaMatches,
  containerMediaRejection,
  containerMediaType,
} from "@/lib/validation/container-files";
import type { ContainerMediaKind } from "@/generated/prisma/enums";

export type StaffContainer = {
  id: string;
  containerNo: string | null;
  sealNo: string | null;
  size: string | null;
  description: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string | null;
  media: { id: string; kind: ContainerMediaKind; originalName: string; uploadedByName: string; uploadedAt: string }[];
};

const LABEL = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

/** A PUT with progress: a 200 MB video needs to say how far it is. */
function put(url: string, file: File, type: string, onProgress: (pct: number) => void) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/** The loaded containers: numbers, a description, photos and videos. The buyer sees these. */
export function ContainersCard({
  shipmentId,
  containers,
  canManage,
}: {
  shipmentId: string;
  containers: StaffContainer[];
  canManage: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [adding, setAdding] = useState(false);
  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <div className="flex items-center justify-between gap-sm">
        <h2 className={LABEL}>Containers</h2>
        {canManage ? (
          <Button
            variant="secondary"
            className="h-control-md sm:h-control-sm"
            pending={adding}
            onClick={async () => {
              setAdding(true);
              try {
                const result = await createContainer({ shipmentId });
                if (!result.success) return void toast.error(result.error);
                await refresh();
              } finally {
                setAdding(false);
              }
            }}
          >
            Add container
          </Button>
        ) : null}
      </div>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Photos, videos and the description are shown to the buyer on their order, with dates only.
      </p>
      {containers.length === 0 ? (
        <p className="mt-sm text-[length:var(--text-body-sm)] text-ink-secondary">No container yet.</p>
      ) : (
        <div className="mt-sm flex flex-col gap-lg">
          {containers.map((c) => (
            <ContainerBlock key={`${c.id}-${c.updatedAt}`} shipmentId={shipmentId} container={c} canManage={canManage} onSaved={refresh} />
          ))}
        </div>
      )}
    </section>
  );
}

function ContainerBlock({
  shipmentId,
  container: c,
  canManage,
  onSaved,
}: {
  shipmentId: string;
  container: StaffContainer;
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    containerNo: c.containerNo ?? "",
    sealNo: c.sealNo ?? "",
    size: c.size ?? "",
    description: c.description ?? "",
  });
  const dirty =
    values.containerNo !== (c.containerNo ?? "") ||
    values.sealNo !== (c.sealNo ?? "") ||
    values.size !== (c.size ?? "") ||
    values.description !== (c.description ?? "");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "media"; item: GalleryItem } | { kind: "container" } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const base = `/api/shipments/${shipmentId}/containers/${c.id}/media`;

  const upload = async (files: File[]) => {
    const problems: string[] = [];
    let saved = 0;
    for (const [index, file] of files.entries()) {
      const reason = containerMediaRejection(file);
      const type = containerMediaType(file.name, file.type);
      if (reason || !type) {
        problems.push(reason ?? file.name);
        continue;
      }
      if (!containerMediaMatches(type, new Uint8Array(await file.slice(0, CONTAINER_SIGNATURE_BYTES).arrayBuffer()))) {
        problems.push(`${file.name} isn't the kind of file its name says.`);
        continue;
      }
      const label = (pct: number) => setProgress(`Uploading ${index + 1} of ${files.length} · ${file.name} · ${pct}%`);
      label(0);
      try {
        const presign = await fetch(`${base}/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        });
        const signed = (await presign.json().catch(() => ({}))) as { key: string; type: string; url: string; error?: string };
        if (!presign.ok) {
          problems.push(signed.error ?? `${file.name}: we couldn't start that upload.`);
          continue;
        }
        if (!(await put(signed.url, file, signed.type, label))) {
          problems.push(`${file.name}: the upload was interrupted.`);
          continue;
        }
        const done = await fetch(`${base}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: signed.key, name: file.name, type: file.type, size: file.size }),
        });
        if (!done.ok) {
          const detail = (await done.json().catch(() => ({}))) as { error?: string };
          problems.push(detail.error ?? `${file.name}: we couldn't save it.`);
          continue;
        }
        saved++;
      } catch {
        problems.push(`${file.name}: the upload was interrupted.`);
      }
    }
    setProgress(null);
    setErrors(problems);
    if (saved) {
      await onSaved();
      toast.success(`${saved} ${saved === 1 ? "file" : "files"} added`);
    }
  };

  const added = `Added by ${c.createdBy} · ${formatDate(c.createdAt)}`;
  const edited = c.updatedBy ? ` · Last edited by ${c.updatedBy} · ${formatDateTime(c.updatedAt)}` : "";

  return (
    <div
      className={`flex min-w-0 flex-col gap-sm rounded-md border border-hairline p-md ${dragging ? "bg-surface-soft" : ""}`}
      onDragOver={canManage ? (e) => (e.preventDefault(), setDragging(true)) : undefined}
      onDragLeave={canManage ? () => setDragging(false) : undefined}
      onDrop={
        canManage
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              void upload([...e.dataTransfer.files]);
            }
          : undefined
      }
    >
      {canManage ? (
        <form
          className="grid grid-cols-1 gap-sm sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const result = await updateContainer({ id: c.id, ...values });
              if (!result.success) return void toast.error(result.error);
              await onSaved();
              toast.success("Container saved");
            } finally {
              setSaving(false);
            }
          }}
        >
          {(
            [
              ["containerNo", "Container no.", 40],
              ["sealNo", "Seal no.", 40],
              ["size", "Size", 20],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key} className="flex flex-col gap-xxs">
              <span className={LABEL}>{label}</span>
              <Input
                value={values[key]}
                maxLength={max}
                className="h-control-md sm:h-control-sm"
                placeholder={key === "size" ? "40'HC" : undefined}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="flex flex-col gap-xxs sm:col-span-3">
            <span className={LABEL}>Description</span>
            <Textarea
              value={values.description}
              maxLength={2000}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-sm sm:col-span-3">
            <Button type="submit" pending={saving} disabled={!dirty}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => input.current?.click()} disabled={progress !== null}>
              <Upload aria-hidden className="size-4" />
              Add photos or videos
            </Button>
            <Button type="button" variant="destructive" onClick={() => setConfirm({ kind: "container" })}>
              Delete container
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={CONTAINER_MEDIA_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) void upload(files);
              }}
            />
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-sm sm:grid-cols-3">
          {(
            [
              ["Container no.", c.containerNo],
              ["Seal no.", c.sealNo],
              ["Size", c.size],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className={LABEL}>{label}</dt>
              <dd className="text-[length:var(--text-body-sm)] text-ink">{value ?? "—"}</dd>
            </div>
          ))}
          {c.description ? (
            <p className="col-span-full whitespace-pre-line text-[length:var(--text-body-sm)] text-ink">{c.description}</p>
          ) : null}
        </dl>
      )}
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        {added}
        {edited}
      </p>
      {progress ? (
        <p role="status" className="truncate text-[length:var(--text-body-sm)] text-ink-secondary">
          {progress}
        </p>
      ) : null}
      {errors.map((error) => (
        <p key={error} role="alert" className="text-[length:var(--text-body-sm)] text-accent-red">
          {error}
        </p>
      ))}
      {c.media.length ? (
        <ContainerGallery
          base={base}
          items={c.media.map((m) => ({
            id: m.id,
            kind: m.kind,
            originalName: m.originalName,
            by: m.uploadedByName,
            date: formatDate(m.uploadedAt),
          }))}
          onDelete={canManage ? (item) => setConfirm({ kind: "media", item }) : undefined}
        />
      ) : (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          No photos or videos yet.{canManage ? " Drop them here or use Add photos or videos." : ""}
        </p>
      )}
      {canManage ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          JPG or PNG up to 15 MB; MP4, MOV or WebM up to 200 MB. If a video won&apos;t play on a phone, export it as MP4.
        </p>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.kind === "container" ? "Delete this container?" : "Delete this file?"}</DialogTitle>
            <DialogDescription className="break-words">
              {confirm?.kind === "container"
                ? "The container and all its photos and videos are removed, for the buyer too. This cannot be undone."
                : confirm
                  ? `${confirm.item.originalName} is removed, for the buyer too. This cannot be undone.`
                  : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={busy}
              onClick={async () => {
                if (!confirm) return;
                setBusy(true);
                try {
                  const result =
                    confirm.kind === "container"
                      ? await deleteContainer({ id: c.id })
                      : await deleteContainerMedia({ id: confirm.item.id });
                  if (!result.success) return void toast.error(result.error);
                  setConfirm(null);
                  await onSaved();
                  toast.success(confirm.kind === "container" ? "Container deleted" : "File deleted");
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
    </div>
  );
}
