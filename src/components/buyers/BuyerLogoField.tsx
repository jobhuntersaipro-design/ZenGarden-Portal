"use client";

import { useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { BuyerLogoUploadResponse } from "@/app/api/buyers/[id]/logo/route";
import { Button } from "@/components/ui/button";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { LOGO_ACCEPT_ATTRIBUTE, logoRejectionReason } from "@/lib/validation/buyer-files";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

/**
 * The company logo, in the edit sheet (2026-09-24). Saved the moment a file is
 * chosen, like a profile picture, rather than held for the sheet's Save: the
 * logo is its own upload, and a Save that failed on some other field should
 * not throw away a picture that already arrived.
 */
export function BuyerLogoField({
  buyerId,
  name,
  logoUrl,
}: {
  buyerId: string;
  name: string;
  logoUrl: string | null;
}) {
  const refresh = useAwaitableRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(logoUrl);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  const upload = async (file: File) => {
    const rejection = logoRejectionReason(file);
    if (rejection) {
      toast.error(rejection);
      return;
    }
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/buyers/${buyerId}/logo`, { method: "POST", body: form });
      const body = (await response.json()) as BuyerLogoUploadResponse & { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "We couldn't save that logo.");
        return;
      }
      setCurrent(body.url);
      await refresh();
      toast.success("Logo saved");
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const response = await fetch(`/api/buyers/${buyerId}/logo`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "We couldn't remove that logo.");
        return;
      }
      setCurrent(null);
      await refresh();
      toast.success("Logo removed");
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-xxs">
      <p className={label}>Company logo</p>
      <div className="flex flex-wrap items-center gap-sm">
        <div className="grid h-16 w-32 shrink-0 place-items-center rounded-md border border-hairline bg-canvas p-xs">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element -- a versioned same-origin route
            <img src={current} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon aria-hidden className="size-6 text-ink-tertiary" />
          )}
        </div>
        <div className="flex flex-wrap gap-xs">
          <Button
            type="button"
            variant="secondary"
            pending={busy === "upload"}
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            {busy === "upload" ? "Uploading…" : current ? "Replace logo" : "Upload logo"}
          </Button>
          {current ? (
            <Button
              type="button"
              variant="secondary"
              pending={busy === "remove"}
              disabled={busy !== null}
              onClick={remove}
            >
              {busy === "remove" ? "Removing…" : "Remove"}
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={LOGO_ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a logo file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        PNG, JPG or WebP up to 5 MB. Shown above their name and beside ours on every
        email about their orders. Saved as soon as you choose it.
      </p>
    </div>
  );
}
