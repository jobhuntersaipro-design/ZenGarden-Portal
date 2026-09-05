# Project Overview — Loving Hands Portal

Loving Hands sells landscaping products (stone, plants, timber, water features) to
business buyers in Malaysia. Buyers send purchase orders as PDF or image
attachments. The portal turns those attachments into structured records and
gives the ops team sales, fulfillment, buyer and product views on top of them.

Core loop: **Upload → Extract (Claude) → Review → Confirm → Fulfil (6 stages) → Browse.**

- Users: a small internal ops team, one organisation, two roles (Member, Super admin).
- Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn primitives,
  Prisma 7 on Neon Postgres, Cloudflare R2 for files, Resend for email, Auth.js v5
  (Google + email/password), Claude Sonnet 5 for extraction, Recharts, Vitest. Hosted on Vercel.
- Currency MYR only. Files PDF/PNG/JPG up to 20 MB.
- Visual design: Claude Design canvas linked from `CLAUDE.md`; design system in `context/design-system.md`.
- Specs for coders: `docs/specs/00-master.md` first, then one phase file per feature branch.
- The earlier Respond.io chat crawler and `/dashboard` are retired in Phase 01.
