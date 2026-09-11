"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createCustomer } from "@/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

type Company = {
  name: string;
  address: string;
  paymentTerms: string;
  remark: string;
  contactName: string;
  email: string;
  phone: string;
};
type Contact = { name: string; username: string; email: string; phone: string };

const BLANK_COMPANY: Company = {
  name: "",
  address: "",
  paymentTerms: "",
  remark: "",
  contactName: "",
  email: "",
  phone: "",
};
const BLANK_CONTACT: Contact = { name: "", username: "", email: "", phone: "" };

/**
 * Creating a customer: the company, the person who signs the paperwork, and
 * optionally the person who signs in to the shop. Those last two are often the
 * same human and often are not, which is why the shop block prefills from the
 * point of contact rather than reusing it.
 */
export function CustomerForm() {
  const { pending: navigating, push } = useUrlNavigation();
  const [company, setCompany] = useState<Company>(BLANK_COMPANY);
  const [contact, setContact] = useState<Contact>(BLANK_CONTACT);
  const [wantsLogin, setWantsLogin] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);

  const busy = saving || navigating;
  const setC = <K extends keyof Company>(key: K, value: Company[K]) =>
    setCompany((current) => ({ ...current, [key]: value }));
  const setP = <K extends keyof Contact>(key: K, value: Contact[K]) =>
    setContact((current) => ({ ...current, [key]: value }));

  // A prefill, not a binding: editing either side afterwards does not re-sync
  // them. Only empty fields are filled, so reopening the block never
  // overwrites what was typed into it.
  const openLogin = (on: boolean) => {
    setWantsLogin(on);
    if (!on) return;
    setContact((current) => ({
      ...current,
      name: current.name || company.contactName,
      email: current.email || company.email,
      phone: current.phone || company.phone,
    }));
  };

  const submit = async () => {
    setSaving(true);
    const result = await createCustomer({
      company,
      contact: wantsLogin
        ? {
            name: contact.name,
            username: contact.username,
            email: contact.email,
            phone: contact.phone,
          }
        : undefined,
      sendInvite,
    });
    if (!result.success) {
      setSaving(false);
      toast.error(result.error);
      return;
    }
    // `toast.warning` appears nowhere else in this codebase — sonner 2.x has
    // it, but whether this project's `<Toaster>` styles it legibly is unknown
    // until it is seen. Step 5 checks it; if it renders unstyled, fall back to
    // `toast.success` with the same words. It is not an error: the customer
    // was created.
    toast[result.data.invite === "failed" ? "warning" : "success"](
      result.data.invite === "sent"
        ? "Customer created and invitation sent."
        : result.data.invite === "failed"
          ? "Customer created, but we couldn't send the invitation. Use Resend invite on their page."
          : "Customer created.",
    );
    push(`/buyers/${result.data.buyerId}`);
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
      <header className="mb-lg">
        <p className={label}>{company.name ? "Customer" : "New customer"}</p>
        <h1 className="sr-only">New customer</h1>
        <Input
          aria-label="Customer name"
          placeholder="Customer name"
          value={company.name}
          onChange={(event) => setC("name", event.target.value)}
          className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-heading-md)] leading-[1.2] font-[650] tracking-[-0.91px] text-ink placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 sm:text-[length:var(--text-display-md)] sm:tracking-[-1.36px]"
        />
      </header>

      <section className="mb-lg flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className={label}>Company</h2>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-address" className={label}>
            Delivery address
          </label>
          <Textarea
            id="customer-address"
            rows={3}
            value={company.address}
            onChange={(event) => setC("address", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-terms" className={label}>
            Payment terms
          </label>
          <Input
            id="customer-terms"
            placeholder="30 days"
            value={company.paymentTerms}
            onChange={(event) => setC("paymentTerms", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-remark" className={label}>
            Remark
          </label>
          <Textarea
            id="customer-remark"
            rows={3}
            value={company.remark}
            onChange={(event) => setC("remark", event.target.value)}
          />
          <p className={caption}>Only our team sees this — it never appears on the shop.</p>
        </div>
      </section>

      <section className="mb-lg flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className={label}>Point of contact</h2>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-poc" className={label}>
            Name
          </label>
          <Input
            id="customer-poc"
            value={company.contactName}
            onChange={(event) => setC("contactName", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-email" className={label}>
            Email
          </label>
          <Input
            id="customer-email"
            type="email"
            value={company.email}
            onChange={(event) => setC("email", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-xxs">
          <label htmlFor="customer-phone" className={label}>
            Phone
          </label>
          <Input
            id="customer-phone"
            value={company.phone}
            onChange={(event) => setC("phone", event.target.value)}
          />
        </div>
      </section>

      <section className="mb-lg flex flex-col gap-md rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <h2 className={label}>Shop access</h2>
          <label className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
            <Switch checked={wantsLogin} onCheckedChange={openLogin} />
            Give them a shop login
          </label>
        </div>

        {wantsLogin ? (
          <>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-name" className={label}>
                Contact name
              </label>
              <Input
                id="contact-name"
                value={contact.name}
                onChange={(event) => setP("name", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-username" className={label}>
                Username
              </label>
              <Input
                id="contact-username"
                value={contact.username}
                onChange={(event) => setP("username", event.target.value)}
              />
              <p className={caption}>
                They sign in with their email address; this is just how we refer to them.
              </p>
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-email" className={label}>
                Email
              </label>
              <Input
                id="contact-email"
                type="email"
                value={contact.email}
                onChange={(event) => setP("email", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="contact-phone" className={label}>
                Phone
              </label>
              <Input
                id="contact-phone"
                value={contact.phone}
                onChange={(event) => setP("phone", event.target.value)}
              />
            </div>
            <label className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
              <Switch checked={sendInvite} onCheckedChange={setSendInvite} />
              Send the invitation email
            </label>
          </>
        ) : (
          <p className={caption}>
            They can be invited later from their own page.
          </p>
        )}
      </section>

      <Button type="submit" pending={busy}>
        Create customer
      </Button>
    </form>
  );
}
