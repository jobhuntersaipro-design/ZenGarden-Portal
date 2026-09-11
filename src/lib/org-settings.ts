import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type SupplierDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type SupplierSettings = {
  /** What is in the database. Null means "fall back". */
  stored: SupplierDetails;
  /** What the environment would supply. For the admin card's placeholders. */
  fallback: SupplierDetails;
  updatedAt: Date | null;
  updatedByName: string | null;
};

const SINGLETON = { id: "singleton" };

const SELECT = {
  supplierName: true,
  supplierEmail: true,
  supplierPhone: true,
  supplierAddress: true,
  updatedAt: true,
  updatedBy: { select: { name: true } },
} as const;

const fromEnv = (): SupplierDetails => ({
  name: env.SUPPLIER_NAME ?? null,
  email: env.SUPPLIER_EMAIL ?? null,
  phone: env.SUPPLIER_PHONE ?? null,
  address: env.SUPPLIER_ADDRESS ?? null,
});

/**
 * Deliberately not wrapped in React's `cache()`: each request has exactly one
 * call site. The shop layout resolves once and passes the result to the header
 * and the footer as props, and the admin page calls `loadSupplierSettings`
 * once. Memoising would buy nothing and would force every unit test to stub
 * React.
 */
const readRow = () =>
  prisma.orgSettings.findUnique({ where: SINGLETON, select: SELECT });

/**
 * The supplier details to display. **Resolved per field, never per row**: a
 * per-row rule ("is there a settings row? then use it") would blank a phone
 * that is still living in an env var the moment someone saved only the email
 * (docs/specs/24-org-settings.md §2).
 */
export async function loadSupplierDetails(): Promise<SupplierDetails> {
  const row = await readRow();
  const fallback = fromEnv();
  return {
    name: row?.supplierName ?? fallback.name,
    email: row?.supplierEmail ?? fallback.email,
    phone: row?.supplierPhone ?? fallback.phone,
    address: row?.supplierAddress ?? fallback.address,
  };
}

/** Stored and fallback kept apart, so the card can show one as the other's placeholder. */
export async function loadSupplierSettings(): Promise<SupplierSettings> {
  const row = await readRow();
  return {
    stored: {
      name: row?.supplierName ?? null,
      email: row?.supplierEmail ?? null,
      phone: row?.supplierPhone ?? null,
      address: row?.supplierAddress ?? null,
    },
    fallback: fromEnv(),
    updatedAt: row?.updatedAt ?? null,
    updatedByName: row?.updatedBy?.name ?? null,
  };
}
