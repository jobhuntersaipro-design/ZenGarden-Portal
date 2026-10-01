import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { UiModeProvider } from "./UiModeProvider";
import type { UiMode } from "@/lib/ui-mode";

const render = (mode: UiMode | null, node: React.ReactNode) =>
  renderToStaticMarkup(mode ? <UiModeProvider mode={mode}>{node}</UiModeProvider> : node);

describe("the preview switch draws one set at a time", () => {
  it("keeps the shadcn button outside Arc mode, and with no provider at all", () => {
    for (const mode of [null, "classic"] as const) {
      const html = render(mode, <Button>Save</Button>);
      expect(html).toContain("rounded-pill");
      expect(html).toContain('data-slot="button"');
    }
  });

  it("draws Arc's button in Arc mode, keeping the caller's label and slot", () => {
    const html = render("arc", <Button>Save</Button>);
    expect(html).not.toContain("rounded-pill");
    expect(html).toContain('data-slot="button"');
    expect(html).toContain("Save");
  });

  it("marks a pending Arc button busy rather than dropping it", () => {
    expect(render("arc", <Button pending>Saving…</Button>)).toContain('aria-busy="true"');
  });

  it("keeps a caller's utilities on an Arc field", () => {
    const html = render("arc", <Input className="w-24" />);
    expect(html).toContain("w-24");
    expect(html).not.toContain("h-control-md");
  });

  it("swaps the status pill for Arc's badge", () => {
    expect(render("classic", <StatusBadge status="FAILED" />)).toContain("text-accent-red");
    expect(render("arc", <StatusBadge status="FAILED" />)).not.toContain("text-accent-red");
  });
});

describe("toast", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lands in Arc's stack only while the page is in Arc mode", async () => {
    const sonner = vi.fn();
    vi.doMock("sonner", () => ({ toast: Object.assign(sonner, { success: sonner, error: sonner, warning: sonner }) }));
    vi.resetModules();
    const { toast, registerArcToasts } = await import("@/lib/toast");
    const sink = vi.fn();
    const unregister = registerArcToasts(sink);

    vi.stubGlobal("document", { documentElement: { dataset: { ui: "arc" } } });
    toast.success("Saved", { action: { label: "Undo", onClick: () => {} } });
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "Saved" }));
    expect(sonner).not.toHaveBeenCalled();

    vi.stubGlobal("document", { documentElement: { dataset: { ui: "classic" } } });
    toast.error("Nope");
    expect(sonner).toHaveBeenCalledWith("Nope", expect.anything());
    expect(sink).toHaveBeenCalledTimes(1);
    unregister();
    vi.doUnmock("sonner");
  });
});
