import "server-only";
import path from "node:path";
import { PO_PREVIEW_CONTENT_ID } from "@/emails/po-parts";
import type { EmailAttachment } from "@/lib/email";
import type { PoDocumentData } from "@/lib/purchase-order-document";
import {
  loadWebOrderDocumentData,
  type WebOrderDocument,
} from "@/lib/web-order-document";

/**
 * What every purchase-order email carries beside its own copy: the document's
 * facts and lines as HTML, a picture of page 1, and the PDF itself.
 *
 * Mail clients cannot draw a PDF in the body, so the picture is what a reader
 * sees without opening the attachment — and the HTML table is what they see
 * when their client blocks images too.
 */

/**
 * 2x the PDF's 72pt grid — 144 DPI. A landscape A4 page comes out at
 * 1684×1190 and roughly 150 KB: sharp at the 536px the email draws it, and a
 * modest attachment rather than a print-resolution scan.
 */
const PREVIEW_SCALE = 2;

/** Rendering sits inside `after()`; a hung render must not hold the email. */
const PREVIEW_TIMEOUT_MS = 10_000;

/**
 * Page 1 of a PDF as a PNG. Null on any failure, never throws: a missing
 * picture degrades the email to HTML and the attached PDF, and must not stop
 * the email.
 *
 * pdf.js reads the page and `@napi-rs/canvas` (pdf.js's own Node canvas) draws
 * it. The purchase order uses the standard Helvetica without embedding it, so
 * pdf.js loads its bundled standard fonts from disk — without them the text
 * renders in a fallback face or not at all.
 */
export async function renderPoPreviewPng(pdfBytes: Uint8Array): Promise<Buffer | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const render = rasterizeFirstPage(pdfBytes);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS);
    });
    return await Promise.race([render, timeout]);
  } catch (cause) {
    console.error("[po-email] renderPoPreviewPng", cause);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function rasterizeFirstPage(pdfBytes: Uint8Array): Promise<Buffer> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    // A copy: pdf.js transfers the buffer it is given, which would detach the
    // caller's bytes before they are attached to the email.
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: `${path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts")}/`,
    isEvalSupported: false,
  }).promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: PREVIEW_SCALE });
    // Typed as a bare object by pdf.js; in Node it is its @napi-rs/canvas
    // factory, whose canvas can encode itself.
    const factory = document.canvasFactory as {
      create(width: number, height: number): {
        canvas: HTMLCanvasElement & { toBuffer(mime: "image/png"): Buffer };
        context: CanvasRenderingContext2D;
      };
    };
    const { canvas, context } = factory.create(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    // pdf.js draws on a transparent canvas; an email client would show the
    // page on whatever colour sits behind it.
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await document.destroy();
  }
}

/**
 * The PDF, and the preview as an inline attachment when there is one. The
 * preview's content id is set only when the PNG exists, so an email never
 * references a `cid:` that is not on it.
 */
export function poEmailAttachments({
  poNumber,
  pdfBytes,
  previewPng,
}: {
  /** The name the files go by — our Order ID, `W-2609-00015`. */
  poNumber: string;
  pdfBytes: Uint8Array;
  previewPng: Buffer | null;
}): EmailAttachment[] {
  const attachments: EmailAttachment[] = [
    {
      filename: `${poNumber}.pdf`,
      content: Buffer.from(pdfBytes),
      contentType: "application/pdf",
    },
  ];
  if (previewPng) {
    attachments.push({
      filename: `${poNumber}-preview.png`,
      content: previewPng,
      contentType: "image/png",
      contentId: PO_PREVIEW_CONTENT_ID,
    });
  }
  return attachments;
}

export type PoEmailContent = {
  /** The document as data, for the facts and the line table. */
  document: PoDocumentData | null;
  /** Whether `cid:po-preview` is on the email. */
  preview: boolean;
  /** Whether the PDF is on the email. */
  attached: boolean;
  attachments: EmailAttachment[] | undefined;
};

/**
 * Everything a shop-order email needs from its document, in one call. `file`
 * is the PDF the caller already has (rendered, redrawn or read back), or null
 * when there is none — the facts and lines are then still loaded, and the
 * email goes without a picture or an attachment rather than not at all.
 *
 * The render runs once per file: when one send path mails two people, call
 * this once and pass the result to both.
 */
export async function preparePoEmail(
  webOrderId: string,
  reference: string,
  file: WebOrderDocument | null,
): Promise<PoEmailContent> {
  const [document, previewPng] = await Promise.all([
    loadWebOrderDocumentData(webOrderId),
    file ? renderPoPreviewPng(file.bytes) : Promise.resolve(null),
  ]);
  return {
    document,
    preview: Boolean(file && previewPng),
    attached: Boolean(file),
    attachments: file
      ? poEmailAttachments({ poNumber: reference, pdfBytes: file.bytes, previewPng })
      : undefined,
  };
}
