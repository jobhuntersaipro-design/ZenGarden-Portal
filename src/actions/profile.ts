"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/actions/auth";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { AvatarError, clearAvatar, storeGeneratedAvatar } from "@/lib/avatar-store";
import { prisma } from "@/lib/prisma";
import {
  generatedAvatarSchema,
  updateProfileSchema,
} from "@/lib/validation/profile";

/**
 * A name or picture shows in the sidebar, the mobile top bar and every table
 * that names a person, so the whole shell is revalidated rather than one page.
 * The client also calls `useSession().update()`, which is what repaints the
 * sidebar without waiting out the jwt callback's five-minute refresh.
 */
function revalidateEverywhere(): void {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function updateProfile(input: {
  name: string;
}): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "That name will not do.",
    };
  }

  try {
    const session = await requireUser();
    await prisma.user.update({
      where: { id: session.id },
      data: { name: parsed.data.name },
    });
    revalidateEverywhere();
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] updateProfile", cause);
    return { success: false, error: "We could not save your name." };
  }
}

export async function setGeneratedAvatar(input: {
  style: string;
  seed: string;
}): Promise<ActionResult<{ url: string }>> {
  const parsed = generatedAvatarSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "That is not a style you can pick." };
  }

  try {
    const session = await requireUser();
    const { url } = await storeGeneratedAvatar({
      userId: session.id,
      style: parsed.data.style,
      seed: parsed.data.seed,
    });
    revalidateEverywhere();
    return { success: true, data: { url } };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    if (cause instanceof AvatarError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] setGeneratedAvatar", cause);
    return { success: false, error: "We could not save that avatar." };
  }
}

/**
 * Falls back to initials, not to the Google photo. Otherwise "Remove" would
 * visibly remove nothing for a Google user; their photo is offered back as an
 * explicit choice instead.
 */
export async function removeAvatar(): Promise<ActionResult> {
  try {
    const session = await requireUser();
    await clearAvatar(session.id, null);
    revalidateEverywhere();
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] removeAvatar", cause);
    return { success: false, error: "We could not remove your picture." };
  }
}

/**
 * Unlike `changePassword`, this deliberately does **not** re-mint the current
 * session: it ends this one too, which is the point. The caller signs out and
 * lands on /signin.
 */
export async function signOutEverywhere(): Promise<ActionResult> {
  try {
    const session = await requireUser();
    await prisma.user.update({
      where: { id: session.id },
      data: { sessionVersion: { increment: 1 } },
    });
    return { success: true, data: undefined };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return { success: false, error: cause.message };
    }
    console.error("[profile] signOutEverywhere", cause);
    return { success: false, error: "We could not sign you out everywhere." };
  }
}
