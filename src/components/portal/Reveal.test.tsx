import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal } from "@/components/portal/Reveal";

const html = (props: Parameters<typeof Reveal>[0]) => renderToStaticMarkup(<Reveal {...props} />);

describe("Reveal", () => {
  it("grows in when it mounts, by default", () => {
    expect(html({ children: "x" })).toContain('class="reveal animate-reveal"');
  });

  it("plays the fold while closing", () => {
    expect(html({ closing: true, children: "x" })).toContain('class="reveal animate-conceal"');
  });

  it("does not grow what was already there when the page loaded", () => {
    const out = html({ appear: false, children: "x" });
    expect(out).not.toContain("animate-reveal");
    expect(out).not.toContain("animate-conceal");
  });

  it("closes even when it never grew in", () => {
    expect(html({ appear: false, closing: true, children: "x" })).toContain("animate-conceal");
  });

  it("keeps padding off the box that reaches zero height", () => {
    // Padding on the clipping box would hold it open at its own height.
    const out = html({ className: "py-sm", children: "x" });
    expect(out).toContain('<div class="min-h-0 overflow-hidden"><div class="py-sm">x</div></div>');
  });
});
