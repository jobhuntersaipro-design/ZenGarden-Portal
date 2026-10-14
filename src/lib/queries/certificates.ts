import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
import {
  productCerts,
  type CertStatus,
  type CertType,
  type ProductCerts,
} from "@/lib/certification";

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/** Each product's NOT / HL / COA status, for every id given. */
export async function loadProductCerts(
  productIds: string[],
): Promise<Map<string, ProductCerts>> {
  const ids = [...new Set(productIds)];
  const today = todayISO();
  if (ids.length === 0) return new Map();
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      certificates: { select: { type: true, expiresOn: true } },
      certOverrides: { select: { type: true } },
    },
  });
  return new Map(
    products.map((product) => [
      product.id,
      productCerts(
        product.certificates.map((cert) => ({
          type: cert.type,
          expiresOn: isoDay(cert.expiresOn),
        })),
        product.certOverrides.map((override) => override.type),
        today,
      ),
    ]),
  );
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
  id: string;
  name: string;
  sku: string;
  market: string | null;
  certs: ProductCerts;
  overrides: Partial<Record<CertType, { reason: string; by: string | null; at: Date }>>;
};

/** Every active product with its three statuses, for the admin overview. */
export async function loadCertificationOverview(): Promise<OverviewRow[]> {
  const today = todayISO();
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ market: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sku: true,
      market: true,
      certificates: { select: { type: true, expiresOn: true } },
      certOverrides: {
        select: { type: true, reason: true, at: true, by: { select: { name: true } } },
      },
    },
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    market: product.market,
    certs: productCerts(
      product.certificates.map((cert) => ({ type: cert.type, expiresOn: isoDay(cert.expiresOn) })),
      product.certOverrides.map((override) => override.type),
      today,
    ),
    overrides: Object.fromEntries(
      product.certOverrides.map((override) => [
        override.type,
        { reason: override.reason, by: override.by?.name ?? null, at: override.at },
      ]),
    ),
  }));
}

export type CertificateRow = {
  id: string;
  type: CertType;
  originalName: string;
  reference: string | null;
  expiresOn: string;
  products: { id: string; name: string; sku: string; market: string | null }[];
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
    select: { id: true, name: true, sku: true, market: true },
    orderBy: { name: "asc" as const },
  },
};

type CertRecord = {
  id: string;
  type: CertType;
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

/** Every product a certificate can be linked to, for the picker. */
export const listCertifiableProducts = () =>
  prisma.product.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, sku: true, market: true },
  });
