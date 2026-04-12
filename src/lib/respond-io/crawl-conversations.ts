import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { normalizePackageName, lookupPackagePrice } from "./pricing";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATE_STR = new Date().toISOString().split("T")[0];
const OUTPUT_CSV = path.join(DATA_DIR, `conversations-${DATE_STR}.csv`);
const OUTPUT_JSON = path.join(DATA_DIR, `conversations-${DATE_STR}.json`);
const LIFECYCLE_JSON = path.join(DATA_DIR, `lifecycle-events-${DATE_STR}.json`);

const LIFECYCLE_MAP: Record<number, string> = {
  678125: "New Lead",
  678126: "Plan Selected",
  678127: "Supporting Document Pending",
  678128: "Installation Done",
  678129: "Cold Lead",
  678626: "Supporting Document Submitted",
  686914: "Closing Script Agreed - Pending Human",
  686915: "Pending Installation",
  714695: "Pending Demand",
  722885: "Pending Transfer Request",
  741711: "Installation Done - Pending Free Gift",
  741712: "Installation Done - Free Gift Done",
  766841: "Follow Up",
};

interface LifecycleEventRaw {
  contactId: number;
  lifecycleId: number;
  lifecycleName: string;
  previousLifecycleId: number | null;
  previousLifecycleName: string | null;
  timestamp: number;
  date: string;
  source: string | null;
}

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
  adPlatform: string | null;
  adName: string | null;
  adId: string | null;
  referral: string | null;
  refererURL: string | null;
  packageName: string | null;
  packagePrice: number | null;
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

function extractPackageFromMessages(
  activities: ChatActivityItem[]
): string | null {
  const outgoingTexts: string[] = [];

  for (const a of activities) {
    if (a.type !== "message") continue;
    const msg = a.payload as Record<string, unknown>;
    const message = msg.message as Record<string, unknown> | undefined;
    if (!message) continue;

    const text =
      (message.text as string) ??
      (message.attachment as Record<string, unknown>)?.description ??
      "";
    if (!text) continue;

    // Priority 1: Formal closing script "Package to be subscribed"
    const packageMatch = text.match(
      /[Pp]ackage\s+to\s+be\s+subscribed\s*[:：]\s*(.+?)(?:\n|$)/
    );
    if (packageMatch) {
      return packageMatch[1].trim();
    }

    const traffic = (a as unknown as Record<string, unknown>).traffic;
    if (traffic === "outgoing") {
      outgoingTexts.push(text);
    }
  }

  // Speed pattern reused across all tiers
  const speedRe = /(\d+)\s*(?:mbps|gbps|gb|mb)/i;

  // Priority 2: Confirmation messages with speed mentions
  const confirmPatterns = [
    // "saya lock/confirm/setkan/simpan/note/submit... Unifi XXXMbps"
    /(?:saya\s+(?:lock|confirm|setkan|simpan|note|submit|dah)|submit\s+order|dah\s+terima|proceed).*?(?:unifi\s+(?:\w+\s+)?)?(\d+\s*(?:mbps|gbps|gb|mb))/i,
    // "you pilih/ambil/confirm... XXXMbps"
    /(?:you\s+(?:pilih|ambil|confirm|nak)).*?(\d+\s*(?:mbps|gbps|gb|mb))/i,
    // "package/pelan daftar XXXMbps"
    /(?:package|pelan|plan).*?(?:daftar|register|ni).*?(\d+\s*(?:mbps|gbps|gb|mb))/i,
    // "daftar/pasang XXXMbps"
    /(?:daftar|pasang|pemasangan).*?(\d+\s*(?:mbps|gbps|gb|mb))/i,
  ];

  for (const text of outgoingTexts) {
    for (const pattern of confirmPatterns) {
      const m = text.match(pattern);
      if (m) {
        const speed = m[1].trim();
        const isBiz = text.toLowerCase().includes("business") || text.toLowerCase().includes("biz");
        return isBiz ? `Unifi Business ${speed}` : `Unifi ${speed}`;
      }
    }
  }

  // Priority 3: Outgoing messages with "Unifi [Home/Business/Biz] XXXMbps" + price
  for (const text of outgoingTexts) {
    const m = text.match(
      /unifi\s+(?:home\s+|business\s+|biz\s+)?(\d+\s*(?:mbps|gbps|gb|mb)).*?(?:rm\s*\d+|bulanan|sebulan|\/bulan)/i
    );
    if (m) {
      const isBiz = text.toLowerCase().includes("business") || text.toLowerCase().includes("biz");
      return isBiz ? `Unifi Business ${m[1].trim()}` : `Unifi ${m[1].trim()}`;
    }
  }

  // Priority 4: Any outgoing message with speed + RM price nearby
  for (const text of outgoingTexts) {
    const m = text.match(
      /(\d+)\s*(?:mbps|gbps|gb|mb)\s*(?:\S+\s+){0,5}rm\s*\d+/i
    );
    if (m && speedRe.test(text)) {
      const speedM = text.match(speedRe);
      if (speedM) {
        const isBiz = text.toLowerCase().includes("business") || text.toLowerCase().includes("biz");
        return isBiz ? `Unifi Business ${speedM[0].trim()}` : `Unifi ${speedM[0].trim()}`;
      }
    }
  }

  return null;
}

function extractConversationOpened(
  contactId: number,
  activities: ChatActivityItem[]
): ConversationOpenedEvent | null {
  const openEvent = activities.find(
    (a) => a.eventType === "on_conversation_opened"
  );
  if (!openEvent) return null;

  const source = openEvent.payload.source ?? "unknown";
  const isContactSource = source === "contact";

  const rawPackage = extractPackageFromMessages(activities);
  const pkgName = rawPackage ? normalizePackageName(rawPackage) : null;
  const pkgPrice = pkgName ? lookupPackagePrice(pkgName) : null;

  return {
    contactId,
    conversationId: openEvent.conversationId,
    source,
    channelId: openEvent.payload.channelId ?? null,
    firstIncomingMessage: openEvent.payload.firstIncomingMessage ?? null,
    timestamp: openEvent.timestamp,
    lifecycleId: openEvent.payload.lifecycleId ?? null,
    adPlatform: (openEvent.payload.adPlatform as string) ?? (isContactSource ? "Google Ads" : null),
    adName: (openEvent.payload.adName as string) ?? (isContactSource ? "Google Ads" : null),
    adId: (openEvent.payload.adId as string) ?? null,
    referral: (openEvent.payload.referral as string) ?? (isContactSource ? "Google Ads" : null),
    refererURL: (openEvent.payload.refererURL as string) ?? null,
    packageName: pkgName,
    packagePrice: pkgPrice,
  };
}

function extractLifecycleEvents(
  contactId: number,
  activities: ChatActivityItem[]
): LifecycleEventRaw[] {
  return activities
    .filter(
      (a) =>
        a.eventType === "on_contact_lifecycle_created" ||
        a.eventType === "on_contact_lifecycle_updated"
    )
    .map((a) => {
      const lcId = a.payload.lifecycleId as number;
      const prevId = (a.payload.previousLifecycleId as number) ?? null;
      return {
        contactId,
        lifecycleId: lcId,
        lifecycleName: LIFECYCLE_MAP[lcId] ?? `Unknown (${lcId})`,
        previousLifecycleId: prevId,
        previousLifecycleName: prevId
          ? (LIFECYCLE_MAP[prevId] ?? `Unknown (${prevId})`)
          : null,
        timestamp: a.timestamp,
        date: new Date(a.timestamp).toISOString().split("T")[0],
        source: (a.payload.source as string) ?? null,
      };
    });
}

async function getIdToken(page: import("playwright").Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("ID_TOKEN"));
  if (!token) throw new Error("ID_TOKEN not found in localStorage");
  return token;
}

async function fetchChatActivityWithPagination(
  page: import("playwright").Page,
  contactId: number,
  idToken: string
): Promise<ChatActivityItem[]> {
  const result = await page.evaluate(
    async ({ contactId, idToken, spaceId, orgId }) => {
      const headers = {
        Authorization: `Bearer ${idToken}`,
        botid: spaceId,
        orgid: orgId,
        timezone: "Asia/Kuala_Lumpur",
        "x-requested-with": "XMLHttpRequest",
        Accept: "application/json",
      };

      let lastId: string | null = null;
      const allItems: unknown[] = [];
      let pages = 0;
      const MAX_PAGES = 30;

      while (pages < MAX_PAGES) {
        const apiUrl: string = lastId
          ? `/api/v2/chat-activity/chat?contactId=${contactId}&lastChatActivityId=${lastId}`
          : `/api/v2/chat-activity/chat?contactId=${contactId}`;

        const resp = await fetch(apiUrl, { headers });
        if (!resp.ok) return { status: "error", data: allItems };

        const json = await resp.json();
        const items = json.data || [];
        pages++;

        if (items.length === 0) break;

        allItems.push(...items);

        // Check if we found the conversation opened event
        const openEvent = items.find(
          (e: { eventType?: string }) =>
            e.eventType === "on_conversation_opened"
        );
        if (openEvent) break;

        // Get first (oldest) item ID for next page
        lastId = items[0].id;

        // If fewer than 50 items, we've reached the beginning
        if (items.length < 50) break;
      }

      return { status: "success", data: allItems };
    },
    { contactId, idToken, spaceId: SPACE_ID, orgId: ORG_ID }
  );

  if (result.status === "success" && Array.isArray(result.data)) {
    return result.data as ChatActivityItem[];
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
  const allLifecycleEvents: LifecycleEventRaw[] = [];
  const errors: { contactId: number; error: string }[] = [];
  const batchSize = 5;

  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (contactId) => {
        try {
          const activities = await fetchChatActivityWithPagination(page, contactId, idToken);
          const opened = extractConversationOpened(contactId, activities);
          const lcEvents = extractLifecycleEvents(contactId, activities);
          return { contactId, opened, lcEvents, error: null };
        } catch (err) {
          return {
            contactId,
            opened: null,
            lcEvents: [] as LifecycleEventRaw[],
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
      allLifecycleEvents.push(...r.lcEvents);
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
      adPlatform: r.adPlatform,
      adName: r.adName,
      adId: r.adId,
      referral: r.referral,
      refererURL: r.refererURL,
      packageName: r.packageName,
      packagePrice: r.packagePrice,
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
    "adPlatform",
    "adName",
    "adId",
    "referral",
    "refererURL",
    "packageName",
    "packagePrice",
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

  // Export lifecycle events
  const lcOutput = {
    crawledAt: new Date().toISOString(),
    totalEvents: allLifecycleEvents.length,
    events: allLifecycleEvents,
  };
  writeFileSync(LIFECYCLE_JSON, JSON.stringify(lcOutput, null, 2), "utf-8");
  console.log(
    `Exported ${allLifecycleEvents.length} lifecycle events to ${LIFECYCLE_JSON}`
  );

  // Summary
  const sourceCounts: Record<string, number> = {};
  const adNameCounts: Record<string, number> = {};
  for (const r of results) {
    sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1;
    if (r.adName) {
      adNameCounts[r.adName] = (adNameCounts[r.adName] ?? 0) + 1;
    }
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
  if (Object.keys(adNameCounts).length > 0) {
    console.log(`\n  By Meta Ad:`);
    for (const [adName, count] of Object.entries(adNameCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`    ${adName}: ${count}`);
    }
  }
}

run().catch((err) => {
  console.error("[conversation crawler] Fatal error:", err);
  process.exit(1);
});
