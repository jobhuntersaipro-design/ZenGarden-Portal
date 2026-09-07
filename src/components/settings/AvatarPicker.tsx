"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { removeAvatar, setGeneratedAvatar } from "@/actions/profile";
import { useAvatarSaving } from "@/components/portal/AvatarSaving";
import { Spinner } from "@/components/portal/Spinner";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/person";
import {
  AVATAR_STYLE_IDS,
  type AvatarStyleId,
} from "@/lib/avatar-style-ids";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { AVATAR_ACCEPT_ATTRIBUTE } from "@/lib/validation/profile";
import { cn } from "@/lib/utils";

/** A picture the browser has not fetched yet paints after the spinner stops. */
const PRELOAD_GIVE_UP_MS = 5000;

/**
 * Resolves once the browser holds the new picture — or gives up on it.
 *
 * The save writes a 256px WebP to R2 and hands back its URL; the sidebar and
 * the preview then ask for that URL over the network. Without this wait the
 * spinner stopped and the toast fired while both were still fetching, so the
 * old picture stayed on screen for a beat after being told it had changed.
 *
 * `onerror` resolves too: a picture that will not load is a broken avatar, not
 * a reason to hold a spinner open for ever.
 */
function preloadPicture(url: string | null | undefined): Promise<void> {
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    const settle = () => resolve();
    image.onload = settle;
    image.onerror = settle;
    setTimeout(settle, PRELOAD_GIVE_UP_MS);
    image.src = url;
  });
}

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
  const refresh = useAwaitableRefresh();
  const { setSaving } = useAvatarSaving();
  const [style, setStyle] = useState<AvatarStyleId>(
    currentStyle ?? AVATAR_STYLE_IDS[0],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const active = previews.find((preview) => preview.id === style) ?? previews[0];

  /**
   * The whole change, start to finish: the write, the new picture fetched, the
   * session cookie rewritten, and the server-rendered shell caught up. Only
   * then do the spinners stop and the toast appear — a success message that
   * lands while the sidebar still shows the old face is a lie, briefly.
   */
  async function settle(url: string | null | undefined) {
    await preloadPicture(url);
    // Two steps, both needed. `update()` runs the jwt callback with
    // trigger "update", which rewrites the session cookie instead of waiting
    // out its five-minute refresh — but the sidebar is a *server* component in
    // the portal layout, so only a refresh makes it re-render against that new
    // cookie. `refresh` is awaitable so this can wait for the repaint.
    await update();
    await refresh();
  }

  async function run(
    label: string,
    work: () => Promise<{
      success: boolean;
      error?: string;
      data?: { url?: string };
    }>,
    done?: string,
  ) {
    setBusy(label);
    setSaving(true);
    const stop = () => {
      setBusy(null);
      setSaving(false);
    };

    let result: { success: boolean; error?: string; data?: { url?: string } };
    try {
      result = await work();
    } catch {
      // A server action can *throw* rather than return an error — the server
      // is down, a deploy is mid-flight, the session has gone. Without this
      // the promise rejected, `busy` never cleared, and every avatar stayed
      // disabled with nothing on screen to say why: the picker looked dead
      // until a reload. Reproduced by stopping the dev server mid-click.
      stop();
      toast.error("We couldn't reach the server. Try again.");
      return;
    }
    if (!result.success) {
      stop();
      toast.error(result.error ?? "That did not work.");
      return;
    }

    await settle(result.data?.url);
    stop();
    if (done) toast.success(done);
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-md">
        {/* The tile spinner says which avatar you picked; this one says the
            picture is changing. A save runs 3 s on a cold serverless start,
            and the preview is the thing the user is watching. */}
        <div className="relative">
          <PersonAvatar name={name} image={image} size="lg" />
          {busy !== null ? (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-canvas/70 text-ink">
              <Spinner size="md" />
            </span>
          ) : null}
        </div>
        <p aria-live="polite" className="sr-only">
          {busy !== null ? "Saving your picture" : ""}
        </p>
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
                setSaving(true);
                const body = new FormData();
                body.append("file", file);
                let response: Response;
                let payload: { url?: string; error?: string };
                try {
                  response = await fetch("/api/avatars", {
                    method: "POST",
                    body,
                  });
                  payload = (await response.json()) as {
                    url?: string;
                    error?: string;
                  };
                } catch {
                  // Same trap as `run`: a failed fetch left the label reading
                  // "Uploading…" for ever.
                  setBusy(null);
                  setSaving(false);
                  toast.error("We couldn't reach the server. Try again.");
                  return;
                }
                if (!response.ok) {
                  setBusy(null);
                  setSaving(false);
                  toast.error(payload.error ?? "We couldn't save that picture.");
                  return;
                }
                await settle(payload.url);
                setBusy(null);
                setSaving(false);
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

      <p className="-mb-xs text-[length:var(--text-caption)] text-ink-tertiary">
        Pick one to use it as your picture.
      </p>

      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">
          Choose a {active.label} avatar — the one you pick becomes your picture
        </legend>
        <div
          className="flex flex-wrap gap-sm"
          aria-busy={busy?.startsWith("variant:") ?? false}
        >
          {active.variants.map((dataUri, index) => {
            const seed = seeds[index];
            const selected = currentStyle === active.id && currentSeed === seed;
            const pending = busy === `variant:${seed}`;
            return (
              <button
                key={seed}
                type="button"
                aria-pressed={selected}
                aria-label={`Use this ${active.label} avatar, option ${index + 1}`}
                title="Use this avatar"
                disabled={busy !== null}
                onClick={() =>
                  run(
                    `variant:${seed}`,
                    () => setGeneratedAvatar({ style: active.id, seed }),
                    "Picture updated",
                  )
                }
                className={cn(
                  "relative size-16 overflow-hidden rounded-pill border bg-surface-soft transition",
                  "focus-visible:outline-2 focus-visible:outline-focus",
                  "hover:border-hairline-strong",
                  selected ? "border-focus" : "border-hairline",
                  // The clicked one keeps its colour; the rest step back, the
                  // same way a busy group of chips reads elsewhere.
                  busy !== null && !pending ? "opacity-60" : "",
                )}
              >
                {/* Decorative — the button's aria-label carries the meaning. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUri} alt="" className="size-full" />
                {pending ? (
                  <span className="absolute inset-0 grid place-items-center bg-canvas/70 text-ink">
                    <Spinner />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
