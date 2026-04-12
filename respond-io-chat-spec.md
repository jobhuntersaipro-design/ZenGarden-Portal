# Respond.io Chat Crawler Spec

## Overview

Crawler to extract all contact/conversation data from Respond.io inbox via their Developer API v2.

**Target:** Space `379161` | Inbox `426902394`
**API Base:** `https://api.respond.io/v2`
**Auth:** Bearer token (workspace-level)

## Status: IMPLEMENTED

First full crawl completed on 2026-04-12 — **1,582 contacts** fetched in ~8 seconds.

## Data Extracted (Per Contact)

| # | Field | Source | Example |
|---|-------|--------|---------|
| 1 | **id** | API | `426902394` |
| 2 | **firstName** | API | `Azimah` |
| 3 | **lastName** | API | `Cookies` |
| 4 | **phone** | API | `+60196029249` |
| 5 | **email** | API | `badd8585@gmail.com` |
| 6 | **countryCode** | API | `MY` |
| 7 | **status** | API | `open`, `closed`, `done` |
| 8 | **isBlocked** | API | `false` |
| 9 | **lifecycle** | API | `New Lead`, `Plan Selected`, etc. |
| 10 | **assignee_name** | API | `Unifi - Sofie` |
| 11 | **assignee_email** | API | `louis.cclin@gmail.com` |
| 12 | **tags** | API | comma-separated |
| 13 | **created_at** | API | ISO timestamp |
| 14 | **installation_address** | custom_field | Full address text |
| 15 | **selected_package** | custom_field | `UniVerse 300  300Mbps (RM129/mth)` |
| 16 | **package_type** | custom_field | `Residential Fibre` |
| 17 | **package_price** | custom_field | — |
| 18 | **ic_passport_number** | custom_field | `880910105548` |
| 19 | **installation_date** | custom_field | — |
| 20 | **installation_status** | custom_field | — |
| 21 | **free_gift** | custom_field | — |
| 22 | **free_gift_price** | custom_field | — |
| 23 | **ads_source** | custom_field | — |

### Limitation: "Conversation Opened By"

The Respond.io Developer API v2 does **not** expose "conversation opened by" data (who/what triggered the conversation). This is only visible in the UI activity log. To get this field, a Playwright browser automation approach would be needed as a future enhancement.

## Lifecycle Distribution (2026-04-12)

| Lifecycle | Count |
|-----------|-------|
| New Lead | 879 |
| Cold Lead | 345 |
| Plan Selected | 168 |
| Pending Installation | 66 |
| Follow Up | 29 |
| Supporting Document Submitted | 26 |
| Pending Demand | 21 |
| Installation Done | 20 |
| Supporting Document Pending | 11 |
| Closing Script Agreed - Pending Human | 10 |
| Pending Transfer Request | 6 |
| Installation Done - Free Gift Done | 1 |

## Assignee Distribution

| Assignee | Count |
|----------|-------|
| Unifi - Sofie | 1,360 |
| Louis Lin | 221 |
| Chris lam | 1 |

## API Details

### Endpoint: List Contacts

```
POST https://api.respond.io/v2/contact/list
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
User-Agent: RespondIO-Crawler/1.0
```

**Body:**
```json
{
  "filter": { "$and": [] },
  "search": "",
  "timezone": "Asia/Kuala_Lumpur"
}
```

**Pagination:** Cursor-based via `?limit=100&cursorId=<lastId>`. The `pagination.next` URL is returned in the response.

### Endpoint: Get Contact

```
GET https://api.respond.io/v2/contact/id:<contactId>
```

## File Structure

```
src/lib/respond-io/
  types.ts       # TypeScript interfaces for all API types
  client.ts      # API client (fetchAllContacts, fetchContactsSince, fetchContactById)
  export.ts      # CSV/JSON export + crawl metadata tracking
  crawl.ts       # CLI runner (full + incremental modes)
```

## Usage

```bash
# Full crawl (all contacts, all time)
npm run crawl

# Incremental crawl (only contacts since last crawl)
npm run crawl:incremental
```

Output goes to `data/` directory:
- `contacts-full-YYYY-MM-DD.csv` — full export
- `contacts-full-YYYY-MM-DD.json` — full export with metadata
- `contacts-incremental-YYYY-MM-DD.csv` — daily delta
- `crawl-meta.json` — tracks last crawl timestamp for incremental runs

## Environment Variables

```env
RESPOND_IO_API_TOKEN=<bearer-token>    # Required
RESPOND_IO_SPACE_ID=379161             # Required
```

Stored in `.env.local` (gitignored).

## Dependencies

- `tsx` (devDependency) — runs TypeScript directly without compilation

## Recurring Schedule

For daily incremental crawl, add a cron job or CI schedule:

```bash
# Every day at 8am MYT (midnight UTC)
0 0 * * * cd /path/to/project && npm run crawl:incremental
```

## Future Enhancements

- [ ] **"Conversation Opened By"** — requires Playwright browser automation (not in API)
- [ ] **Message history** — send/receive message endpoints exist but conversation listing is not in API
- [ ] **Dashboard integration** — display crawl data in the Next.js app
- [ ] **Automated alerts** — notify when lifecycle changes or new leads spike
