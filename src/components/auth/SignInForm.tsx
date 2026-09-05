"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/auth/FieldLabel";
import { GoogleMark } from "@/components/auth/GoogleMark";
import { Notice } from "@/components/auth/Notice";
import { Button } from "@/components/ui/button";

/** Never says which half was wrong (design reference §3.1). */
const WRONG = "Wrong email or password.";
const RATE_LIMITED = "Too many attempts. Try again in 15 minutes.";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(result.code === "too_many_attempts" ? RATE_LIMITED : WRONG);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("We could not sign you in. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-xl flex flex-col gap-md">
      {error ? <Notice>{error}</Notice> : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-sm" noValidate>
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Members
        </p>

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

        <div className="flex flex-col gap-xxs">
          <FieldLabel
            htmlFor="password"
            action={
              <Link
                href="/forgot-password"
                className="text-[length:var(--text-caption)] text-ink-tertiary underline-offset-2 hover:text-ink-secondary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Forgot password?
              </Link>
            }
          >
            Password
          </FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-xs w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-sm" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[length:var(--text-caption)] text-ink-tertiary">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <div className="flex flex-col gap-xxs">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          New here?
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => signIn("google", { redirectTo: next })}
          className="h-control-oauth w-full gap-xs border-hairline-strong bg-canvas hover:bg-surface"
        >
          <GoogleMark />
          Continue with Google
        </Button>
        {/* Belongs to the Google block, not to the card: at the foot of the card
            it read as applying to both paths (design reference §3.1). */}
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          Use Continue with Google to request access. An admin approves it.
        </p>
      </div>
    </div>
  );
}
