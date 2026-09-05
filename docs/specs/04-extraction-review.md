# Phase 04 — Claude extraction and review

Branch `feature/extraction-review`. Depends on: 03. Screen: design reference §3.4.

Goal: every uploaded document is read by Claude into a typed draft; a person
reviews it beside the source, fixes what is wrong, and confirms; a
`PurchaseOrder` row is written only then.

## 1. Extraction schema — `src/lib/extraction/schema.ts`

```ts
export const PoExtractionSchema = z.object({
  poNumber: z.string().min(1),
  buyerName: z.string().min(1),
  poDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().default("MYR"),
  buyerReference: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().nullable(),
    unitPrice: z.number().nonnegative(),
    amount: z.number().nonnegative(),
  })).min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  total: z.number().nonnegative(),
  pageCount: z.number().int().positive(),
  confidence: z.object({
    overall: z.number().min(0).max(100),
    fields: z.record(z.string(), z.number().min(0).max(100)),   // keys = field names above, plus "lineItems"
  }),
});
export type PoExtraction = z.infer<typeof PoExtractionSchema>;
```

Numbers arrive as JSON numbers from the model and are converted to `Decimal`
strings on save; the draft keeps them as strings from the first render onward
so nothing is ever rounded twice.

## 2. Extractor — `src/lib/extraction/extract-po.ts`

`extractPurchaseOrder(bytes, mimeType): Promise<PoExtraction>`:

- Builds a `client.messages.parse` call: model `env.EXTRACTION_MODEL`,
  `max_tokens 4096`, `output_config.format = zodOutputFormat(PoExtractionSchema)`,
  system prompt from `prompt.ts`, one user message with a `document` block
  (`source: { type: "base64", media_type: "application/pdf", data }`) for PDFs
  or an `image` block for PNG/JPEG, followed by a text block "Extract this
  purchase order."
- The system prompt states: ZenGarden is the seller and the buyer is the
  party issuing the PO; dates are output as ISO; money is numeric without
  currency symbols; line amounts should equal quantity × unit price unless
  the document says otherwise; confidence is the model's honest estimate per
  field and 0 for fields it could not find; `pageCount` is the number of pages seen.
- Returns `message.parsed_output`, plus usage for `Extraction.inputTokens/outputTokens`.
- Timeout 90 s via `AbortSignal.timeout`. Any error is rethrown as
  `ExtractionError(message)`; the caller records it.

**`/api/upload/complete`** now, after creating the `Extraction`: set
`RUNNING` + `startedAt`, `getObjectBytes`, call the extractor, and on success
write `rawJson`, `draftJson` (a copy, with `buyerId` resolved by exact
case-insensitive `Buyer.name` match, or `hintBuyerId` from Phase 03),
`confidence`, `model`, tokens, `finishedAt`, `Document.pageCount`, status
`SUCCEEDED`. On failure: `FAILED`, `error`, `finishedAt`. The response is
`{ extractionId, status }` either way; the client queue row becomes
"Ready to review" or "Failed" and the footer pill becomes "Review N files".

`retryExtraction(extractionId)` Server Action reruns the same steps for a
`FAILED` extraction.

## 3. Review screen — `/review/[id]`

Server component loads the `Extraction` with its `Document`, all `Buyer`s
(id, name) and all active `Product`s (id, name, sku, unit, listPrice) for
matching. Redirects: `CONFIRMED` → `/purchase-orders/[poId]`; `DISCARDED` →
`/upload`. The queue position "Review 1 of 3" comes from `?queue=id1,id2,id3`
carried from the upload page; without it the eyebrow reads "Review". Eyebrows
keep the mono family, size and tertiary colour but are not uppercased (G3).
The sidebar shows "Purchase orders" as the active item while `/review/[id]`
is open (G1).

**Left: `DocumentPreview`** (client). Fetches `GET /api/documents/[id]/url`
(owner or any signed-in user; returns a 10-minute presigned GET) and renders
PDFs with `react-pdf` (`Document`/`Page`, one page at a time, width fitted
to the column, pager under it) or images with `<img>`. Add
`pdfjs.GlobalWorkerOptions.workerSrc` from the package's bundled worker. Same
component is reused on PO detail in Phase 05.

**Right: `ReviewForm`** (client, `useReducer` over the draft). Fields and
per-field confidence per design reference §3.4.

**Field layout.** Buyer leads the form on its own full-width row, so a long
buyer name is never the value that truncates. The remaining header fields —
PO number, PO date, Delivery date, Currency, Buyer reference, Payment terms —
flow beneath it in two columns. Field labels are mono, sentence case, not
uppercased (G3). Only one field can hold focus at a time (no second field
rendered in a focused state), and a focused input shows its value in full
rather than clipped; values that ellipsise carry a `title` with the full text
(G4).

Behaviours:

- Buyer field is a combobox (`Popover` + list) over existing buyers with
  "Create “Acme Industrial Sdn Bhd”" as the last option when there is no
  exact match; a matched buyer shows the "Known buyer" pill.
- Line items: editable rows; `amount` recomputes from quantity × unit price
  when either changes unless the user edits `amount` directly (then a small
  "manual" dot appears). Each line has a product combobox that sets
  `productId` and, when the description is empty, fills it. Remove-row and
  "+ Add line". Footer totals recompute on every edit; when the totals do not
  agree with the document the totals row itself turns `accent-red` and its
  inline caption points at the banner ("The totals don't match the document —
  see above"), rather than being the only notice. The gate below owns the
  behaviour.
- Every change debounces 800 ms into `saveDraft(extractionId, draft)` so a
  refresh loses nothing. Save state shown as `text-caption` "Saved" / "Saving…".
- **Duplicate check**: on buyer or PO number change, `checkDuplicate(buyerId, poNumber)`
  returns the latest confirmed PO with that pair, if any. Show the amber strip
  with a link and the checkbox "This is a revised PO". Confirm is disabled
  while a duplicate exists and the box is unticked.
- Confirm & save button is disabled while `status !== SUCCEEDED && status !== FAILED`,
  while any Zod error is present (errors shown under fields), while saving, or
  while the totals mismatch below stands unresolved and unacknowledged.
- **Low confidence never blocks confirm.** A field under 70 stays a warning
  only: amber number, amber left border, the hint "Low confidence — check
  source". It does not disable Confirm & save and it plays no part in the
  totals gate.
- Discard → `Dialog` "Discard this file? The upload is kept for 30 days." →
  `discardExtraction` sets `DISCARDED`, `discardedAt`; the document is deleted
  from R2 by `deleteOrphans` after 30 days.

**Totals gate.** Confirming is gated on the totals agreeing with the document.

- The comparison is the **computed total (`subtotal + tax`) against the total
  printed on the document** (the extracted `total` field, kept as the document
  says it, not recomputed). Compare as Decimal strings at 2 dp, never floats.
  Do not compare the line-item sum to the document total — that ignores tax
  and is the wrong test; the line-item sum against `subtotal` is a separate
  hint that appears in the guidance line below.
- On a mismatch a **persistent banner sits above the two-column split**, not an
  inline caption inside the form. It carries the heading "The totals don't
  match the document", three labelled figures — **Computed total**, **Document
  says**, **Difference** (the difference in `accent-red`) — a guidance line
  naming the usual causes ("Usually a line the extraction missed, or a
  different tax rate."), and the acknowledgement control. It stays on screen
  while the mismatch stands; it is not dismissible.
- While the mismatch stands, **"Confirm & save" renders disabled** with the
  caption "Locked — totals don't match" beneath it.
- There are exactly **two ways out**:
  **(A) Fix the numbers** — the preferred path. Edit the line items or the
  totals until `subtotal + tax` equals the document total; the banner
  disappears and Confirm unlocks by itself, with no acknowledgement recorded.
  **(B) Acknowledge** — tick "I checked the source — save with this mismatch"
  in the banner. Confirm unlocks immediately, and the difference is recorded in
  the PO's activity log with the acknowledging user's name (see
  `confirmPurchaseOrder` below), so the escape hatch is auditable.
  Nothing else unlocks Confirm.

**Server Actions** (`src/actions/purchase-orders.ts`):

- `saveDraft(id, draft)`: owner or any member; stores `draftJson` unvalidated
  except for shape.
- `confirmPurchaseOrder(id, draft, { revisedOf?: poId, totalsAcknowledged?: boolean })`: validates with
  `PoDraftSchema` (the extraction schema with `buyerId | newBuyerName`, product
  ids, Decimal strings). One transaction: upsert `Buyer`; if `revisedOf`, load
  that PO, set `revision = prev.revision + 1`, `revisionOfId = prev.id`; create
  `PurchaseOrder` with `confirmedById = session.user.id`, `stage ORDER_PLACED`;
  create `LineItem`s with positions; create `PoStageEvent { toStage: ORDER_PLACED, changedById: null }`;
  set `Extraction.status = CONFIRMED`. The action re-checks the totals gate
  server-side: if `subtotal + tax ≠ total` and `totalsAcknowledged` is not
  true, it returns `{ success: false, error: "The totals don't match the
  document." }` and writes nothing — the client gate is convenience, not the
  check. When `totalsAcknowledged` is true, the same transaction also inserts
  an activity entry — a `PoStageEvent` with `kind = EDIT`,
  `fromStage = toStage = ORDER_PLACED`, `changedById = session.user.id` and
  `note = "Confirmed with a totals mismatch: computed RM 12,400.00, document
  RM 12,000.00, difference RM 400.00"` — which renders in the PO detail
  Activity list (Phase 05) and is ignored by every analytics function. Unique violation on
  `(buyerId, poNumber, revision)` returns the error "Someone confirmed this PO
  a moment ago." Returns `{ poId, nextExtractionId }` where next is the next
  `SUCCEEDED` or `FAILED` id in `?queue`, or null.
- Client on success: toast "PO-2026-0917 saved · View →", then `router.push`
  to the next review or `/purchase-orders`.

**States**: RUNNING → skeleton column and polling `getExtractionStatus(id)`
every 3 s; FAILED → empty form + retry strip (manual fill still allowed and
confirmable). 

## 4. Tests

- Vitest: `schema.test.ts` (valid sample, missing line items, bad dates);
  `extract-po.test.ts` with a mocked Anthropic client returning a fixture;
  `confirm.test.ts` for the draft schema, the totals gate (`subtotal + tax` vs
  the document total, including the server-side refusal without
  `totalsAcknowledged` and the acknowledgement event), and the revision
  numbering with a mocked Prisma.
- Fixtures: put three real-looking sample POs (PDF, PNG, JPG) in
  `test/fixtures/`; they are also handy for manual QA.
- Playwright: upload fixture → review → confirm → detail page shows the number.

## 5. Acceptance criteria

1. Uploading the PDF fixture produces a `SUCCEEDED` extraction within 30 s
   with sensible fields and per-field confidence numbers.
2. Fields under 70 confidence get the amber left border and the "Low
   confidence — check source" hint.
3. Editing a quantity updates the amount and the totals; when `subtotal + tax`
   stops matching the document total the totals row turns red and the banner
   appears above the split with Computed total, Document says and Difference.
4. Refreshing the page mid-edit keeps the edits.
5. Confirming writes one `PurchaseOrder`, its `LineItem`s, one System stage
   event, and flips the extraction to `CONFIRMED`; the list shows it as "Order placed".
6. Confirming the same buyer + PO number again is blocked until "revised PO"
   is ticked, then saves as revision 2 pointing at revision 1.
7. A failed extraction can be filled by hand and confirmed, or retried.
8. Discard removes the item from the review queue and the PO list backlog.
9. With a totals mismatch, "Confirm & save" is disabled and captioned
   "Locked — totals don't match"; it cannot be confirmed by any route other
   than making the numbers agree or ticking the acknowledgement — calling the
   action directly from devtools without `totalsAcknowledged` is refused.
10. Editing the line items until `subtotal + tax` equals the document total
    clears the banner and unlocks Confirm with no acknowledgement recorded.
11. Ticking "I checked the source — save with this mismatch" unlocks Confirm,
    and the saved PO's Activity list shows an entry naming the difference and
    the user who acknowledged it.
12. A field with confidence below 70 and no totals mismatch confirms normally.
13. Buyer occupies a full-width row above the two-column field grid; a long
    buyer name is not the value that truncates, and no two fields render
    focused at once.
