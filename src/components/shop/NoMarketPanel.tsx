/**
 * What a signed-in contact sees when nobody has given their buyer a market.
 *
 * The alternative was an empty grid, and an empty grid is the worse failure:
 * it reads as "Zen Garden sells nothing" or as a broken page, and the reader
 * has no way to find out which. This says what has happened, that it is ours
 * to fix rather than theirs, and what to do — so the first person it happens
 * to gets an answer instead of filing a bug.
 *
 * It is one component rather than a line on each screen, so the home page,
 * the catalogue, a product page and the cart cannot drift into saying three
 * different things about one state.
 */
export function NoMarketPanel({
  /** What the reader was trying to do, so the heading fits the screen. */
  heading = "Your catalogue isn’t ready yet",
}: {
  heading?: string;
}) {
  return (
    <section className="mx-auto max-w-prose rounded-lg border border-hairline bg-canvas px-md py-xl text-center">
      <h1 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
        {heading}
      </h1>
      <p className="mt-sm text-[length:var(--text-body-md)] text-ink-secondary">
        Your account isn’t assigned to a market, so there are no products to show
        you. Our team sets this up — nothing is wrong with your sign-in.
      </p>
      <p className="mt-sm text-[length:var(--text-body-sm)] text-ink-tertiary">
        Get in touch with your Zen Garden contact and we’ll open your catalogue.
      </p>
    </section>
  );
}
