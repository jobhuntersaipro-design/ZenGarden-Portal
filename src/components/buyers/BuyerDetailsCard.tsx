"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { updateBuyer, type BuyerPatch } from "@/actions/buyers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BuyerLogoField } from "@/components/buyers/BuyerLogoField";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/dates";
import { paymentTermsDaysInput } from "@/lib/payment-terms";

export type BuyerDetails = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
  /** What their shop shows. Null means it shows nothing — see `shop-market.ts`. */
  market: string | null;
  remark: string | null;
  since: string | null;
  /** The versioned logo route, or null when they have none (2026-09-24). */
  logoUrl?: string | null;
};

const CONTACT_FIELDS: { key: keyof BuyerPatch; label: string }[] = [
  { key: "contactName", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Delivery address" },
];

/**
 * Only fields with values are rendered. A card full of blank labelled rows
 * reads as broken, so when there is no contact information at all the card
 * shows one line and an action instead. Payment terms and "buyer since" are
 * always known, so they keep their rows either way.
 */
export function BuyerDetailsCard({
  buyer,
  canRename,
  markets,
  canEditLogo = true,
}: {
  buyer: BuyerDetails;
  canRename: boolean;
  /** Whether the sheet offers the logo: `buyer.manage`, which the route checks too. */
  canEditLogo?: boolean;
  /** The MARKET vocabulary, the same list `Product.market` is chosen from. */
  markets: string[];
}) {
  const refresh = useAwaitableRefresh();
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState<BuyerPatch>({
    contactName: buyer.contactName,
    email: buyer.email,
    phone: buyer.phone,
    address: buyer.address,
    // The **days**, not the stored wording. `optionalPaymentTermsSchema` takes
    // a number of days and refuses anything else, so opening this sheet with
    // the stored "30 days" in the field and saving it back was refused —
    // "Payment terms are a whole number of days, 0 or more." — which blocked
    // every other field on the row, the market included, on every buyer whose
    // terms were written that way (the seed writes all of them that way). The
    // three purchase-order forms have read the field through this helper since
    // 2026-09-22; this one was missed.
    paymentTerms: paymentTermsDaysInput(buyer.paymentTerms) || null,
    market: buyer.market,
    remark: buyer.remark,
    ...(canRename ? { name: buyer.name } : {}),
  });
  const [pending, setPending] = useState(false);

  const present = CONTACT_FIELDS.filter(
    (field) => (buyer[field.key as keyof BuyerDetails] as string | null) !== null,
  );

  const sheet = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">
          {present.length === 0 ? "Add contact details" : "Edit details"}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-panel-lg">
        <SheetHeader>
          <SheetTitle>Edit buyer details</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-md p-md">
          {canEditLogo ? (
            <BuyerLogoField buyerId={buyer.id} name={buyer.name} logoUrl={buyer.logoUrl ?? null} />
          ) : null}

          {canRename ? (
            <div className="flex flex-col gap-xxs">
              <label
                htmlFor="buyer-name"
                className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
              >
                Name
              </label>
              <Input
                id="buyer-name"
                value={patch.name ?? ""}
                onChange={(event) =>
                  setPatch((current) => ({ ...current, name: event.target.value }))
                }
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                The name every PO is matched against. Must stay unique.
              </p>
            </div>
          ) : null}

          {CONTACT_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-xxs">
              <label
                htmlFor={`buyer-${field.key}`}
                className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
              >
                {field.label}
              </label>
              <Input
                id={`buyer-${field.key}`}
                value={(patch[field.key] as string | null) ?? ""}
                onChange={(event) =>
                  setPatch((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}

          {/* Out of that loop and a number input, because it is the one field
              here that is not free text: the column stores "30 days" and the
              form edits the 30. The label says so, as the buyer form's own
              does. */}
          <div className="flex flex-col gap-xxs">
            <label
              htmlFor="buyer-paymentTerms"
              className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
            >
              Payment terms (days)
            </label>
            <Input
              id="buyer-paymentTerms"
              type="number"
              min={0}
              step={1}
              placeholder="30"
              value={patch.paymentTerms ?? ""}
              onChange={(event) =>
                setPatch((current) => ({ ...current, paymentTerms: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-xxs">
            <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Market
            </span>
            <GrowingListPicker
              label="Market"
              value={patch.market ?? null}
              known={markets}
              onChange={(market) => setPatch((current) => ({ ...current, market }))}
            />
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              What they can buy. Their shop shows the products in this market and no
              others; with no market it shows nothing.
            </p>
          </div>

          <div className="flex flex-col gap-xxs">
            <label
              htmlFor="buyer-remark"
              className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
            >
              Remark
            </label>
            <Textarea
              id="buyer-remark"
              value={patch.remark ?? ""}
              onChange={(event) =>
                setPatch((current) => ({ ...current, remark: event.target.value }))
              }
            />
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              Only our team sees this — it never appears on the shop.
            </p>
          </div>

          <Button
            pending={pending}
            onClick={async () => {
              setPending(true);
              const result = await updateBuyer(buyer.id, patch);
              if (!result.success) {
                setPending(false);
                toast.error(result.error);
                return;
              }
              setOpen(false);
              toast.success("Details saved");
              await refresh();
              setPending(false);
            }}
          >
            {pending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-md flex items-start justify-between gap-md">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Details
        </p>
        {sheet}
      </div>

      {present.length === 0 ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          No contact details yet
        </p>
      ) : (
        <dl className="flex flex-col gap-sm">
          {present.map((field) => {
            const value = buyer[field.key as keyof BuyerDetails] as string;
            return (
              <div key={field.key}>
                <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                  {field.label}
                </dt>
                <dd
                  title={value}
                  className="truncate text-[length:var(--text-body-md)] text-ink"
                >
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      <dl className="mt-md flex flex-col gap-sm border-t border-hairline pt-md">
        <div>
          <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Market
          </dt>
          <dd className="text-[length:var(--text-body-md)] text-ink">
            {buyer.market ?? (
              // Amber and a sentence, not "Not set": this is the one field
              // whose absence stops the customer buying anything at all, and
              // a reader should not have to know that to understand the row.
              <span className="text-brand-amber">
                Not set — their shop is empty until it is
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Payment terms
          </dt>
          <dd className="text-[length:var(--text-body-md)] text-ink">
            {buyer.paymentTerms ?? "Not set"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Buyer since
          </dt>
          <dd className="text-[length:var(--text-body-md)] text-ink">
            {buyer.since ? formatDate(buyer.since) : "No orders yet"}
          </dd>
        </div>
        {buyer.remark ? (
          <div>
            <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Remark
            </dt>
            <dd className="whitespace-pre-wrap text-[length:var(--text-body-md)] text-ink">
              {buyer.remark}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
