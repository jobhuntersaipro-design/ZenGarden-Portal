"use client";

import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { Switch } from "@/components/arc/switch/switch";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Calendar } from "@/components/arc/calendar/calendar";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import {
  DateRangePicker,
  type DateRange,
  type DateRangePreset,
} from "@/components/arc/date-range-picker/date-range-picker";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { GalleryGroup, Specimen } from "./Specimen";

/*
 * Every date here is built from fixed parts, never from `new Date()` during
 * render, so the server's markup and the browser's agree. Each side builds and
 * formats in its own local zone, which lands on the same calendar day.
 */
const TODAY = new Date(2026, 8, 30);
const PO_DATE = new Date(2026, 8, 28);
const DEMAND_CEILING = new Date(2027, 8, 29);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(date: Date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function daysBefore(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
}

const caption = "text-[length:var(--text-body-sm)] text-ink-secondary";

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super admin" },
  { value: "PRODUCTION_PLANNER", label: "Production planner" },
  { value: "QC", label: "QC" },
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "MEMBER", label: "Member" },
];

const ROLE_CARDS = [
  { value: "SUPER_ADMIN", label: "Super admin", description: "Everything, including users and the permission grid." },
  { value: "PRODUCTION_PLANNER", label: "Production planner", description: "Moves an order from Order placed to In production." },
  { value: "QC", label: "QC", description: "Passes an order out of In production." },
  { value: "WAREHOUSE", label: "Warehouse", description: "Takes an order from QC passed through to Delivered." },
  { value: "MEMBER", label: "Member", description: "Sees everything and changes nothing." },
];

const PERMISSIONS = [
  { key: "advance.orderPlaced", label: "Advance: Order placed → In production" },
  { key: "advance.inProduction", label: "Advance: In production → QC passed" },
  { key: "po.confirm", label: "Confirm a purchase order" },
];

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
];

const GRAINS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const VIEWS = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];

const RANGE_PRESETS: DateRangePreset[] = RANGES.map(({ value, label }) => ({
  label,
  range: (today: Date) => ({ start: daysBefore(today, Number(value) - 1), end: today }),
}));

const MAX_BYTES = 20 * 1024 * 1024;

function CheckboxSpecimen() {
  const [granted, setGranted] = useState<Record<string, boolean>>({
    "advance.orderPlaced": true,
    "advance.inProduction": false,
    "po.confirm": false,
  });
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-col gap-xxs">
        {PERMISSIONS.map((row) => (
          <Checkbox
            key={row.key}
            label={row.label}
            checked={granted[row.key]}
            onCheckedChange={(next) => setGranted((current) => ({ ...current, [row.key]: next === true }))}
          />
        ))}
      </div>
      <Checkbox
        label="Confirm with the totals mismatch"
        description="Subtotal RM 1,701.00 + tax RM 0.00 does not reach the printed RM 1,926.50."
        checked={acknowledged}
        onCheckedChange={(next) => setAcknowledged(next === true)}
      />
    </div>
  );
}

function RadioGroupSpecimen() {
  const [role, setRole] = useState("MEMBER");
  return <RadioGroup label="Role" options={ROLES} value={role} onValueChange={setRole} />;
}

function RadioCardsSpecimen() {
  const [role, setRole] = useState<string>("PRODUCTION_PLANNER");
  return (
    <RadioCards
      aria-label="New user's role"
      layout="list"
      options={ROLE_CARDS}
      value={role}
      onValueChange={setRole}
    />
  );
}

function SwitchSpecimen() {
  const [shopLogin, setShopLogin] = useState(true);
  const [published, setPublished] = useState(false);
  return (
    <div className="flex flex-col gap-xs">
      <Switch label="Give them a shop login" checked={shopLogin} onCheckedChange={setShopLogin} />
      <Switch label="Published on the shop" checked={published} onCheckedChange={setPublished} />
    </div>
  );
}

function SegmentedControlSpecimen() {
  const [range, setRange] = useState("30");
  const [grain, setGrain] = useState("day");
  const [view, setView] = useState("grid");
  return (
    <div className="flex flex-col items-start gap-sm">
      <SegmentedControl label="Range" options={RANGES} value={range} onValueChange={setRange} />
      <SegmentedControl label="Grain" options={GRAINS} value={grain} onValueChange={setGrain} />
      <SegmentedControl label="View" options={VIEWS} value={view} onValueChange={setView} />
    </div>
  );
}

function CalendarSpecimen() {
  const [until, setUntil] = useState(new Date(2026, 10, 30));
  const hydrated = useHydrated();
  return (
    <div className="flex flex-col gap-sm">
      {!hydrated ? (
        <div className="h-80" aria-hidden />
      ) : (
        <Calendar
          value={until}
          onChange={setUntil}
          minDate={TODAY}
          maxDate={DEMAND_CEILING}
          locale="en-GB"
        />
      )}
      <p className={caption}>Up to {formatDay(until)}</p>
    </div>
  );
}

function DatePickerSpecimen() {
  const [delivery, setDelivery] = useState<Date | undefined>(undefined);
  return (
    <DatePicker
      label="Expected delivery"
      description={`Can't be before the PO date, ${formatDay(PO_DATE)}.`}
      placeholder="Choose a date"
      value={delivery}
      onChange={setDelivery}
      minDate={PO_DATE}
      locale="en-GB"
      format={{ day: "numeric", month: "short", year: "numeric" }}
    />
  );
}

function DateRangePickerSpecimen() {
  const [range, setRange] = useState<DateRange>({ start: daysBefore(TODAY, 29), end: TODAY });
  const hydrated = useHydrated();
  return (
    <div className="flex flex-col gap-sm">
      {!hydrated ? <div className="h-control-md" aria-hidden /> : <DateRangePicker
        label="Custom range"
        value={range}
        onChange={setRange}
        presets={RANGE_PRESETS}
        maxDate={TODAY}
        weekStartsOn={1}
        locale="en-GB"
      />}
      <p className={caption}>
        {formatDay(range.start)} – {formatDay(range.end)}
      </p>
    </div>
  );
}

function FileDropzoneSpecimen() {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="flex flex-col gap-sm">
      <FileDropzone
        label="Add purchase orders"
        description="Drop PDFs or photos here, or choose from your device"
        note="PDF, PNG or JPG, up to 20 MB each. Nothing uploads from this preview."
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        maxSize={MAX_BYTES}
        maxFiles={10}
        onFilesChange={setFiles}
      />
      <p className={caption}>
        {files.length === 0
          ? "No files chosen yet."
          : `${files.length} ${files.length === 1 ? "file" : "files"} chosen: ${files.map((file) => file.name).join(", ")}`}
      </p>
    </div>
  );
}

export function SelectionSection() {
  return (
    <GalleryGroup id="selection" title="Toggles, dates and files">
      <Specimen name="checkbox" job="The permission grid, and acknowledging a totals mismatch." phase={6}>
        <CheckboxSpecimen />
      </Specimen>
      <Specimen name="radio-group" job="Not used: radio-cards took the user drawer's role." phase={6}>
        <RadioGroupSpecimen />
      </Specimen>
      <Specimen name="radio-cards" job="Choices that need a line each, like a new user's role." phase={6}>
        <RadioCardsSpecimen />
      </Specimen>
      <Specimen name="switch" job="Give them a shop login; publish or unpublish a product." phase={4}>
        <SwitchSpecimen />
      </Specimen>
      <Specimen name="segmented-control" job="Range presets, Daily / Weekly / Monthly, grid or list." phase={2}>
        <SegmentedControlSpecimen />
      </Specimen>
      <Specimen name="calendar" job="The Demand Board's “up to” date." phase={2}>
        <CalendarSpecimen />
      </Specimen>
      <Specimen name="date-picker" job="Not used: every date field is DateInput, built on calendar." phase={3}>
        <DatePickerSpecimen />
      </Specimen>
      <Specimen name="date-range-picker" job="The dashboard's custom range." phase={2}>
        <DateRangePickerSpecimen />
      </Specimen>
      <Specimen name="file-dropzone" job="Upload purchase orders and buyer documents." phase={3}>
        <FileDropzoneSpecimen />
      </Specimen>
    </GalleryGroup>
  );
}
