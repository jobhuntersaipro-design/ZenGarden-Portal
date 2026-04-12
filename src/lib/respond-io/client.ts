import type {
  CrawlerConfig,
  RespondIOContact,
  RespondIOContactListResponse,
} from "./types";

const DEFAULT_CONFIG: Omit<CrawlerConfig, "apiToken" | "spaceId"> = {
  baseUrl: "https://api.respond.io/v2",
  pageSize: 100,
  timezone: "Asia/Kuala_Lumpur",
  rateLimitMs: 200,
};

function buildConfig(
  overrides?: Partial<CrawlerConfig>
): CrawlerConfig {
  const apiToken =
    overrides?.apiToken ?? process.env.RESPOND_IO_API_TOKEN ?? "";
  const spaceId =
    overrides?.spaceId ?? process.env.RESPOND_IO_SPACE_ID ?? "";

  if (!apiToken) throw new Error("RESPOND_IO_API_TOKEN is required");
  if (!spaceId) throw new Error("RESPOND_IO_SPACE_ID is required");

  return { ...DEFAULT_CONFIG, apiToken, spaceId, ...overrides };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchContactPage(
  config: CrawlerConfig,
  cursorId?: number
): Promise<RespondIOContactListResponse> {
  const url = cursorId
    ? `${config.baseUrl}/contact/list?limit=${config.pageSize}&cursorId=${cursorId}`
    : `${config.baseUrl}/contact/list`;

  const body = JSON.stringify({
    filter: { $and: [] },
    search: "",
    timezone: config.timezone,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      "User-Agent": "RespondIO-Crawler/1.0",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `API error ${response.status}: ${text}`
    );
  }

  return response.json();
}

export async function fetchAllContacts(
  overrides?: Partial<CrawlerConfig>,
  onProgress?: (fetched: number) => void
): Promise<RespondIOContact[]> {
  const config = buildConfig(overrides);
  const allContacts: RespondIOContact[] = [];
  let cursorId: number | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchContactPage(config, cursorId);
    allContacts.push(...page.items);

    if (onProgress) onProgress(allContacts.length);

    if (page.pagination.next && page.items.length > 0) {
      const lastItem = page.items[page.items.length - 1];
      cursorId = lastItem.id;
      await sleep(config.rateLimitMs);
    } else {
      hasMore = false;
    }
  }

  return allContacts;
}

export async function fetchContactById(
  contactId: number,
  overrides?: Partial<CrawlerConfig>
): Promise<RespondIOContact> {
  const config = buildConfig(overrides);

  const response = await fetch(
    `${config.baseUrl}/contact/id:${contactId}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "User-Agent": "RespondIO-Crawler/1.0",
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function fetchContactsSince(
  sinceTimestamp: number,
  overrides?: Partial<CrawlerConfig>,
  onProgress?: (fetched: number) => void
): Promise<RespondIOContact[]> {
  const config = buildConfig(overrides);
  const contacts: RespondIOContact[] = [];
  let cursorId: number | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchContactPage(config, cursorId);

    for (const contact of page.items) {
      if (contact.created_at >= sinceTimestamp) {
        contacts.push(contact);
      }
    }

    if (onProgress) onProgress(contacts.length);

    const oldestInPage = page.items[page.items.length - 1];
    if (
      !page.pagination.next ||
      page.items.length === 0 ||
      (oldestInPage && oldestInPage.created_at < sinceTimestamp)
    ) {
      hasMore = false;
    } else {
      cursorId = oldestInPage.id;
      await sleep(config.rateLimitMs);
    }
  }

  return contacts;
}
