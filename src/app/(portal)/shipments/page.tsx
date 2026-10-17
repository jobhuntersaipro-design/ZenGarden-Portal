import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";
import { ShipmentFilters } from "@/components/shipments/ShipmentFilters";
import { ShipmentTable } from "@/components/shipments/ShipmentTable";
import { ShippingTabs } from "@/components/shipments/ShippingTabs";
import { can, requirePagePermission } from "@/lib/permissions/require";
import { firstParam, parsePagination, type SearchParams } from "@/lib/queries/pagination";
import { listShipments, type ShipmentFilters as Filters } from "@/lib/queries/shipments";
import { SLOT_ORDER, STATUS_ORDER, type ShipmentStatus, type SlotKey } from "@/lib/shipments/checklist";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "Shipments · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function ShipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission("shipment.view");
  const params = await searchParams;
  const { page, size } = parsePagination(params);
  const day = (key: string) => {
    const value = firstParam(params, key);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = firstParam(params, key) as T | undefined;
    return value && allowed.includes(value) ? value : undefined;
  };
  const filters: Filters = {
    q: firstParam(params, "q")?.trim() || undefined,
    status: pick<ShipmentStatus>("status", STATUS_ORDER),
    missing: pick<SlotKey>("missing", SLOT_ORDER),
    buyerId: firstParam(params, "buyer") || undefined,
    market: firstParam(params, "market") || undefined,
    etdFrom: day("etd_from"),
    etdTo: day("etd_to"),
    sort: pick("sort", ["status", "etd", "eta", "createdAt"] as const) ?? "status",
    dir: pick("dir", ["asc", "desc"] as const) ?? "asc",
  };
  const [list, canManage, canBookings, canUploadBc] = await Promise.all([
    listShipments(filters, page, size),
    can("shipment.manage"),
    can("bc.view"),
    can("bc.upload"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Shipping"
        title="Shipments"
        action={
          <div className="flex flex-wrap items-center gap-sm">
            {canUploadBc ? (
              <Button asChild variant="secondary">
                <Link href="/booking-confirmations/upload">
                  <LinkSpinner />
                  Upload BC
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button asChild>
                <Link href="/shipments/new">
                  <LinkSpinner />
                  New shipment
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <ShippingTabs bookings={canBookings} />
      <ShipmentFilters
        counts={list.counts}
        all={list.all}
        buyers={list.buyers}
        markets={list.markets}
        resolved={list.resolved}
      />
      <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        <span className="tabular-nums">{list.total}</span> {list.total === 1 ? "shipment" : "shipments"}
        <UpdatingHint />
      </p>
      <ShipmentTable rows={list.rows} page={page} size={size} total={list.total} />
    </>
  );
}

export default withLoadingFloor(ShipmentsPage);
