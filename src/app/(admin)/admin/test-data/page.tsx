import type { Metadata } from "next";
import { TestDataCard } from "@/components/admin/TestDataCard";
import { countTestData, isProduction } from "@/lib/test-data";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = { title: "Test data · Zen Garden Portal" };
export const dynamic = "force-dynamic";

async function TestDataPage() {
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

export default withLoadingFloor(TestDataPage);
