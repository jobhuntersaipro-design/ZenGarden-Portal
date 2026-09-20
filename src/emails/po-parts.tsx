import type { CSSProperties, ReactNode } from "react";
import {
  bodyFont,
  canvas,
  hairline,
  ink,
  inkSecondary,
  inkTertiary,
  monoFont,
  white,
} from "@/emails/parts";
import { formatGrouped } from "@/lib/money";
import type { PoDocumentData } from "@/lib/purchase-order-document";

/**
 * The purchase order, drawn in an email (2026-09-18).
 *
 * Mail clients cannot show a PDF in the body, so every email about a purchase
 * order carries its facts and lines as HTML — readable with images blocked —
 * and, above the button, a picture of page 1 sent as an inline attachment.
 *
 * Tables and inline styles only: Gmail strips `<style>` in places and Outlook
 * lays out nothing else reliably. The content column is 536px (`Layout`).
 */

/** Referenced as `cid:`; `poEmailAttachments` gives the PNG this id. */
export const PO_PREVIEW_CONTENT_ID = "po-preview";
const CONTENT_WIDTH = 536;

const cell: CSSProperties = {
  fontFamily: bodyFont,
  fontSize: 14,
  lineHeight: 1.4,
  color: ink,
  verticalAlign: "top",
};

const label: CSSProperties = {
  fontFamily: bodyFont,
  fontSize: 11,
  lineHeight: 1.4,
  letterSpacing: "0.4px",
  textTransform: "uppercase",
  color: inkTertiary,
};

/**
 * "PO number ACME-PO-771" under the heading, named for what it is (2026-09-17:
 * the Order ID is never the PO number).
 *
 * The buyer's own PO number since 2026-09-20, at the user's request, where it
 * was the Order ID before. Every order placed since then carries one; an order
 * placed while the field was still optional reads "—" rather than borrowing
 * our Order ID, which would be exactly the confusion the 2026-09-17 fix
 * removed. The subject and heading do fall back to the Order ID, because an
 * unnamed order is unfindable in an inbox.
 */
export function PoMetaLine({ poNumber }: { poNumber: string | null }) {
  return (
    <p
      style={{
        margin: "0 0 16px",
        fontFamily: bodyFont,
        fontSize: 14,
        lineHeight: 1.4,
        color: inkSecondary,
      }}
    >
      {"PO number "}
      <span style={{ fontFamily: monoFont, color: ink, whiteSpace: "nowrap" }}>
        {poNumber?.trim() || "—"}
      </span>
    </p>
  );
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <td width="50%" style={{ ...cell, padding: "0 12px 12px 0", width: "50%" }}>
      <div style={label}>{name}</div>
      <div style={{ marginTop: 2, fontWeight: 600 }}>{children}</div>
    </td>
  );
}

function Money({ children, bold = false }: { children: string; bold?: boolean }) {
  return (
    <span style={{ whiteSpace: "nowrap", fontWeight: bold ? 600 : 400 }}>{children}</span>
  );
}

/**
 * The order's facts, its lines and its totals — the part of the document a
 * reader with images off still gets.
 *
 * `declined` changes what an empty date or term reads as: on a live order the
 * team has yet to set it ("We'll confirm"); on a declined one nobody will.
 */
export function PoSummary({
  document,
  heading,
  declined = false,
}: {
  document: PoDocumentData;
  heading: string;
  declined?: boolean;
}) {
  const unset = declined ? "—" : "We'll confirm";
  const numeric: CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
  const head: CSSProperties = { ...label, padding: "0 0 8px", borderBottom: `1px solid ${ink}` };
  const row: CSSProperties = { padding: "10px 0", borderBottom: `1px solid ${hairline}` };

  return (
    <>
      <div style={{ height: 1, backgroundColor: hairline, margin: "8px 0 20px" }} />
      <div style={{ ...label, margin: "0 0 12px", color: inkSecondary }}>{heading}</div>

      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <Fact name="Buyer">{document.buyer.name}</Fact>
            <Fact name="Order date">{document.orderDate}</Fact>
          </tr>
          <tr>
            <Fact name="Expected delivery">{document.deliveryDate ?? unset}</Fact>
            <Fact name="Payment terms">{document.paymentTerms ?? unset}</Fact>
          </tr>
          <tr>
            <Fact name="Currency">{document.currency}</Fact>
            <Fact name="PO number">{document.poNumber ?? "—"}</Fact>
          </tr>
        </tbody>
      </table>

      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ margin: "12px 0 0", borderCollapse: "collapse" }}
      >
        <thead>
          <tr>
            <th align="left" style={{ ...head, textAlign: "left" }}>
              Item
            </th>
            <th align="right" style={{ ...head, textAlign: "right", paddingLeft: 12 }}>
              Cartons
            </th>
            <th align="right" style={{ ...head, textAlign: "right", paddingLeft: 12 }}>
              Unit price
            </th>
            <th align="right" style={{ ...head, textAlign: "right", paddingLeft: 12 }}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line) => (
            <tr key={line.position}>
              <td style={{ ...cell, ...row }}>
                <div style={{ fontWeight: 600 }}>{line.description}</div>
                {line.detailCaption ? (
                  <div style={{ fontSize: 12, color: inkSecondary }}>{line.detailCaption}</div>
                ) : null}
                <div
                  style={{
                    fontFamily: monoFont,
                    fontSize: 12,
                    color: inkTertiary,
                    wordBreak: "break-all",
                  }}
                >
                  {line.sku}
                </div>
              </td>
              <td style={{ ...numeric, ...row, paddingLeft: 12 }}>
                {formatGrouped(line.cartons, 0)}
              </td>
              <td style={{ ...numeric, ...row, paddingLeft: 12 }}>
                <Money>{formatGrouped(line.unitPrice)}</Money>
              </td>
              <td style={{ ...numeric, ...row, paddingLeft: 12 }}>
                <Money bold>{formatGrouped(line.amount)}</Money>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ margin: "8px 0 20px" }}
      >
        <tbody>
          <tr>
            <td style={{ ...cell, color: inkSecondary, padding: "6px 0" }}>Subtotal</td>
            <td style={{ ...numeric, padding: "6px 0" }}>
              <Money>{formatGrouped(document.subtotal)}</Money>
            </td>
          </tr>
          {document.tax ? (
            <tr>
              <td style={{ ...cell, color: inkSecondary, padding: "6px 0" }}>Tax</td>
              <td style={{ ...numeric, padding: "6px 0" }}>
                <Money>{formatGrouped(document.tax)}</Money>
              </td>
            </tr>
          ) : null}
          <tr>
            <td
              style={{
                ...cell,
                fontSize: 16,
                fontWeight: 700,
                padding: "10px 0 0",
                borderTop: `2px solid ${ink}`,
              }}
            >
              {`Total (${document.currency})`}
            </td>
            <td
              style={{
                ...numeric,
                fontSize: 16,
                padding: "10px 0 0",
                borderTop: `2px solid ${ink}`,
              }}
            >
              <Money bold>{formatGrouped(document.total)}</Money>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

/**
 * Page 1 of the purchase order, and how to reach the document when the picture
 * does not show. Draws no `<img>` unless the PNG is really on the email — a
 * failed render leaves the sentence, never a broken image.
 */
export function PoPreview({
  reference,
  orderUrl,
  preview,
  attached,
}: {
  reference: string;
  orderUrl: string;
  preview: boolean;
  attached: boolean;
}) {
  if (!preview && !attached) return null;

  const link = (
    <a href={orderUrl} style={{ color: ink, textDecoration: "underline" }}>
      open it in your browser
    </a>
  );
  const note: CSSProperties = {
    margin: "8px 0 16px",
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 1.5,
    color: inkTertiary,
  };

  if (!preview) {
    return (
      <p style={{ ...note, margin: "0 0 16px" }}>
        The purchase order is attached as a PDF, or {link}.
      </p>
    );
  }

  return (
    <>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ backgroundColor: canvas, borderRadius: 8 }}
      >
        <tbody>
          <tr>
            <td>
              {/* eslint-disable-next-line @next/next/no-img-element -- an email, not a page */}
              <img
                src={`cid:${PO_PREVIEW_CONTENT_ID}`}
                width={CONTENT_WIDTH}
                alt={`Purchase order ${reference}`}
                // Not a hint to the mail client, which ignores it: without it
                // React's server renderer hoists a <link rel="preload"> for
                // the image into <head>, which has no business in an email.
                fetchPriority="low"
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: CONTENT_WIDTH,
                  // The border inside the 536px, not 2px past the column.
                  boxSizing: "border-box",
                  height: "auto",
                  border: `1px solid ${hairline}`,
                  borderRadius: 8,
                  backgroundColor: white,
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p style={note}>
        Can&apos;t see the document?{" "}
        <a href={orderUrl} style={{ color: ink, textDecoration: "underline" }}>
          Open it in your browser
        </a>
        {attached ? " or download the attached PDF." : "."}
      </p>
    </>
  );
}

/** Under the button of every purchase-order email. None of them is an invoice. */
export function PoFooter() {
  return (
    <p
      style={{
        margin: "8px 0 0",
        fontFamily: bodyFont,
        fontSize: 12,
        lineHeight: 1.5,
        color: inkTertiary,
      }}
    >
      This email is not an invoice.
    </p>
  );
}
