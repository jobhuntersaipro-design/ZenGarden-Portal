# Current Feature

Respond.io Chat Crawler

## Status

In Progress

## Goals

- Crawl all contact/conversation data from Respond.io via API (DONE)
- Extract "Conversation Opened By" field via Playwright browser automation (IN PROGRESS)
- Full crawl + incremental daily mode
- Export to CSV/JSON

## Notes

- API crawl working: 1,582 contacts fetched
- "Conversation Opened By" not available in API, needs Playwright
- Spec file: respond-io-chat-spec.md

## History

- 2026-04-12: API crawler built and first full crawl completed (1,582 contacts)
- 2026-04-12: Starting Playwright automation for "Conversation Opened By" field
