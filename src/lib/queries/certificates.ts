import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
import { groupProducts } from "@/lib/product-groups";
import {
  productCerts,
  type CertStatus,
  type CertType,
  type DocType,
  type ProductCerts,
} from "@/lib/certification";

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Certification is per product, not per flavour (2026-10-15): a Halal or
 * COA certificate covers every variant of a listing — the family in one
 * market, the card a buyer sees. So a variant's status is read from every
 * certificate and override on any variant of its listing.
 *
 * ponytail: reads the whole catalogue (~300 rows) per call; narrow the query
 * to the listings asked for if the catalogue grows into the thousands.
 */
async function loadListings() {
  const rows = await prisma.product.findMany({
    orderBy: [{ market: "asc" }, { name: "asc" }],
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      variant: true,
      packSize: true,
      market: true,
      active: true,
      familyId: true,
      family: { select: { name: true } },
      certificates: { select: { type: true, expiresOn: true } },
      certOverrides: {
        select: { type: true, reason: true, at: true, by: { select: { name: true } } },
      },
    },
  });
  const today = todayISO();
  return groupProducts(rows.map((row) => ({ ...row, familyName: row.family?.name ?? null }))).map(
    (group) => ({
      ...group,
      certs: productCerts(
        group.variants.flatMap((variant) =>
          variant.certificates.map((cert) => ({ type: cert.type, expiresOn: isoDay(cert.expiresOn) })),
        ),
        group.variants.flatMap((variant) => variant.certOverrides.map((override) => override.type)),
        today,
      ),
    }),
  );
}

/** Each product's NOT / HL / COA status — its listing's — for every id given. */
export async function loadProductCerts(
  productIds: string[],
): Promise<Map<string, ProductCerts>> {
  const ids = new Set(productIds);
  if (ids.size === 0) return new Map();
  const listings = await loadListings();
  return new Map(
    listings.flatMap((listing) =>
      listing.variants
        .filter((variant) => ids.has(variant.id))
        .map((variant) => [variant.id, listing.certs] as const),
    ),
  );
}

/** Every product id in the listing `productId` belongs to, itself included. */
export async function listingProductIds(productId: string): Promise<string[]> {
  const listing = (await loadListings()).find((group) =>
    group.variants.some((variant) => variant.id === productId),
  );
  return listing ? listing.variants.map((variant) => variant.id) : [productId];
}

/**
 * The buyer's view: the colour of each dot and nothing else — no expiry, no
 * file, no override (the epic's "buyers see dots only").
 */
export type CertDots = Record<CertType, CertStatus>;

export const toDots = (certs: ProductCerts): CertDots => ({
  NOT: certs.NOT.status,
  HL: certs.HL.status,
  COA: certs.COA.status,
});

export async function loadCertDots(productIds: string[]): Promise<Map<string, CertDots>> {
  const certs = await loadProductCerts(productIds);
  return new Map([...certs].map(([id, value]) => [id, toDots(value)]));
}

export type OverviewRow = {
  /** A variant of the listing: overrides are keyed on it and spread to the rest. */
  id: string;
  name: string;
  /** Every variant's SKU, space-separated, for search. */
  sku: string;
  variants: number;
  market: string | null;
  certs: ProductCerts;
  overrides: Partial<Record<CertType, { reason: string; by: string | null; at: Date }>>;
};

/** Every listing with an active variant, with its three statuses, for the admin overview. */
export async function loadCertificationOverview(): Promise<OverviewRow[]> {
  const listings = await loadListings();
  return listings.flatMap((listing) => {
    const active = listing.variants.filter((variant) => variant.active);
    if (active.length === 0) return [];
    const overrides: OverviewRow["overrides"] = {};
    for (const variant of listing.variants) {
      for (const override of variant.certOverrides) {
        if (override.type === "OTHER" || overrides[override.type]) continue;
        overrides[override.type] = {
          reason: override.reason,
          by: override.by?.name ?? null,
          at: override.at,
        };
      }
    }
    return [
      {
        id: active[0].id,
        name: listing.name,
        sku: active.map((variant) => variant.sku).join(" "),
        variants: active.length,
        market: listing.market,
        certs: listing.certs,
        overrides,
      },
    ];
  });
}

export type CertificateRow = {
  id: string;
  type: DocType;
  originalName: string;
  reference: string | null;
  expiresOn: string;
  products: { id: string; name: string; variant: string | null; sku: string; market: string | null }[];
  uploadedBy: string | null;
  createdAt: Date;
};

const CERT_SELECT = {
  id: true,
  type: true,
  originalName: true,
  reference: true,
  expiresOn: true,
  createdAt: true,
  uploadedBy: { select: { name: true } },
  products: {
    select: { id: true, name: true, variant: true, sku: true, market: true },
    orderBy: { name: "asc" as const },
  },
};

type CertRecord = {
  id: string;
  type: DocType;
  originalName: string;
  reference: string | null;
  expiresOn: Date;
  createdAt: Date;
  uploadedBy: { name: string } | null;
  products: CertificateRow["products"];
};

const toRow = (cert: CertRecord): CertificateRow => ({
  ...cert,
  expiresOn: isoDay(cert.expiresOn),
  uploadedBy: cert.uploadedBy?.name ?? null,
});

export async function listCertificates(): Promise<CertificateRow[]> {
  const certs = await prisma.certificate.findMany({
    orderBy: { expiresOn: "asc" },
    select: CERT_SELECT,
  });
  return certs.map(toRow);
}

export async function loadCertificate(id: string): Promise<CertificateRow | null> {
  const cert = await prisma.certificate.findUnique({ where: { id }, select: CERT_SELECT });
  return cert ? toRow(cert) : null;
}

export type CertifiableListing = {
  /** The listing's key; ticking it links every variant in `ids`. */
  key: string;
  ids: string[];
  name: string;
  sku: string;
  market: string | null;
  variants: number;
};

/** Every listing a certificate can cover, for the picker — one row per product, not per flavour. */
export async function listCertifiableProducts(): Promise<CertifiableListing[]> {
  const listings = await loadListings();
  return listings
    .flatMap((listing) => {
      const active = listing.variants.filter((variant) => variant.active);
      if (active.length === 0) return [];
      return [
        {
          key: listing.key,
          ids: active.map((variant) => variant.id),
          name: listing.name,
          sku: active.map((variant) => variant.sku).join(" "),
          market: listing.market,
          variants: active.length,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.market ?? "").localeCompare(b.market ?? ""));
}
