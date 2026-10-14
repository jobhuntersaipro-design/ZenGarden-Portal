import type { Metadata } from "next";
import Link from "next/link";
import { CertificationTable } from "@/components/certificates/CertificationTable";
import { CertificatesTable } from "@/components/certificates/CertificatesTable";
import { DOT_TONE } from "@/components/certificates/CertDots";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Rise } from "@/components/portal/Rise";
import { TablePagination } from "@/components/portal/TablePagination";
import { Button } from "@/components/ui/button";
import type { CertFilterField } from "@/components/certificates/CertFilters";
import { CERT_LABEL, CERT_TYPES, DOC_LABEL, DOC_TYPES, type CertStatus } from "@/lib/certification";
import {
  EXPIRY_FILTERS,
  EXPIRY_LABEL,
  OVERVIEW_SHOW,
  OVERVIEW_SORT_KEYS,
  matchesExpiry,
  needsAttention,
  oneOf,
  selectCertificates,
  selectOverview,
} from "@/lib/certification-overview";
import { todayISO } from "@/lib/dates";
import { withLoadingFloor } from "@/lib/loading-floor";
import { listCertificates, loadCertificationOverview } from "@/lib/queries/certificates";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Certification · Zen Garden Portal" };
export const dynamic = "force-dynamic";

const CERT_SORT_KEYS = ["originalName", "expiresOn", "products", "uploadedBy"] as const;

const VIEW_LINK =
  "inline-flex min-h-control-md items-center rounded-pill border px-sm text-[length:var(--text-body-sm)] focus-visible:outline-2 focus-visible:outline-focus sm:min-h-control-sm";

/**
 * Certification health for every product and market (2026-10-14, ClickUp
 * z8v9xnhuf7): the overview, and the certificate files behind it.
 */
async function CertificationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view = firstParam(params, "view") === "certificates" ? "certificates" : "products";
  const today = todayISO();
  const overview = await loadCertificationOverview();

  // Per type: how many products are green, yellow, red.
  const summary = CERT_TYPES.map((type) => {
    const count = (statuses: CertStatus[]) =>
      overview.filter((row) => statuses.includes(row.certs[type].status)).length;
    return {
      type,
      approved: count(["approved"]),
      renew: count(["renew"]),
      red: count(["expired", "missing"]),
    };
  });

  const viewHref = (next: string) => (next === "products" ? "/admin/certifications" : `/admin/certifications?view=${next}`);

  return (
    <>
      <Rise index={0} className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Halal · NOT · COA
          </p>
          <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
            Certification
          </h1>
          <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
            Green more than 3 months from expiry, amber within 3 months, red expired or not
            uploaded. Orders whose every product is green on all three are approved without
            review.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/certifications/new">
            <LinkSpinner />
            Upload certificate
          </Link>
        </Button>
      </Rise>

      <Rise index={1} className="mb-lg grid grid-cols-1 gap-sm sm:grid-cols-3">
        {summary.map((item) => (
          <div key={item.type} className="rounded-lg border border-hairline bg-canvas p-md">
            <p className="text-[length:var(--text-body-sm)] font-medium text-ink">
              {CERT_LABEL[item.type]}
            </p>
            <ul className="mt-xs flex flex-wrap gap-x-md gap-y-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
              {(
                [
                  ["approved", item.approved, "approved"],
                  ["renew", item.renew, "to renew"],
                  ["expired", item.red, "expired or missing"],
                ] as const
              ).map(([tone, count, label]) => (
                <li key={tone} className="inline-flex items-center gap-xxs">
                  <span aria-hidden className={`size-2 rounded-full ${DOT_TONE[tone]}`} />
                  <span className="tabular-nums text-ink">{count}</span> {label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Rise>

      <Rise index={2} className="mb-sm flex flex-wrap gap-xs">
        {(["products", "certificates"] as const).map((value) => (
          <Link
            key={value}
            href={viewHref(value)}
            aria-current={view === value ? "page" : undefined}
            className={`${VIEW_LINK} ${view === value ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-ink"}`}
          >
            {value === "products" ? "By product" : "Certificates"}
          </Link>
        ))}
      </Rise>

      <Rise index={3}>
        {view === "certificates" ? (
          <CertificatesList params={params} today={today} />
        ) : (
          <ProductsView params={params} overview={overview} today={today} />
        )}
      </Rise>
    </>
  );
}

function ProductsView({
  params,
  overview,
  today,
}: {
  params: SearchParams;
  overview: Awaited<ReturnType<typeof loadCertificationOverview>>;
  today: string;
}) {
  const q = firstParam(params, "q")?.trim() || undefined;
  const show = oneOf(firstParam(params, "show"), OVERVIEW_SHOW) ?? "all";
  const markets = [...new Set(overview.flatMap((row) => (row.market ? [row.market] : [])))].sort();
  const market = oneOf(firstParam(params, "market"), markets);
  const type = oneOf(firstParam(params, "type"), CERT_TYPES);
  const expiry = oneOf(firstParam(params, "expiry"), EXPIRY_FILTERS);
  const sort = parseSort(params, OVERVIEW_SORT_KEYS, { key: "name", dir: "asc" });
  const rows = selectOverview(overview, { q, market, type, expiry, show, sort, today });
  const { page, size, skip, take } = parsePagination(params, [50, 100]);
  const counts = {
    all: overview.length,
    attention: overview.filter(needsAttention).length,
  };
  const count = (filter: Parameters<typeof selectOverview>[1]) => selectOverview(overview, filter).length;
  const base = { show: "all" as const, sort, today };
  const fields: CertFilterField[] = [
    {
      id: "type",
      label: "Certificate",
      options: CERT_TYPES.map((value) => ({
        value,
        label: CERT_LABEL[value],
        hint: count({ ...base, type: value }),
      })),
    },
    {
      id: "expiry",
      label: "Expiry",
      options: EXPIRY_FILTERS.map((value) => ({
        value,
        label: EXPIRY_LABEL[value],
        hint: count({ ...base, type, expiry: value }),
      })),
    },
    ...(markets.length > 0
      ? [
          {
            id: "market",
            label: "Market",
            options: markets.map((value) => ({
              value,
              label: value,
              hint: overview.filter((row) => row.market === value).length,
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      <CertificationTable
        rows={rows.slice(skip, skip + take)}
        sort={sort}
        show={show}
        counts={counts}
        fields={fields}
      />
      <TablePagination page={page} size={size} total={rows.length} sizes={[50, 100]} />
    </>
  );
}

async function CertificatesList({ params, today }: { params: SearchParams; today: string }) {
  const all = await listCertificates();
  const q = firstParam(params, "q")?.trim() || undefined;
  const uploaders = [...new Set(all.flatMap((row) => (row.uploadedBy ? [row.uploadedBy] : [])))].sort();
  const type = oneOf(firstParam(params, "type"), DOC_TYPES);
  const uploadedBy = oneOf(firstParam(params, "by"), uploaders);
  const expiry = oneOf(firstParam(params, "expiry"), EXPIRY_FILTERS.filter((e) => e !== "missing"));
  const certificates = selectCertificates(all, { q, type, uploadedBy, expiry, today });
  const fields: CertFilterField[] = [
    {
      id: "type",
      label: "Type",
      options: DOC_TYPES.map((value) => ({
        value,
        label: DOC_LABEL[value],
        hint: all.filter((row) => row.type === value).length,
      })),
    },
    {
      id: "expiry",
      label: "Expiry",
      options: EXPIRY_FILTERS.filter((e) => e !== "missing").map((value) => ({
        value,
        label: EXPIRY_LABEL[value],
        hint: all.filter((row) => matchesExpiry(row.expiresOn, value, today)).length,
      })),
    },
    ...(uploaders.length > 0
      ? [
          {
            id: "by",
            label: "Uploaded by",
            options: uploaders.map((value) => ({
              value,
              label: value,
              hint: all.filter((row) => row.uploadedBy === value).length,
            })),
          },
        ]
      : []),
  ];
  const sort = parseSort(params, CERT_SORT_KEYS, { key: "expiresOn", dir: "asc" });
  const value = (row: (typeof certificates)[number]) =>
    sort.key === "products"
      ? row.products.length
      : sort.key === "uploadedBy"
        ? (row.uploadedBy ?? "")
        : row[sort.key as "originalName" | "expiresOn"];
  const sorted = [...certificates].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order = left < right ? -1 : left > right ? 1 : 0;
    return sort.dir === "asc" ? order : -order;
  });
  return (
    <CertificatesTable
      certificates={sorted}
      sort={sort}
      today={today}
      fields={fields}
      filtered={Boolean(q || type || uploadedBy || expiry)}
    />
  );
}

export default withLoadingFloor(CertificationPage);
