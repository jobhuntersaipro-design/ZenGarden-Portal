import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-key", EXTRACTION_MODEL: "claude-sonnet-5" },
}));

const { ExtractionError, extractPurchaseOrder } = await import(
  "@/lib/extraction/extract-po"
);

const parsedOutput = {
  poNumber: "PO-2026-0917",
  buyerName: "Acme Industrial Sdn Bhd",
  poDate: "2026-09-17",
  deliveryDate: null,
  currency: "MYR",
  buyerReference: null,
  paymentTerms: null,
  lineItems: [
    {
      description: "Stone lantern 60cm",
      quantity: 20,
      unit: "piece",
      unitPrice: 727.1613,
      amount: 14543.23,
    },
  ],
  subtotal: 14543.23,
  tax: 0,
  total: 14543.23,
  pageCount: 2,
  confidence: { overall: 92, fields: { poNumber: 99 } },
};

/** Stands in for the Anthropic client; records what it was asked for. */
const clientReturning = (message: unknown) => {
  const parse = vi.fn().mockResolvedValue(message);
  return { client: { messages: { parse } } as never, parse };
};

const bytes = new Uint8Array([1, 2, 3]);

describe("extractPurchaseOrder", () => {
  it("returns the parsed output with the model and token usage", async () => {
    const { client } = clientReturning({
      parsed_output: parsedOutput,
      model: "claude-sonnet-5",
      usage: { input_tokens: 1200, output_tokens: 340 },
    });

    const result = await extractPurchaseOrder(bytes, "application/pdf", client);
    expect(result.extraction.poNumber).toBe("PO-2026-0917");
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(340);
  });

  it("sends a PDF as a document block", async () => {
    const { client, parse } = clientReturning({
      parsed_output: parsedOutput,
      model: "m",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await extractPurchaseOrder(bytes, "application/pdf", client);

    const content = parse.mock.calls[0][0].messages[0].content;
    expect(content[0].type).toBe("document");
    expect(content[0].source.media_type).toBe("application/pdf");
    expect(content[1]).toEqual({ type: "text", text: "Extract this purchase order." });
  });

  it("sends a PNG as an image block with its own media type", async () => {
    const { client, parse } = clientReturning({
      parsed_output: parsedOutput,
      model: "m",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await extractPurchaseOrder(bytes, "image/png", client);

    const content = parse.mock.calls[0][0].messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source.media_type).toBe("image/png");
  });

  it("asks for structured output against the schema", async () => {
    const { client, parse } = clientReturning({
      parsed_output: parsedOutput,
      model: "m",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await extractPurchaseOrder(bytes, "application/pdf", client);

    const params = parse.mock.calls[0][0];
    expect(params.output_config.format).toBeDefined();
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.max_tokens).toBe(4096);
    expect(params.system).toContain("Loving Hands is the seller");
  });

  it("refuses a file type it cannot read", async () => {
    const { client } = clientReturning({});
    await expect(
      extractPurchaseOrder(bytes, "application/msword", client),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it("turns an empty parse into a reason the reviewer can act on", async () => {
    const { client } = clientReturning({
      parsed_output: null,
      model: "m",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await expect(
      extractPurchaseOrder(bytes, "application/pdf", client),
    ).rejects.toThrow(/scan with no readable text/);
  });

  it("names a timeout as a timeout", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("Request was aborted"));
    await expect(
      extractPurchaseOrder(bytes, "application/pdf", {
        messages: { parse },
      } as never),
    ).rejects.toThrow("Reading the document took too long");
  });

  it("wraps any other failure as an ExtractionError", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("503 overloaded"));
    await expect(
      extractPurchaseOrder(bytes, "application/pdf", { messages: { parse } } as never),
    ).rejects.toBeInstanceOf(ExtractionError);
  });
});
