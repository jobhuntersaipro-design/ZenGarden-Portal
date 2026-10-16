# Phase 67 — QC hold, and the stages a buyer sees

**Goal:** QC can put an order on hold between In production and QC passed,
and only QC releases it. Buyers see four stages, not seven.

**Branch:** `feature/qc-hold`, from `main` after Phase 66.

Asked for as (2026-10-16): "Add QC Hold, between in production and QC pass"
and "Remove In production and In warehouse from buyer POV". Answers taken:
**QC gives the green light** (QC owns the hold and the release); **QC hold is
hidden from buyers**.

## 1. The stage

`PoStage.QC_HOLD`, one additive migration (`ALTER TYPE ... ADD VALUE
'QC_HOLD' BEFORE 'QC_PASSED'`). Order:

```
Order placed → In production → [QC hold] → QC passed → In warehouse → Delivering → Delivered
```

**QC hold is skippable.** From In production QC chooses **Pass QC** (→ QC
passed) or **Hold** (→ QC hold). From QC hold the only forward move is
**Release** (→ QC passed). An order that never fails QC never passes through
hold, so it is not an empty step on most orders.

### Rules, in `src/lib/po-stages.ts`

- `PO_STAGES` gains `QC_HOLD` at index 2; label "QC hold"; colour a new
  `--color-stage-hold` (amber-red, distinct from the five existing stage
  hues; check it against the palette validator).
- `nextStage` becomes `nextStages(stage): PoStage[]` — In production returns
  `[QC_PASSED, QC_HOLD]`, every other stage one or none. `advanceStage` takes
  the target and checks it is one of them.
- `prevStage` from QC passed returns QC hold **only if the order was in hold**
  (read from its events), else In production. From QC hold it returns In
  production.
- **Hold needs a reason** (the note is required), shown on the order and in
  the feed: "Chris Lam put this order on QC hold: 'Cap leaking on 2 cartons'".

### Permissions

- `po.advance.in_production` (QC, as today) covers both Pass QC and Hold.
- New `po.advance.qc_hold` — default **QC** and super admin only. Release is
  QC's call.
- The permission grid shows the new row under Fulfilment.

### Stepper

- Staff stepper: seven nodes only when the order has been in hold; otherwise
  the six it shows today. A held order's node is amber with "On hold" and the
  reason under it.
- The Advance control on In production becomes two buttons: **Pass QC**
  (primary) and **Hold**.

### Everything that counts stages

Every reader of `PO_STAGES` / `PoStage` was listed by grep (16 files). Each
gets the new value, and these need a decision written in code:

| Reader | Treatment |
|---|---|
| Demand Board stage chart and table | QC hold is its own band and column, between In production and QC passed |
| Dashboard fulfilment, on-time | Counted as open, like In production |
| `stage-history` replay | Reads it like any stage; ties broken by the chain as now |
| Stock deduction (In warehouse → Delivering) | Unaffected |
| PO list stage filter | Gains "QC hold" |
| Activity sentences | "put … on QC hold", "released … from QC hold" |

`PoStage` is an enum, so `Record<PoStage, …>` maps fail `tsc` until each has
the new key — that is the checklist; nothing is done until `tsc` passes.

## 2. What a buyer sees

Buyer surfaces read stages in three places: the orders list status
(`buyerOrderStatus`), the order page's `StageStepper` and any stage dates on
that page. No email names a stage.

**Buyer stages:** Order placed → QC passed → Delivering → Delivered.

One pure function, `buyerStage(stage)`, maps the real stage to the last
stage the buyer may see:

| Real stage | Buyer sees |
|---|---|
| Order placed, In production, QC hold | Order placed |
| QC passed, In warehouse | QC passed |
| Delivering | Delivering |
| Delivered | Delivered |

- The buyer's stepper draws four nodes and their dates (the date the buyer
  stage was entered: QC passed's date is when it entered QC passed, never the
  in-warehouse move).
- `loadBuyerOrder` returns only `STAGE` events whose `toStage` is a buyer
  stage, so hidden stages and their dates never reach the browser. Pin the
  select and the filter in a test, the way `shop-viewer.test.ts` pins its
  select: the HTML of a held order must not contain "hold", "QC hold" or the
  hold reason.
- The buyer's orders table filter/sort by status uses the buyer stage.

## 3. Acceptance

1. As QC: Hold with a reason → order shows QC hold; the planner and warehouse
   cannot Release; QC Releases → QC passed. Hold with an empty reason is
   refused.
2. An order that went straight to QC passed shows six staff nodes; one that
   was held shows seven.
3. Move back from QC passed lands on QC hold for a held order, In production
   otherwise.
4. Demand Board: a held order sits in the QC hold band on the days it was
   held, reconciled against SQL.
5. As the buyer, on a held order: status "Order placed", four nodes, and the
   page HTML contains no "hold" and no reason. In warehouse reads "QC passed".
6. No overflow at 390 / 1440; both In production buttons 44px at 390.
7. Tests, `tsc`, lint, build clean.
