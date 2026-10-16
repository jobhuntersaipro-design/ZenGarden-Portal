import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";
import { ShipmentSearch } from "@/components/shipments/ShipmentSearch";
import { ShipmentTable } from "@/components/shipments/ShipmentTable";
import { can, requirePagePermission } from "@/lib/permissions/require";
import { firstParam, parsePagination, type SearchParams } from "@/lib/queries/pagination";
import { listShipments } from "@/lib/queries/shipments";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "Shipments · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function ShipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission("shipment.view");
  const params = await searchParams;
  const q = firstParam(params, "q")?.trim() || undefined;
  const { page, size } = parsePagination(params);
  const [{ rows, total }, canManage, canBookings] = await Promise.all([
    listShipments({ q, page, size }),
    can("shipment.manage"),
    can("bc.view"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Shipping"
        title="Shipments"
        action={
          <div className="flex flex-wrap items-center gap-sm">
            {canBookings ? (
              <Link
                href="/booking-confirmations"
                className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0"
              >
                Booking confirmations
              </Link>
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
      <ShipmentSearch />
      <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        <span className="tabular-nums">{total}</span> {total === 1 ? "shipment" : "shipments"}
        <UpdatingHint />
      </p>
      <ShipmentTable rows={rows} page={page} size={size} total={total} />
    </>
  );
}

export default withLoadingFloor(ShipmentsPage);
