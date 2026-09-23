import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { OPS_ROLES, type OpsRole } from "@/lib/permissions/roles";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/actions/permissions", () => ({
  updatePermissions: vi.fn(),
}));

const { PermissionGrid, STICKY_ACTION, STICKY_CORNER, STICKY_HEAD, groupStartsCollapsed, visibleOpsRoles } =
  await import("@/components/admin/PermissionGrid");

const grid = (props: { initialRoleFocus?: OpsRole | null; initialAdminOpen?: boolean } = {}) =>
  renderToStaticMarkup(<PermissionGrid matrix={{}} {...props} />);

describe("visibleOpsRoles", () => {
  it("keeps every column when nothing is focused", () => {
    expect(visibleOpsRoles(null)).toEqual(OPS_ROLES);
  });

  it("keeps one column when a role is focused", () => {
    expect(visibleOpsRoles(Role.QC)).toEqual([Role.QC]);
  });
});

describe("groupStartsCollapsed", () => {
  it("folds Administration and leaves every other group open", () => {
    expect(groupStartsCollapsed("Administration")).toBe(true);
    expect(groupStartsCollapsed("Dashboard")).toBe(false);
    expect(groupStartsCollapsed("Fulfilment")).toBe(false);
  });
});

describe("PermissionGrid", () => {
  it("sticks the action column and the role header inside the scroller", () => {
    const markup = grid();
    // Separate borders: a collapsed border sticks to the row, and the sticky
    // cell loses it. The scroller is what both sticks anchor to.
    expect(markup).toContain("border-separate");
    expect(markup).toContain("max-h-permission-grid");
    expect(markup).toContain("overflow-auto");

    const corner = markup.indexOf(STICKY_CORNER);
    expect(corner).toBeGreaterThan(-1);
    expect(markup.slice(corner, corner + 400)).toContain("Action");
    expect(markup.split(STICKY_HEAD).length - 1).toBe(OPS_ROLES.length);
    expect(markup).toContain(STICKY_ACTION);
  });

  it("starts with Administration folded, on both layouts", () => {
    const markup = grid();
    // Desktop and the phone list each render the disclosure.
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(markup).not.toContain("Manage users");
    expect(markup).not.toContain("Manage permissions");
    expect(markup).toContain("Purchase orders");
    expect(markup).toContain("Move an order back a stage");
  });

  it("renders the Administration rows when that group starts open", () => {
    const markup = grid({ initialAdminOpen: true });
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(2);
    expect(markup).toContain("Manage users");
    expect(markup).toContain("Manage permissions");
  });

  it("focuses one role column and keeps the action names", () => {
    const markup = grid({ initialRoleFocus: Role.QC });
    expect(markup.split(STICKY_HEAD).length - 1).toBe(1);
    expect(markup).toContain(">QC</th>");
    expect(markup).not.toContain(">Super admin</th>");
    expect(markup).not.toContain(">Warehouse</th>");
    expect(markup).toContain('aria-label="QC: Dashboard"');
    expect(markup).not.toContain('aria-label="Super admin:');
    expect(markup).not.toContain('aria-label="Warehouse:');
    // The names the column is read against are still there.
    expect(markup).toContain("Upload a purchase order");
    // The phone picker is a different control and still defaults to planner.
    expect(markup).toContain('aria-label="Production planner: Dashboard"');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>QC</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>All</);
  });

  it("presses All and leaves the phone role picker on planner", () => {
    const markup = grid();
    expect(markup).toMatch(/aria-pressed="true"[^>]*>All</);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Production planner</);
    expect(markup).toContain("Save changes");
  });
});
