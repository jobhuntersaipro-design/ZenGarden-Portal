"use client";

import { useEffect, useState } from "react";
import { Sparkles, XIcon } from "lucide-react";
import {
  WELCOME_MESSAGES,
  greetingFor,
  parseRecent,
  pickWelcome,
  rememberShown,
} from "@/lib/welcome";

const RECENT_KEY = "zg.welcome.recent";
const CURRENT_KEY = "zg.welcome.current";
const DISMISSED_KEY = "zg.welcome.dismissed";

/** Storage can be missing or throw (private windows, blocked site data). */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the card still works for this page, it just won't remember.
  }
}

const klHour = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date()),
  );

type Shown = { greeting: string; message: string };

/**
 * A warm line at the top of the portal, once per sign-in, until it is closed.
 *
 * `loginId` is when this session signed in, so the card is keyed to the
 * sign-in rather than to the page: it stays put while the reader moves around
 * (the same line, not a new one per click), closing it keeps it closed for the
 * rest of that sign-in, and the next sign-in brings a new one. The ✕ writes
 * that sign-in as dismissed and unmounts — the cause, not just the view
 * (context/lessons.md §11).
 *
 * Everything is read after mount: the line is chosen from this browser's own
 * history, which the server cannot see, so rendering it on the server would
 * only ever disagree with the client.
 */
export function WelcomeCard({
  firstName,
  loginId,
}: {
  firstName: string;
  loginId: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (read(DISMISSED_KEY) === loginId) return;

    let index: number | null = null;
    // JSON, not "login:index" — the login id carries a colon of its own, and
    // splitting on it once made every page draw a new line.
    try {
      const current: unknown = JSON.parse(read(CURRENT_KEY) ?? "null");
      if (
        current &&
        typeof current === "object" &&
        "login" in current &&
        "index" in current &&
        current.login === loginId &&
        typeof current.index === "number" &&
        WELCOME_MESSAGES[current.index]
      ) {
        index = current.index;
      }
    } catch {
      // A stored value from somewhere else; draw a fresh line below.
    }
    if (index === null) {
      const recent = parseRecent(read(RECENT_KEY));
      index = pickWelcome(recent);
      write(RECENT_KEY, JSON.stringify(rememberShown(recent, index)));
      write(CURRENT_KEY, JSON.stringify({ login: loginId, index }));
    }

    // A browser-only read (localStorage) decides what to render, so this is
    // the one place it can be set; see the component's own comment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({
      greeting: greetingFor(klHour()),
      message: WELCOME_MESSAGES[index],
    });
  }, [loginId]);

  if (!shown) return null;

  return (
    <section
      aria-label="Welcome"
      className="relative mb-lg flex animate-rise items-start gap-sm overflow-hidden rounded-md border border-hairline bg-canvas py-md pr-xs pl-md shadow-xs"
    >
      {/* The brand's colour, as the design system allows it: inside the
          gradient, never as a flat fill. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand-gradient" />
      <span
        aria-hidden
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface text-brand-pink"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
          {shown.greeting}, {firstName}
        </p>
        <p className="mt-xxs text-[length:var(--text-body-md)] text-ink-secondary">
          {shown.message}
        </p>
      </div>
      <button
        type="button"
        aria-label="Close the welcome message"
        onClick={() => {
          write(DISMISSED_KEY, loginId);
          setShown(null);
        }}
        className="-mt-xxs grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:size-8"
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </section>
  );
}
