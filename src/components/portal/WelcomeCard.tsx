"use client";

import { useEffect, useState } from "react";
import { Sparkles, XIcon } from "lucide-react";
import arc from "@/components/arc/alert/alert.module.css";
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

  const dismiss = () => {
    write(DISMISSED_KEY, loginId);
    setShown(null);
  };

  // Arc's alert — its surface, resting shadow, tinted icon and
  // round dismiss — carrying the same greeting and line.
  return (
    <section aria-label="Welcome" className={`${arc.alert} ${arc.info} mb-lg animate-rise`}>
      <span aria-hidden className={`${arc.icon} text-brand-pink`}>
        <Sparkles className="size-4" />
      </span>
      <div className={arc.copy}>
        <p className={`${arc.title} text-[length:var(--text-body-md)] text-ink`}>
          {shown.greeting}, {firstName}
        </p>
        <p className={`${arc.description} text-[length:var(--text-body-sm)]`}>{shown.message}</p>
      </div>
      <button
        type="button"
        aria-label="Close the welcome message"
        onClick={dismiss}
        className={`${arc.dismiss} max-sm:size-11`}
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </section>
  );
}
