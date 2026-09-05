"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { formatDate } from "@/lib/dates";

export type BuyerDetails = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
  since: string | null;
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
}: {
  buyer: BuyerDetails;
  canRename: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState<BuyerPatch>({
    contactName: buyer.contactName,
    email: buyer.email,
    phone: buyer.phone,
    address: buyer.address,
    paymentTerms: buyer.paymentTerms,
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
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit buyer details</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-md p-md">
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

          {[...CONTACT_FIELDS, { key: "paymentTerms" as const, label: "Payment terms" }].map(
            (field) => (
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
            ),
          )}

          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const result = await updateBuyer(buyer.id, patch);
              setPending(false);
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              setOpen(false);
              toast.success("Details saved");
              router.refresh();
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
      </dl>
    </section>
  );
}
