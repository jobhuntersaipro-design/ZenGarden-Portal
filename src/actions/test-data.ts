"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UnauthorizedError, requireSuperAdmin } from "@/lib/auth-guards";
import {
  MAX_ORDERS,
  blockedReason,
  deleteTestData,
  generateTestData,
  type TestDataCounts,
} from "@/lib/test-data";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Throwaway data for eyeballing the portal (see `src/lib/test-data.ts`).
 *
 * Super admin only, and refused on production **here** as well as in the card
 * — hiding a button is not a guard, and this one writes hundreds of rows.
 */
const guard = async () => {
  try {
    return { user: await requireSuperAdmin(), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

const ordersSchema = z
  .number()
  .int("Whole orders only")
  .min(1, "Generate at least one order")
  .max(MAX_ORDERS, `${MAX_ORDERS} orders at most in one run`);

export async function generateTestDataAction(
  orders: number,
): Promise<ActionResult<TestDataCounts>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  // Generating is refused on production; deleting deliberately is not — it is
  // the safe direction, and a tagged row that reached production some other
  // way (a restored dump) must still have a way out.
  const blocked = blockedReason();
  if (blocked) return { success: false, error: blocked };

  const parsed = ordersSchema.safeParse(orders);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const counts = await generateTestData(user.id, parsed.data);
    revalidateEverything();
    return { success: true, data: counts };
  } catch (cause) {
    console.error("generateTestData failed", cause);
    return { success: false, error: "Could not generate the test data." };
  }
}

export async function deleteTestDataAction(): Promise<ActionResult<TestDataCounts>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const counts = await deleteTestData();
    revalidateEverything();
    return { success: true, data: counts };
  } catch (cause) {
    console.error("deleteTestData failed", cause);
    return {
      success: false,
      error:
        cause instanceof Error && cause.message.startsWith("Refusing:")
          ? cause.message
          : "Could not delete the test data.",
    };
  }
}

/** Test data moves every figure in the portal, so every page it feeds is stale. */
function revalidateEverything() {
  for (const path of [
    "/",
    "/purchase-orders",
    "/demand",
    "/buyers",
    "/products",
    "/admin",
    "/shop",
    "/shop/products",
  ]) {
    revalidatePath(path);
  }
}
