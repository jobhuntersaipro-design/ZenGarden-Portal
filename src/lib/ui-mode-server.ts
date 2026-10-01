import "server-only";
import { cookies } from "next/headers";
import { UI_MODE_COOKIE, resolveUiMode, type UiMode } from "@/lib/ui-mode";

/** The mode this request draws in, read once in the root layout. */
export async function getUiMode(): Promise<UiMode> {
  return resolveUiMode((await cookies()).get(UI_MODE_COOKIE)?.value);
}
