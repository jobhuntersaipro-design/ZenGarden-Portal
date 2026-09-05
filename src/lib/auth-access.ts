import { AccessRequestStatus, Role } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import {
  AccessRequested,
  accessRequestedSubject,
} from "@/emails/AccessRequested";

/**
 * The Google half of the `signIn` callback (docs/specs/02-auth.md §1), kept in
 * its own module so it can be tested without standing up a NextAuth instance.
 *
 * Returns `true` to let the sign-in continue, or a path to send the visitor to
 * instead. No session is created for the path cases, and — because Auth.js
 * runs this before `handleLoginOrRegister` — no `User` row is created either.
 */
export type GoogleProfile = {
  email: string;
  name: string;
  image: string | null;
};

/** `AccessRequest` rows are keyed by email; the pending page shows it back. */
export const encodeEmail = (email: string) =>
  Buffer.from(email, "utf8").toString("base64url");

export async function resolveGoogleSignIn(
  profile: GoogleProfile,
): Promise<true | string> {
  const email = profile.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // The spec calls for `false` here. `false` raises AccessDenied, which lands
    // on `?error=AccessDenied`; returning the path lands the user on the
    // `?error=disabled` copy the spec actually asks for.
    if (existing.disabledAt) return "/signin?error=disabled";
    return true;
  }

  const autoApprove = env.AUTO_APPROVE_DOMAIN?.trim().toLowerCase();
  if (autoApprove && email.endsWith(`@${autoApprove}`)) {
    // A decline is a decision about a person, not about their domain. Without
    // this, turning the shortcut on would quietly readmit everyone an admin had
    // already turned away.
    const declined = await prisma.accessRequest.findUnique({
      where: { email },
      select: { status: true },
    });
    if (declined?.status === AccessRequestStatus.DECLINED) {
      return "/signin/pending?declined=1";
    }

    await prisma.user.create({
      data: {
        email,
        name: profile.name,
        image: profile.image,
        role: Role.MEMBER,
        emailVerified: new Date(),
      },
    });
    return true;
  }

  return queueAccessRequest({ ...profile, email });
}

/**
 * An unknown address does not get an account — it gets a queue entry, and the
 * super admins get one email the first time it appears.
 */
async function queueAccessRequest(profile: GoogleProfile): Promise<string> {
  const existing = await prisma.accessRequest.findUnique({
    where: { email: profile.email },
  });

  if (existing?.status === AccessRequestStatus.DECLINED) {
    return "/signin/pending?declined=1";
  }

  if (existing) {
    // `lastSeen` is `@updatedAt`. No email: the admins were told the first
    // time, and someone retrying must not be able to page them repeatedly.
    await prisma.accessRequest.update({
      where: { email: profile.email },
      data: { name: profile.name, image: profile.image },
    });
    return `/signin/pending?e=${encodeEmail(profile.email)}`;
  }

  await prisma.accessRequest.create({
    data: {
      email: profile.email,
      name: profile.name,
      image: profile.image,
      status: AccessRequestStatus.PENDING,
    },
  });

  const admins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN, disabledAt: null },
    select: { email: true },
  });

  if (admins.length > 0) {
    await sendEmail({
      to: admins.map((admin) => admin.email),
      subject: accessRequestedSubject(profile.name),
      react: AccessRequested({
        name: profile.name,
        email: profile.email,
        adminUrl: `${env.APP_URL}/admin`,
      }),
    });
  }

  return `/signin/pending?e=${encodeEmail(profile.email)}`;
}
