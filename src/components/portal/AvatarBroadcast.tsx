"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * One channel, one message: "the signed-in person's picture changed".
 *
 * Every screen that names a person reads `User.image` on the server, so a
 * *fresh* render is always right. What is not right is a page that was
 * rendered before the change and never re-renders — a second tab left open on
 * a purchase order, most often. There the sidebar, the tables and the Activity
 * card all keep the old face, or the old initials, until something navigates.
 *
 * `router.refresh()` in each listening tab re-renders its current route
 * against the server and drops the client router cache with it, so the change
 * lands everywhere rather than only where it was made.
 *
 * A `BroadcastChannel` never delivers to the context that posted, so the tab
 * doing the saving is not asked to refresh a second time.
 */
const CHANNEL = "loving-hands.avatar";

/** Tells every other tab of this browser to re-read the picture. */
export function announceAvatarChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage("changed");
  channel.close();
}

/**
 * Mounted once, in the portal layout, so it is listening on every screen —
 * including the ones that show other people's pictures beside their names.
 */
export function AvatarChangeListener() {
  const router = useRouter();

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => router.refresh();
    return () => channel.close();
  }, [router]);

  return null;
}
