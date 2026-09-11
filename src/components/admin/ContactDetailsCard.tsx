"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateSupplierDetails } from "@/actions/org-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import type { SupplierSettings } from "@/lib/org-settings";
import { formatDate } from "@/lib/dates";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/** What an empty field shows, so the reader can see what the shop displays today. */
const placeholderFor = (fallback: string | null) =>
  fallback ? `Currently ${fallback} — from the environment` : "Not set";

/**
 * The supplier contact details the public shop displays. Super admin only.
 *
 * An empty field shows its environment value as placeholder text rather than
 * nothing: the fallback is invisible otherwise, and a reader would have to open
 * Vercel to learn what the footer is currently showing.
 */
export function ContactDetailsCard({ settings }: { settings: SupplierSettings }) {
  const refresh = useAwaitableRefresh();
  const [form, setForm] = useState({
    supplierName: settings.stored.name ?? "",
    supplierEmail: settings.stored.email ?? "",
    supplierPhone: settings.stored.phone ?? "",
    supplierAddress: settings.stored.address ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSaving(true);
    try {
      const result = await updateSupplierDetails(form);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Contact details saved.");
      await refresh();
    } catch {
      // An unguarded await here is what left the avatar picker permanently
      // disabled on 2026-09-08.
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-xl rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
        Contact details
      </h2>
      <p className={`mt-xxs ${caption}`}>These appear on your public shop.</p>

      <form
        className="mt-md flex max-w-panel-lg flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-name" className={label}>
            Supplier name
          </label>
          <Input
            id="supplier-name"
            placeholder={placeholderFor(settings.fallback.name)}
            value={form.supplierName}
            onChange={(event) => set("supplierName", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-email" className={label}>
            Email
          </label>
          <Input
            id="supplier-email"
            type="email"
            placeholder={placeholderFor(settings.fallback.email)}
            value={form.supplierEmail}
            onChange={(event) => set("supplierEmail", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-phone" className={label}>
            Phone
          </label>
          <Input
            id="supplier-phone"
            placeholder={placeholderFor(settings.fallback.phone)}
            value={form.supplierPhone}
            onChange={(event) => set("supplierPhone", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="supplier-address" className={label}>
            Address
          </label>
          <Textarea
            id="supplier-address"
            rows={3}
            placeholder={placeholderFor(settings.fallback.address)}
            value={form.supplierAddress}
            onChange={(event) => set("supplierAddress", event.target.value)}
          />
          <p className={caption}>Line breaks are kept, and the footer shows them.</p>
        </div>

        <div className="flex flex-wrap items-center gap-md">
          <Button type="submit" pending={saving}>
            Save
          </Button>
          {settings.updatedAt ? (
            <p className={caption}>
              Last changed
              {settings.updatedByName ? ` by ${settings.updatedByName}` : ""} on{" "}
              {formatDate(settings.updatedAt)}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
