import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { authConfig } from "@/lib/auth.config";
import { resolveGoogleSignIn } from "@/lib/auth-access";
import { prisma } from "@/lib/prisma";
import {
  TooManyAttemptsError,
  checkLoginAllowed,
  clientIp,
  recordLoginAttempt,
} from "@/lib/rate-limit";
import { signInSchema } from "@/lib/validation/auth";

/** How long a token may go without being re-checked against the database. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
/** How often `User.lastActiveAt` is written. */
const ACTIVITY_INTERVAL_MS = 10 * 60_000;

/**
 * Auth.js puts `code` in the URL, so it must not hint at anything sensitive.
 * "Wrong email or password" is deliberately one code for both halves; the
 * rate-limit code is separate because the user needs to be told to wait.
 */
class RateLimitedError extends CredentialsSignin {
  code = "too_many_attempts";
}

/**
 * Server instances are reused between requests, so this keeps the
 * `lastActiveAt` write off the hot path even when the refreshed token cannot
 * be persisted back to the cookie (a Server Component render, for instance).
 */
const lastActivityWrite = new Map<string, number>();

async function touchLastActive(userId: string): Promise<void> {
  const previous = lastActivityWrite.get(userId) ?? 0;
  if (Date.now() - previous < ACTIVITY_INTERVAL_MS) return;
  lastActivityWrite.set(userId, Date.now());
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  } catch (cause) {
    console.error("[auth] could not write lastActiveAt", cause);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    // `allowDangerousEmailAccountLinking` is deliberate. An admin creates a user
    // with a password (Phase 09); that same person must be able to press
    // "Continue with Google" on the same address and land in the same account
    // rather than hit an OAuthAccountNotLinked wall. The usual risk — an
    // attacker claiming an address they do not own — does not apply because
    // Google has already verified the address, and this is the only OAuth
    // provider the portal accepts.
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = clientIp(request.headers);

        try {
          await checkLoginAllowed(email, ip);
        } catch (cause) {
          if (cause instanceof TooManyAttemptsError) throw new RateLimitedError();
          throw cause;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        const usable = user && !user.disabledAt && user.passwordHash;
        // The hash comparison is skipped when there is nothing to compare
        // against, so an unknown address answers faster than a known one. That
        // is acceptable here: the portal has no self-service sign-up, so the
        // set of addresses is not a secret worth defending with a dummy hash.
        const ok = Boolean(usable) && (await compare(password, user!.passwordHash!));

        await recordLoginAttempt(email, ip, ok);
        if (!ok) return null;

        return {
          id: user!.id,
          email: user!.email,
          name: user!.name,
          image: user!.image,
          role: user!.role,
          mustChangePassword: user!.mustChangePassword,
          sessionVersion: user!.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account, profile }) {
      // `authorize` has already vetted the credentials path completely.
      if (account?.provider !== "google") return true;

      const email = (profile?.email ?? user.email)?.trim().toLowerCase();
      if (!email) return false;

      // `allowDangerousEmailAccountLinking` rests entirely on Google having
      // verified the address. On the rare account where it has not, linking
      // would let a stranger take over an admin-created user by claiming their
      // address, so the sign-in stops here.
      if (profile && profile.email_verified === false) {
        return "/signin?error=unverified";
      }

      return resolveGoogleSignIn({
        email,
        name: profile?.name ?? user.name ?? email,
        image: (profile?.picture as string | undefined) ?? user.image ?? null,
      });
    },

    async jwt({ token, user, trigger }) {
      // A fresh sign-in has already proved who it is, so it adopts whatever
      // `sessionVersion` the row carries rather than being measured against it.
      const isSignIn = Boolean(user?.id);
      if (user?.id) {
        token.id = user.id;
        token.refreshedAt = 0; // force the read below on this first pass
      }

      const userId = token.id ?? (token.sub as string | undefined);
      if (!userId) return null;
      token.id = userId;

      const stale =
        !token.refreshedAt || Date.now() - token.refreshedAt > REFRESH_INTERVAL_MS;
      if (trigger !== "update" && !stale) return token;

      const fresh = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          image: true,
          role: true,
          disabledAt: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });

      // Deleted or disabled ends the session; so does a `sessionVersion` bump,
      // which is how a password change or an admin reset signs a user out
      // everywhere. Both take effect within REFRESH_INTERVAL_MS.
      if (!fresh || fresh.disabledAt) return null;
      if (!isSignIn && fresh.sessionVersion > (token.sessionVersion ?? 0)) {
        return null;
      }

      token.name = fresh.name;
      token.email = fresh.email;
      token.picture = fresh.image;
      token.role = fresh.role;
      token.mustChangePassword = fresh.mustChangePassword;
      token.sessionVersion = fresh.sessionVersion;
      token.refreshedAt = Date.now();

      await touchLastActive(userId);
      return token;
    },
  },
});
