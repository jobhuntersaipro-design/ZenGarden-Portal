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
 * strip, the two parties, the six-column line grid, the totals column, the
 * notes and the footer carrying our own reference.
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

/** A4 at 72dpi is 595×842pt; 36pt is the 12mm margin the screen print uses. */
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
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
    paddingVertical: 12,
  },
  metaCell: { flexGrow: 1, flexBasis: 0, paddingRight: 12 },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 3 },
  parties: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
    paddingVertical: 12,
  },
  party: { flexGrow: 1, flexBasis: 0, paddingRight: 24 },
  partyHeading: { fontSize: 7, color: COLORS.inkTertiary, letterSpacing: 0.6 },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 3 },
  partyLine: { fontSize: 9, color: COLORS.inkSecondary, marginTop: 3 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 },
  headRow: { borderBottomWidth: 1, borderBottomColor: COLORS.ink },
  bodyRow: { borderBottomWidth: 1, borderBottomColor: COLORS.hairline },
  lastRow: { borderBottomWidth: 1, borderBottomColor: COLORS.ink },
  // The preview's 34/132/1fr/64/96/104 grid, in points across 523pt of body.
  colIndex: { width: 22, textAlign: "right", paddingRight: 6 },
  colCode: { width: 96, paddingRight: 6 },
  colDescription: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
  colCartons: { width: 48, textAlign: "right" },
  colUnit: { width: 66, textAlign: "right" },
  colAmount: { width: 72, textAlign: "right" },
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
      title={`Purchase order ${document.reference}`}
      author={document.supplier.name}
      subject={`Purchase order for ${document.buyer.name}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead}>
          <Text style={styles.company}>{DOCUMENT_COMPANY_NAME}</Text>
          <View>
            <Text style={styles.title}>PURCHASE ORDER</Text>
            <Text style={styles.reference}>{document.reference}</Text>
          </View>
        </View>

        <View style={styles.metaStrip}>
          <Meta label="Order date" value={document.orderDate} />
          {/* "—" until the team confirms a date (Phase 44). */}
          <Meta label="Expected delivery" value={document.deliveryDate ?? "—"} />
          <Meta label="Payment terms" value={document.paymentTerms ?? "—"} />
          <Meta label="Currency" value={document.currency} />
        </View>

        <View style={styles.parties}>
          <Party heading="Buyer" party={document.buyer} />
          <Party heading="Supplier" party={document.supplier} />
        </View>

        <View style={{ paddingTop: 12 }}>
          {/* `fixed` repeats the header on every page of a long order. */}
          <View style={[styles.row, styles.headRow]} fixed>
            <Text style={[styles.colIndex, styles.caption]}>#</Text>
            <Text style={[styles.colCode, styles.caption]}>Product code</Text>
            <Text style={[styles.colDescription, styles.caption]}>Description</Text>
            <Text style={[styles.colCartons, styles.caption]}>Cartons</Text>
            <Text style={[styles.colUnit, styles.caption]}>Unit price</Text>
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
                {line.packCaption ? (
                  <Text style={styles.lineCaption}>{line.packCaption}</Text>
                ) : null}
              </View>
              <Text style={styles.colCartons}>{formatGrouped(line.cartons, 0)}</Text>
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
          {document.ourReference ? (
            <Text style={styles.caption}>{document.ourReference}</Text>
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
