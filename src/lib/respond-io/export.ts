import { writeFileSync, existsSync, readFileSync } from "fs";
import type { RespondIOContact, CrawlResult } from "./types";

interface FlatContact {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  countryCode: string | null;
  status: string;
  isBlocked: boolean;
  lifecycle: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  tags: string;
  created_at: string;
  installation_address: string | null;
  selected_package: string | null;
  package_type: string | null;
  package_price: string | null;
  ic_passport_number: string | null;
  installation_date: string | null;
  installation_status: string | null;
  free_gift: string | null;
  free_gift_price: string | null;
  ads_source: string | null;
}

function flattenContact(contact: RespondIOContact): FlatContact {
  const customFieldMap: Record<string, string | null> = {};
  for (const cf of contact.custom_fields) {
    customFieldMap[cf.name] = cf.value;
  }

  const assigneeName = contact.assignee
    ? `${contact.assignee.firstName} ${contact.assignee.lastName}`.trim()
    : null;

  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    email: contact.email,
    countryCode: contact.countryCode,
    status: contact.status,
    isBlocked: contact.isBlocked,
    lifecycle: contact.lifecycle,
    assignee_name: assigneeName,
    assignee_email: contact.assignee?.email ?? null,
    tags: contact.tags.join(", "),
    created_at: new Date(contact.created_at * 1000).toISOString(),
    installation_address: customFieldMap.installation_address ?? null,
    selected_package: customFieldMap.selected_package ?? null,
    package_type: customFieldMap.package_type ?? null,
    package_price: customFieldMap.package_price ?? null,
    ic_passport_number: customFieldMap.ic_passport_number ?? null,
    installation_date: customFieldMap.installation_date ?? null,
    installation_status: customFieldMap.installation_status ?? null,
    free_gift: customFieldMap.free_gift ?? null,
    free_gift_price: customFieldMap.free_gift_price ?? null,
    ads_source: customFieldMap.ads_source ?? null,
  };
}

function escapeCsvField(value: string | null | boolean | number): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(
  contacts: RespondIOContact[],
  outputPath: string
): void {
  const flat = contacts.map(flattenContact);
  if (flat.length === 0) {
    console.log("No contacts to export.");
    return;
  }

  const headers = Object.keys(flat[0]) as (keyof FlatContact)[];
  const headerRow = headers.join(",");
  const rows = flat.map((row) =>
    headers.map((h) => escapeCsvField(row[h])).join(",")
  );

  const csv = [headerRow, ...rows].join("\n");
  writeFileSync(outputPath, csv, "utf-8");
  console.log(`Exported ${contacts.length} contacts to ${outputPath}`);
}

export function exportToJson(
  result: CrawlResult,
  outputPath: string
): void {
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`Exported ${result.totalFetched} contacts to ${outputPath}`);
}

export function loadLastCrawlTimestamp(metaPath: string): number | null {
  if (!existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    return meta.lastCrawledAt ?? null;
  } catch {
    return null;
  }
}

export function saveLastCrawlTimestamp(
  metaPath: string,
  timestamp: number
): void {
  writeFileSync(
    metaPath,
    JSON.stringify({ lastCrawledAt: timestamp }, null, 2),
    "utf-8"
  );
}
