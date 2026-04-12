import { fetchAllContacts, fetchContactsSince } from "./client";
import {
  exportToCsv,
  exportToJson,
  loadLastCrawlTimestamp,
  saveLastCrawlTimestamp,
  loadConversationMap,
} from "./export";
import type { CrawlResult } from "./types";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const META_PATH = path.join(DATA_DIR, "crawl-meta.json");

async function run() {
  const mode = process.argv[2] ?? "full";
  const startTime = Date.now();

  console.log(`[respond.io crawler] Mode: ${mode}`);
  console.log(`[respond.io crawler] Started at ${new Date().toISOString()}`);

  if (mode === "incremental") {
    const lastTimestamp = loadLastCrawlTimestamp(META_PATH);
    if (!lastTimestamp) {
      console.log("No previous crawl found. Running full crawl instead.");
      return runFull(startTime);
    }

    console.log(
      `Fetching contacts since ${new Date(lastTimestamp * 1000).toISOString()}...`
    );

    const contacts = await fetchContactsSince(lastTimestamp, undefined, (n) =>
      process.stdout.write(`\r  Fetched ${n} new contacts...`)
    );
    console.log("");

    const nowTimestamp = Math.floor(Date.now() / 1000);
    const result: CrawlResult = {
      contacts,
      totalFetched: contacts.length,
      crawledAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    const dateStr = new Date().toISOString().split("T")[0];
    exportToCsv(contacts, path.join(DATA_DIR, `contacts-incremental-${dateStr}.csv`));
    exportToJson(result, path.join(DATA_DIR, `contacts-incremental-${dateStr}.json`));
    saveLastCrawlTimestamp(META_PATH, nowTimestamp);

    console.log(`\n[respond.io crawler] Done in ${result.durationMs}ms`);
    console.log(`  New contacts: ${result.totalFetched}`);
  } else {
    return runFull(startTime);
  }
}

async function runFull(startTime: number) {
  console.log("Fetching ALL contacts...");

  const contacts = await fetchAllContacts(undefined, (n) =>
    process.stdout.write(`\r  Fetched ${n} contacts...`)
  );
  console.log("");

  const nowTimestamp = Math.floor(Date.now() / 1000);
  const result: CrawlResult = {
    contacts,
    totalFetched: contacts.length,
    crawledAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  const dateStr = new Date().toISOString().split("T")[0];
  const convMap = loadConversationMap(DATA_DIR);
  exportToCsv(contacts, path.join(DATA_DIR, `contacts-full-${dateStr}.csv`), convMap);
  exportToJson(result, path.join(DATA_DIR, `contacts-full-${dateStr}.json`));
  saveLastCrawlTimestamp(META_PATH, nowTimestamp);

  // Print summary
  const lifecycleCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const assigneeCounts: Record<string, number> = {};

  for (const c of contacts) {
    const lc = c.lifecycle ?? "Unknown";
    lifecycleCounts[lc] = (lifecycleCounts[lc] ?? 0) + 1;

    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;

    const assignee = c.assignee
      ? `${c.assignee.firstName} ${c.assignee.lastName}`.trim()
      : "Unassigned";
    assigneeCounts[assignee] = (assigneeCounts[assignee] ?? 0) + 1;
  }

  console.log(`\n[respond.io crawler] Done in ${result.durationMs}ms`);
  console.log(`  Total contacts: ${result.totalFetched}`);
  console.log(`\n  By Lifecycle:`);
  for (const [lc, count] of Object.entries(lifecycleCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${lc}: ${count}`);
  }
  console.log(`\n  By Status:`);
  for (const [s, count] of Object.entries(statusCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${s}: ${count}`);
  }
  console.log(`\n  By Assignee:`);
  for (const [a, count] of Object.entries(assigneeCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${a}: ${count}`);
  }
}

run().catch((err) => {
  console.error("[respond.io crawler] Fatal error:", err);
  process.exit(1);
});
