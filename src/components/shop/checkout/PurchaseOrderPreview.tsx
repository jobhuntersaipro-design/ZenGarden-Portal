import { DocumentFit } from "@/components/shop/checkout/DocumentFit";
import { formatGrouped } from "@/lib/money";
import {
  AWAITING_CONFIRMATION_NOTE,
  DOCUMENT_COMPANY_NAME,
  type PoDocumentData,
} from "@/lib/purchase-order-document";

/**
 * The purchase order itself, drawn before it is sent (Phase 33).
 *
 * This is the artboard `docs/design/storefront/purchase-order-preview.html`,
 * rebuilt on the design system's tokens — the artboard prints raw hex, and
 * `context/coding-standard.md` forbids that in a component, so `#292d34`
 * becomes `text-ink`, `#6f6f6f` `text-ink-tertiary`, `#646464`
 * `text-ink-secondary` and `#e8e8e8` `border-hairline`.
 *
 * **Laid out at a landscape 1070px** (portrait A4's 794px until Phase 45 added
 * five quantity columns; `globals.css` says why not A4's own 1123). A document
 * that reflows is not the document; the reader is checking what the seller
 * will hold, so it keeps its proportions. Since 2026-09-17 `DocumentFit` opens
 * it scaled to the frame's width with −/+/Fit, and only a zoom past Fit scrolls
 * inside the frame — the page itself never scrolls sideways.
 *
 * Server-renderable: it takes data and holds no state (the zoom lives in
 * `DocumentFit`, a client leaf). The review screen
 * passes a fresh `PoDocumentData` as the reader types, so it is always
 * current without this component knowing anything about forms.
 */
export function PurchaseOrderPreview({
  document,
  footnote = "This is a preview. The order is not placed until you confirm it.",
}: {
  document: PoDocumentData;
  /**
   * The line along the bottom of the page. It defaults to the checkout
   * wording because that is where this component was born, but the default is
   * a lie anywhere else: an order that has already been sent is not a preview,
   * and the buyer reading it on `/orders/{id}` is looking at a record. Pass
   * what is true for the screen.
   */
  footnote?: string;
}) {
  return (
    // The data attributes are print hooks, not styling: `globals.css` needs to
    // reach the frame and scroller (to stop them clipping the page at the
    // paper's edge), the zoom (to print at full size) and the sheet itself (to
    // drop the screen-only shadow) without matching on utility classes, which
    // tailwind-merge or a restyle could move out from under it.
    <DocumentFit>
      <article
        data-po-page
        aria-label="Purchase order preview"
        className="mx-auto flex w-po-page flex-col bg-canvas p-xl text-ink shadow-sm"
      >
        <header className="flex items-start justify-between border-b-2 border-ink pb-md">
          <p className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
            {DOCUMENT_COMPANY_NAME}
          </p>
          <div className="text-right">
            <p className="font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
              PURCHASE ORDER
            </p>
            {/* Our Order ID, named — never the buyer's PO (2026-09-17). */}
            {document.orderId ? (
              <p className="mt-xxs font-mono text-[length:var(--text-body-md)] text-ink">
                {`Order ID ${document.orderId}`}
              </p>
            ) : null}
          </div>
        </header>

        {/* Five cells since 2026-09-17, the buyer's PO Number first ("—" when
            they gave none). Expected delivery reads "—" until the team
            confirms a date, which then takes its place; until then the note
            under them says so (Phase 45). */}
        <div className="border-b border-hairline py-md">
          <dl className="grid grid-cols-5 gap-md">
            <Meta label="PO Number" value={document.poNumber ?? "—"} />
            <Meta label="Order Date" value={document.orderDate} />
            <Meta label="Expected Delivery" value={document.deliveryDate ?? "—"} />
            <Meta label="Payment Terms" value={document.paymentTerms ?? "—"} />
            <Meta label="Currency" value={document.currency} />
          </dl>
          {document.awaitingConfirmation ? (
            <p className="mt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
              {AWAITING_CONFIRMATION_NOTE}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-xl border-b border-hairline py-md">
          <Party heading="Buyer" party={document.buyer} />
          <Party heading="Supplier" party={document.supplier} />
        </div>

        <div className="pt-md">
          <Row className="border-b border-ink pb-xs">
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">#</span>
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              Product Code
            </span>
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              Description
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              {/* No space to wrap on, so the break is offered after the
                  slash; unbroken, the two headers ran into each other. */}
              Pieces/<wbr />Carton
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Cartons/<wbr />Pallet
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Total Pieces
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Total Cartons
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Total Pallets
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Unit Price
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Amount
            </span>
          </Row>

          {document.lines.map((line, index) => (
            <Row
              key={`${line.sku}-${line.position}`}
              className={
                index === document.lines.length - 1
                  ? "border-b border-ink"
                  : "border-b border-hairline"
              }
            >
              <span className="text-right text-[length:var(--text-body-sm)] text-ink-tertiary">
                {line.position}
              </span>
              <span className="font-mono text-[length:var(--text-body-sm)] break-words text-ink">
                {line.sku}
              </span>
              <span className="min-w-0">
                <span className="block text-[length:var(--text-body-sm)] font-medium text-ink">
                  {line.description}
                </span>
                {line.detailCaption ? (
                  <span className="mt-xxs block text-[length:var(--text-caption)] text-ink-tertiary">
                    {line.detailCaption}
                  </span>
                ) : null}
              </span>
              <Quantity value={count(line.piecesPerCarton)} />
              <Quantity value={count(line.cartonsPerPallet)} />
              <Quantity value={count(line.totalPieces)} />
              <Quantity value={formatGrouped(line.cartons, 0)} />
              <Quantity value={count(line.pallets)} />
              <span className="text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
                {formatGrouped(line.unitPrice)}
              </span>
              <span className="text-right text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                {formatGrouped(line.amount)}
              </span>
            </Row>
          ))}
        </div>

        <div className="flex justify-end pt-md">
          <div className="w-po-totals">
            <div className="flex justify-between py-xxs">
              <span className="text-[length:var(--text-body-md)] text-ink-secondary">
                Subtotal
              </span>
              <span className="text-[length:var(--text-body-md)] font-medium tabular-nums text-ink">
                {formatGrouped(document.subtotal)}
              </span>
            </div>
            {document.tax ? (
              <div className="flex justify-between py-xxs">
                <span className="text-[length:var(--text-body-md)] text-ink-secondary">
                  Tax
                </span>
                <span className="text-[length:var(--text-body-md)] font-medium tabular-nums text-ink">
                  {formatGrouped(document.tax)}
                </span>
              </div>
            ) : null}
            <div className="mt-xxs flex items-baseline justify-between border-t-2 border-ink pt-sm">
              <span className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
                {`Total (${document.currency})`}
              </span>
              <span className="font-display text-[length:var(--text-heading-md)] font-[650] tabular-nums text-ink">
                {formatGrouped(document.total)}
              </span>
            </div>
          </div>
        </div>

        {document.notes ? (
          <div className="pt-md">
            <p className="text-[length:var(--text-caption)] tracking-wide text-ink-tertiary uppercase">
              Notes from the buyer
            </p>
            <p className="mt-xxs whitespace-pre-line text-[length:var(--text-body-md)] text-ink-secondary">
              {document.notes}
            </p>
          </div>
        ) : null}

        <div className="grow" />

        <footer className="mt-md flex justify-between border-t border-hairline pt-xs">
          <span className="text-[length:var(--text-caption)] text-ink-tertiary">
            {footnote}
          </span>
          {document.orderId ? (
            <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
              {`Order ID ${document.orderId}`}
            </span>
          ) : null}
        </footer>
      </article>
    </DocumentFit>
  );
}

/** A whole number grouped, or "—" where the product does not carry it. */
const count = (value: number | null) =>
  value === null ? "—" : formatGrouped(value, 0);

function Quantity({ value }: { value: string }) {
  return (
    <span className="text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
      {value}
    </span>
  );
}

/**
 * The ten-column line grid, shared by the header and every row: #, code,
 * description, the five quantity columns at one width so their two-line
 * headers align, unit price and amount (Phase 45).
 */
function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-[34px_120px_minmax(0,1fr)_68px_68px_68px_68px_68px_84px_108px] items-start gap-xs py-xs ${className}`}
    >
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[length:var(--text-caption)] text-ink-tertiary">{label}</dt>
      <dd className="text-[length:var(--text-body-md)] font-medium text-ink">{value}</dd>
    </div>
  );
}

function Party({
  heading,
  party,
}: {
  heading: string;
  party: { name: string; address: string | null; contact: string | null };
}) {
  return (
    <div>
      <p className="text-[length:var(--text-caption)] tracking-wide text-ink-tertiary uppercase">
        {heading}
      </p>
      <p className="mt-xxs text-[length:var(--text-body-md)] font-semibold text-ink">
        {party.name}
      </p>
      {party.address ? (
        <p className="mt-xxs whitespace-pre-line text-[length:var(--text-body-md)] text-ink-secondary">
          {party.address}
        </p>
      ) : null}
      {party.contact ? (
        <p className="mt-xs text-[length:var(--text-body-md)] text-ink-secondary">
          {party.contact}
        </p>
      ) : null}
    </div>
  );
}
