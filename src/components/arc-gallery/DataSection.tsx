"use client";

import { useState, type ReactNode } from "react";
import {
  Boxes,
  CheckCircle2,
  FileText,
  Folder,
  Package,
  SearchX,
  Tag,
  Upload,
  XCircle,
} from "lucide-react";
import { Avatar } from "@/components/arc/avatar/avatar";
import { AvatarGroup } from "@/components/arc/avatar-group/avatar-group";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { Card } from "@/components/arc/card/card";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { AnimatedCounter } from "@/components/arc/animated-counter/animated-counter";
import {
  SortableDataTable,
  type DataColumn,
} from "@/components/arc/sortable-data-table/sortable-data-table";
import { TreeView, type TreeNode } from "@/components/arc/tree-view/tree-view";
import {
  FilterToolbar,
  type FilterChip,
  type FilterField,
} from "@/components/arc/filter-toolbar/filter-toolbar";
import { Timeline, type TimelineEvent } from "@/components/arc/timeline/timeline";
import { Carousel } from "@/components/arc/carousel/carousel";
import { formatMYR, MYR_PREFIX } from "@/lib/money";
import { formatDate, TIME_ZONE } from "@/lib/dates";
import { GalleryGroup, Specimen } from "./Specimen";

/** A blank is "nobody has recorded this", never zero (CLAUDE.md). */
const BLANK = "—";

const caption = "text-[length:var(--text-caption)] text-ink-tertiary";
const toggle =
  "inline-flex min-h-control-md items-center rounded-pill border px-sm text-[length:var(--text-body-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm";
const toggleOn = "border-ink bg-ink text-canvas";
const toggleOff = "border-hairline bg-canvas text-ink hover:bg-surface";

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${toggle} ${pressed ? toggleOn : toggleOff}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- avatar */

function AvatarSpecimen() {
  return (
    <div className="flex flex-wrap items-center gap-md">
      <Avatar name="Aisha Rahman" size="xl" status="online" />
      <Avatar name="Chris Lam" size="lg" status="offline" />
      <Avatar name="Nurul Izzati" size="md" />
      <Avatar name="Siti Nurhaliza" size="sm" />
    </div>
  );
}

/* ---------------------------------------------------------- avatar-group */

function AvatarGroupSpecimen() {
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <AvatarGroup
          label="Handled PO number PO-2026-0039"
          members={[
            { name: "Aisha Rahman", status: "online" },
            { name: "Nurul Izzati" },
            { name: "Chris Lam" },
          ]}
        />
        <span className={caption}>PO-2026-0039 · confirmed, planned, QC</span>
      </div>
      <div className="flex flex-wrap items-center gap-sm">
        <AvatarGroup
          size="sm"
          max={3}
          label="Meridian Chemicals contacts"
          members={[
            { name: "Siti Nurhaliza" },
            { name: "Tan Wei Ming" },
            { name: "Farah Aziz" },
            { name: "Kumar Pillai" },
            { name: "Lee Mei Ling" },
          ]}
        />
        <span className={caption}>Meridian Chemicals · 5 shop contacts</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- badge */

type StatusLabel = "Needs review" | "Confirmed" | "Failed" | "In production" | "Delivered";

const STATUS_TONE: Record<StatusLabel, BadgeTone> = {
  "Needs review": "warning",
  Confirmed: "success",
  Failed: "danger",
  "In production": "info",
  Delivered: "neutral",
};

const BADGES = Object.entries(STATUS_TONE).map(([label, tone]) => ({ label, tone }));

function BadgeSpecimen() {
  const [small, setSmall] = useState(false);
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap gap-xs">
        {BADGES.map((badge) => (
          <Badge key={badge.label} tone={badge.tone} size={small ? "sm" : "md"}>
            {badge.label}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-xs">
        <Toggle pressed={!small} onClick={() => setSmall(false)}>
          Medium
        </Toggle>
        <Toggle pressed={small} onClick={() => setSmall(true)}>
          Small
        </Toggle>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function CardSpecimen() {
  return (
    <Card
      title="Meridian Chemicals"
      description="Account in Vietnam. Payment terms 30 days. Orders by the carton, mostly shower cream and hand wash."
      avatar={<Avatar name="Siti Nurhaliza" size="sm" />}
      meta="Siti Nurhaliza · Buyer contact"
      status="Last order 12 Sep 2026"
      details={
        <dl className="grid grid-cols-2 gap-x-md gap-y-xs text-[length:var(--text-body-sm)]">
          <dt className="text-ink-tertiary">Open orders</dt>
          <dd className="text-ink">2</dd>
          <dt className="text-ink-tertiary">12-month sales</dt>
          <dd className="text-ink">{formatMYR("284164.69")}</dd>
          <dt className="text-ink-tertiary">Market</dt>
          <dd className="text-ink">Vietnam</dd>
          <dt className="text-ink-tertiary">Payment terms</dt>
          <dd className="text-ink">30 days</dd>
        </dl>
      }
    />
  );
}

/* ----------------------------------------------------------- metric-card */

/**
 * `MetricCard` takes a plain number with no prefix and no decimals, so the
 * money tile carries whole ringgit in the figure and the exact amount in its
 * context line. See the report: it cannot print "RM 673,967.79" itself.
 */
function MetricCardSpecimen() {
  return (
    <div className="grid grid-cols-1 gap-sm">
      <MetricCard
        label="Total sales (RM)"
        value={673968}
        context={`${formatMYR("673967.79")} · vs ${formatMYR("612700.00")} previous period`}
        change="+10.0%"
      />
      <MetricCard
        label="Purchase orders"
        value={35}
        context="vs 32 previous period"
        change="+3"
      />
      <MetricCard label="Buyers" value={11} context="Ordered in the last 30 days" />
    </div>
  );
}

/* ----------------------------------------------------------- empty-state */

function EmptyStateSpecimen() {
  const [mode, setMode] = useState<"empty" | "search">("empty");
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap gap-xs">
        <Toggle pressed={mode === "empty"} onClick={() => setMode("empty")}>
          Empty table
        </Toggle>
        <Toggle pressed={mode === "search"} onClick={() => setMode("search")}>
          No match
        </Toggle>
      </div>
      {mode === "empty" ? (
        <EmptyState
          label="No purchase orders"
          icon={<FileText aria-hidden="true" />}
          title="No purchase orders yet"
          description="Upload a buyer's PO and it appears here once someone confirms it."
          action={
            <button type="button" className={`${toggle} ${toggleOn} gap-xxs`}>
              <Upload className="size-4" aria-hidden="true" />
              Upload PO
            </button>
          }
        />
      ) : (
        <EmptyState
          label="No matching buyers"
          icon={<SearchX aria-hidden="true" />}
          title="Nothing matches “zzzz”"
          description="Clear the search or the filters to see every buyer."
          action={
            <button type="button" className={`${toggle} ${toggleOff}`}>
              Clear search
            </button>
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ animated-counter */

/**
 * Money crosses as a string (00-master §4). The counter only takes a
 * `number`, so the string is converted once at the edge; with two fixed
 * decimals `Intl.NumberFormat` prints the same digits the string holds.
 */
const RANGES = [
  { id: "30", label: "Last 30 days", total: "673967.79" },
  { id: "60", label: "Last 60 days", total: "1284511.40" },
  { id: "90", label: "Last 90 days", total: "1903226.05" },
] as const;

function AnimatedCounterSpecimen() {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30");
  const active = RANGES.find((item) => item.id === range) ?? RANGES[0];
  return (
    <div className="flex flex-col gap-sm">
      <AnimatedCounter
        label={`Total sales · ${active.label}`}
        prefix={MYR_PREFIX}
        value={Number(active.total)}
        decimals={2}
        animateOnView
      />
      <p className={caption}>Exact: {formatMYR(active.total)}</p>
      <div className="flex flex-wrap gap-xs">
        {RANGES.map((item) => (
          <Toggle key={item.id} pressed={item.id === range} onClick={() => setRange(item.id)}>
            {item.label}
          </Toggle>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------- sortable-data-table */

type PoRow = {
  id: string;
  orderId: string | null;
  poNumber: string | null;
  buyer: string;
  poDate: Date | null;
  status: StatusLabel;
  /** Sort key: whole sen, so sorting never touches a float. Null is a blank. */
  totalSen: number | null;
  /** Display value, as money crosses the boundary: a string. */
  total: string;
};

const kl = (iso: string) => new Date(`${iso}T00:00:00+08:00`);

const PO_ROWS: PoRow[] = [
  { id: "po1", orderId: "W-2609-00014", poNumber: "ACME-PO-771", buyer: "Acme Industrial Sdn Bhd", poDate: kl("2026-09-12"), status: "Confirmed", totalSen: 1417250, total: "14172.50" },
  { id: "po2", orderId: null, poNumber: "PO-2026-0039", buyer: "Meridian Chemicals", poDate: kl("2026-08-31"), status: "Delivered", totalSen: 4094462, total: "40944.62" },
  { id: "po3", orderId: "W-2609-00021", poNumber: null, buyer: "Kelana Steel", poDate: null, status: "Needs review", totalSen: 47250, total: "472.50" },
  { id: "po4", orderId: null, poNumber: "PO-2026-0027", buyer: "Tanjung Electrical", poDate: kl("2026-09-14"), status: "In production", totalSen: 998910, total: "9989.10" },
  { id: "po5", orderId: null, poNumber: "PO-2026-0023", buyer: "Sunway Packaging", poDate: kl("2026-09-03"), status: "Confirmed", totalSen: 2520000, total: "25200.00" },
  { id: "po6", orderId: null, poNumber: "PO-2026-0025", buyer: "Pacific Timber", poDate: kl("2026-09-04"), status: "In production", totalSen: 376197, total: "3761.97" },
  { id: "po7", orderId: "W-2609-00022", poNumber: "KS-PO-9001", buyer: "Kelana Steel", poDate: kl("2026-09-20"), status: "Confirmed", totalSen: 141750, total: "1417.50" },
  { id: "po8", orderId: null, poNumber: null, buyer: "Meridian Chemicals", poDate: null, status: "Failed", totalSen: null, total: "" },
];

const orBlank = (value: unknown) => (value == null || value === "" ? BLANK : String(value));

const PO_COLUMNS: DataColumn<PoRow>[] = [
  { key: "orderId", label: "Order ID", sortable: true, render: orBlank },
  { key: "poNumber", label: "PO number", sortable: true, render: orBlank },
  { key: "buyer", label: "Buyer", sortable: true },
  {
    key: "poDate",
    label: "PO date",
    sortable: true,
    render: (value) => (value instanceof Date ? formatDate(value) : BLANK),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (_, row) => (
      <Badge tone={STATUS_TONE[row.status]} size="sm">
        {row.status}
      </Badge>
    ),
  },
  {
    key: "totalSen",
    label: "Total",
    sortable: true,
    numeric: true,
    render: (_, row) => (row.totalSen === null ? BLANK : formatMYR(row.total)),
  },
];

function SortableDataTableSpecimen() {
  return (
    <div className="min-w-0 overflow-x-auto">
      <SortableDataTable<PoRow>
        rows={PO_ROWS}
        columns={PO_COLUMNS}
        rowKey="id"
        caption="Purchase orders"
        defaultSort={{ key: "poDate", direction: "desc" }}
        selectable
        itemName={{ one: "purchase order", other: "purchase orders" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- tree-view */

const variants = (prefix: string, names: string[]): TreeNode[] =>
  names.map((name) => ({ id: `${prefix}-${name}`, label: name, icon: <Tag aria-hidden="true" /> }));

const FAMILY_TREE: TreeNode[] = [
  {
    id: "fam-sc-2100",
    label: "ZEN 2.1L Shower Cream",
    icon: <Boxes aria-hidden="true" />,
    children: [
      {
        id: "sc-vn",
        label: "Vietnam",
        icon: <Package aria-hidden="true" />,
        children: variants("sc-vn", ["Goat's Milk", "Lavender", "Carrot"]),
      },
      {
        id: "sc-mydin",
        label: "Mydin",
        icon: <Package aria-hidden="true" />,
        children: variants("sc-mydin", ["Goat's Milk", "Lavender"]),
      },
    ],
  },
  {
    id: "fam-hw-0500",
    label: "ZEN 500ML Hand Wash",
    icon: <Boxes aria-hidden="true" />,
    children: [
      {
        id: "hw-mydin",
        label: "Mydin",
        icon: <Package aria-hidden="true" />,
        children: variants("hw-mydin", ["Lemon", "Lime"]),
      },
    ],
  },
];

const DOC_TREE: TreeNode[] = [
  {
    id: "doc-contracts",
    label: "Contracts",
    icon: <Folder aria-hidden="true" />,
    children: [
      { id: "doc-c1", label: "Supply agreement 2026.pdf", icon: <FileText aria-hidden="true" /> },
      { id: "doc-c2", label: "Price list Q4.xlsx", icon: <FileText aria-hidden="true" /> },
    ],
  },
  {
    id: "doc-ssm",
    label: "SSM",
    icon: <Folder aria-hidden="true" />,
    children: [{ id: "doc-s1", label: "SSM certificate.pdf", icon: <FileText aria-hidden="true" /> }],
  },
];

function TreeViewSpecimen() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-xxs">
        <p className={caption}>Product families</p>
        <TreeView
          aria-label="Product families"
          nodes={FAMILY_TREE}
          defaultExpandedIds={["fam-sc-2100", "sc-vn"]}
          onSelect={(node) => setPicked(node.label)}
        />
      </div>
      <div className="flex flex-col gap-xxs">
        <p className={caption}>Meridian Chemicals · documents</p>
        <TreeView
          aria-label="Meridian Chemicals documents"
          nodes={DOC_TREE}
          defaultExpandedIds={["doc-contracts"]}
          onSelect={(node) => setPicked(node.label)}
        />
      </div>
      <p className={caption} aria-live="polite">
        {picked ? `Selected: ${picked}` : "Nothing selected"}
      </p>
    </div>
  );
}

/* -------------------------------------------------------- filter-toolbar */

const FILTER_FIELDS: FilterField[] = [
  { id: "market", label: "Market", options: [{ value: "Vietnam", hint: 4 }, { value: "Mydin", hint: 4 }, { value: "Super Indo", hint: 3 }, { value: "No market", hint: 1 }] },
  { id: "brand", label: "Brand", options: ["Zen Garden", "MR. KING", "L.HANDS"] },
  { id: "category", label: "Category", options: ["Shower cream & gel", "Hand wash & soap", "Hair care", "Dishwash & cleanser", "Laundry detergent", "Fragrance"] },
  { id: "status", label: "Status", options: ["Needs review", "Confirmed", "Failed"] },
];

function FilterToolbarSpecimen() {
  const [filters, setFilters] = useState<FilterChip[]>([
    { id: "market", label: "Market", value: "Vietnam" },
    { id: "status", label: "Status", value: "Confirmed" },
  ]);
  return (
    <FilterToolbar
      label="Purchase order filters"
      filters={filters}
      onRemove={(id) => setFilters((current) => current.filter((filter) => filter.id !== id))}
      onClearAll={() => setFilters([])}
      addFilter={{
        fields: FILTER_FIELDS,
        onAdd: (chip) =>
          setFilters((current) => [...current.filter((filter) => filter.id !== chip.id), chip]),
      }}
    />
  );
}

/* -------------------------------------------------------------- timeline */

/** Fixed, so the server and the client render the same relative labels. */
const TIMELINE_NOW = Date.parse("2026-09-18T15:00:00+08:00");

const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: "t1",
    at: "2026-09-18T09:37:00+08:00",
    actor: "Aisha Rahman · Super admin",
    title: "advanced this order from In production to QC passed",
    meta: "PO-2026-0039",
    detail: <p className="text-[length:var(--text-body-sm)] text-ink-secondary">“QC good — carton 3 repacked.”</p>,
  },
  {
    id: "t2",
    at: "2026-09-16T14:05:00+08:00",
    actor: "Nurul Izzati · Production planner",
    title: "advanced this order from Order placed to In production",
    meta: "PO-2026-0039",
  },
  {
    id: "t3",
    at: "2026-09-16T10:12:00+08:00",
    actor: "Aisha Rahman · Super admin",
    title: "edited this order",
    meta: "Expected delivery 21 Sep 2026 → 28 Sep 2026",
    detail: <p className="text-[length:var(--text-body-sm)] text-ink-secondary">“Buyer asked to push it a week.”</p>,
  },
  {
    id: "t4",
    at: "2026-09-15T08:00:00+08:00",
    title: "Extraction failed: the document could not be read",
    meta: "scan-0415.pdf",
    icon: <XCircle aria-hidden="true" />,
    tone: "danger",
  },
  {
    id: "t5",
    at: "2026-09-12T11:20:00+08:00",
    actor: "Siti Nurhaliza · Buyer contact",
    title: "placed order W-2609-00014",
    meta: `Meridian Chemicals · ${formatMYR("14172.50")}`,
  },
  {
    id: "t6",
    at: "2026-09-12T11:21:00+08:00",
    title: "System placed the order",
    icon: <CheckCircle2 aria-hidden="true" />,
    tone: "success",
  },
];

function TimelineSpecimen() {
  return (
    <Timeline
      label="Notes and activity for PO-2026-0039"
      events={TIMELINE_EVENTS}
      now={TIMELINE_NOW}
      timeZone={TIME_ZONE}
      locale="en-GB"
      headingLevel={4}
      maxHeight="24rem"
    />
  );
}

/* -------------------------------------------------------------- carousel */

const SLIDES = [
  { name: "ZEN 2.1L Shower Cream — Goat's Milk", sku: "ZEN-SC-2100-GM-VN", tone: "bg-surface-soft" },
  { name: "ZEN 2.1L Shower Cream — Lavender", sku: "ZEN-SC-2100-LV-VN", tone: "bg-surface-info" },
  { name: "ZEN 2.1L Shower Cream — Carrot", sku: "ZEN-SC-2100-CR-VN", tone: "bg-surface-warning" },
  { name: "ZEN 500ML Hand Wash — Lemon", sku: "ZEN-HW-0500-LE-MYDIN", tone: "bg-surface-success" },
] as const;

function CarouselSpecimen() {
  return (
    <Carousel label="ZEN 2.1L Shower Cream photos">
      {SLIDES.map((slide) => (
        <div
          key={slide.sku}
          className={`flex aspect-4/3 flex-col justify-end gap-xxs rounded-md p-md ${slide.tone}`}
        >
          <Package className="size-8 text-ink-secondary" aria-hidden="true" />
          <p className="text-[length:var(--text-body-sm)] font-medium text-ink">{slide.name}</p>
          <p className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">{slide.sku}</p>
        </div>
      ))}
    </Carousel>
  );
}

/* --------------------------------------------------------------- section */

export function DataSection() {
  return (
    <GalleryGroup id="data" title="Data display">
      <Specimen name="avatar" job="People everywhere: uploader, confirmer, the account menu." phase={2}>
        <AvatarSpecimen />
      </Specimen>
      <Specimen name="avatar-group" job="Who handled an order; a buyer's contacts." phase={4}>
        <AvatarGroupSpecimen />
      </Specimen>
      <Specimen name="badge" job="Status and stage pills." phase={3}>
        <BadgeSpecimen />
      </Specimen>
      <Specimen name="card" job="Every card surface." phase={2}>
        <CardSpecimen />
      </Specimen>
      <Specimen name="metric-card" job="The KPI tiles." phase={2}>
        <MetricCardSpecimen />
      </Specimen>
      <Specimen name="empty-state" job="An empty table, or a search with no match." phase={3}>
        <EmptyStateSpecimen />
      </Specimen>
      <Specimen name="animated-counter" job="KPI figures counting up." phase={2}>
        <AnimatedCounterSpecimen />
      </Specimen>
      <Specimen
        name="sortable-data-table"
        job="Purchase orders, buyers and products tables."
        phase={3}
        wide
      >
        <SortableDataTableSpecimen />
      </Specimen>
      <Specimen
        name="tree-view"
        job="Families → products → variants; a buyer's document folders."
        phase={4}
      >
        <TreeViewSpecimen />
      </Specimen>
      <Specimen name="filter-toolbar" job="Filter rows over list pages." phase={3} wide>
        <FilterToolbarSpecimen />
      </Specimen>
      <Specimen
        name="timeline"
        job="Notes and activity on a purchase order; buyer activity."
        phase={3}
      >
        <TimelineSpecimen />
      </Specimen>
      <Specimen name="carousel" job="Product photos on the shop's product page." phase={5}>
        <CarouselSpecimen />
      </Specimen>
    </GalleryGroup>
  );
}
