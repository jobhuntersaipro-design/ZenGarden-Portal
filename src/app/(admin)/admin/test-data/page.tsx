import type { Metadata } from "next";
import { TestDataCard } from "@/components/admin/TestDataCard";
import { countTestData, isProduction } from "@/lib/test-data";

export const metadata: Metadata = { title: "Test data · Zen Garden Portal" };
export const dynamic = "force-dynamic";

export default async function TestDataPage() {
  const counts = await countTestData();

  return (
    <>
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Testing
      </p>
      <h1 className="mb-lg font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
        Test data
      </h1>

      <TestDataCard counts={counts} production={isProduction()} />
    </>
  );
}
