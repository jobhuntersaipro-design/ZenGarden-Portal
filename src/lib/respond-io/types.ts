export interface RespondIOCustomField {
  name: string;
  value: string | null;
}

export interface RespondIOAssignee {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface RespondIOContact {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  profilePic: string | null;
  locale: string | null;
  countryCode: string | null;
  status: "open" | "closed";
  isBlocked: boolean;
  custom_fields: RespondIOCustomField[];
  tags: string[];
  assignee: RespondIOAssignee | null;
  lifecycle: string | null;
  created_at: number;
}

export interface RespondIOPagination {
  next: string | null;
  previous: string | null;
}

export interface RespondIOContactListResponse {
  items: RespondIOContact[];
  pagination: RespondIOPagination;
}

export interface CrawlerConfig {
  apiToken: string;
  spaceId: string;
  baseUrl: string;
  pageSize: number;
  timezone: string;
  rateLimitMs: number;
}

export interface CrawlResult {
  contacts: RespondIOContact[];
  totalFetched: number;
  crawledAt: string;
  durationMs: number;
}
