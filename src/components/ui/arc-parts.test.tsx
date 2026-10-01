import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { UserStatusBadge } from "@/components/admin/RingBadge";
import { CartonStepper } from "@/components/shop/CartonStepper";

const render = (node: React.ReactNode) => renderToStaticMarkup(node);

describe("the shared primitives draw Arc's parts", () => {
  it("draws Arc's button, keeping the caller's label and slot", () => {
    const html = render(<Button>Save</Button>);
    expect(html).not.toContain("rounded-pill");
    expect(html).toContain('data-slot="button"');
    expect(html).toContain("Save");
  });

  it("marks a pending button busy rather than dropping it", () => {
    expect(render(<Button pending>Saving…</Button>)).toContain('aria-busy="true"');
  });

  it("keeps a caller's utilities on an Arc field", () => {
    const html = render(<Input className="w-24" />);
    expect(html).toContain("w-24");
    expect(html).not.toContain("h-control-md");
  });

  it("draws a status as Arc's badge, label included", () => {
    const html = render(<StatusBadge status="FAILED" />);
    expect(html).toContain("Failed");
    expect(html).not.toContain("text-accent-red");
  });

  it("draws the admin user status as Arc's badge", () => {
    const html = render(<UserStatusBadge status="Active" />);
    expect(html).not.toContain("text-accent-green");
    expect(html).toContain("Active");
  });
});

describe("the carton stepper", () => {
  it("keeps both steps labelled and 44px on a phone in Arc's field", () => {
    const html = render(
      <CartonStepper
        size="card"
        live
        value={3}
        packSize={6}
        unit="carton"
        label="Lemon"
        onChange={async () => ({ success: true })}
      />,
    );
    expect(html).toContain('aria-label="One fewer carton — Lemon"');
    expect(html).toContain('aria-label="One more carton — Lemon"');
    expect(html).toContain('value="3"');
    expect((html.match(/max-sm:size-11/g) ?? []).length).toBe(2);
  });
});

describe("toast", () => {
  it("lands in Arc's stack while it is mounted, and nowhere once it has gone", async () => {
    const { toast, registerArcToasts } = await import("@/lib/toast");
    const sink = vi.fn();
    const unregister = registerArcToasts(sink);
    toast.success("Saved", { action: { label: "Undo", onClick: () => {} } });
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Saved", action: expect.objectContaining({ label: "Undo" }) }),
    );
    unregister();
    expect(() => toast.error("Nope")).not.toThrow();
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
