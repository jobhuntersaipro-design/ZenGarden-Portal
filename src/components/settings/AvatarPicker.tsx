"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { removeAvatar, setGeneratedAvatar } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/person";
import {
  AVATAR_STYLE_IDS,
  type AvatarStyleId,
} from "@/lib/avatar-style-ids";
import { AVATAR_ACCEPT_ATTRIBUTE } from "@/lib/validation/profile";
import { cn } from "@/lib/utils";

export type StylePreview = {
  id: AvatarStyleId;
  label: string;
  /** One `data:image/svg+xml` URI per seed, in the same order as `seeds`. */
  variants: string[];
};

/**
 * The picture picker: upload a photo, choose one of the generated avatars, or
 * fall back to initials. Every source ends up as the same 256px WebP in R2, so
 * nothing downstream can tell them apart.
 *
 * The previews are rendered on the server and arrive as data URIs. Rendering
 * them here would ship all four DiceBear definitions to the browser and defeat
 * the tree-shaking that keeps the other 57 out of the bundle.
 */
export function AvatarPicker({
  name,
  image,
  seeds,
  previews,
  currentStyle,
  currentSeed,
}: {
  name: string;
  image: string | null;
  seeds: string[];
  previews: StylePreview[];
  currentStyle: AvatarStyleId | null;
  currentSeed: string | null;
}) {
  const { update } = useSession();
  const router = useRouter();
  const [style, setStyle] = useState<AvatarStyleId>(
    currentStyle ?? AVATAR_STYLE_IDS[0],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const active = previews.find((preview) => preview.id === style) ?? previews[0];

  async function run(
    label: string,
    work: () => Promise<{ success: boolean; error?: string }>,
  ) {
    setBusy(label);
    const result = await work();
    setBusy(null);
    if (!result.success) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    // Two steps, both needed. `update()` runs the jwt callback with
    // trigger "update", which rewrites the session cookie instead of waiting
    // out its five-minute refresh — but the sidebar is a *server* component in
    // the portal layout, so only `router.refresh()` makes it re-render against
    // that new cookie.
    await update();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-md">
        <PersonAvatar name={name} image={image} size="lg" />
        <div className="flex flex-wrap gap-xs">
          <label
            className={cn(
              "inline-flex h-control-md cursor-pointer items-center rounded-sm border border-hairline bg-surface-soft px-md",
              "text-[length:var(--text-body-sm)] font-medium text-ink",
              "hover:border-hairline-strong focus-within:outline-2 focus-within:outline-focus",
            )}
          >
            {busy === "upload" ? "Uploading…" : "Upload a photo"}
            <input
              type="file"
              className="sr-only"
              accept={AVATAR_ACCEPT_ATTRIBUTE}
              disabled={busy !== null}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                // Cleared straight away so re-picking the same file re-fires.
                event.target.value = "";
                if (!file) return;
                setBusy("upload");
                const body = new FormData();
                body.append("file", file);
                const response = await fetch("/api/avatars", {
                  method: "POST",
                  body,
                });
                const payload = (await response.json()) as {
                  url?: string;
                  error?: string;
                };
                setBusy(null);
                if (!response.ok) {
                  toast.error(payload.error ?? "We couldn't save that picture.");
                  return;
                }
                await update();
                router.refresh();
                toast.success("Picture updated");
              }}
            />
          </label>
          {image ? (
            <Button
              variant="secondary"
              pending={busy === "remove"}
              onClick={() => run("remove", removeAvatar)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Or choose a style
      </p>

      <div className="flex flex-wrap gap-xs">
        {previews.map((preview) => (
          <button
            key={preview.id}
            type="button"
            aria-pressed={style === preview.id}
            onClick={() => setStyle(preview.id)}
            className={cn(
              // h-control-md is the 44px token: the project's mobile pass
              // requires standalone controls to clear 44px on a phone, and
              // padding alone left these at 39px.
              "flex h-control-md items-center rounded-pill border px-md",
              "text-[length:var(--text-body-sm)]",
              "focus-visible:outline-2 focus-visible:outline-focus",
              style === preview.id
                ? "border-focus text-ink"
                : "border-hairline-strong text-ink-secondary",
            )}
          >
            {preview.label}
          </button>
        ))}
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">Choose a {active.label} avatar</legend>
        <div className="flex flex-wrap gap-sm">
          {active.variants.map((dataUri, index) => {
            const seed = seeds[index];
            const selected = currentStyle === active.id && currentSeed === seed;
            return (
              <button
                key={seed}
                type="button"
                aria-pressed={selected}
                aria-label={`${active.label} avatar, option ${index + 1}`}
                disabled={busy !== null}
                onClick={() =>
                  run("variant", () =>
                    setGeneratedAvatar({ style: active.id, seed }),
                  )
                }
                className={cn(
                  "size-16 overflow-hidden rounded-pill border bg-surface-soft",
                  "focus-visible:outline-2 focus-visible:outline-focus",
                  selected ? "border-focus" : "border-hairline",
                )}
              >
                {/* Decorative — the button's aria-label carries the meaning. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUri} alt="" className="size-full" />
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
