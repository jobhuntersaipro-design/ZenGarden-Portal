"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  FileText,
  LayoutDashboard,
  Package,
  Search,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/arc/blocks/page-header/page-header";
import { EmptyStates } from "@/components/arc/blocks/empty-states/empty-states";
import {
  CommandPalette,
  type CommandItem,
} from "@/components/arc/command-palette/command-palette";
import {
  NotificationCenter,
  type NotificationItem,
} from "@/components/arc/notification-center/notification-center";
import { FileUpload } from "@/components/arc/file-upload/file-upload";
import { Button } from "@/components/ui/button";
import { GalleryGroup, Specimen } from "./Specimen";

const note =
  "text-[length:var(--text-body-sm)] text-ink-tertiary";

/**
 * Arc's two blocks take no props: they are self-contained demos with their
 * own copy. They are shown as shipped, and the caption says what the portal
 * would pass them once they are wrapped for real screens.
 */
function FixedContentNote({ children }: { children: string }) {
  return <p className={`mb-sm ${note}`}>{children}</p>;
}

const ICON = { width: 17, height: 17, strokeWidth: 1.8 } as const;

const PALETTE_ITEMS: CommandItem[] = [
  {
    id: "po-0039",
    label: "PO-2026-0039",
    description: "Meridian Chemicals · Delivering · 9 days late",
    group: "Purchase orders",
    keywords: ["meridian", "delivering"],
    icon: <FileText {...ICON} />,
  },
  {
    id: "po-0025",
    label: "PO-2026-0025",
    description: "Pacific Timber · In warehouse · 5 days late",
    group: "Purchase orders",
    keywords: ["pacific", "warehouse"],
    icon: <FileText {...ICON} />,
  },
  {
    id: "w-00014",
    label: "W-2609-00014",
    description: "Acme Industrial Sdn Bhd · PO number ACME-PO-771",
    group: "Purchase orders",
    keywords: ["acme", "shop"],
    icon: <FileText {...ICON} />,
  },
  {
    id: "buyer-acme",
    label: "Acme Industrial Sdn Bhd",
    description: "63 purchase orders · Mydin",
    group: "Buyers",
    icon: <Building2 {...ICON} />,
  },
  {
    id: "buyer-meridian",
    label: "Meridian Chemicals",
    description: "41 purchase orders · Vietnam",
    group: "Buyers",
    icon: <Building2 {...ICON} />,
  },
  {
    id: "product-lemon",
    label: "MR.KING 1.5L — Lemon",
    description: "MRK-DW-1500-LE · 6 per carton · RM 157.50",
    group: "Products",
    keywords: ["dishwash"],
    icon: <Package {...ICON} />,
  },
  {
    id: "product-goat",
    label: "ZEN 1L — Goat's Milk",
    description: "ZEN-SC-1000-GM-MYDIN · 12 per carton · RM 210.00",
    group: "Products",
    keywords: ["shower cream"],
    icon: <Package {...ICON} />,
  },
  {
    id: "page-dashboard",
    label: "Dashboard",
    group: "Pages",
    icon: <LayoutDashboard {...ICON} />,
  },
  {
    id: "page-demand",
    label: "Demand Board",
    group: "Pages",
    icon: <Truck {...ICON} />,
  },
  {
    id: "page-buyers",
    label: "Buyers",
    group: "Pages",
    icon: <Building2 {...ICON} />,
  },
  {
    id: "page-products",
    label: "Products",
    group: "Pages",
    icon: <Package {...ICON} />,
  },
];

function PaletteSpecimen() {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // ⌘K / Ctrl+K opens the palette; once it is open, Arc's own listener
  // moves focus to its search box on the same shortcut.
  useEffect(() => {
    if (open) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) frame.current?.querySelector("input")?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <Button
          ref={trigger}
          variant="secondary"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Search aria-hidden="true" />
          {open ? "Close search" : "Search the portal"}
        </Button>
        <span className={note}>or press ⌘K / Ctrl K</span>
      </div>
      {open ? (
        <div ref={frame} className="min-w-0">
          <CommandPalette
            items={PALETTE_ITEMS}
            label="Search purchase orders, buyers, products and pages"
            placeholder="Search a PO number, buyer or product"
            onSelect={(item) => {
              setChosen(`${item.label} would open here.`);
              close();
            }}
            onClose={close}
          />
        </div>
      ) : null}
      <p className={note} aria-live="polite">
        {chosen}
      </p>
    </div>
  );
}

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "shop-00014",
    title: "W-2609-00014 sent by Acme Industrial Sdn Bhd",
    description:
      "A shop order for 3 products, 18 cartons, RM 2,835.00. It waits in the review queue until someone confirms it.",
    time: "4 min",
    tone: "info",
  },
  {
    id: "uploads-ready",
    title: "3 uploads ready for review",
    description:
      "Claude has read three purchase orders uploaded this morning. Each needs its products matched before it can be confirmed.",
    time: "22 min",
    tone: "success",
  },
  {
    id: "late-0025",
    title: "PO-2026-0025 is 5 days late",
    description:
      "Pacific Timber expected delivery on 16 Sep 2026. It has been In warehouse since 18 Sep.",
    time: "1 h",
    tone: "warning",
  },
  {
    id: "confirmed-0063",
    title: "PO-2026-0063 confirmed",
    description: "Confirmed by Aisha Rahman with delivery expected 2 Oct 2026.",
    time: "Yesterday",
    tone: "success",
    read: true,
  },
];

function NotificationSpecimen() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-sm">
      <NotificationCenter
        notifications={NOTIFICATIONS}
        label="Review queue"
      />
      <span className={note}>Open the bell to read, mark and dismiss.</span>
    </div>
  );
}

/** Stands in for the R2 upload: counts to 100 on a timer, never leaves the browser. */
function simulateUpload(
  _file: File,
  {
    onProgress,
    signal,
  }: { onProgress: (percent: number) => void; signal: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let percent = 0;
    const step = 6 + Math.round(Math.random() * 10);
    const timer = window.setInterval(() => {
      percent = Math.min(percent + step, 100);
      onProgress(percent);
      if (percent >= 100) {
        window.clearInterval(timer);
        resolve();
      }
    }, 180);
    signal.addEventListener(
      "abort",
      () => {
        window.clearInterval(timer);
        reject(new Error("Removed"));
      },
      { once: true },
    );
  });
}

function UploadSpecimen() {
  return (
    <div className="flex min-w-0 flex-col gap-xs">
      <FileUpload
        label="Upload purchase orders"
        description="PDF, PNG or JPG, up to 20 MB each. Nothing leaves this page; progress is simulated."
        accept=".pdf,.png,.jpg,.jpeg"
        maxSize={20 * 1024 * 1024}
        onUpload={simulateUpload}
      />
    </div>
  );
}

export function BlocksSection() {
  return (
    <GalleryGroup id="blocks" title="Blocks">
      <Specimen
        name="page-header"
        job="Every page's eyebrow, title, summary and actions."
        phase={2}
        wide
      >
        <FixedContentNote>
          Arc ships this block with its own demo project and no props, so it cannot take “Purchase Orders”, “406 purchase orders · RM 8,161,352.29” or Upload PO yet. Shown as shipped.
        </FixedContentNote>
        <PageHeader />
      </Specimen>

      <Specimen
        name="command-palette"
        job="New: ⌘K to jump to any purchase order, buyer or product."
        phase={2}
        wide
      >
        <PaletteSpecimen />
      </Specimen>

      <Specimen
        name="notification-center"
        job="New: shop orders and uploads waiting for review."
        phase={2}
        wide
      >
        <NotificationSpecimen />
      </Specimen>

      <Specimen
        name="empty-states"
        job="First-run and zero-data screens."
        phase={2}
        wide
      >
        <FixedContentNote>
          Arc ships this block with its own four scenes and no props, so it cannot say “No purchase orders yet — upload the first one” yet. Shown as shipped.
        </FixedContentNote>
        <EmptyStates />
      </Specimen>

      <Specimen
        name="file-upload"
        job="The upload queue with per-file progress."
        phase={3}
        wide
      >
        <UploadSpecimen />
      </Specimen>
    </GalleryGroup>
  );
}

export default BlocksSection;
