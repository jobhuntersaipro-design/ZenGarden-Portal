"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/actions/auth";
import { FieldLabel } from "@/components/auth/FieldLabel";
import { Notice } from "@/components/auth/Notice";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  if (sent) {
    return (
      <div className="mt-xl flex flex-col gap-md">
        <Notice tone="success">
          If that address has a password, we&rsquo;ve emailed a link. It expires
          in 30 minutes.
        </Notice>
        <Link
          href="/signin"
          className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="mt-xl flex flex-col gap-md"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setPending(true);
        const result = await requestPasswordReset(email);
        setPending(false);
        if (result.success) setSent(true);
        else setError(result.error);
      }}
    >
      {error ? <Notice>{error}</Notice> : null}

      <div className="flex flex-col gap-xxs">
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link"}
      </Button>

      <Link
        href="/signin"
        className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Back to sign in
      </Link>
    </form>
  );
}
