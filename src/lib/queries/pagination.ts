/** 10 / 30 / 50 per page, default 10 (design reference §4). */
export const PAGE_SIZES = [10, 30, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type SortDirection = "asc" | "desc";

export type Pagination = {
  page: number;
  size: number;
  skip: number;
  take: number;
};

export type SearchParams = Record<string, string | string[] | undefined>;

/** `?a=1&a=2` is a user typing in the address bar; the first value wins. */
export function firstParam(
  params: SearchParams,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Page and size out of the URL, clamped to something the database can serve.
 * A hand-edited `?size=100000` must not become an unbounded query.
 */
export function parsePagination(params: SearchParams): Pagination {
  const rawSize = Number.parseInt(firstParam(params, "size") ?? "", 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : DEFAULT_PAGE_SIZE;

  const rawPage = Number.parseInt(firstParam(params, "page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  return { page, size, skip: (page - 1) * size, take: size };
}

export type Sort<Key extends string = string> = {
  key: Key;
  dir: SortDirection;
};

/**
 * `?sort=&dir=` against an allow-list. The allow-list is what makes this safe
 * to interpolate into an ORDER BY: a key that is not in it never reaches SQL.
 */
export function parseSort<Key extends string>(
  params: SearchParams,
  allowed: readonly Key[],
  fallback: Sort<Key>,
): Sort<Key> {
  const key = firstParam(params, "sort");
  const dir = firstParam(params, "dir");
  return {
    key: allowed.includes(key as Key) ? (key as Key) : fallback.key,
    dir: dir === "asc" || dir === "desc" ? dir : fallback.dir,
  };
}

/**
 * The footer's "1–10 of 408". `to` is clamped to the total so the last page
 * does not claim rows it has not got.
 */
export function pageRange(page: number, size: number, total: number) {
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const pages = Math.max(1, Math.ceil(total / size));
  return { from, to, pages };
}
