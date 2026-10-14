import type { Metadata } from "next";
import Link from "next/link";
import { CertificationTable } from "@/components/certificates/CertificationTable";
import { CertificatesTable } from "@/components/certificates/CertificatesTable";
import { DOT_TONE } from "@/components/certificates/CertDots";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Rise } from "@/components/portal/Rise";
import { TablePagination } from "@/components/portal/TablePagination";
import { Button } from "@/components/ui/button";
import { CERT_LABEL, CERT_TYPES, type CertStatus } from "@/lib/certification";
import {
  OVERVIEW_SHOW,
  OVERVIEW_SORT_KEYS,
  needsAttention,
  selectOverview,
  type OverviewShow,
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
          <ProductsView params={params} overview={overview} />
        )}
      </Rise>
    </>
  );
}

function ProductsView({
  params,
  overview,
}: {
  params: SearchParams;
  overview: Awaited<ReturnType<typeof loadCertificationOverview>>;
}) {
  const q = firstParam(params, "q")?.trim() || undefined;
  const showParam = firstParam(params, "show") as OverviewShow;
  const show = OVERVIEW_SHOW.includes(showParam) ? showParam : "all";
  const markets = [...new Set(overview.flatMap((row) => (row.market ? [row.market] : [])))].sort();
  // Resolved against what exists, so the select never shows a filter the rows are not under.
  const marketParam = firstParam(params, "market");
  const market = marketParam && markets.includes(marketParam) ? marketParam : null;
  const sort = parseSort(params, OVERVIEW_SORT_KEYS, { key: "name", dir: "asc" });
  const rows = selectOverview(overview, { q, market: market ?? undefined, show, sort });
  const { page, size, skip, take } = parsePagination(params, [50, 100]);
  const counts = {
    all: overview.length,
    attention: overview.filter(needsAttention).length,
  };

  return (
    <>
      <CertificationTable
        rows={rows.slice(skip, skip + take)}
        sort={sort}
        show={show}
        counts={counts}
        market={market}
        markets={markets}
      />
      <TablePagination page={page} size={size} total={rows.length} sizes={[50, 100]} />
    </>
  );
}

async function CertificatesList({ params, today }: { params: SearchParams; today: string }) {
  const certificates = await listCertificates();
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
  return <CertificatesTable certificates={sorted} sort={sort} today={today} />;
}

export default withLoadingFloor(CertificationPage);
