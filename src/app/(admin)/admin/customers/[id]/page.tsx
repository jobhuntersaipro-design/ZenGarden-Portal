import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WebOrderStatus } from "@/generated/prisma/enums";
import { CustomerActivity } from "@/components/admin/CustomerActivity";
import { DeleteCustomer } from "@/components/admin/DeleteCustomer";
import { BuyerContactsCard } from "@/components/buyers/BuyerContactsCard";
import { BuyerDetailsCard } from "@/components/buyers/BuyerDetailsCard";
import { loadCustomerActivity } from "@/lib/queries/customer-activity";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/queries/customer-activity-entries";
import { listBuyerContacts } from "@/lib/queries/clients";
import { firstParam, parsePagination, type SearchParams } from "@/lib/queries/pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadCustomer(id: string) {
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
      // A cart is a `WebOrder` too — `openCart` creates one at DRAFT the
      // moment a signed-in client adds their first item — so this must agree
      // with `deleteBuyer`'s own filter (`src/actions/customers.ts`) or the
      // danger zone would disable Delete and tell the reader an order blocks
      // it when all that happened is an abandoned cart.
      _count: {
        select: {
          purchaseOrders: true,
          webOrders: { where: { status: { not: WebOrderStatus.DRAFT } } },
          contacts: true,
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
  return { title: `${buyer?.name ?? "Customer"} · Loving Hands Portal` };
}

export default async function AdminCustomerPage({
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

  const [buyer, contacts] = await Promise.all([loadCustomer(id), listBuyerContacts(id)]);
  if (!buyer) notFound();

  const activity = await loadCustomerActivity(id, { page, kind });

  return (
    <>
      <Link
        href="/admin/customers"
        className="mb-md inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      >
        ‹ Customers
      </Link>

      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Customer</p>
      <h1 className="mb-lg font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
        {buyer.name}
      </h1>

      <div className="grid gap-lg lg:grid-cols-2">
        {/* `min-w-0` on both grid items: unlike `/buyers/[id]`, which gives
            `BuyerContactsCard` a full-width row of its own, this page puts it
            beside `BuyerDetailsCard` in one two-column grid — the first time
            either card has had to shrink below its content's natural width.
            A grid item's default `min-width: auto` refuses that (the same
            trap flex items fall into), so a shop contact's name/email row
            forced the whole grid — and the page — 13px wider than the
            viewport at 390px. Found by this task's own overflow sweep. */}
        <div className="min-w-0">
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
        </div>
        <div className="min-w-0">
          <BuyerContactsCard buyerId={buyer.id} contacts={contacts} canManage />
        </div>
      </div>

      <div className="mt-lg">
        <CustomerActivity
          entries={activity.entries}
          total={activity.total}
          kind={kind}
          page={page}
          failedWindowHours={activity.failedWindowHours}
        />
      </div>

      <div className="mt-lg">
        <DeleteCustomer
          buyerId={buyer.id}
          name={buyer.name}
          contacts={buyer._count.contacts}
          purchaseOrders={buyer._count.purchaseOrders}
          webOrders={buyer._count.webOrders}
        />
      </div>
    </>
  );
}
