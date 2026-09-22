/**
 * The bits of the test-data tool a **client** component needs.
 *
 * Separate from `src/lib/test-data.ts` because that module imports `prisma`,
 * and importing a single constant from it pulls the Neon driver into the
 * browser bundle: Turbopack then fails the build on `node:module` while `tsc`
 * and the whole test suite stay green. Phase 51 hit this exactly, which is why
 * `DEMAND_SPAN` lives in `src/lib/planning/grain.ts` rather than beside its
 * query. `test-data.ts` re-exports both, so a server caller still has one
 * import.
 */
export const MAX_ORDERS = 200;

export type TestDataCounts = {
  buyers: number;
  products: number;
  purchaseOrders: number;
  lineItems: number;
  reviewQueue: number;
  shopOrders: number;
};
