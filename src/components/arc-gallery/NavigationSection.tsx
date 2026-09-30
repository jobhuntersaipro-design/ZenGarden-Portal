"use client";

import { useState } from "react";
import { Download, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { Accordion } from "@/components/arc/accordion/accordion";
import {
  BottomSheet,
  BottomSheetClose,
} from "@/components/arc/bottom-sheet/bottom-sheet";
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/arc/dialog/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/arc/drawer/drawer";
import {
  HoverCard,
  HoverCardProfile,
} from "@/components/arc/hover-card/hover-card";
import { Pagination } from "@/components/arc/pagination/pagination";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/arc/popover/popover";
import {
  ResizablePanel,
  ResizablePanels,
} from "@/components/arc/resizable-panels/resizable-panels";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/arc/tabs/tabs";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { formatMYR } from "@/lib/money";
import { GalleryGroup, Specimen } from "./Specimen";

/** Our own trigger buttons around the Arc overlays: the secondary control. */
const TRIGGER =
  "inline-flex h-control-md items-center gap-xs rounded-sm border border-hairline bg-surface-soft px-md text-[length:var(--text-body-sm)] font-medium text-ink hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const PRIMARY =
  "inline-flex h-control-md items-center justify-center rounded-pill bg-ink px-lg text-[length:var(--text-body-sm)] font-medium text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50";
const FIELD =
  "w-full rounded-sm border border-hairline-strong bg-canvas px-xs py-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus";
const LABEL = "text-[length:var(--text-caption)] text-ink-secondary";
const CAPTION = "text-[length:var(--text-caption)] text-ink-tertiary";

const PO = "PO-2026-0039";
const STAGES = [
  "Order placed",
  "In production",
  "QC passed",
  "In warehouse",
  "Delivering",
  "Delivered",
];

/** Thirty day columns from 30 Sep 2026, labelled in UTC so server and browser agree. */
const DAYS = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8, 30 + index));
  return {
    key: date.toISOString().slice(0, 10),
    label: date.toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    cartons: index % 4 === 1 ? null : ((index * 37) % 90) + 6,
  };
});

export function NavigationSection() {
  return (
    <GalleryGroup id="navigation" title="Navigation and overlays">
      <Specimen
        name="tabs"
        job="Admin rooms; Products / Families / Markets on the catalogue."
        phase={4}
      >
        <TabsSpecimen />
      </Specimen>
      <Specimen
        name="breadcrumb"
        job="Detail pages: Purchase orders › PO-2026-0039."
        phase={3}
      >
        <Breadcrumb
          items={[
            { label: "Purchase orders", href: "/purchase-orders" },
            { label: PO },
          ]}
        />
      </Specimen>
      <Specimen name="pagination" job="Every table footer." phase={3}>
        <PaginationSpecimen />
      </Specimen>
      <Specimen
        name="scroll-area"
        job="Wide tables and the Demand Board inside their card."
        phase={2}
      >
        <ScrollArea orientation="horizontal" label="Cartons wanted by day">
          <div className="flex w-max gap-xxs pb-sm">
            {DAYS.map((day) => (
              <div
                key={day.key}
                className="flex w-20 flex-col gap-xxs rounded-sm border border-hairline bg-surface px-xs py-xs"
              >
                <span className={CAPTION}>{day.label}</span>
                <span className="text-[length:var(--text-body-sm)] text-ink tabular-nums">
                  {day.cartons ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Specimen>
      <Specimen
        name="accordion"
        job="The “More analytics” disclosure; folded buyer details."
        phase={2}
      >
        <Accordion
          defaultOpen={-1}
          items={[
            {
              title: "More analytics",
              content: (
                <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
                  Sales by market, repeat buyers and on-time delivery for the
                  last 30 days — {formatMYR("904930.85")} across 42 purchase
                  orders.
                </p>
              ),
            },
            {
              title: "Address, terms and remark",
              content: (
                <dl className="grid grid-cols-1 gap-xs text-[length:var(--text-body-sm)] sm:grid-cols-2">
                  <div>
                    <dt className={LABEL}>Address</dt>
                    <dd className="text-ink">
                      Lot 12, Jalan Perindustrian 3, 40300 Shah Alam
                    </dd>
                  </div>
                  <div>
                    <dt className={LABEL}>Payment terms</dt>
                    <dd className="text-ink">30 days</dd>
                  </div>
                </dl>
              ),
            },
          ]}
        />
      </Specimen>
      <Specimen
        name="resizable-panels"
        job="The review screen: the document beside the form."
        phase={3}
        wide
      >
        <div className="h-72">
          <ResizablePanels label="Review Meridian Chemicals' purchase order">
            <ResizablePanel
              id="arc-review-document"
              label="Document"
              defaultSize={58}
              minSize={160}
              collapsible
            >
              <div className="flex h-full flex-col gap-xs overflow-hidden bg-surface p-md">
                <span className="font-mono text-[length:var(--text-eyebrow)] text-ink">
                  {PO}
                </span>
                <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
                  Meridian Chemicals · 31 Aug 2026
                </span>
                <div className="mt-xs flex flex-col gap-xxs">
                  {[1, 2, 3, 4].map((line) => (
                    <div key={line} className="h-3 rounded-xxs bg-surface-soft" />
                  ))}
                </div>
              </div>
            </ResizablePanel>
            <ResizablePanel
              id="arc-review-form"
              label="Form"
              defaultSize={42}
              minSize={160}
            >
              <dl className="flex h-full flex-col gap-sm overflow-hidden p-md text-[length:var(--text-body-sm)]">
                <div>
                  <dt className={LABEL}>Buyer</dt>
                  <dd className="text-ink">Meridian Chemicals</dd>
                </div>
                <div>
                  <dt className={LABEL}>PO number</dt>
                  <dd className="text-ink">{PO}</dd>
                </div>
                <div>
                  <dt className={LABEL}>Total</dt>
                  <dd className="text-ink tabular-nums">
                    {formatMYR("3761.97")}
                  </dd>
                </div>
              </dl>
            </ResizablePanel>
          </ResizablePanels>
        </div>
      </Specimen>
      <Specimen
        name="dialog"
        job="Delete confirmations, with the reference typed back."
        phase={3}
      >
        <DialogSpecimen />
      </Specimen>
      <Specimen
        name="drawer"
        job="Edit sheets: purchase order, buyer, product, stock."
        phase={4}
      >
        <DrawerSpecimen />
      </Specimen>
      <Specimen
        name="bottom-sheet"
        job="The same sheets and the filters, on a phone."
        phase={5}
      >
        <BottomSheet
          title="Filter purchase orders"
          description="Narrow the list by stage."
          trigger={
            <button type="button" className={TRIGGER}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
            </button>
          }
        >
          <fieldset className="flex flex-col gap-xs">
            <legend className={`${LABEL} mb-xs`}>Stage</legend>
            {STAGES.map((stage) => (
              <label
                key={stage}
                className="flex min-h-control-md items-center gap-sm text-[length:var(--text-body-sm)] text-ink"
              >
                <input type="checkbox" className="size-4" defaultChecked={stage !== "Delivered"} />
                {stage}
              </label>
            ))}
          </fieldset>
          <BottomSheetClose className={`${PRIMARY} mt-md w-full`}>
            Show 27 orders
          </BottomSheetClose>
        </BottomSheet>
      </Specimen>
      <Specimen
        name="popover"
        job="The Advance note; the trend series picker."
        phase={3}
      >
        <PopoverSpecimen />
      </Specimen>
      <Specimen
        name="hover-card"
        job="A buyer or product preview when hovering its name."
        phase={4}
      >
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          Ordered by{" "}
          <HoverCard
            content={
              <HoverCardProfile
                name="Acme Industrial Sdn Bhd"
                role="Buyer · Malaysia"
                bio="Hand wash and dishwash by the pallet, every fortnight."
                stats={[
                  { label: "Orders", value: 63 },
                  { label: "12m revenue", value: formatMYR("284164.69", 0) },
                ]}
                meta="Last order 22 Sep 2026"
              />
            }
          >
            <button
              type="button"
              className="font-medium text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Acme Industrial Sdn Bhd
            </button>
          </HoverCard>
        </p>
      </Specimen>
      <Specimen
        name="tooltip"
        job="Truncated names and icon-only buttons."
        phase={2}
      >
        <div className="flex min-w-0 items-center gap-sm">
          <Tooltip content="Download">
            <button
              type="button"
              aria-label="Download"
              className="inline-grid size-control-md shrink-0 place-items-center rounded-sm border border-hairline bg-surface-soft text-ink hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Download className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip content="500ML FINE FRAGRANCE SHOWER GEL — Style">
            <button
              type="button"
              className="min-w-0 max-w-40 truncate text-left text-[length:var(--text-body-sm)] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              500ML FINE FRAGRANCE SHOWER GEL — Style
            </button>
          </Tooltip>
        </div>
      </Specimen>
    </GalleryGroup>
  );
}

function TabsSpecimen() {
  return (
    <Tabs defaultValue="products">
      <TabsList aria-label="Catalogue view">
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="families">Families</TabsTrigger>
        <TabsTrigger value="markets">Markets</TabsTrigger>
      </TabsList>
      <TabsContent value="products">
        <p className="pt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
          308 products, one row each.
        </p>
      </TabsContent>
      <TabsContent value="families">
        <p className="pt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
          59 families, each one product across its markets.
        </p>
      </TabsContent>
      <TabsContent value="markets">
        <p className="pt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
          Mydin, Super Indo and Vietnam, plus the products carrying no market.
        </p>
      </TabsContent>
    </Tabs>
  );
}

function PaginationSpecimen() {
  const total = 406;
  const pageSize = 10;
  const pageCount = Math.ceil(total / pageSize);
  const [page, setPage] = useState(3);
  return (
    <div className="flex flex-col gap-xs">
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      <span className={CAPTION}>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
        {total}
      </span>
    </div>
  );
}

function DialogSpecimen() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === PO.toLowerCase();
  function change(next: boolean) {
    setOpen(next);
    if (!next) setTyped("");
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger className={TRIGGER}>
        <Trash2 className="size-4" aria-hidden="true" />
        Delete {PO}
      </DialogTrigger>
      <DialogContent
        title={`Delete ${PO}?`}
        description="Its line items and stage history go with it. The document stays."
      >
        <form
          className="flex flex-col gap-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches) change(false);
          }}
        >
          <label className="flex flex-col gap-xxs">
            <span className={LABEL}>Type {PO} to confirm</span>
            <input
              className={FIELD}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-xs">
            <DialogClose className={TRIGGER}>Cancel</DialogClose>
            <button type="submit" className={PRIMARY} disabled={!matches}>
              Delete
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DrawerSpecimen() {
  const [open, setOpen] = useState(false);
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger className={TRIGGER}>
        <Pencil className="size-4" aria-hidden="true" />
        Edit {PO}
      </DrawerTrigger>
      <DrawerContent
        title={`Edit ${PO}`}
        description="Meridian Chemicals · Delivering"
      >
        <form
          className="flex flex-col gap-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <label className="flex flex-col gap-xxs">
            <span className={LABEL}>Expected delivery</span>
            <input type="date" className={FIELD} defaultValue="2026-10-02" />
          </label>
          <label className="flex flex-col gap-xxs">
            <span className={LABEL}>Payment terms (days)</span>
            <input type="number" min={0} className={FIELD} defaultValue={30} />
          </label>
          <label className="flex flex-col gap-xxs">
            <span className={LABEL}>Remark</span>
            <textarea rows={3} className={FIELD} />
          </label>
          <div className="flex flex-wrap justify-end gap-xs">
            <DrawerClose className={TRIGGER}>Cancel</DrawerClose>
            <button type="submit" className={PRIMARY}>
              Save details
            </button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function PopoverSpecimen() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNote("");
      }}
    >
      <PopoverTrigger className={TRIGGER}>Advance to QC passed</PopoverTrigger>
      <PopoverContent>
        <form
          className="flex flex-col gap-sm"
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            setNote("");
          }}
        >
          <label className="flex flex-col gap-xxs">
            <span className={LABEL}>
              Note for the move from In production to QC passed
            </span>
            <textarea
              rows={3}
              className={FIELD}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-xs">
            <PopoverClose className={TRIGGER}>Cancel</PopoverClose>
            <button type="submit" className={PRIMARY}>
              Confirm
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
