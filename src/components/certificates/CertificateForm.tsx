"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { deleteCertificate, saveCertificate } from "@/actions/certificates";
import type { PresignedCertificate } from "@/app/api/certificates/presign/route";
import {
  FileDropzone,
  type FileDropzoneUpload,
} from "@/components/arc/file-dropzone/file-dropzone";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DOC_LABEL, DOC_TYPES, type DocType } from "@/lib/certification";
import type { CertificateExtraction } from "@/lib/extraction/extract-certificate";
import type { CertificateRow } from "@/lib/queries/certificates";
import { toast } from "@/lib/toast";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  type AcceptedMimeType,
  formatBytes,
  rejectionReason,
} from "@/lib/validation/upload";

type Product = { id: string; name: string; sku: string; market: string | null };
type Uploaded = { key: string; name: string; type: AcceptedMimeType; size: number };

const LABEL = "block text-[length:var(--text-body-sm)] font-medium text-ink";

const TYPE_HINT: Record<DocType, string> = {
  HL: "JAKIM, MUI or another Halal body",
  NOT: "NPRA product notification",
  COA: "A batch's lab results",
  OTHER: "Kept on file — drives no status dot",
};

/** Kind of document Claude reads, as the form's type. */
const fromKind = (kind: CertificateExtraction["kind"]): DocType => (kind === "other" ? "OTHER" : kind);

/** A PUT straight to R2 that reports its progress, which `fetch` cannot. */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress((event.loaded / event.total) * 100);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the file (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("The upload was interrupted — check your connection"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

/**
 * Upload a certificate and say what it covers (2026-10-14). The file goes
 * straight to R2 through Arc's dropzone, Claude reads its type, number and
 * expiry, and a person confirms them. Choosing a type other than the one
 * Claude read asks first: a Halal certificate filed as a COA turns the wrong
 * dot green. One certificate can cover many products — a Halal
 * certificate covers a range — so when it lapses or is replaced they all
 * move together.
 */
export function CertificateForm({
  products,
  certificate,
}: {
  products: Product[];
  certificate?: CertificateRow;
}) {
  const router = useRouter();
  const [file, setFile] = useState<Uploaded | null>(null);
  /** The dropped file itself, shown from the browser while it uploads and is read. */
  const [local, setLocal] = useState<{ url: string; mimeType: string } | null>(null);
  useEffect(() => () => (local ? URL.revokeObjectURL(local.url) : undefined), [local]);
  const [type, setType] = useState<DocType | null>(certificate?.type ?? null);
  /** The type Claude read off the current file, if it read one. */
  const [detected, setDetected] = useState<DocType | null>(null);
  const [asking, setAsking] = useState<DocType | null>(null);
  /** Bumped per file, so a slow read of a replaced file is ignored. */
  const attempt = useRef(0);
  const [reference, setReference] = useState(certificate?.reference ?? "");
  const [expiresOn, setExpiresOn] = useState(certificate?.expiresOn ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(certificate?.products.map((product) => product.id)),
  );
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? products.filter((product) =>
          `${product.name} ${product.sku} ${product.market ?? ""}`.toLowerCase().includes(needle),
        )
      : products;
  }, [products, search]);

  const clearFile = () => {
    attempt.current += 1;
    setFile(null);
    setLocal(null);
    setDetected(null);
    setNote(null);
    setReading(false);
  };

  const read = async (uploaded: Uploaded, mine: number) => {
    setReading(true);
    try {
      const response = await fetch("/api/certificates/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: uploaded.key, type: uploaded.type }),
      });
      const found = (await response.json().catch(() => ({}))) as Partial<CertificateExtraction> & {
        error?: string;
      };
      if (mine !== attempt.current) return;
      if (!response.ok || !found.kind) {
        setNote(found.error ?? "We couldn't read it — choose the type and enter the details by hand.");
        return;
      }
      const kind = fromKind(found.kind);
      setDetected(kind);
      setType(kind);
      if (found.reference) setReference(found.reference);
      if (found.expiresOn) setExpiresOn(found.expiresOn);
      setNote(
        found.expiresOn
          ? `AI read this as ${DOC_LABEL[kind]} — check the number and expiry before saving.`
          : `AI read this as ${DOC_LABEL[kind]}, but no expiry — enter it by hand.`,
      );
    } catch {
      if (mine === attempt.current) setNote("We couldn't reach the server to read it — enter the details by hand.");
    } finally {
      if (mine === attempt.current) setReading(false);
    }
  };

  /** Arc's dropzone calls this per file: presign, PUT with progress, then Claude reads it. */
  const upload: FileDropzoneUpload = async (item, { onProgress, signal }) => {
    const chosen = item.file;
    if (!chosen) throw new Error("No file");
    const mine = ++attempt.current;
    setError(null);
    setNote(null);
    setFile(null);
    setDetected(null);
    const reason = rejectionReason({ name: chosen.name, type: chosen.type, size: chosen.size });
    if (reason) throw new Error(reason);
    setLocal({ url: URL.createObjectURL(chosen), mimeType: chosen.type });
    const presign = await fetch("/api/certificates/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: chosen.name, type: chosen.type, size: chosen.size }),
      signal,
    });
    const signed = (await presign.json().catch(() => ({}))) as PresignedCertificate & { error?: string };
    if (!presign.ok) throw new Error(signed.error ?? "We couldn't start that upload");
    await putWithProgress(signed.url, chosen, onProgress, signal);
    if (mine !== attempt.current) return;
    const uploaded = {
      key: signed.key,
      name: chosen.name,
      type: chosen.type as AcceptedMimeType,
      size: chosen.size,
    };
    setFile(uploaded);
    void read(uploaded, mine);
  };

  /** Picking a type other than the one Claude read asks first. */
  const chooseType = (next: DocType) => {
    if (detected && next !== detected && next !== type) setAsking(next);
    else setType(next);
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = async () => {
    setError(null);
    if (!certificate && !file) return setError("Upload the certificate file.");
    if (!type) return setError("Choose what kind of certificate this is.");
    if (!expiresOn) return setError("Enter the expiry date.");
    setSaving(true);
    try {
      const result = await saveCertificate(
        { type, reference, expiresOn, productIds: [...selected], file },
        certificate?.id,
      );
      if (!result.success) return setError(result.error);
      toast.success(certificate ? "Certificate saved" : "Certificate uploaded");
      router.push("/admin/certifications?view=certificates");
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!certificate || !window.confirm(`Delete ${certificate.originalName}? Its products lose this certificate.`)) return;
    setSaving(true);
    try {
      const result = await deleteCertificate(certificate.id);
      if (!result.success) return setError(result.error);
      toast.success("Certificate deleted");
      router.push("/admin/certifications?view=certificates");
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const busy = reading || saving;

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <p className={LABEL}>File</p>
        {certificate ? (
          <p className="mt-xxs truncate text-[length:var(--text-body-sm)] text-ink-secondary">
            On file:{" "}
            <a
              href={`/api/certificates/${certificate.id}/url`}
              target="_blank"
              rel="noreferrer"
              title={certificate.originalName}
              className="text-brand-link underline-offset-2 hover:underline"
            >
              {certificate.originalName}
            </a>
          </p>
        ) : null}
        <div className="mt-sm">
          <FileDropzone
            multiple={false}
            maxFiles={1}
            accept={ACCEPT_ATTRIBUTE}
            maxSize={MAX_FILE_BYTES}
            compactAt={1}
            label={certificate ? "Replace the file" : "Add the certificate"}
            description="Drop the file here or choose from your device"
            note={`PDF, PNG or JPG — up to ${formatBytes(MAX_FILE_BYTES)}. AI reads the type, number and expiry.`}
            onUpload={upload}
            onFilesChange={(files) => (files.length === 0 ? clearFile() : undefined)}
          />
        </div>
        {reading ? (
          <p role="status" className="mt-sm flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink-secondary">
            <Sparkles aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            <TextShimmer>AI is reading the certificate…</TextShimmer>
          </p>
        ) : note ? (
          <p role="status" className="mt-sm flex items-start gap-xs text-[length:var(--text-body-sm)] text-ink-secondary">
            <Sparkles aria-hidden className="mt-xxs size-4 shrink-0 text-ink-tertiary" />
            {note}
          </p>
        ) : null}

        <p id="cert-type-label" className={`${LABEL} mt-lg`}>
          Type
        </p>
        <RadioCards
          aria-labelledby="cert-type-label"
          className="mt-xs"
          minColumnWidth={170}
          value={type}
          disabled={reading}
          onValueChange={(value) => chooseType(value as DocType)}
          options={DOC_TYPES.map((value) => ({
            value,
            label: DOC_LABEL[value],
            description: TYPE_HINT[value],
            meta:
              detected === value ? (
                <span className="inline-flex items-center gap-xxs text-[length:var(--text-caption)] text-ink-secondary">
                  <Sparkles aria-hidden className="size-3" /> Read by AI
                </span>
              ) : undefined,
          }))}
        />

        <div className="mt-lg grid gap-md sm:grid-cols-2">
          <label className={LABEL}>
            Certificate number
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="As printed"
              className="mt-xxs"
            />
          </label>
          {/* Typed, not the month-by-month calendar: a Halal certificate runs
              years ahead, and correcting the year Claude read is one keystroke. */}
          <label className={LABEL}>
            Expires
            <Input
              type="date"
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
              className="mt-xxs"
            />
          </label>
        </div>

        {local || certificate ? (
          <>
            <p className={`${LABEL} mt-lg`}>Preview</p>
            <div className="mt-xs">
              <DocumentPreview
                key={local?.url ?? certificate?.id}
                documentId={certificate?.id ?? "new"}
                originalName={local ? "the uploaded file" : (certificate?.originalName ?? "")}
                file={local ?? undefined}
                urlEndpoint={certificate ? `/api/certificates/${certificate.id}/url?preview=1` : undefined}
                download={
                  certificate && !local ? (
                    <Button variant="secondary" asChild>
                      <a href={`/api/certificates/${certificate.id}/url?download=1`}>Download</a>
                    </Button>
                  ) : (
                    <span />
                  )
                }
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <p className={LABEL}>Covers</p>
          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
            {selected.size} of {products.length} products
          </p>
        </div>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          Every product this certificate is for. A product&apos;s market is its country.
        </p>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <Input
            aria-label="Search products"
            placeholder="Product, SKU or market…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-control-md min-w-0 basis-full sm:h-control-sm sm:basis-auto sm:flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelected((current) => new Set([...current, ...shown.map((p) => p.id)]))}
          >
            Select {search.trim() ? "these" : "all"} ({shown.length})
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
        <ul className="mt-sm max-h-preview overflow-y-auto rounded-sm border border-hairline">
          {shown.map((product) => (
            <li key={product.id} className="border-b border-hairline last:border-b-0">
              <label className="flex min-h-control-md cursor-pointer items-center gap-sm px-sm py-xxs hover:bg-surface-soft">
                <Checkbox
                  checked={selected.has(product.id)}
                  onCheckedChange={(on) => toggle(product.id, on === true)}
                  aria-label={product.name}
                />
                <span className="min-w-0 flex-1">
                  <span title={product.name} className="block truncate text-[length:var(--text-body-sm)] text-ink">
                    {product.name}
                  </span>
                  <span className="block truncate text-[length:var(--text-caption)] text-ink-tertiary">
                    {product.sku}
                    {product.market ? ` · ${product.market}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-sm py-md text-[length:var(--text-body-sm)] text-ink-tertiary">
              No product matches.
            </li>
          ) : null}
        </ul>
      </section>

      {/* Below both cards, so a phone ticks the products before it saves. */}
      <div className="flex flex-col gap-md lg:col-span-2">
        {error ? (
          <p
            role="alert"
            className="rounded-sm border border-accent-red px-sm py-xs text-[length:var(--text-body-sm)] text-accent-red"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-sm">
          <Button type="button" onClick={save} disabled={busy} pending={saving}>
            {certificate ? "Save certificate" : "Upload certificate"}
          </Button>
          {certificate ? (
            <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={asking !== null} onOpenChange={(next) => (next ? null : setAsking(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change the type to {asking ? DOC_LABEL[asking] : ""}?</DialogTitle>
            <DialogDescription>
              AI read this file as {detected ? DOC_LABEL[detected] : ""}.{" "}
              {asking === "OTHER"
                ? "Filed as Other, it turns no dot green on the products it covers."
                : `Filing it as ${asking ? DOC_LABEL[asking] : ""} changes which dot it turns green on every product it covers.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(null)}>
              Keep {detected ? DOC_LABEL[detected] : ""}
            </Button>
            <Button
              onClick={() => {
                setType(asking);
                setAsking(null);
              }}
            >
              Change to {asking ? DOC_LABEL[asking] : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
