import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/**
 * The portal's session shape. `role` and `mustChangePassword` ride in the JWT
 * so the proxy can read them without touching the database
 * (docs/specs/02-auth.md §1).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    mustChangePassword?: boolean;
    sessionVersion?: number;
  }
}

// `next-auth/jwt` only re-exports `@auth/core/jwt`, and augmenting a re-export
// does not merge into the original interface — the augmentation has to name the
// module the interface is actually declared in.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    mustChangePassword?: boolean;
    /** Compared against `User.sessionVersion`; a bump signs the user out everywhere. */
    sessionVersion?: number;
    /** Epoch ms of the last database re-read, for the 5-minute refresh. */
    refreshedAt?: number;
    /** Epoch ms of the last `lastActiveAt` write, for the 10-minute throttle. */
    activeAt?: number;
  }
}
