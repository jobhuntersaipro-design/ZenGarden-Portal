import "server-only";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatGrouped } from "@/lib/money";
import {
  AWAITING_CONFIRMATION_NOTE,
  DOCUMENT_COMPANY_NAME,
  type PoDocumentData,
} from "@/lib/purchase-order-document";

/**
 * The purchase order as a file (Phase 37).
 *
 * A second renderer of the **same** `PoDocumentData` that
 * `PurchaseOrderPreview` draws in Tailwind: one builder decides what a
 * purchase order says, and the screen and the file cannot disagree about it.
 * Section for section this mirrors that component — masthead, four-cell meta
 * strip, the buyer's block, the ten-column line grid, the totals column, the
 * notes and the footer carrying our own reference. Landscape since Phase 45,
 * when the line grid gained five quantity columns that portrait could not
 * hold beside a readable description.
 *
 * **This is the one file in the repository allowed raw hex.** A PDF has no
 * stylesheet and no CSS custom properties, so `text-ink` cannot resolve to
 * anything here; the values below are the design system's own, copied from
 * `docs/design/storefront/_parts.md` and named so a reader can see which
 * token each one is. `context/coding-standard.md`'s ban is on inventing
 * colours in a component, and nothing is invented here.
 *
 * **Fonts are the PDF built-ins, Helvetica and Helvetica-Bold.** Bundling
 * Inter and Plus Jakarta Sans means `Font.register` plus
 * `outputFileTracingIncludes`, and 2026-09-08 proved a laptop cannot verify
 * such an include: a macOS build traces the files whether or not the glob
 * matched, and production 500ed on sharp with the artefact looking correct.
 * A purchase order set in Helvetica is unremarkable; one that fails to render
 * in production is not. Known cost: no brand faces on the file, and no CJK
 * glyphs — a buyer named in Chinese script would print as boxes.
 */

const COLORS = {
  ink: "#292d34",
  inkSecondary: "#646464",
  inkTertiary: "#6f6f6f",
  hairline: "#e8e8e8",
  canvas: "#ffffff",
} as const;

/**
 * Landscape A4 at 72dpi is 842×595pt; 36pt is the 12mm margin the screen print
 * uses, leaving 770pt of body.
 */
const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.canvas,
    color: COLORS.ink,
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingHorizontal: 36,
    paddingTop: 36,
    // Room for the footer, which is fixed to the bottom of every page.
    paddingBottom: 56,
  },
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.ink,
    paddingBottom: 12,
  },
  company: { fontFamily: "Helvetica-Bold", fontSize: 14, color: COLORS.ink },
  title: { fontFamily: "Helvetica-Bold", fontSize: 14, textAlign: "right" },
  reference: { fontSize: 10, marginTop: 3, textAlign: "right" },
  caption: { fontSize: 7, color: COLORS.inkTertiary },
  metaStrip: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
    paddingVertical: 12,
  },
  metaCells: { flexDirection: "row" },
  metaNote: { fontSize: 8, color: COLORS.inkSecondary, marginTop: 8 },
  metaCell: { flexGrow: 1, flexBasis: 0, paddingRight: 12 },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 3 },
  parties: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
    paddingVertical: 12,
  },
  // A fixed half, not `flexGrow: 1`: there is only one party left, and a
  // grower would stretch the buyer's block across the whole sheet.
  party: { width: "50%", paddingRight: 24 },
  partyHeading: { fontSize: 7, color: COLORS.inkTertiary, letterSpacing: 0.6 },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 3 },
  partyLine: { fontSize: 9, color: COLORS.inkSecondary, marginTop: 3 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 },
  headRow: { borderBottomWidth: 1, borderBottomColor: COLORS.ink },
  bodyRow: { borderBottomWidth: 1, borderBottomColor: COLORS.hairline },
  lastRow: { borderBottomWidth: 1, borderBottomColor: COLORS.ink },
  // The preview's ten-column grid, in points across 770pt of body. The five
  // quantity columns share one width so their two-line headers line up.
  colIndex: { width: 22, textAlign: "right", paddingRight: 6 },
  colCode: { width: 96, paddingRight: 6 },
  colDescription: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
  colQuantity: { width: 58, textAlign: "right", paddingLeft: 4 },
  colUnit: { width: 64, textAlign: "right", paddingLeft: 4 },
  colAmount: { width: 76, textAlign: "right", paddingLeft: 4 },
  description: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  lineCaption: { fontSize: 7, color: COLORS.inkTertiary, marginTop: 2 },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", paddingTop: 12 },
  totals: { width: 200 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 9, color: COLORS.inkSecondary },
  totalsValue: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 2,
    borderTopColor: COLORS.ink,
    marginTop: 3,
    paddingTop: 8,
  },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  notes: { paddingTop: 12 },
  notesHeading: { fontSize: 7, color: COLORS.inkTertiary, letterSpacing: 0.6 },
  notesBody: { fontSize: 9, color: COLORS.inkSecondary, marginTop: 3 },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
    paddingTop: 6,
  },
});

/** A whole number grouped, or "—" where the product does not carry it. */
const count = (value: number | null) =>
  value === null ? "—" : formatGrouped(value, 0);

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Party({
  heading,
  party,
}: {
  heading: string;
  party: PoDocumentData["buyer"];
}) {
  return (
    <View style={styles.party}>
      <Text style={styles.partyHeading}>{heading.toUpperCase()}</Text>
      <Text style={styles.partyName}>{party.name}</Text>
      {party.address ? <Text style={styles.partyLine}>{party.address}</Text> : null}
      {party.contact ? <Text style={styles.partyLine}>{party.contact}</Text> : null}
    </View>
  );
}

export function PurchaseOrderPdf({
  document,
  footnote,
}: {
  document: PoDocumentData;
  /** The line along the bottom. The caller says what is true of this order. */
  footnote: string;
}) {
  return (
    <Document
      title={`Purchase order ${document.orderId ?? document.poNumber ?? ""}`.trim()}
      author={DOCUMENT_COMPANY_NAME}
      subject={`Purchase order for ${document.buyer.name}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.masthead}>
          <Text style={styles.company}>{DOCUMENT_COMPANY_NAME}</Text>
          <View>
            <Text style={styles.title}>PURCHASE ORDER</Text>
            {/* Our Order ID, named — never the buyer's PO (2026-09-17). */}
            {document.orderId ? (
              <Text style={styles.reference}>{`Order ID ${document.orderId}`}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.metaStrip}>
          <View style={styles.metaCells}>
            <Meta label="PO Number" value={document.poNumber ?? "—"} />
            <Meta label="Order Date" value={document.orderDate} />
            {/* "—" until the team confirms a date (Phase 44). */}
            <Meta label="Expected Delivery" value={document.deliveryDate ?? "—"} />
            <Meta label="Payment Terms" value={document.paymentTerms ?? "—"} />
            <Meta label="Currency" value={document.currency} />
          </View>
          {document.awaitingConfirmation ? (
            <Text style={styles.metaNote}>{AWAITING_CONFIRMATION_NOTE}</Text>
          ) : null}
        </View>

        {/* One party, half width: we are the supplier and the masthead
            already says so, so there is no second block (2026-09-18). */}
        <View style={styles.parties}>
          <Party heading="Buyer" party={document.buyer} />
        </View>

        <View style={{ paddingTop: 12 }}>
          {/* `fixed` repeats the header on every page of a long order. */}
          <View style={[styles.row, styles.headRow]} fixed>
            <Text style={[styles.colIndex, styles.caption]}>#</Text>
            <Text style={[styles.colCode, styles.caption]}>Product Code</Text>
            <Text style={[styles.colDescription, styles.caption]}>Description</Text>
            <Text style={[styles.colQuantity, styles.caption]}>Pieces/Carton</Text>
            <Text style={[styles.colQuantity, styles.caption]}>Cartons/Pallet</Text>
            <Text style={[styles.colQuantity, styles.caption]}>Total Pieces</Text>
            <Text style={[styles.colQuantity, styles.caption]}>Total Cartons</Text>
            <Text style={[styles.colQuantity, styles.caption]}>Total Pallets</Text>
            <Text style={[styles.colUnit, styles.caption]}>Unit Price</Text>
            <Text style={[styles.colAmount, styles.caption]}>Amount</Text>
          </View>

          {document.lines.map((line, index) => (
            <View
              key={`${line.sku}-${line.position}`}
              style={[
                styles.row,
                index === document.lines.length - 1 ? styles.lastRow : styles.bodyRow,
              ]}
              // A line must not be split across two pages.
              wrap={false}
            >
              <Text style={[styles.colIndex, { color: COLORS.inkTertiary }]}>
                {line.position}
              </Text>
              <Text style={styles.colCode}>{line.sku}</Text>
              <View style={styles.colDescription}>
                <Text style={styles.description}>{line.description}</Text>
                {line.detailCaption ? (
                  <Text style={styles.lineCaption}>{line.detailCaption}</Text>
                ) : null}
              </View>
              <Text style={styles.colQuantity}>{count(line.piecesPerCarton)}</Text>
              <Text style={styles.colQuantity}>{count(line.cartonsPerPallet)}</Text>
              <Text style={styles.colQuantity}>{count(line.totalPieces)}</Text>
              <Text style={styles.colQuantity}>{formatGrouped(line.cartons, 0)}</Text>
              <Text style={styles.colQuantity}>
                {count(line.pallets)}
              </Text>
              <Text style={styles.colUnit}>{formatGrouped(line.unitPrice)}</Text>
              <Text style={[styles.colAmount, styles.description]}>
                {formatGrouped(line.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totals}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatGrouped(document.subtotal)}</Text>
            </View>
            {document.tax ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>{formatGrouped(document.tax)}</Text>
              </View>
            ) : null}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>{`Total (${document.currency})`}</Text>
              <Text style={styles.grandValue}>{formatGrouped(document.total)}</Text>
            </View>
          </View>
        </View>

        {document.notes ? (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.notesHeading}>NOTES FROM THE BUYER</Text>
            <Text style={styles.notesBody}>{document.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.caption}>{footnote}</Text>
          {document.orderId ? (
            <Text style={styles.caption}>{`Order ID ${document.orderId}`}</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

/** The bytes. `renderToBuffer` is the Node entry point; there is no browser here. */
export function renderPurchaseOrderPdf(
  document: PoDocumentData,
  footnote: string,
): Promise<Buffer> {
  return renderToBuffer(<PurchaseOrderPdf document={document} footnote={footnote} />);
}
