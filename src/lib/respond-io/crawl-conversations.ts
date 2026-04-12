import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const OUTPUT_CSV = path.join(DATA_DIR, `conversations-${new Date().toISOString().split("T")[0]}.csv`);
const OUTPUT_JSON = path.join(DATA_DIR, `conversations-${new Date().toISOString().split("T")[0]}.json`);

const SPACE_ID = process.env.RESPOND_IO_SPACE_ID ?? "379161";
const ORG_ID = "373287";
const EMAIL = process.env.RESPOND_IO_EMAIL ?? "";
const PASSWORD = process.env.RESPOND_IO_PASSWORD ?? "";

interface ConversationOpenedEvent {
  contactId: number;
  conversationId: number;
  source: string;
  channelId: number | null;
  firstIncomingMessage: string | null;
  timestamp: number;
  lifecycleId: number | null;
}

interface ChatActivityItem {
  contactId: number;
  eventType?: string;
  type: string;
  timestamp: number;
  conversationId: number;
  payload: {
    source?: string;
    channelId?: number;
    firstIncomingMessage?: string;
    lifecycleId?: number;
    [key: string]: unknown;
  };
}

function extractConversationOpened(
  contactId: number,
  activities: ChatActivityItem[]
): ConversationOpenedEvent | null {
  const openEvent = activities.find(
    (a) => a.eventType === "on_conversation_opened"
  );
  if (!openEvent) return null;

  return {
    contactId,
    conversationId: openEvent.conversationId,
    source: openEvent.payload.source ?? "unknown",
    channelId: openEvent.payload.channelId ?? null,
    firstIncomingMessage: openEvent.payload.firstIncomingMessage ?? null,
    timestamp: openEvent.timestamp,
    lifecycleId: openEvent.payload.lifecycleId ?? null,
  };
}

async function getIdToken(page: import("playwright").Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("ID_TOKEN"));
  if (!token) throw new Error("ID_TOKEN not found in localStorage");
  return token;
}

async function fetchChatActivity(
  page: import("playwright").Page,
  contactId: number,
  idToken: string
): Promise<ChatActivityItem[]> {
  const result = await page.evaluate(
    async ({ contactId, idToken, spaceId, orgId }) => {
      const resp = await fetch(
        `/api/v2/chat-activity/chat?contactId=${contactId}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            botid: spaceId,
            orgid: orgId,
            timezone: "Asia/Kuala_Lumpur",
            "x-requested-with": "XMLHttpRequest",
            Accept: "application/json",
          },
        }
      );
      if (!resp.ok) return { error: resp.status, data: [] };
      const json = await resp.json();
      return json;
    },
    { contactId, idToken, spaceId: SPACE_ID, orgId: ORG_ID }
  );

  if (result.status === "success" && Array.isArray(result.data)) {
    return result.data;
  }
  return [];
}

function escapeCsv(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function run() {
  const startTime = Date.now();
  console.log("[conversation crawler] Starting...");

  // Load contact IDs from the latest full crawl
  const fullCrawlFiles = existsSync(DATA_DIR)
    ? readFileSync(
        path.join(DATA_DIR, `contacts-full-${new Date().toISOString().split("T")[0]}.json`),
        "utf-8"
      )
    : null;

  if (!fullCrawlFiles) {
    console.error("No full crawl data found. Run 'npm run crawl' first.");
    process.exit(1);
  }

  const crawlData = JSON.parse(fullCrawlFiles);
  const contactIds: number[] = crawlData.contacts.map(
    (c: { id: number }) => c.id
  );
  console.log(`Found ${contactIds.length} contacts to process`);

  // Load saved session
  const sessionPath = path.join(DATA_DIR, "browser-session.json");
  if (!existsSync(sessionPath)) {
    console.error(
      "No browser session found. Run the MCP Playwright login flow first to save session to data/browser-session.json"
    );
    process.exit(1);
  }

  const session = JSON.parse(readFileSync(sessionPath, "utf-8"));
  const savedLocalStorage: Record<string, string> =
    typeof session === "string" ? JSON.parse(session).localStorage : session.localStorage;
  const savedCookies: string =
    typeof session === "string" ? JSON.parse(session).cookies : session.cookies;

  const idToken = savedLocalStorage.ID_TOKEN;
  if (!idToken) {
    console.error("No ID_TOKEN found in saved session. Re-login required.");
    process.exit(1);
  }
  console.log("[conversation crawler] Using saved session token");

  // Launch browser and restore session
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Set cookies
  const cookiePairs = savedCookies.split("; ").filter(Boolean);
  const cookieObjects = cookiePairs.map((pair) => {
    const [name, ...rest] = pair.split("=");
    return {
      name,
      value: rest.join("="),
      domain: ".respond.io",
      path: "/",
    };
  });
  await context.addCookies(cookieObjects);

  const page = await context.newPage();

  // Navigate and restore localStorage
  await page.goto(`https://app.respond.io/space/${SPACE_ID}/dashboard`);
  await page.evaluate((ls) => {
    for (const [key, value] of Object.entries(ls)) {
      localStorage.setItem(key, value);
    }
  }, savedLocalStorage);

  // Verify session works
  await page.goto(
    `https://app.respond.io/space/${SPACE_ID}/inbox/${contactIds[0]}`
  );
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (currentUrl.includes("/user/login")) {
    console.error("Session expired. Re-login required via MCP Playwright.");
    await browser.close();
    process.exit(1);
  }
  console.log("[conversation crawler] Session active, starting crawl");

  // Fetch chat activity for each contact
  const results: ConversationOpenedEvent[] = [];
  const errors: { contactId: number; error: string }[] = [];
  const batchSize = 5;

  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (contactId) => {
        try {
          const activities = await fetchChatActivity(page, contactId, idToken);
          const opened = extractConversationOpened(contactId, activities);
          return { contactId, opened, error: null };
        } catch (err) {
          return {
            contactId,
            opened: null,
            error: String(err),
          };
        }
      })
    );

    for (const r of batchResults) {
      if (r.opened) {
        results.push(r.opened);
      } else if (r.error) {
        errors.push({ contactId: r.contactId, error: r.error });
      } else {
        errors.push({
          contactId: r.contactId,
          error: "No conversation_opened event found",
        });
      }
    }

    const progress = Math.min(i + batchSize, contactIds.length);
    process.stdout.write(
      `\r  Processed ${progress}/${contactIds.length} contacts (${results.length} found, ${errors.length} errors)`
    );

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < contactIds.length) {
      await page.waitForTimeout(100);
    }

    // Refresh token every 500 contacts
    if (progress % 500 === 0 && progress < contactIds.length) {
      try {
        const newToken = await getIdToken(page);
        if (newToken !== idToken) {
          console.log("\n  Token refreshed");
        }
      } catch {
        // Token still valid, continue
      }
    }
  }

  console.log("");
  await browser.close();

  // Merge with contact data
  const contactMap = new Map<number, Record<string, unknown>>();
  for (const c of crawlData.contacts) {
    contactMap.set(c.id, c);
  }

  // Build merged output
  const mergedResults = results.map((r) => {
    const contact = contactMap.get(r.contactId);
    return {
      contactId: r.contactId,
      firstName: (contact as { firstName?: string })?.firstName ?? "",
      lastName: (contact as { lastName?: string })?.lastName ?? "",
      phone: (contact as { phone?: string })?.phone ?? "",
      lifecycle: (contact as { lifecycle?: string })?.lifecycle ?? "",
      conversationOpenedBy: r.source,
      channelId: r.channelId,
      firstMessage: r.firstIncomingMessage,
      conversationTimestamp: new Date(r.timestamp).toISOString(),
      status: (contact as { status?: string })?.status ?? "",
      assignee: contact
        ? `${(contact as { assignee?: { firstName?: string; lastName?: string } }).assignee?.firstName ?? ""} ${(contact as { assignee?: { firstName?: string; lastName?: string } }).assignee?.lastName ?? ""}`.trim()
        : "",
    };
  });

  // Export CSV
  const headers = [
    "contactId",
    "firstName",
    "lastName",
    "phone",
    "lifecycle",
    "conversationOpenedBy",
    "channelId",
    "firstMessage",
    "conversationTimestamp",
    "status",
    "assignee",
  ];
  const csvRows = mergedResults.map((r) =>
    headers.map((h) => escapeCsv((r as Record<string, unknown>)[h] as string | number | null)).join(",")
  );
  const csv = [headers.join(","), ...csvRows].join("\n");
  writeFileSync(OUTPUT_CSV, csv, "utf-8");
  console.log(`Exported ${mergedResults.length} conversations to ${OUTPUT_CSV}`);

  // Export JSON
  const jsonOutput = {
    crawledAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    totalProcessed: contactIds.length,
    totalFound: results.length,
    totalErrors: errors.length,
    results: mergedResults,
    errors: errors.slice(0, 50),
  };
  writeFileSync(OUTPUT_JSON, JSON.stringify(jsonOutput, null, 2), "utf-8");
  console.log(`Exported JSON to ${OUTPUT_JSON}`);

  // Summary
  const sourceCounts: Record<string, number> = {};
  for (const r of results) {
    sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1;
  }

  console.log(`\n[conversation crawler] Done in ${Date.now() - startTime}ms`);
  console.log(`  Total contacts: ${contactIds.length}`);
  console.log(`  Conversations found: ${results.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`\n  Conversation Opened By:`);
  for (const [source, count] of Object.entries(sourceCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`    ${source}: ${count}`);
  }
}

run().catch((err) => {
  console.error("[conversation crawler] Fatal error:", err);
  process.exit(1);
});
