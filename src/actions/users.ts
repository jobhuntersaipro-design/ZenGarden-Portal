"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { AccessRequestStatus, Role } from "@/generated/prisma/enums";
import {
  AccessApproved,
  accessApprovedSubject,
} from "@/emails/AccessApproved";
import {
  AccessDeclined,
  accessDeclinedSubject,
} from "@/emails/AccessDeclined";
import {
  TemporaryPassword,
  temporaryPasswordSubject,
} from "@/emails/TemporaryPassword";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  createUserSchema,
  setPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/lib/validation/users";

const BCRYPT_COST = 12;

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const guard = async () => {
  try {
    return { user: await requireSuperAdmin(), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError
          ? cause.message
          : "You are not signed in.",
    };
  }
};

const revalidate = () => revalidatePath("/admin");

/**
 * The portal must never end up with nobody who can administer it, so the last
 * active super admin cannot be demoted, disabled or deleted. Counted at the
 * moment of the change rather than cached.
 */
async function isLastSuperAdmin(userId: string): Promise<boolean> {
  const others = await prisma.user.count({
    where: {
      id: { not: userId },
      role: Role.SUPER_ADMIN,
      disabledAt: null,
    },
  });
  return others === 0;
}

export async function createUser(
  input: CreateUserInput,
): Promise<ActionResult<{ id: string; password?: string }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That user could not be created.",
    };
  }
  const data = parsed.data;

  try {
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash: data.password
          ? await hash(data.password, BCRYPT_COST)
          : null,
        // Only meaningful with a password; a Google user never sees the form.
        mustChangePassword: Boolean(data.password) && data.mustChangePassword,
      },
      select: { id: true, name: true, email: true },
    });

    if (data.password) {
      await sendEmail({
        to: created.email,
        subject: temporaryPasswordSubject(),
        react: TemporaryPassword({
          name: created.name,
          password: data.password,
          signInUrl: `${env.APP_URL}/signin`,
        }),
      });
    }

    revalidate();
    // Returned once so the drawer can show it; it is never stored in the clear.
    return {
      success: true,
      data: { id: created.id, password: data.password },
    };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return { success: false, error: "Someone already has that email." };
    }
    console.error("[users] createUser", cause);
    return { success: false, error: "We couldn't create that user." };
  }
}

export async function updateUser(
  userId: string,
  input: UpdateUserInput,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, disabledAt: true },
    });
    if (!target) return { success: false, error: "That user is gone." };

    const demoting = target.role === Role.SUPER_ADMIN && data.role !== Role.SUPER_ADMIN;
    const disabling = target.disabledAt === null && !data.active;

    // Locking yourself out is never what you meant.
    if (userId === user.id && demoting) {
      return { success: false, error: "You can't demote yourself." };
    }
    if (userId === user.id && disabling) {
      return { success: false, error: "You can't disable yourself." };
    }
    if ((demoting || disabling) && (await isLastSuperAdmin(userId))) {
      return {
        success: false,
        error: "This is the last super admin. Promote someone else first.",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        disabledAt: data.active ? null : (target.disabledAt ?? new Date()),
        // Disabling bumps the version so the Phase 02 jwt callback cuts the
        // session at its next refresh rather than waiting for expiry.
        ...(disabling ? { sessionVersion: { increment: 1 } } : {}),
      },
    });

    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return { success: false, error: "Someone already has that email." };
    }
    console.error("[users] updateUser", cause);
    return { success: false, error: "We couldn't save those changes." };
  }
}

export async function setPassword(
  userId: string,
  password: string,
  mustChange = true,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = setPasswordSchema.safeParse({ password, mustChange });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That password will not do.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hash(parsed.data.password, BCRYPT_COST),
          mustChangePassword: parsed.data.mustChange,
          // Ends every existing session at its next JWT refresh.
          sessionVersion: { increment: 1 },
        },
      }),
      // Any outstanding reset link is now a way in with a password nobody
      // chose, so they go.
      prisma.passwordResetToken.deleteMany({ where: { userId } }),
    ]);

    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[users] setPassword", cause);
    return { success: false, error: "We couldn't set that password." };
  }
}

/**
 * Soft delete. The row stays so every upload, confirmation and stage event
 * keeps its attribution — a hard delete would leave the audit trail pointing
 * at nobody. Real row deletion is not offered.
 */
export async function deleteUser(
  userId: string,
  typedEmail: string,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  if (userId === user.id) {
    return { success: false, error: "You can't delete yourself." };
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    if (!target) return { success: false, error: "That user is gone." };

    // The typed confirmation is checked here too, not only in the dialog.
    if (typedEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      return { success: false, error: "That email doesn't match." };
    }
    if (target.role === Role.SUPER_ADMIN && (await isLastSuperAdmin(userId))) {
      return {
        success: false,
        error: "This is the last super admin. Promote someone else first.",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: "Deleted user",
        disabledAt: new Date(),
        passwordHash: null,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
        // The address is freed for reuse and cannot identify them any more.
        email: `deleted+${randomBytes(6).toString("hex")}@lovinghandsportal.invalid`,
      },
    });

    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[users] deleteUser", cause);
    return { success: false, error: "We couldn't delete that user." };
  }
}

export async function approveAccessRequest(
  requestId: string,
  role: Role,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const request = await prisma.accessRequest.findUnique({
      where: { id: requestId },
      select: { email: true, name: true, image: true, status: true },
    });
    if (!request) return { success: false, error: "That request is gone." };
    if (request.status !== AccessRequestStatus.PENDING) {
      return { success: false, error: "That request has already been decided." };
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: request.email },
        select: { id: true },
      });
      // Someone may have been created by hand, or by AUTO_APPROVE_DOMAIN,
      // between the request and this click.
      if (!existing) {
        await tx.user.create({
          data: {
            email: request.email,
            name: request.name,
            image: request.image,
            role,
            emailVerified: new Date(),
          },
        });
      }
      await tx.accessRequest.update({
        where: { id: requestId },
        data: {
          status: AccessRequestStatus.APPROVED,
          decidedById: user.id,
          decidedAt: new Date(),
        },
      });
    });

    await sendEmail({
      to: request.email,
      subject: accessApprovedSubject(),
      react: AccessApproved({
        name: request.name,
        signInUrl: `${env.APP_URL}/signin`,
      }),
    });

    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[users] approveAccessRequest", cause);
    return { success: false, error: "We couldn't approve that request." };
  }
}

export async function declineAccessRequest(
  requestId: string,
  notify: boolean,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const request = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: AccessRequestStatus.DECLINED,
        decidedById: user.id,
        decidedAt: new Date(),
      },
      select: { email: true, name: true },
    });

    if (notify) {
      await sendEmail({
        to: request.email,
        subject: accessDeclinedSubject(),
        react: AccessDeclined({ name: request.name }),
      });
    }

    revalidate();
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[users] declineAccessRequest", cause);
    return { success: false, error: "We couldn't decline that request." };
  }
}
