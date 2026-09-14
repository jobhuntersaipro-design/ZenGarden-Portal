# Project Overview — Zen Garden Portal

Zen Garden sells personal care goods — shower cream and gel, hand wash and
soap, hair and body care, sanitizer, dishwash, laundry detergent and fragrance
— to business buyers in Malaysia, under its own brand and others including
MR. KING and L.HANDS, and for export markets as well as named retail customers.
Buyers send purchase orders as PDF or image attachments. The portal turns
those attachments into structured records and gives the ops team sales,
fulfillment, buyer and product views on top of them.

Core loop: **Upload → Extract (Claude) → Review → Confirm → Fulfil (6 stages) → Browse.**

- Users: a small internal ops team, one organisation, two roles (Member, Super admin).
- Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn primitives,
  Prisma 7 on Neon Postgres, Cloudflare R2 for files, Resend for email, Auth.js v5
  (Google + email/password), Claude Sonnet 5 for extraction, Recharts, Vitest. Hosted on Vercel.
- Currency MYR only. Files PDF/PNG/JPG up to 20 MB. Products are sold by the
  carton, and a product's `market` is its destination or its retail customer —
  never its country of origin.
- **The landscaping catalogue in `prisma/seed.ts` is fiction**, left from the
  project's first days. The real catalogue was imported from the customer's own
  inventory sheet (`scripts/import-catalog.ts`); `PRODUCT_CATEGORIES` in
  `src/lib/product-categories.ts` is the true category list.
- Visual design: Claude Design canvas linked from `CLAUDE.md`; design system in `context/design-system.md`.
- Specs for coders: `docs/specs/00-master.md` first, then one phase file per feature branch.
- The earlier Respond.io chat crawler and `/dashboard` are retired in Phase 01.
