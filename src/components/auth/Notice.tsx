"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheckIcon, InfoIcon, OctagonXIcon, XIcon } from "lucide-react";
import arc from "@/components/arc/alert/alert.module.css";
export type NoticeTone = "error" | "success" | "info";

/**
 * Arc's alert in each tone (arc/alert), with the same icons the toasts use,
 * so a message about the same thing is marked the same way whichever surface
 * it lands on. The tone colours the icon and the alert's edge; the words stay
 * `ink` — see below.
 */
const TONE: Record<NoticeTone, { className: string; Icon: typeof InfoIcon }> = {
  error: { className: arc.danger, Icon: OctagonXIcon },
  success: { className: arc.success, Icon: CircleCheckIcon },
  info: { className: arc.info, Icon: InfoIcon },
};

/**
 * The inline strip above an auth form (design reference §3.1).
 *
 * **The words are `ink`, not the accent, and that is a measured deviation from
 * the reference**, which specifies `text-accent-red`. On the `bg-surface-soft`
 * the same reference asks for, `accent-red` measures **3.32:1** and
 * `accent-green` **3.61:1** — both under the 4.5:1 floor for normal text,
 * where `ink` clears **11.59:1**. The tone is carried by a coloured icon,
 * which only has a 3:1 floor to clear and does, and by the alert's edge.
 *
 * **Dismissible only where there is something to dismiss to.** Passing
 * `onDismiss` (a form clearing its own error) or `dismissHref` (a page
 * stripping the search parameter the message came from) puts an ✕ on the
 * strip. A notice that *is* the screen's answer — "we've emailed a link" —
 * passes neither and stays, because closing it would leave the screen saying
 * nothing about what just happened.
 *
 * Both routes remove the **cause**, so this component cannot hold a stale
 * "dismissed" flag: clearing the error or the parameter unmounts the strip
 * outright, and the next failure mounts a fresh one. The local state exists
 * only to hide it in the frame before that lands.
 */
export function Notice({
  tone = "error",
  children,
  onDismiss,
  dismissHref,
}: {
  tone?: NoticeTone;
  children: ReactNode;
  /** For a client form: clear the error state this strip is rendered from. */
  onDismiss?: () => void;
  /**
   * For a server page: where to go to drop the parameter that produced the
   * message. A real link, so it needs no router hook and cmd-click behaves;
   * `replace` so Back cannot bring the dismissed message back.
   */
  dismissHref?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const { className, Icon } = TONE[tone];

  if (hidden) return null;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${arc.alert} ${className} text-[length:var(--text-body-sm)] text-ink`}
    >
      <span className={arc.icon}>
        <Icon aria-hidden className="size-4" />
      </span>
      <p className={`${arc.copy} ${arc.title}`}>{children}</p>
      {dismissHref ? (
        <Link
          href={dismissHref}
          replace
          scroll={false}
          aria-label="Dismiss this message"
          onClick={() => setHidden(true)}
          className="-my-xxs grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:size-7"
        >
          <XIcon aria-hidden className="size-4" />
        </Link>
      ) : onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss this message"
          onClick={() => {
            setHidden(true);
            onDismiss();
          }}
          className="-my-xxs grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:size-7"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
