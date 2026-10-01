"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NotificationCenter,
  type NotificationItem,
} from "@/components/arc/notification-center/notification-center";
import { loadReviewNotifications, type ReviewNotification } from "@/actions/shell";
import { useReviewCount } from "@/components/portal/ReviewCount";
import { formatDateTime } from "@/lib/dates";
import { beginRouteProgress } from "@/lib/route-progress";

/** Per browser: which updates this person has read or put away. */
const READ_KEY = "zg-notifications-read";
const DISMISSED_KEY = "zg-notifications-dismissed";

function readSet(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, values: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values].slice(-200)));
  } catch {
    // Private mode or storage blocked: the bell still works, it just forgets.
  }
}

/**
 * Arc's notification center on the review queue: every shop order and read
 * upload waiting on the team is an update, newest waiting longest first, and
 * Open goes to its review screen. It reloads whenever the shell's review
 * count moves, so it agrees with the badge on Purchase Orders. Read and
 * dismissed are remembered per browser; an order leaves the list for everyone
 * once it is confirmed or declined, because it leaves the queue.
 */
export function ReviewNotifications() {
  const router = useRouter();
  const { count } = useReviewCount();
  const [rows, setRows] = useState<ReviewNotification[] | null>(null);
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const result = await loadReviewNotifications();
        if (!live || !result.success) return;
        setRead(readSet(READ_KEY));
        setDismissed(readSet(DISMISSED_KEY));
        setRows(result.data);
      } catch {
        // The badge on Purchase Orders still carries the count.
      }
    })();
    return () => {
      live = false;
    };
  }, [count]);

  const items: NotificationItem[] = (rows ?? [])
    .filter((row) => !dismissed.has(row.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      time: row.at ? formatDateTime(row.at) : "",
      read: read.has(row.id),
      tone: row.kind === "shop" ? "warning" : "info",
    }));
  const hrefs = new Map((rows ?? []).map((row) => [row.id, row.href]));

  return (
    <NotificationCenter
      // Arc seeds its own list once, so a new set of updates remounts it.
      key={items.map((item) => `${item.id}:${item.read ? 1 : 0}`).join("|")}
      label="Waiting on the team"
      notifications={items}
      onReadChange={(item, isRead) => {
        const next = new Set(read);
        if (isRead) next.add(item.id);
        else next.delete(item.id);
        writeSet(READ_KEY, next);
      }}
      onDismiss={(item) => {
        const next = new Set(dismissed);
        next.add(item.id);
        writeSet(DISMISSED_KEY, next);
      }}
      onOpenItem={(item) => {
        const href = hrefs.get(item.id);
        if (!href) return;
        const next = new Set(read);
        next.add(item.id);
        writeSet(READ_KEY, next);
        setRead(next);
        beginRouteProgress();
        router.push(href);
      }}
    />
  );
}
