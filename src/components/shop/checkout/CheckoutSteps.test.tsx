import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckoutSteps } from "@/components/shop/checkout/CheckoutSteps";

describe("CheckoutSteps", () => {
  it("reads \"We'll be in touch\" while the order is still pending", () => {
    const html = renderToStaticMarkup(<CheckoutSteps current={2} />);
    expect(html).toContain("We&#x27;ll be in touch");
    expect(html).not.toContain("Received");
    expect(html).not.toContain("Confirmed");
    // Still on the current step — not done, no checkmark's "done" text yet.
    expect(html).toContain('aria-current="step"');
  });

  it("reads \"Received\" while the team holds the order", () => {
    const html = renderToStaticMarkup(
      <CheckoutSteps current={4} state="received" />,
    );
    expect(html).toContain("Received");
    expect(html).not.toContain("We&#x27;ll be in touch");
    expect(html).not.toContain("Confirmed");
    // Every step reads done, so none is the current one.
    expect(html).not.toContain('aria-current="step"');
  });

  it("reads \"Confirmed\" once the order is confirmed", () => {
    const html = renderToStaticMarkup(
      <CheckoutSteps current={4} state="confirmed" />,
    );
    expect(html).toContain("Confirmed");
    expect(html).not.toContain("We&#x27;ll be in touch");
    expect(html).not.toContain("Received");
    expect(html).not.toContain('aria-current="step"');
  });
});
