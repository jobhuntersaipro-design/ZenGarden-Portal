import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WebOrderReceived,
  webOrderReceivedSubject,
} from "@/emails/WebOrderReceived";

const html = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    WebOrderReceived({
      reference: "W-2609-00001",
      buyerReference: "ACME-PO-771",
      lineCount: 3,
      total: "RM 1,926.50",
      orderUrl: "https://shop.example.com/orders/w1",
      ...over,
    }),
  );

describe("WebOrderReceived", () => {
  it("names the order, the figures and the buyer's own reference", () => {
    const out = html();
    expect(out).toContain("W-2609-00001");
    expect(out).toContain("ACME-PO-771");
    expect(out).toContain("RM 1,926.50");
    expect(out).toContain("3 lines");
    expect(out).toContain("https://shop.example.com/orders/w1");
  });

  it("omits the buyer's reference when they gave none", () => {
    expect(html({ buyerReference: null })).not.toContain("your reference");
  });

  it("says one line, not 1 lines", () => {
    expect(html({ lineCount: 1 })).toContain("1 line ");
  });

  // The whole point of this mail is that a delivery date does NOT exist yet.
  // Promising one here would contradict the confirmation mail that follows.
  it("promises no delivery date", () => {
    const out = html().toLowerCase();
    expect(out).not.toContain("expect to deliver");
    expect(out).not.toContain("delivery date is");
  });

  it("puts the reference in the subject", () => {
    expect(webOrderReceivedSubject("W-2609-00001")).toBe(
      "We have your order W-2609-00001",
    );
  });
});
