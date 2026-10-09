import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "@/lib/env";
import { extractionModel } from "@/lib/extraction/model";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/extraction/prompt";
import {
  PoExtractionSchema,
  notAPurchaseOrder,
  type PoExtraction,
} from "@/lib/extraction/schema";

/** Everything that can go wrong here reaches the caller as this. */
export class ExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractionError";
  }
}

const MAX_TOKENS = 4096;
/** Well inside the route's own maxDuration of 120. */
const TIMEOUT_MS = 90_000;

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type ExtractionResult = {
  extraction: PoExtraction;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * PDFs go in a `document` block; PNG and JPEG go in an `image` block. The two
 * image types are written out separately rather than sharing a branch, because
 * a shared `mimeType` widens to `string` and the SDK wants the literal.
 */
function sourceBlock(
  bytes: Uint8Array,
  mimeType: string,
): Anthropic.ContentBlockParam {
  const data = Buffer.from(bytes).toString("base64");
  switch (mimeType) {
    case "application/pdf":
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      };
    case "image/png":
      return {
        type: "image",
        source: { type: "base64", media_type: "image/png", data },
      };
    case "image/jpeg":
      return {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data },
      };
    default:
      throw new ExtractionError(`Cannot read a ${mimeType} file`);
  }
}

/**
 * One document, one structured-output call. Shared by the PO reader and the
 * booking-confirmation reader (2026-10-08), so both time out, and word their
 * failures, the same way.
 */
export async function readDocument<Schema extends z.ZodType>({
  bytes,
  mimeType,
  system,
  instruction,
  format,
  client = anthropic,
}: {
  bytes: Uint8Array;
  mimeType: string;
  system: string;
  instruction: string;
  format: Schema;
  client?: Anthropic;
}) {
  const block = sourceBlock(bytes, mimeType);
  try {
    return await client.messages.parse(
      {
        model: await extractionModel(),
        max_tokens: MAX_TOKENS,
        system,
        messages: [
          {
            role: "user",
            content: [block, { type: "text", text: instruction }],
          },
        ],
        output_config: { format: zodOutputFormat(format) },
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    // The reason reaches the queue row and the retry strip, so it says what
    // happened rather than quoting an HTTP status.
    if (detail.includes("aborted") || detail.includes("timeout")) {
      throw new ExtractionError("Reading the document took too long", { cause });
    }
    throw new ExtractionError(`We couldn't read that document — ${detail}`, {
      cause,
    });
  }
}

export async function extractPurchaseOrder(
  bytes: Uint8Array,
  mimeType: string,
  client: Anthropic = anthropic,
): Promise<ExtractionResult> {
  const message = await readDocument({
    bytes,
    mimeType,
    system: EXTRACTION_SYSTEM_PROMPT,
    instruction: "Extract this purchase order.",
    format: PoExtractionSchema,
    client,
  });

  if (!message.parsed_output) {
    // A refusal or a stop before the JSON closed. Nothing usable came back.
    throw new ExtractionError(
      "The document didn't come back as a purchase order — it may be a scan with no readable text",
    );
  }

  // Refused here, before any draft exists, so it never reaches the review queue.
  if (message.parsed_output.documentKind !== "purchase_order") {
    throw new ExtractionError(notAPurchaseOrder(message.parsed_output.documentKind));
  }

  return {
    extraction: message.parsed_output,
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
