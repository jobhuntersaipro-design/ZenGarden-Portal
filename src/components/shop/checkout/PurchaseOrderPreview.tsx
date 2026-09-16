import { Wordmark } from "@/components/portal/Wordmark";
import { formatMYR } from "@/lib/money";
import type { PoDocumentData } from "@/lib/purchase-order-document";

/**
 * The purchase order itself, drawn before it is sent (Phase 33).
 *
 * This is the artboard `docs/design/storefront/purchase-order-preview.html`,
 * rebuilt on the design system's tokens — the artboard prints raw hex, and
 * `context/coding-standard.md` forbids that in a component, so `#292d34`
 * becomes `text-ink`, `#6f6f6f` `text-ink-tertiary`, `#646464`
 * `text-ink-secondary` and `#e8e8e8` `border-hairline`.
 *
 * **Fixed at A4's 794px inside a scrolling container.** A document that
 * reflows is not the document; the reader is checking what the seller will
 * hold, so it keeps its proportions and the *container* scrolls on a narrow
 * screen, which is this project's rule for wide content and keeps the page
 * itself from ever scrolling sideways.
 *
 * Server-renderable: it takes data and holds no state. The review screen
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
    // The two data attributes are print hooks, not styling: `globals.css`
    // needs to reach the scroller (to stop it clipping the page at the paper's
    // edge) and the sheet itself (to drop the screen-only shadow) without
    // matching on utility classes, which tailwind-merge or a restyle could
    // move out from under it.
    <div
      data-po-scroller
      className="overflow-x-auto rounded-lg border border-hairline bg-surface p-md"
    >
      <article
        data-po-page
        aria-label="Purchase order preview"
        className="mx-auto flex w-po-page flex-col bg-canvas p-xl text-ink shadow-sm"
      >
        <header className="flex items-start justify-between border-b-2 border-ink pb-md">
          <div>
            <Wordmark />
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              Prepared for the buyer named below
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
              PURCHASE ORDER
            </p>
            <p className="mt-xxs font-mono text-[length:var(--text-body-md)] text-ink">
              {document.reference}
            </p>
          </div>
        </header>

        {/* Four cells, or five once the team has committed to a date. The
            cell is not drawn while there is nothing to put in it: a blank
            "Expected delivery" reads as a promise forgotten rather than one
            not yet made. */}
        <dl
          className={`grid gap-md border-b border-hairline py-md ${document.deliveryDate ? "grid-cols-5" : "grid-cols-4"}`}
        >
          <Meta label="Order date" value={document.orderDate} />
          <Meta label="Delivery requested" value={document.requestedDate ?? "—"} />
          {document.deliveryDate ? (
            <Meta label="Expected delivery" value={document.deliveryDate} />
          ) : null}
          <Meta label="Payment terms" value={document.paymentTerms ?? "—"} />
          <Meta label="Currency" value={document.currency} />
        </dl>

        <div className="grid grid-cols-2 gap-xl border-b border-hairline py-md">
          <Party heading="Buyer" party={document.buyer} />
          <Party heading="Supplier" party={document.supplier} />
        </div>

        <div className="pt-md">
          <Row className="border-b border-ink pb-xs">
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">#</span>
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              Product code
            </span>
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              Description
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Cartons
            </span>
            <span className="text-right text-[length:var(--text-caption)] text-ink-tertiary">
              Unit price
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
                <span className="mt-xxs block text-[length:var(--text-caption)] text-ink-tertiary">
                  {line.packCaption}
                </span>
              </span>
              <span className="text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
                {line.cartons}
              </span>
              <span className="text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
                {line.unitPrice}
              </span>
              <span className="text-right text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                {line.amount}
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
                {document.subtotal}
              </span>
            </div>
            {document.tax ? (
              <div className="flex justify-between py-xxs">
                <span className="text-[length:var(--text-body-md)] text-ink-secondary">
                  Tax
                </span>
                <span className="text-[length:var(--text-body-md)] font-medium tabular-nums text-ink">
                  {document.tax}
                </span>
              </div>
            ) : null}
            <div className="mt-xxs flex items-baseline justify-between border-t-2 border-ink pt-sm">
              <span className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
                {`Total (${document.currency})`}
              </span>
              <span className="font-display text-[length:var(--text-heading-md)] font-[650] tabular-nums text-ink">
                {formatMYR(document.total).replace("RM ", "")}
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

        <div className="grid grid-cols-2 gap-xl pt-lg">
          <Signature label="Authorised by (buyer)" />
          <Signature label="Date" />
        </div>

        <footer className="mt-md flex justify-between border-t border-hairline pt-xs">
          <span className="text-[length:var(--text-caption)] text-ink-tertiary">
            {footnote}
          </span>
          {document.ourReference ? (
            <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
              {document.ourReference}
            </span>
          ) : null}
        </footer>
      </article>
    </div>
  );
}

/** The artboard's six-column line grid, shared by the header and every row. */
function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-[34px_132px_minmax(0,1fr)_64px_96px_104px] items-start gap-xs py-xs ${className}`}
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

function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="h-px bg-ink" />
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">{label}</p>
    </div>
  );
}
