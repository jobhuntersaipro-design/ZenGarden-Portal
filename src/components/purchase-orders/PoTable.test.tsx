import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/purchase-orders",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/purchase-orders/DeletePoDialog", () => ({
  DeletePoDialog: () => null,
}));
vi.mock("@/components/purchase-orders/DeleteUploadButton", () => ({
  DeleteUploadButton: () => null,
}));
vi.mock("@/components/purchase-orders/DeleteWebOrderDialog", () => ({
  DeleteWebOrderDialog: () => null,
}));

import { DataTable, columnShowClass, stickyColumnClass } from "@/components/portal/DataTable";
import { poColumns, poRowHref, type PoRow } from "@/components/purchase-orders/PoTable";

const draft = (over: Partial<PoRow> = {}): PoRow => ({
  id: "ext_1",
  kind: "DRAFT",
  orderId: null,
  poNumber: null,
  fileName: "test-scan-c5atgf.pdf",
  buyerName: "Waiting to be reviewed",
  buyerId: null,
  poDate: null,
  deliveryDate: null,
  itemCount: 0,
  total: "0",
  status: "FAILED",
  stage: null,
  uploadedByName: "Aisha Rahman",
  uploadedByImage: null,
  confirmedByName: null,
  confirmedByImage: null,
  fileType: "application/pdf",
  source: "scan",
  revision: 1,
  queuedAt: null,
  ...over,
});

describe("failed-upload columns stay inside the card", () => {
  const columns = poColumns({ canDeleteOrders: false });
  const showAt = Object.fromEntries(columns.map((column) => [column.key, column.showAt]));

  it("keeps the identifier, the status and the row action on every card", () => {
    for (const key of ["orderId", "poNumber", "buyerName", "total", "status", "actions"]) {
      expect(showAt[key]).toBeUndefined();
    }
  });

  it("drops date, items and source until the card clears md", () => {
    expect(showAt.poDate).toBe("md");
    expect(showAt.itemCount).toBe("md");
    expect(showAt.source).toBe("md");
  });

  it("drops expected delivery until the card clears lg", () => {
    expect(showAt.deliveryDate).toBe("lg");
  });

  it("drops the two avatar columns until the card clears xl", () => {
    // Twelve columns measured 1342px. The page column tops out at 1160px,
    // so these two never fit beside the identifier without a scrollbar.
    expect(showAt.uploadedBy).toBe("xl");
    expect(showAt.confirmedBy).toBe("xl");
  });

  it("caps a failed scan's file name and keeps the full name on the title", () => {
    const name = "supplier-po-scan-meridian-chemicals-september-2026-final.pdf";
    const markup = renderToStaticMarkup(
      <>{columns[0].cell(draft({ fileName: name }))}</>,
    );
    expect(markup).toContain("max-w-56");
    expect(markup).toContain("truncate");
    expect(markup).toContain(`title="Uploaded file ${name} — no Order ID"`);
    expect(markup).toContain(name);
  });

  it("still opens a failed upload on its review page", () => {
    expect(poRowHref(draft())).toBe("/review/ext_1");
  });
});

describe("table scroll helpers", () => {
  it("hides a column until the named card width", () => {
    expect(columnShowClass(undefined)).toBe("");
    expect(columnShowClass("md")).toBe("@max-table-md:hidden");
    expect(columnShowClass("lg")).toBe("@max-table-lg:hidden");
    expect(columnShowClass("xl")).toBe("@max-table-xl:hidden");
  });

  it("pins only the first column", () => {
    expect(stickyColumnClass(0, "head")).toBe("sticky left-0 z-20");
    expect(stickyColumnClass(0, "body")).toBe("sticky left-0 z-10");
    expect(stickyColumnClass(1, "body")).toBe("");
  });

  it("scrolls inside the card, with the identifier sticky and a late column dropped", () => {
    const markup = renderToStaticMarkup(
      <DataTable
        columns={[
          { key: "id", header: "Order ID", cell: () => "scan.pdf" },
          { key: "status", header: "Status", cell: () => "Failed" },
          {
            key: "by",
            header: "Uploaded by",
            showAt: "xl",
            cell: () => "Aisha",
          },
        ]}
        rows={[{ id: "1" }]}
        sort={{ key: "id", dir: "asc" }}
        onSortChange={() => {}}
        emptyText="None"
      />,
    );
    expect(markup).toContain("@container");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("sticky left-0");
    expect(markup).toContain("@max-table-xl:hidden");
  });
});
