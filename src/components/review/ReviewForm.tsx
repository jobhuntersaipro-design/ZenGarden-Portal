"use client";

import { ReviewSplit } from "@/components/review/ReviewSplit";
import { ConfirmMorph } from "@/components/arc/confirm-morph/confirm-morph";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { beginRouteProgress } from "@/lib/route-progress";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { toast } from "@/lib/toast";
import { ExtractionStatus } from "@/generated/prisma/enums";
import {
  checkDuplicate,
  confirmPurchaseOrder,
  discardExtraction,
  retryExtraction,
  saveDraft,
  type DuplicateMatch,
} from "@/actions/purchase-orders";
import { Combobox, type ComboboxOption } from "@/components/review/Combobox";
import { draftReducer } from "@/components/review/draft-reducer";
import {
  Confidence,
  ConfidenceBars,
  ExtractGroup,
  ExtractRow,
  isLow,
} from "@/components/review/ExtractField";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { SourceHighlightProvider } from "@/components/review/source-highlight";
import type { Source } from "@/lib/extraction/source-match";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  LineItemsTable,
  LineItemSum,
} from "@/components/review/LineItemsTable";
import { TotalsBanner } from "@/components/review/TotalsBanner";
import {
  buildIdf,
  matchLine,
  type CatalogueEntry,
} from "@/lib/extraction/match-products";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/dates";
import { PoDraftSchema, checkTotals, type PoDraft } from "@/lib/validation/purchase-orders";
import { paymentTermsDaysInput } from "@/lib/payment-terms";

const SAVE_DEBOUNCE_MS = 800;

export function ReviewForm({
  extractionId,
  status,
  extractionError,
  initialDraft,
  confidence,
  buyers,
  catalogue,
  queue,
  document,
  locked,
}: {
  extractionId: string;
  status: ExtractionStatus;
  extractionError: string | null;
  initialDraft: PoDraft;
  confidence: Record<string, number>;
  buyers: ComboboxOption[];
  catalogue: CatalogueEntry[];
  queue: string[];
  /**
   * The source document, drawn as this screen's primary pane (2026-09-17).
   * A slot rather than a sibling on the page, so the form can put its header
   * fields in the rail beside it and its line items full width underneath.
   */
  document: ReactNode;
  /**
   * Read-only since 2026-09-17 — but only where Claude read a value and the
   * draft carries it.
   * A failed extraction has no PO number, and locking an empty field would
   * leave the upload impossible to confirm.
   */
  locked: { poNumber: boolean; poDate: boolean };
}) {
  const router = useRouter();
  const refresh = useAwaitableRefresh();
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  /**
   * The exact mismatch the reviewer accepted, as `computed:document`. Holding
   * the figures rather than a boolean is what stops an acknowledgement of one
   * difference from silently authorising a later, different one — tick, fix the
   * numbers, break them again, and the gate closes as it should.
   */
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [isRevision, setIsRevision] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const first = useRef(true);

  // Once per document. Every line's ranking reads these weights, so building
  // them per line would be the same work times twenty.
  const idf = useMemo(() => buildIdf(catalogue), [catalogue]);
  const totals = useMemo(() => checkTotals(draft), [draft]);
  const parsed = useMemo(() => PoDraftSchema.safeParse(draft), [draft]);

  /** Every change lands in the database 800 ms later, so a refresh loses nothing. */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveDraft(extractionId, draft).then((result) =>
        setSaveState(result.success ? "saved" : "idle"),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, extractionId]);

  /** A confirmed PO with this buyer and number already exists — or does not. */
  useEffect(() => {
    if (!draft.buyerId || !draft.poNumber) return;
    let cancelled = false;
    void checkDuplicate(draft.buyerId, draft.poNumber).then((result) => {
      if (!cancelled && result.success) setDuplicate(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.buyerId, draft.poNumber]);

  // Both of these are derived rather than synchronised into state. A duplicate
  // kept after the buyer was cleared would lock Confirm over nothing.
  const mismatchKey = `${totals.computed}:${totals.document}`;
  const acknowledgedNow = !totals.matches && acknowledgedFor === mismatchKey;
  const duplicateNow =
    draft.buyerId && draft.poNumber && duplicate?.poNumber === draft.poNumber
      ? duplicate
      : null;

  // A match on the same buyer is as near proof of a duplicate as this gets, so
  // it holds Confirm. The same number under a different name is a warning: two
  // customers may genuinely use one numbering scheme.
  const blockedByDuplicate =
    Boolean(duplicateNow?.sameBuyer) && !isRevision;
  const blockedByTotals = !totals.matches && !acknowledgedNow;
  // Mirrored by confirmPurchaseOrder, so calling the action directly cannot
  // bypass it — the same shape as the totals gate beside it.
  const undecided = draft.lineItems.filter(
    (line) => line.productDecision === "unset",
  ).length;
  const blockedByProducts = undecided > 0;
  const canConfirm =
    !confirming &&
    parsed.success &&
    !blockedByTotals &&
    !blockedByDuplicate &&
    !blockedByProducts &&
    status !== ExtractionStatus.RUNNING;

  const exactMatches = useMemo(
    () =>
      draft.lineItems
        .map((line, index) => {
          if (line.productDecision !== "unset") return null;
          const [top] = matchLine(
            { description: line.description, sku: line.sku },
            catalogue,
            idf,
          );
          return top?.score === 100 ? { index, productId: top.productId } : null;
        })
        .filter(
          (match): match is { index: number; productId: string } => match !== null,
        ),
    [draft.lineItems, catalogue, idf],
  );

  const onConfirm = useCallback(async () => {
    setConfirming(true);
    setFormError(null);
    const result = await confirmPurchaseOrder(
      extractionId,
      draft,
      {
        revisedOf: isRevision && duplicateNow ? duplicateNow.poId : null,
        totalsAcknowledged: acknowledgedNow,
      },
      queue,
    );
    setConfirming(false);
    if (!result.success) {
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(`${draft.poNumber} saved`, {
      action: {
        label: "View",
        onClick: () => {
          beginRouteProgress();
          router.push(`/purchase-orders/${result.data.poId}`);
        },
      },
    });
    beginRouteProgress();
    router.push(
      result.data.nextExtractionId
        ? `/review/${result.data.nextExtractionId}?queue=${encodeURIComponent(queue.join(","))}`
        : "/purchase-orders",
    );
  }, [acknowledgedNow, draft, duplicateNow, extractionId, isRevision, queue, router]);

  /**
   * Low-confidence fields the reviewer has vouched for, by "Looks right" or by
   * editing them. Saved with the draft, so a reload keeps them; Confirm never
   * waits on them.
   */
  const checked = useMemo(() => new Set(draft.checkedFields ?? []), [draft.checkedFields]);
  const check = (key: string) => dispatch({ type: "check", key });
  const edit = (
    field: "poNumber" | "poDate" | "currency" | "paymentTerms" | "subtotal" | "total",
    value: string | null,
  ) => {
    check(field);
    dispatch({ type: "field", field, value });
  };

  // The order the fields read on screen, so Review walks them top to bottom.
  const scored = ["buyerName", "poNumber", "poDate", "currency", "paymentTerms", "subtotal", "total", "lineItems"]
    .filter((key) => typeof confidence[key] === "number")
    .map((key) => ({ key, confidence: confidence[key] }));
  const toCheck = scored.filter((field) => isLow(field.confidence) && !checked.has(field.key));
  const average = scored.length
    ? Math.round(scored.reduce((sum, field) => sum + field.confidence, 0) / scored.length)
    : 0;
  const focusField = (key: string) => {
    const target = window.document.querySelector<HTMLElement>(
      `[data-field="${key}"] :is(input, button), #${key}`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  };

  const lock = blockedByTotals
    ? "Locked — totals don’t match"
    : blockedByDuplicate
      ? "Locked — tick “This is a revised PO”"
      : blockedByProducts
        ? `Locked — ${undecided} ${undecided === 1 ? "line needs" : "lines need"} a product`
        : null;

  /** What each row points at on the PDF while hovered or focused. */
  const buyerName =
    buyers.find((buyer) => buyer.id === draft.buyerId)?.label ?? draft.newBuyerName ?? "";
  const termsDays = paymentTermsDaysInput(draft.paymentTerms);
  const source = {
    buyerName: [{ kind: "text", value: buyerName }],
    poNumber: [{ kind: "text", value: draft.poNumber }],
    poDate: [{ kind: "date", value: draft.poDate }],
    currency: [{ kind: "text", value: draft.currency }],
    paymentTerms: termsDays ? [{ kind: "text", value: `${termsDays} days` }] : [],
    subtotal: [{ kind: "money", value: draft.subtotal }],
    total: [{ kind: "money", value: draft.total }],
  } satisfies Record<string, Source[]>;

  const fieldError = (path: string) =>
    parsed.success
      ? undefined
      : parsed.error.issues.find((issue) => issue.path.join(".") === path)?.message;

  return (
    <SourceHighlightProvider>
      <TotalsBanner
        totals={totals}
        acknowledged={acknowledgedNow}
        onAcknowledge={(value) => setAcknowledgedFor(value ? mismatchKey : null)}
      />

      {duplicateNow ? (
        <div className="mb-lg rounded-lg border border-hairline bg-surface-soft p-md">
          <p className="text-[length:var(--text-body-sm)] text-ink">
            {duplicateNow.sameBuyer ? (
              <>{draft.poNumber} already exists for this buyer.</>
            ) : (
              <>
                {draft.poNumber} already exists for{" "}
                <span className="font-medium">{duplicateNow.buyerName}</span>. If
                that is the same company, choose that buyer instead of adding a
                new one.
              </>
            )}{" "}
            <Link
              href={`/purchase-orders/${duplicateNow.poId}`}
              className="text-brand-link underline-offset-2 hover:underline"
            >
              See revision {duplicateNow.revision}
            </Link>
          </p>
          {/* Only offered for the same buyer: a revision of another buyer's
              order would point `revisionOfId` across two customers. */}
          {duplicateNow.sameBuyer ? (
            <label className="mt-xs flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
              <Checkbox
                checked={isRevision}
                onCheckedChange={(value) => setIsRevision(value === true)}
              />
              This is a revised PO
            </label>
          ) : null}
        </div>
      ) : null}

      {/* One card, as in Arc's document-extract block (2026-10-27): the
          document beside its fields, the line items under both, and a footer
          that sums up how sure the read was. `min-w-0` down the chain keeps
          the 952px line-items table scrolling inside its own container rather
          than pushing the page sideways on a phone. */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-hairline bg-canvas">
        <div className="min-w-0 p-sm sm:p-md">
          <ReviewSplit document={document} documentSize={52}>
            <div className="@container flex min-w-0 flex-col gap-lg">
              {status === ExtractionStatus.FAILED ? (
                <div className="flex flex-wrap items-center justify-between gap-sm border-b border-hairline pb-md">
                  <div className="min-w-0">
                    <p className="text-[length:var(--text-body-sm)] text-accent-red">
                      {extractionError ?? "We couldn't read this document."}
                    </p>
                    <p className="mt-xxs text-[length:var(--text-caption)] text-ink-secondary">
                      Fill it in by hand and confirm, or try reading it again.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    pending={retrying}
                    onClick={async () => {
                      setRetrying(true);
                      const result = await retryExtraction(extractionId);
                      setRetrying(false);
                      if (result.success) void refresh();
                      else toast.error(result.error);
                    }}
                  >
                    {retrying ? "Reading again…" : "Try again"}
                  </Button>
                </div>
              ) : scored.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-sm border-b border-hairline pb-md">
                  <p className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
                    {toCheck.length > 0 ? (
                      <>
                        <AlertTriangle
                          aria-hidden
                          className="size-4 text-brand-amber-strong"
                          strokeWidth={1.75}
                        />
                        {toCheck.length === 1
                          ? "1 field needs a check"
                          : `${toCheck.length} fields need a check`}
                      </>
                    ) : (
                      <>
                        <CheckCircle2
                          aria-hidden
                          className="size-4 text-accent-green"
                          strokeWidth={1.75}
                        />
                        Every field read clearly
                      </>
                    )}
                  </p>
                  {toCheck.length > 0 ? (
                    <Button variant="secondary" onClick={() => focusField(toCheck[0].key)}>
                      Review
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <ExtractGroup label="Order" tone="purple">
                <div data-field="buyerName">
                  <ExtractRow
                    label="Buyer"
                    confidence={confidence.buyerName}
                    checked={checked.has("buyerName")}
                    onLooksRight={() => check("buyerName")}
                    source={source.buyerName}
                    error={fieldError("buyerId")}
                  >
                    <Combobox
                      ariaLabel="Buyer"
                      value={draft.buyerId ?? null}
                      options={buyers}
                      placeholder={draft.newBuyerName ?? "Choose a buyer"}
                      createLabel={(query) => `Create “${query}”`}
                      onSelect={(option) => {
                        check("buyerName");
                        dispatch({ type: "buyer", buyerId: option.id, newBuyerName: null });
                      }}
                      onCreate={(name) => {
                        check("buyerName");
                        dispatch({ type: "buyer", buyerId: null, newBuyerName: name });
                      }}
                    />
                  </ExtractRow>
                </div>
                <ExtractRow
                  label="PO number"
                  htmlFor="poNumber"
                  confidence={confidence.poNumber}
                  checked={checked.has("poNumber")}
                  onLooksRight={() => check("poNumber")}
                  source={source.poNumber}
                  error={fieldError("poNumber")}
                >
                  {locked.poNumber ? (
                    <ReadOnlyValue id="poNumber" value={draft.poNumber} />
                  ) : (
                    <Input
                      id="poNumber"
                      value={draft.poNumber}
                      title={draft.poNumber || undefined}
                      onChange={(event) => edit("poNumber", event.target.value)}
                    />
                  )}
                </ExtractRow>
                <ExtractRow
                  label="PO date"
                  htmlFor="poDate"
                  confidence={confidence.poDate}
                  checked={checked.has("poDate")}
                  onLooksRight={() => check("poDate")}
                  source={source.poDate}
                  error={fieldError("poDate")}
                >
                  {locked.poDate ? (
                    <ReadOnlyValue
                      id="poDate"
                      value={draft.poDate ? formatDate(draft.poDate) : ""}
                    />
                  ) : (
                    <DateInput
                      id="poDate"
                      value={draft.poDate}
                      onChange={(value) => edit("poDate", value)}
                    />
                  )}
                </ExtractRow>
                <ExtractRow
                  label="Currency"
                  htmlFor="currency"
                  confidence={confidence.currency}
                  checked={checked.has("currency")}
                  onLooksRight={() => check("currency")}
                  source={source.currency}
                >
                  <Input
                    id="currency"
                    value={draft.currency}
                    onChange={(event) => edit("currency", event.target.value)}
                  />
                </ExtractRow>
                {/* Days, not what the document printed. Claude reads the terms
                    off the page and they arrive as anything — "Net 30", "COD" —
                    so the number is parsed out where there is one and the
                    reviewer states it where there is not (2026-09-22). */}
                <ExtractRow
                  label="Payment terms (days)"
                  htmlFor="paymentTerms"
                  confidence={confidence.paymentTerms}
                  checked={checked.has("paymentTerms")}
                  onLooksRight={() => check("paymentTerms")}
                  source={source.paymentTerms}
                >
                  <Input
                    id="paymentTerms"
                    type="number"
                    min="0"
                    value={paymentTermsDaysInput(draft.paymentTerms)}
                    onChange={(event) => edit("paymentTerms", event.target.value || null)}
                  />
                </ExtractRow>
              </ExtractGroup>

              <ExtractGroup label="Totals" tone="amber">
                <ExtractRow
                  label="Subtotal"
                  htmlFor="subtotal"
                  confidence={confidence.subtotal}
                  checked={checked.has("subtotal")}
                  onLooksRight={() => check("subtotal")}
                  source={source.subtotal}
                  error={fieldError("subtotal")}
                >
                  <Input
                    id="subtotal"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={draft.subtotal}
                    onChange={(event) => edit("subtotal", event.target.value)}
                  />
                </ExtractRow>
                <ExtractRow
                  label="Total"
                  htmlFor="total"
                  confidence={confidence.total}
                  checked={checked.has("total")}
                  onLooksRight={() => check("total")}
                  source={source.total}
                  error={fieldError("total")}
                >
                  <Input
                    id="total"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={draft.total}
                    onChange={(event) => edit("total", event.target.value)}
                  />
                </ExtractRow>
                <div className="grid gap-x-md @sm:grid-cols-extract-row">
                  <div className="@sm:col-start-2">
                  <LineItemSum lineItems={draft.lineItems} />
                  {totals.matches ? null : (
                    <p className="mt-xxs text-[length:var(--text-caption)] text-accent-red">
                      The totals don&rsquo;t match the document — see above
                    </p>
                  )}
                  </div>
                </div>
              </ExtractGroup>
            </div>
          </ReviewSplit>
        </div>

        <div className="min-w-0 border-t border-hairline p-sm sm:p-md">
          <ExtractGroup
            label="Line items"
            tone="green"
            meta={
              <>
                {draft.lineItems.length === 1 ? "1 row" : `${draft.lineItems.length} rows`}
                {typeof confidence.lineItems === "number" ? (
                  <>
                    {" · "}
                    <Confidence
                      value={confidence.lineItems}
                      checked={checked.has("lineItems")}
                    />
                  </>
                ) : null}
              </>
            }
            action={
              <div className="flex flex-wrap items-center gap-xs">
                {isLow(confidence.lineItems) && !checked.has("lineItems") ? (
                  <Button variant="secondary" onClick={() => check("lineItems")}>
                    Looks right
                  </Button>
                ) : null}
                {exactMatches.length > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // The gate stays literal — every line needs a decision —
                      // while a twenty-line order whose codes all match is one
                      // click rather than twenty.
                      for (const match of exactMatches) {
                        dispatch({
                          type: "decision",
                          index: match.index,
                          decision: "linked",
                          productId: match.productId,
                        });
                      }
                    }}
                  >
                    {`Accept ${exactMatches.length} exact ${exactMatches.length === 1 ? "match" : "matches"}`}
                  </Button>
                ) : null}
              </div>
            }
          >
            <div data-field="lineItems" className="min-w-0">
              <LineItemsTable
                lineItems={draft.lineItems}
                catalogue={catalogue}
                idf={idf}
                dispatch={dispatch}
              />
            </div>
          </ExtractGroup>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-md border-t border-hairline px-sm py-sm sm:px-md">
          <div className="flex min-w-0 flex-wrap items-center gap-x-md gap-y-xxs">
            {scored.length > 0 ? (
              <>
                <ConfidenceBars
                  fields={scored.map((field) => ({
                    key: field.key,
                    confidence: field.confidence,
                    flagged: toCheck.some((flagged) => flagged.key === field.key),
                  }))}
                />
                <span className="text-[length:var(--text-body-sm)] text-ink">
                  <span className="font-medium tabular-nums">{average}%</span> average
                </span>
                {toCheck.length > 0 ? (
                  <span className="inline-flex items-center gap-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
                    <AlertTriangle
                      aria-hidden
                      className="size-4 text-brand-amber-strong"
                      strokeWidth={1.75}
                    />
                    {toCheck.length} to check
                  </span>
                ) : null}
              </>
            ) : null}
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
            </span>
          </div>

          <div className="flex items-center gap-md">
            {/* Arc's confirm morph: Discard asks "Discard this file?" in
                place, with Cancel beside it, rather than over a dialog. The
                upload is kept for 30 days, so the question says so. */}
            <ConfirmMorph
              label="Discard"
              prompt="Discard? The upload is kept 30 days."
              confirmLabel="Discard"
              cancelLabel="Cancel"
              pendingLabel="Discarding"
              doneLabel="Discarded"
              tone="danger"
              onConfirm={async () => {
                let result: Awaited<ReturnType<typeof discardExtraction>>;
                try {
                  result = await discardExtraction(extractionId);
                } catch {
                  toast.error("We couldn't reach the server. Try again.");
                  throw new Error("unreachable");
                }
                if (!result.success) {
                  toast.error(result.error);
                  throw new Error(result.error);
                }
                beginRouteProgress();
                router.push("/purchase-orders");
              }}
            />
            <Button disabled={!canConfirm} pending={confirming} onClick={onConfirm}>
              {confirming ? "Saving…" : "Confirm & save"}
            </Button>
          </div>
        </div>
      </div>

      {formError ? (
        <p role="alert" className="mt-sm text-[length:var(--text-body-sm)] text-accent-red">
          {formError}
        </p>
      ) : null}
      {lock ? (
        <p className="mt-xs text-right text-[length:var(--text-caption)] text-ink-tertiary">
          {lock}
        </p>
      ) : null}
    </SourceHighlightProvider>
  );
}

/** A value the reviewer checks but cannot change — PO number and PO date since 2026-09-17. */
function ReadOnlyValue({ id, value }: { id: string; value: string }) {
  return (
    <p
      id={id}
      title={value}
      className="flex h-control-md min-w-0 items-center rounded-sm bg-surface-soft px-2.5 text-[length:var(--text-body-md)] text-ink"
    >
      <span className="truncate">{value || "—"}</span>
    </p>
  );
}
