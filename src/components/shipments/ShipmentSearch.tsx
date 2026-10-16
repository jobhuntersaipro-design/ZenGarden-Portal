"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

export function ShipmentSearch() {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <div className="relative mb-md w-full sm:w-80">
      <Search
        className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
        aria-hidden
      />
      <Input
        aria-label="Search shipments"
        placeholder="Reference, buyer, PO number, booking no.…"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (value) params.set("q", value);
            else params.delete("q");
            params.delete("page");
            replace(params.toString() ? `${pathname}?${params}` : pathname);
          }, 200);
        }}
        className="h-control-md w-full pl-xl sm:h-control-sm"
      />
    </div>
  );
}
