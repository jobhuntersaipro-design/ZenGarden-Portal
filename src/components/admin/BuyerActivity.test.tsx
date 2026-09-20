import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@/lib/queries/buyer-activity-entries";

// The card writes the URL through `usePendingChoice`, which needs a router;
// the rows themselves need none, and they are what this test reads.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/buyers/b1",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { BuyerActivity } = await import("@/components/admin/BuyerActivity");

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: "audit:1",
  kind: "sign-in",
  at: "2026-09-19T02:00:00.000Z",
  text: "Siti Nurhaliza signed in",
  actor: { name: "Siti Nurhaliza", image: null, role: "CLIENT" },
  href: null,
  ...over,
});

const card = (entries: ActivityEntry[]) =>
  renderToStaticMarkup(
    <BuyerActivity
      entries={entries}
      total={entries.length}
      kind="all"
      page={1}
      failedWindowHours={24}
    />,
  );

/**
 * This timeline mixes the buyer's own contacts — signing in, placing shop
 * orders — with ops staff confirming, editing and advancing. An avatar and a
 * name alone do not say which side of that a row came from.
 */
describe("BuyerActivity names each actor's role", () => {
  it("tells a buyer's own contact from an ops role", () => {
    const markup = card([
      entry({}),
      entry({
        id: "po:1",
        kind: "purchase-order",
        actor: { name: "Aisha Rahman", image: null, role: "SUPER_ADMIN" },
        text: "PO number PO-2026-0063 confirmed · RM 100.00 · from the shop",
      }),
    ]);
    expect(markup).toContain("Buyer contact");
    expect(markup).toContain("Super admin");
  });

  it("leaves a row with no actor alone", () => {
    // A failed sign-in is an email address and nothing more — no person, so
    // no avatar and no role.
    const markup = card([
      entry({ id: "failed:1", actor: null, text: "Failed sign-in for siti@acme.com" }),
    ]);
    expect(markup).toContain("Failed sign-in for siti@acme.com");
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("Buyer contact");
  });
});
