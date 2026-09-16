import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AddProductToListing } from "@/components/admin/AddProductToListing";
import { ListingMembers } from "@/components/admin/ListingMembers";
import { Rise } from "@/components/portal/Rise";
import { loadListing, productsOutsideFamily } from "@/lib/queries/product-families";

export const metadata: Metadata = { title: "Listing · Zen Garden Portal" };
export const dynamic = "force-dynamic";

/**
 * One listing, as the buyer meets it (Phase 40).
 *
 * A family in one market is one card on the shop, so this page is sectioned
 * by market: each section is a card, and what it holds is what that card
 * offers. Before this there was nowhere to see a listing whole — membership
 * could only be read and changed one product at a time, from the product.
 */
export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [listing, candidates] = await Promise.all([
    loadListing(id),
    productsOutsideFamily(id),
  ]);
  if (!listing) notFound();

  const variants = listing.markets.reduce((sum, section) => sum + section.members.length, 0);

  return (
    <>
      <Rise index={0} className="mb-lg">
        <Link
          href="/admin/catalogue"
          className="text-[length:var(--text-caption)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          ← Catalogue
        </Link>
        <p className="mt-xs font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {listing.code}
          {listing.brand ? ` · ${listing.brand}` : ""} · {listing.category}
          {listing.size ? ` · ${listing.size}` : ""}
        </p>
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
          {listing.name}
        </h1>
        <p className="mt-xxs max-w-[62ch] text-[length:var(--text-body-sm)] text-ink-secondary">
          {variants} {variants === 1 ? "variant" : "variants"} across{" "}
          {listing.markets.length}{" "}
          {listing.markets.length === 1 ? "market" : "markets"}. Each market is one
          card on the shop; hiding a variant takes it off that card without
          deleting it.
        </p>
      </Rise>

      <div className="flex flex-col gap-lg">
        {listing.markets.map((section, index) => (
          <Rise key={section.market ?? ""} index={index + 1} className="min-w-0">
            <ListingMembers market={section.market} members={section.members} />
          </Rise>
        ))}

        <Rise index={listing.markets.length + 1} className="min-w-0">
          <section className="rounded-lg border border-hairline bg-canvas p-md">
            <AddProductToListing familyId={listing.id} candidates={candidates} />
          </section>
        </Rise>
      </div>
    </>
  );
}
