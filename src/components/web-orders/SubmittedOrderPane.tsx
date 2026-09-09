import { PersonChip } from "@/components/ui/person";
import { quantityCaption } from "@/lib/cartons";
import { formatDateTime } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import type { OpsWebOrder } from "@/lib/queries/web-orders";

/**
 * What the buyer actually sent, read-only.
 *
 * This plays the part the PDF plays on `/review/[id]`: the thing you check the
 * form beside it against. It is deliberately not editable — the form is where
 * changes happen, and having two editable copies of the same numbers is how a
 * reviewer loses track of which one the buyer agreed to.
 */
export function SubmittedOrderPane({ order }: { order: OpsWebOrder }) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        What the buyer sent
      </p>
      <h2 className="mt-xxs font-display text-[length:var(--text-heading-sm)] text-ink">
        {order.reference}
      </h2>

      <dl className="mt-md grid gap-sm sm:grid-cols-2">
        {[
          ["Buyer", order.buyerName],
          ["Their reference", order.buyerReference],
          ["Payment terms", order.buyerPaymentTerms],
          [
            "Placed",
            order.submittedAt ? formatDateTime(order.submittedAt) : null,
          ],
        ]
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <div key={label as string}>
              <dt className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
                {label}
              </dt>
              <dd className="text-[length:var(--text-body-sm)] text-ink">{value}</dd>
            </div>
          ))}
      </dl>

      <div className="mt-md flex items-center gap-xs">
        <PersonChip name={order.placedByName} image={null} />
        <span className="text-[length:var(--text-caption)] text-ink-tertiary">
          {order.placedByEmail}
        </span>
      </div>

      {order.notes ? (
        <div className="mt-md rounded-md bg-surface p-sm">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Note from the buyer
          </p>
          <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink">
            {order.notes}
          </p>
        </div>
      ) : null}

      <ul className="mt-md flex flex-col gap-xs">
        {order.lines.map((line) => (
          <li
            key={line.productId}
            className="border-b border-hairline pb-xs last:border-0 last:pb-0"
          >
            <p className="text-[length:var(--text-body-sm)] text-ink">{line.name}</p>
            <p className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
              {`${line.sku} · ${quantityCaption(line.cartons, line.packSize, line.unit)} · ${formatMYR(
                Number(line.unitPrice),
              )} · ${formatMYR(Number(line.amount))}`}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-md flex items-baseline justify-between gap-sm border-t border-hairline pt-md">
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
          Buyer&rsquo;s total
        </span>
        <span className="text-[length:var(--text-heading-sm)] font-semibold tabular-nums text-ink">
          {formatMYR(Number(order.subtotal))}
        </span>
      </div>
    </section>
  );
}
