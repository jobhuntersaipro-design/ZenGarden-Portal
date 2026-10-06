import { guardRoute } from "@/lib/api-guard";

/**
 * Reading a file on an order is `po.view` — the same key that opens the page.
 * Uploading or replacing one is also `po.document`, so a member who may look
 * cannot attach, and a buyer (who fails `requireUser` inside either check)
 * cannot do either.
 */
export async function guardOrderDocumentRead() {
  return guardRoute("po.view");
}

export async function guardOrderDocumentWrite() {
  const viewed = await guardRoute("po.view");
  if (viewed.denied) return viewed;
  return guardRoute("po.document");
}
