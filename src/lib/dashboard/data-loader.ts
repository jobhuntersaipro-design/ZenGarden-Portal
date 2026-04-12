import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import type { ConversationRecord, LifecycleEvent } from "./types";
import { LIFECYCLE_MAP } from "./types";

const DATA_DIR = path.resolve(process.cwd(), "data");

export function getLatestDataDate(): string | null {
  if (!existsSync(DATA_DIR)) return null;
  const files = readdirSync(DATA_DIR).filter((f) =>
    f.startsWith("conversations-")
  );
  if (!files.length) return null;
  const dates = files
    .map((f) => f.match(/(\d{4}-\d{2}-\d{2})/)?.[1])
    .filter(Boolean) as string[];
  dates.sort().reverse();
  return dates[0] ?? null;
}

export function getAllDataDates(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  const files = readdirSync(DATA_DIR).filter((f) =>
    f.startsWith("conversations-")
  );
  const dates = files
    .map((f) => f.match(/(\d{4}-\d{2}-\d{2})/)?.[1])
    .filter(Boolean) as string[];
  return dates.sort().reverse();
}

export function loadConversations(
  date?: string
): ConversationRecord[] {
  const d = date ?? getLatestDataDate();
  if (!d) return [];

  const convPath = path.join(DATA_DIR, `conversations-${d}.json`);
  if (!existsSync(convPath)) return [];

  const raw = JSON.parse(readFileSync(convPath, "utf-8"));
  const results = raw.results ?? [];

  // Load lifecycle events if available
  const lcPath = path.join(DATA_DIR, `lifecycle-events-${d}.json`);
  const lcMap = new Map<number, LifecycleEvent[]>();

  if (existsSync(lcPath)) {
    const lcData = JSON.parse(readFileSync(lcPath, "utf-8"));
    for (const evt of lcData.events ?? []) {
      const arr = lcMap.get(evt.contactId) ?? [];
      arr.push(evt);
      lcMap.set(evt.contactId, arr);
    }
  }

  return results.map(
    (r: Record<string, unknown>): ConversationRecord => ({
      contactId: r.contactId as number,
      firstName: (r.firstName as string) ?? "",
      lastName: (r.lastName as string) ?? "",
      phone: (r.phone as string) ?? "",
      lifecycle: (r.lifecycle as string) ?? "",
      conversationOpenedBy: (r.conversationOpenedBy as string) ?? "",
      adPlatform: (r.adPlatform as string) ?? null,
      adName: (r.adName as string) ?? null,
      adId: (r.adId as string) ?? null,
      status: (r.status as string) ?? "",
      assignee: (r.assignee as string) ?? "",
      conversationTimestamp: (r.conversationTimestamp as string) ?? "",
      lifecycleHistory: lcMap.get(r.contactId as number) ?? [],
    })
  );
}

export function loadLifecycleEvents(date?: string): LifecycleEvent[] {
  const d = date ?? getLatestDataDate();
  if (!d) return [];

  const lcPath = path.join(DATA_DIR, `lifecycle-events-${d}.json`);
  if (!existsSync(lcPath)) return [];

  const raw = JSON.parse(readFileSync(lcPath, "utf-8"));
  return raw.events ?? [];
}

export function resolveLifecycleName(id: number): string {
  return LIFECYCLE_MAP[id] ?? `Unknown (${id})`;
}
