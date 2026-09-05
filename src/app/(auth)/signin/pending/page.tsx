import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { UseDifferentAccount } from "@/components/auth/UseDifferentAccount";

export const metadata: Metadata = {
  title: "Access requested · Loving Hands Portal",
};

/** `?e=` is base64url of the address the visitor signed in with. */
function decodeEmail(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const email = Buffer.from(value, "base64url").toString("utf8");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

const initials = (email: string) => email.slice(0, 2).toUpperCase();

export default async function AccessRequestedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.e;
  const email = decodeEmail(Array.isArray(raw) ? raw[0] : raw);
  const declined = params.declined === "1";

  if (declined) {
    return (
      <AuthCard
        eyebrow="Access declined"
        title="Your request was declined"
        subtitle="Ask your admin if you think that's a mistake."
      >
        <div className="mt-xl">
          <UseDifferentAccount />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Access requested"
      title="You're on the list"
      subtitle="We've sent your request to a Loving Hands admin. You'll get an email at the address below once it's approved — usually within a working day."
    >
      {/* Only what the URL carries is shown. Looking the request up to add the
          real name and avatar would turn this page into a way to test whether
          a given person has asked for access. */}
      {email ? (
        <div className="mt-xl flex items-center gap-sm rounded-sm bg-surface p-sm">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[length:var(--text-caption)] font-semibold text-ink"
          >
            {initials(email)}
          </span>
          <span className="min-w-0 flex-1">
            <span
              title={email}
              className="block truncate text-[length:var(--text-body-sm)] text-ink"
            >
              {email}
            </span>
            <span className="block text-[length:var(--text-caption)] text-ink-tertiary">
              via Google
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary ring-1 ring-brand-amber">
            Pending
          </span>
        </div>
      ) : null}

      <div className="mt-md">
        <UseDifferentAccount />
      </div>
    </AuthCard>
  );
}
