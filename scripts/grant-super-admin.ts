/**
 * Makes one address a super admin on whichever database the given env file
 * points at, creating the user if it does not exist yet:
 *
 *   npx tsx --env-file=.env.local scripts/grant-super-admin.ts you@example.com
 *   npx tsx --env-file=.env.production.local scripts/grant-super-admin.ts you@example.com
 *
 * The address is an argument, never a filter, and the host it is about to
 * write to is printed first — the two databases differ by one word in a
 * connection string, and promoting the wrong one is silent.
 *
 * A row created here carries `emailVerified` and no password, which is what
 * lets "Continue with Google" link the account on first sign-in
 * (`allowDangerousEmailAccountLinking` in src/lib/auth.ts). An existing row is
 * re-enabled if it was disabled, and its password is left untouched.
 */
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

function host(url: string | undefined): string {
  const match = url?.match(/@([^/?]+)/);
  return match ? match[1] : "unknown";
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const name = process.argv[3]?.trim();
  if (!email?.includes("@")) {
    console.error(
      "Give me the email address to promote:\n" +
        "  npx tsx --env-file=.env.local scripts/grant-super-admin.ts you@example.com [Display Name]",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Database: ${host(process.env.DATABASE_URL)}`);
  const before = await prisma.user.findUnique({ where: { email } });
  console.log(
    before
      ? `Found ${before.email} — role ${before.role}, ${before.disabledAt ? "disabled" : "active"}.`
      : `No user with ${email}; creating one.`,
  );

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: Role.SUPER_ADMIN,
      disabledAt: null,
      emailVerified: before?.emailVerified ?? new Date(),
    },
    create: {
      email,
      name: name || email.split("@")[0],
      role: Role.SUPER_ADMIN,
      emailVerified: new Date(),
    },
  });
  console.log(`Now: ${user.email} — ${user.role}, verified, sign in with Google.`);

  const admins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN, disabledAt: null },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Active super admins: ${admins.map((a) => a.email).join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
