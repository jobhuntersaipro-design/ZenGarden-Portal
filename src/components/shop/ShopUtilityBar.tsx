/**
 * The strip above the header — desktop only (`md`+); the mobile top bar
 * carries no equivalent, so this is `hidden md:block` rather than switching
 * content like `ShopHeader` does. Nothing here is interactive.
 */
export function ShopUtilityBar() {
  return (
    <div className="hidden bg-ink text-canvas/80 md:block">
      <div className="mx-auto flex max-w-page items-center justify-between px-md py-xs text-[length:var(--text-caption)] sm:px-lg">
        <span>Wholesale personal care · Malaysia</span>
        <div className="flex items-center gap-lg">
          <span>All prices in MYR</span>
          <span>Sold by the carton</span>
          <span>Sign in only when you order</span>
        </div>
      </div>
    </div>
  );
}
