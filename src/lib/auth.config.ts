import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/**
 * The half of the Auth.js configuration that touches nothing but the token.
 *
 * `src/proxy.ts` builds its own NextAuth instance from this so that route
 * protection never imports Prisma (docs/specs/02-auth.md §2). The full
 * configuration in `src/lib/auth.ts` spreads it and adds the adapter, the
 * providers and the database-backed `signIn` and `jwt` callbacks.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? (token.sub as string);
        session.user.role = token.role as Role;
        session.user.mustChangePassword = token.mustChangePassword ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
