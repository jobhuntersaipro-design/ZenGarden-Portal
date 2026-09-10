import { Package, Search, Truck, type LucideIcon } from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Search,
    title: "Browse without an account",
    body: "Every price is on the page. Nothing is hidden behind a login.",
  },
  {
    icon: Package,
    title: "Order by the carton",
    body: "Pick cartons, not pieces — the pack size is shown on every product.",
  },
  {
    icon: Truck,
    title: "We confirm, then deliver",
    body: "Your order reaches our team, who confirm it and come back to you.",
  },
];

export function HowItWorks() {
  return (
    <div className="grid gap-md sm:grid-cols-3">
      {STEPS.map((step) => (
        <div
          key={step.title}
          className="flex items-start gap-sm rounded-lg border border-hairline p-md"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-soft">
            <step.icon className="size-5 text-ink" aria-hidden />
          </div>
          <div>
            <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">
              {step.title}
            </p>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              {step.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
