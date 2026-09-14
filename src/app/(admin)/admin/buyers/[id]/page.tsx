import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, WebOrderStatus } from "@/generated/prisma/enums";
import { BuyerActivity } from "@/components/admin/BuyerActivity";
import { DeleteBuyer } from "@/components/admin/DeleteBuyer";
import { BuyerContactsCard } from "@/components/buyers/BuyerContactsCard";
import { BuyerDetailsCard } from "@/components/buyers/BuyerDetailsCard";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Rise } from "@/components/portal/Rise";
import { PersonAvatar } from "@/components/ui/person";
import { formatDate } from "@/lib/dates";
import { loadBuyerActivity } from "@/lib/queries/buyer-activity";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/queries/buyer-activity-entries";
import { listBuyerContacts } from "@/lib/queries/clients";
import { firstParam, parsePagination, type SearchParams } from "@/lib/queries/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadBuyer(id: string) {
  return prisma.buyer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      contactName: true,
      email: true,
      phone: true,
      address: true,
      paymentTerms: true,
      remark: true,
      createdAt: true,
      // A cart is a `WebOrder` too — `openCart` creates one at DRAFT the
      // moment a signed-in client adds their first item — so this must agree
      // with `deleteBuyer`'s own filter (`src/actions/admin-buyers.ts`) or the
      // danger zone would disable Delete and tell the reader an order blocks
      // it when all that happened is an abandoned cart.
      _count: {
        select: {
          purchaseOrders: true,
          webOrders: { where: { status: { not: WebOrderStatus.DRAFT } } },
          // role: CLIENT — matches `listBuyerContacts`'s own filter, or the
          // danger-zone sentence could count a contact the card above it
          // does not list.
          contacts: { where: { role: Role.CLIENT } },
        },
      },
      purchaseOrders: {
        orderBy: { poDate: "asc" },
        take: 1,
        select: { poDate: true },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const buyer = await prisma.buyer.findUnique({ where: { id }, select: { name: true } });
  return { title: `${buyer?.name ?? "Buyer"} · Zen Garden Portal` };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export default async function AdminBuyerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const kindParam = firstParam(query, "kind") as ActivityKind;
  const kind = ACTIVITY_KINDS.includes(kindParam) ? kindParam : "all";
  const { page } = parsePagination(query);

  const [buyer, contacts] = await Promise.all([loadBuyer(id), listBuyerContacts(id)]);
  if (!buyer) notFound();

  const activity = await loadBuyerActivity(id, { page, kind });
  const orders = buyer._count.purchaseOrders + buyer._count.webOrders;
  // "Since" is their first order where there is one, otherwise the day the
  // row was created — a buyer entered from the shop has no PO to date them by.
  const since = buyer.purchaseOrders[0]?.poDate ?? buyer.createdAt;

  return (
    <>
      <Link
        href="/admin/buyers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Buyer management
      </Link>

      {/* The hero: who this is, at a glance, before the cards ask for
          attention. The monogram is the same `PersonAvatar` the table uses,
          so a buyer looks the same here as in the row that led here. */}
      <Rise index={0}>
        {/* Stacked below `sm`: three flex siblings on one 350px line handed the
            name a column a few letters wide and it broke one character per
            line (measured at 390px). */}
        <section className="mb-lg flex flex-col items-start gap-md rounded-lg border border-hairline bg-canvas p-lg sm:flex-row sm:items-center">
          <PersonAvatar name={buyer.name} size="lg" />
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Buyer</p>
            <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink break-words">
              {buyer.name}
            </h1>
            <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
              Since {formatDate(since.toISOString())} · {plural(orders, "order")} ·{" "}
              {plural(buyer._count.contacts, "shop contact")}
            </p>
          </div>
          <Link
            href={`/buyers/${buyer.id}`}
            className="inline-flex min-h-control-md shrink-0 items-center gap-xxs rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
          >
            <LinkSpinner />
            View analytics ›
          </Link>
        </section>
      </Rise>

      <div className="grid gap-lg lg:grid-cols-2">
        {/* `min-w-0` on both grid items: unlike `/buyers/[id]`, which gives
            `BuyerContactsCard` a full-width row of its own, this page puts it
            beside `BuyerDetailsCard` in one two-column grid — the first time
            either card has had to shrink below its content's natural width.
            A grid item's default `min-width: auto` refuses that (the same
            trap flex items fall into), so a shop contact's name/email row
            forced the whole grid — and the page — 13px wider than the
            viewport at 390px. Found by Phase 25's own overflow sweep. */}
        <Rise index={1} className="min-w-0">
          <BuyerDetailsCard
            buyer={{
              id: buyer.id,
              name: buyer.name,
              contactName: buyer.contactName,
              email: buyer.email,
              phone: buyer.phone,
              address: buyer.address,
              paymentTerms: buyer.paymentTerms,
              remark: buyer.remark,
              since: buyer.purchaseOrders[0]?.poDate.toISOString() ?? null,
            }}
            // This route is super-admin-only twice over: the layout redirects
            // and the proxy 404s. Anyone rendering this can rename.
            canRename
          />
        </Rise>
        <Rise index={2} className="min-w-0">
          <BuyerContactsCard buyerId={buyer.id} contacts={contacts} canManage />
        </Rise>
      </div>

      <Rise index={3} className="mt-lg">
        <BuyerActivity
          entries={activity.entries}
          total={activity.total}
          kind={kind}
          page={page}
          failedWindowHours={activity.failedWindowHours}
        />
      </Rise>

      <Rise index={4} className="mt-lg">
        <DeleteBuyer
          buyerId={buyer.id}
          name={buyer.name}
          contacts={buyer._count.contacts}
          purchaseOrders={buyer._count.purchaseOrders}
          webOrders={buyer._count.webOrders}
        />
      </Rise>
    </>
  );
}
