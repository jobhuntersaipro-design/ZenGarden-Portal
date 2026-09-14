"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { createBuyer } from "@/actions/admin-buyers";
import { Rise } from "@/components/portal/Rise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

type Draft = {
  name: string;
  contact: { name: string; email: string; phone: string };
  address: string;
  paymentTerms: string;
  remark: string;
};

const BLANK: Draft = {
  name: "",
  contact: { name: "", email: "", phone: "" },
  address: "",
  paymentTerms: "",
  remark: "",
};

/**
 * Creating a buyer: the company and the person who signs in for it. That
 * person always gets shop access — there is no switch to remember and no
 * second block to fill in twice (docs/specs/26-buyer-management.md §3).
 * Address, payment terms and the internal remark are folded away: most
 * buyers are entered from an email signature, and three empty boxes between
 * the reader and Create are three reasons to stop.
 *
 * `afterCreate` is required and has no default: the same form is reached from
 * the portal and from the admin room, and landing a super admin back in the
 * wrong one is the kind of thing a default quietly does forever.
 */
export function BuyerForm({ afterCreate }: { afterCreate: string }) {
  const { pending: navigating, push } = useUrlNavigation();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const moreId = useId();

  const busy = saving || navigating;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setContact = (key: keyof Draft["contact"], value: string) =>
    setDraft((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));

  const submit = async () => {
    setSaving(true);
    try {
      const result = await createBuyer(draft);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Two toasts, one truth each: the buyer exists either way, and only the
      // second says the inbox will be empty — the defect Phase 23 found in
      // exactly this flow was a success toast for an email that never left.
      if (result.data.invite === "sent") {
        toast.success("Buyer created and invitation sent.");
      } else {
        toast.warning(
          "Buyer created, but the invitation didn't send. Use Resend invitation on their page.",
        );
      }
      push(`${afterCreate}/${result.data.buyerId}`);
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="max-w-panel-lg"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* Not `PageHeader`: the title here is the Name field rather than text,
          and an `<input>` cannot live inside its `<h1>`. */}
      <Rise index={0} className="mb-lg">
        <header>
          <p className={label}>{draft.name ? "Buyer" : "New buyer"}</p>
          <h1 className="sr-only">New buyer</h1>
          <Input
            aria-label="Company name"
            placeholder="Company name"
            autoFocus
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            // `md:text-[length:…]` as well as `sm:`: the Input primitive carries its
            // own `md:text-sm`, which outranked the `sm:` size here and left the
            // title at 14px with display-size tracking — measured on Phase 25's
            // form, where the company name rendered squeezed. tailwind-merge
            // drops the primitive's `md:text-sm` for the one passed in.
            className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-heading-md)] leading-[1.2] font-[650] tracking-[-0.91px] text-ink placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 sm:text-[length:var(--text-display-md)] sm:tracking-[-1.36px] md:text-[length:var(--text-display-md)]"
          />
        </header>
      </Rise>

      <Rise index={1} className="mb-lg">
        <section className="flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
          <div>
            <h2 className={label}>Point of contact</h2>
            <p className={`mt-xxs ${caption}`}>
              They get a shop login straight away — an email with a temporary password
              goes to this address.
            </p>
          </div>
          <div className="flex flex-col gap-xxs">
            <label htmlFor="contact-name" className={label}>
              Name
            </label>
            <Input
              id="contact-name"
              autoComplete="off"
              value={draft.contact.name}
              onChange={(event) => setContact("name", event.target.value)}
            />
          </div>
          <div className="grid gap-md sm:grid-cols-2">
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-email" className={label}>
                Email
              </label>
              <Input
                id="contact-email"
                type="email"
                autoComplete="off"
                placeholder="name@buyer.com"
                value={draft.contact.email}
                onChange={(event) => setContact("email", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-phone" className={label}>
                Phone <span className="normal-case">(optional)</span>
              </label>
              <Input
                id="contact-phone"
                autoComplete="off"
                placeholder="+60 12-345 6789"
                value={draft.contact.phone}
                onChange={(event) => setContact("phone", event.target.value)}
              />
            </div>
          </div>
        </section>
      </Rise>

      <Rise index={2} className="mb-lg">
        <section className="rounded-lg border border-hairline bg-canvas">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((open) => !open)}
            className="flex min-h-control-md w-full items-center justify-between gap-sm rounded-lg p-lg text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            <span>
              <span className={`block ${label}`}>More details</span>
              <span className={`mt-xxs block ${caption}`}>
                Delivery address, payment terms and an internal remark. All optional.
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={`size-4 shrink-0 text-ink-tertiary transition-transform duration-200 motion-reduce:transition-none ${
                moreOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {/* The one grid row goes 0fr → 1fr, which is what lets the height
              animate without measuring it. The inner box must be min-h-0 and
              overflow-hidden or the row refuses to shrink below its content. */}
          <div
            id={moreId}
            className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
              moreOpen ? "disclosure-open" : "disclosure-closed"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col gap-md px-lg pb-lg" hidden={!moreOpen}>
                <div className="flex flex-col gap-xxs">
                  <label htmlFor="buyer-address" className={label}>
                    Delivery address
                  </label>
                  <Textarea
                    id="buyer-address"
                    rows={3}
                    value={draft.address}
                    onChange={(event) => set("address", event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-xxs">
                  <label htmlFor="buyer-terms" className={label}>
                    Payment terms
                  </label>
                  <Input
                    id="buyer-terms"
                    placeholder="30 days"
                    value={draft.paymentTerms}
                    onChange={(event) => set("paymentTerms", event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-xxs">
                  <label htmlFor="buyer-remark" className={label}>
                    Remark
                  </label>
                  <Textarea
                    id="buyer-remark"
                    rows={3}
                    value={draft.remark}
                    onChange={(event) => set("remark", event.target.value)}
                  />
                  <p className={caption}>Only our team sees this — it never appears on the shop.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Rise>

      <Rise index={3} className="flex flex-wrap items-center gap-sm">
        <Button type="submit" pending={busy}>
          {busy ? "Creating…" : "Create buyer"}
        </Button>
        <p className={caption}>You can edit everything on their page afterwards.</p>
      </Rise>
    </form>
  );
}
