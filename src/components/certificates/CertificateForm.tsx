"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { deleteCertificate, saveCertificate } from "@/actions/certificates";
import type { PresignedCertificate } from "@/app/api/certificates/presign/route";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CERT_LABEL, CERT_TYPES, type CertType } from "@/lib/certification";
import type { CertificateExtraction } from "@/lib/extraction/extract-certificate";
import type { CertificateRow } from "@/lib/queries/certificates";
import { toast } from "@/lib/toast";
import {
  ACCEPT_ATTRIBUTE,
  type AcceptedMimeType,
  rejectionReason,
} from "@/lib/validation/upload";

type Product = { id: string; name: string; sku: string; market: string | null };
type Uploaded = { key: string; name: string; type: AcceptedMimeType; size: number };

const LABEL = "block text-[length:var(--text-body-sm)] font-medium text-ink";
const SELECT =
  "mt-xxs h-control-md w-full rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:text-[length:var(--text-body-sm)]";

/**
 * Upload a certificate and say what it covers (2026-10-14). The file goes
 * straight to R2, Claude reads its type, number and expiry, and a person
 * confirms them. One certificate can cover many products — a Halal
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<Uploaded | null>(null);
  const [type, setType] = useState<CertType>(certificate?.type ?? "HL");
  const [reference, setReference] = useState(certificate?.reference ?? "");
  const [expiresOn, setExpiresOn] = useState(certificate?.expiresOn ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(certificate?.products.map((product) => product.id)),
  );
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
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

  const upload = async (chosen: File) => {
    setError(null);
    setNote(null);
    const reason = rejectionReason({ name: chosen.name, type: chosen.type, size: chosen.size });
    if (reason) {
      setError(reason);
      return;
    }
    setStage("uploading");
    try {
      const presign = await fetch("/api/certificates/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: chosen.name, type: chosen.type, size: chosen.size }),
      });
      const signed = (await presign.json().catch(() => ({}))) as PresignedCertificate & {
        error?: string;
      };
      if (!presign.ok) {
        setError(signed.error ?? "We couldn't start that upload.");
        return;
      }
      const put = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": chosen.type },
        body: chosen,
      });
      if (!put.ok) {
        setError("Storage refused the file. Try again.");
        return;
      }
      const uploaded = {
        key: signed.key,
        name: chosen.name,
        type: chosen.type as AcceptedMimeType,
        size: chosen.size,
      };
      setFile(uploaded);

      setStage("reading");
      const read = await fetch("/api/certificates/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: uploaded.key, type: uploaded.type }),
      });
      const found = (await read.json().catch(() => ({}))) as Partial<CertificateExtraction> & {
        error?: string;
      };
      if (!read.ok) {
        setNote(found.error ?? "We couldn't read it — enter the details by hand.");
        return;
      }
      if (found.kind && found.kind !== "other") setType(found.kind);
      if (found.reference) setReference(found.reference);
      if (found.expiresOn) setExpiresOn(found.expiresOn);
      setNote(
        found.expiresOn
          ? "Read from the file — check the type and the expiry before saving."
          : "No expiry could be read off the file — enter it by hand.",
      );
    } catch {
      setError("The upload was interrupted — check your connection.");
    } finally {
      setStage("idle");
    }
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

  const busy = stage !== "idle" || saving;

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <p className={LABEL}>File</p>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          PDF, PNG or JPG. Claude reads the type, number and expiry; you confirm them.
        </p>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <Button
            type="button"
            variant={file || certificate ? "outline" : "default"}
            disabled={busy}
            pending={stage !== "idle"}
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden className="size-4" />
            {stage === "uploading"
              ? "Uploading…"
              : stage === "reading"
                ? "Reading the certificate…"
                : file || certificate
                  ? "Replace file"
                  : "Choose file"}
          </Button>
          {file || certificate ? (
            <span
              className="min-w-0 truncate text-[length:var(--text-body-sm)] text-ink"
              title={file?.name ?? certificate?.originalName}
            >
              {certificate && !file ? (
                <a
                  href={`/api/certificates/${certificate.id}/url`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-link underline-offset-2 hover:underline"
                >
                  {certificate.originalName}
                </a>
              ) : (
                file?.name
              )}
            </span>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              if (chosen) void upload(chosen);
            }}
          />
        </div>
        {note ? (
          <p role="status" className="mt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
            {note}
          </p>
        ) : null}

        <div className="mt-lg grid gap-md sm:grid-cols-2">
          <label className={LABEL}>
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value as CertType)}
              className={SELECT}
            >
              {CERT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value} · {CERT_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
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

        {error ? (
          <p
            role="alert"
            className="mt-md rounded-sm border border-accent-red px-sm py-xs text-[length:var(--text-body-sm)] text-accent-red"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-lg flex flex-wrap gap-sm">
          <Button type="button" onClick={save} disabled={busy} pending={saving}>
            {certificate ? "Save certificate" : "Upload certificate"}
          </Button>
          {certificate ? (
            <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
              Delete
            </Button>
          ) : null}
        </div>
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
            className="h-control-md min-w-0 flex-1 sm:h-control-sm"
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
    </div>
  );
}
