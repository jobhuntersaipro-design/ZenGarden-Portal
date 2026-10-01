"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "cn";
import arcDialog from "@/components/arc/dialog/dialog.module.css";
import {
  CommandPalette,
  type CommandItem,
} from "@/components/arc/command-palette/command-palette";
import { loadCommandIndex, type CommandEntry } from "@/actions/shell";
import { NAV } from "@/components/portal/nav";
import { beginRouteProgress } from "@/lib/route-progress";

/** The event a Search button sends; the one palette in the shell listens. */
const OPEN_EVENT = "zg:open-command";

/** Opens the palette from anywhere in the shell. */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * ⌘K (Ctrl+K on Windows): Arc's command palette, to jump to any page, purchase
 * order, buyer or product by typing. The index is read the first time it
 * opens and kept for the session; pages are offered at once, from the nav
 * this role may open, so the palette is useful before the index arrives.
 */
export function CommandMenu({ allowed }: { allowed: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CommandEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Read once, the first time the palette opens; a failure is tried again
    // on the next open. The setters are stable, so this effect runs once.
    let requested = false;
    const load = async () => {
      if (requested) return;
      requested = true;
      setLoading(true);
      try {
        const result = await loadCommandIndex();
        if (result.success) setEntries(result.data);
        else requested = false;
      } catch {
        requested = false;
      } finally {
        setLoading(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        void load();
      }
    };
    const onOpen = () => {
      setOpen(true);
      void load();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // The items and where each one goes, built together so they cannot drift.
  const { items, hrefs } = useMemo(() => {
    const pages = [
      ...NAV.filter((entry) => allowed.includes(entry.href)).map((entry) => ({
        id: `page:${entry.href}`,
        label: entry.label as string,
        keywords: [entry.short as string],
        href: entry.href as string,
      })),
      { id: "page:/settings", label: "Settings", keywords: [], href: "/settings" },
    ];
    const all = [
      ...pages.map((page) => ({ ...page, group: "Pages", description: undefined })),
      ...(entries ?? []).map((entry) => ({
        ...entry,
        description: entry.description || undefined,
      })),
    ];
    return {
      items: all.map(
        (item): CommandItem => ({
          id: item.id,
          label: item.label,
          description: item.description,
          group: item.group,
          keywords: item.keywords,
        }),
      ),
      hrefs: new Map(all.map((item) => [item.id, item.href])),
    };
  }, [allowed, entries]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={arcDialog.overlay} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-md top-xxl z-50 mx-auto max-w-panel-lg outline-none sm:top-section"
        >
          <DialogPrimitive.Title className="sr-only">Search the portal</DialogPrimitive.Title>
          <CommandPalette
            label="Search the portal"
            placeholder={
              loading && !entries
                ? "Loading purchase orders, buyers and products…"
                : "Jump to a page, PO number, buyer or product"
            }
            items={items}
            onClose={() => setOpen(false)}
            onSelect={(item) => {
              const href = hrefs.get(item.id);
              setOpen(false);
              if (!href) return;
              beginRouteProgress();
              router.push(href);
            }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The visible way in: the palette is not only for people who know ⌘K. */
export function SearchButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      aria-label="Search the portal"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "flex min-h-control-md items-center gap-xs rounded-sm border border-hairline-strong px-sm text-[length:var(--text-body-sm)] text-ink-tertiary transition-colors hover:border-ink-tertiary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="max-lg:sr-only">Search</span>
      <kbd className="ml-auto hidden rounded-xxs border border-hairline px-xxs font-mono text-[length:var(--text-caption)] lg:inline">
        ⌘K
      </kbd>
    </button>
  );
}
