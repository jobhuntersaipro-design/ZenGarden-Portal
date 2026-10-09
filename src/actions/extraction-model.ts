"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/actions/auth";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import {
  isExtractionModel,
  isModelOwner,
  saveExtractionModel,
} from "@/lib/extraction/model";

export async function setExtractionModel(id: string): Promise<ActionResult> {
  try {
    const session = await requireUser();
    if (!isModelOwner(session.email)) {
      return { success: false, error: "Only the portal owner can change the model." };
    }
    if (!isExtractionModel(id)) {
      return { success: false, error: "That model isn't on the list." };
    }
    await saveExtractionModel(id);
    revalidatePath("/settings");
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { success: false, error: error.message };
    }
    console.error("[extraction-model] save failed", error);
    return { success: false, error: "We couldn't save the model. Try again." };
  }
}
