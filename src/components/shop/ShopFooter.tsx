import Link from "next/link";
import { Wordmark } from "@/components/portal/Wordmark";
import { env } from "@/lib/env";
import { shopHref } from "@/lib/shop-routes";

const FOOTER_LINK =
  "text-[length:var(--text-caption)] text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * A server component — it reads `SUPPLIER_*` from `env` directly, unlike
 * `ShopAccountMenu`'s "Talk to our team" row, which is client and takes
 * `supplierEmail` as a prop from `ShopHeader` for exactly that reason.
 */
export function ShopFooter({ categories }: { categories: string[] }) {
  const shopCategories = categories.slice(0, 3);

  return (
    <footer className="mt-xxl border-t border-hairline bg-surface">
      <div className="mx-auto grid max-w-page grid-cols-1 gap-lg px-md py-xl sm:grid-cols-2 sm:px-lg md:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
            Personal care goods, sold by the carton to businesses across Malaysia.
          </p>
        </div>

        <div className="flex flex-col gap-xs">
          <p className="text-[length:var(--text-caption)] font-semibold text-ink">Shop</p>
          <Link href={shopHref.catalogue()} className={FOOTER_LINK}>
            All products
          </Link>
          {shopCategories.map((category) => (
            <Link key={category} href={shopHref.catalogue({ category })} className={FOOTER_LINK}>
              {category}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-xs">
          <p className="text-[length:var(--text-caption)] font-semibold text-ink">Your account</p>
          <Link href={shopHref.signIn()} className={FOOTER_LINK}>
            Sign in
          </Link>
          <Link href={shopHref.orders()} className={FOOTER_LINK}>
            My orders
          </Link>
          {/* Phase 18 points this at /checkout; this phase it is the same
              sign-in the account column already offers. */}
          <Link href={shopHref.signIn()} className={FOOTER_LINK}>
            Request an account
          </Link>
        </div>

        <div className="flex flex-col gap-xs">
          <p className="text-[length:var(--text-caption)] font-semibold text-ink">Contact</p>
          {env.SUPPLIER_PHONE ? (
            <p className="text-[length:var(--text-caption)] text-ink-secondary">
              {env.SUPPLIER_PHONE}
            </p>
          ) : null}
          {env.SUPPLIER_EMAIL ? (
            <p className="text-[length:var(--text-caption)] text-ink-secondary">
              {env.SUPPLIER_EMAIL}
            </p>
          ) : null}
          {env.SUPPLIER_ADDRESS ? (
            <p className="whitespace-pre-line text-[length:var(--text-caption)] text-ink-secondary">
              {env.SUPPLIER_ADDRESS}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto max-w-page px-md py-sm text-[length:var(--text-caption)] text-ink-tertiary sm:px-lg">
          © 2026 Loving Hands. All prices in Malaysian Ringgit.
        </div>
      </div>
    </footer>
  );
}
