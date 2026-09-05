import { prisma } from "@/lib/prisma";

/** Failed sign-ins tolerated per email and per IP inside the window. */
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;

/** Password reset requests tolerated per email per hour. */
const RESET_MAX_REQUESTS = 3;
const RESET_WINDOW_MINUTES = 60;

/** Attempt rows are useless after a day; swept on 1 call in 50. */
const ATTEMPT_RETENTION_HOURS = 24;
const CLEANUP_ODDS = 50;

/**
 * Thrown by `checkLoginAllowed`. `src/lib/auth.ts` turns it into an Auth.js
 * `CredentialsSignin` so the sign-in form can tell it apart from a wrong
 * password (docs/specs/02-auth.md §3).
 */
export class TooManyAttemptsError extends Error {
  constructor(
    message = `Too many attempts. Try again in ${LOGIN_WINDOW_MINUTES} minutes.`,
  ) {
    super(message);
    this.name = "TooManyAttemptsError";
  }
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/**
 * Serverless has no shared memory, so the counter lives in Postgres. Both
 * dimensions are checked: an attacker spraying one IP across many emails is
 * stopped by the IP count, and a distributed attack on one account by the
 * email count.
 */
export async function checkLoginAllowed(
  email: string,
  ip: string,
): Promise<void> {
  await maybeCleanup();

  const since = minutesAgo(LOGIN_WINDOW_MINUTES);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { email, success: false, at: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: { ip, success: false, at: { gte: since } },
    }),
  ]);

  if (byEmail >= LOGIN_MAX_FAILURES || byIp >= LOGIN_MAX_FAILURES) {
    throw new TooManyAttemptsError();
  }
}

/**
 * Never throws. A failure to write the audit row must not turn a correct
 * password into a rejected sign-in.
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  try {
    await prisma.loginAttempt.create({ data: { email, ip, success } });
  } catch (cause) {
    console.error("[rate-limit] could not record login attempt", cause);
  }
}

/**
 * Reset requests are counted as issued tokens for that user in the last hour.
 * An address with no account issues no token, so it consumes no budget — and
 * it gets the same success copy either way, which is what keeps the endpoint
 * from confirming whether an address exists.
 */
export async function checkPasswordResetAllowed(
  userId: string,
): Promise<boolean> {
  const recent = await prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: minutesAgo(RESET_WINDOW_MINUTES) } },
  });
  return recent < RESET_MAX_REQUESTS;
}

/**
 * A nightly job would be one more thing to own. Sweeping on 1 call in 50 keeps
 * the table small enough without a scheduler; a skipped sweep costs nothing
 * because the window queries are bounded by `at`, not by table size.
 */
async function maybeCleanup(): Promise<void> {
  if (Math.random() * CLEANUP_ODDS >= 1) return;
  try {
    await prisma.loginAttempt.deleteMany({
      where: { at: { lt: minutesAgo(ATTEMPT_RETENTION_HOURS * 60) } },
    });
  } catch (cause) {
    console.error("[rate-limit] could not sweep login attempts", cause);
  }
}

/**
 * Vercel puts the client address first in `x-forwarded-for`. The fallback
 * string still gives the limiter a bucket to count in rather than silently
 * disabling the IP dimension.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
