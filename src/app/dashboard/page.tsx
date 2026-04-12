import {
  loadConversations,
  loadLifecycleEvents,
  getLatestDataDate,
} from "@/lib/dashboard/data-loader";
import {
  computeAdPerformance,
  computeLifecycleByAd,
  computeDailyLifecycleMovement,
  computeDailySummary,
  generateInsights,
} from "@/lib/dashboard/analytics";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const date = getLatestDataDate();
  if (!date) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">No Data Available</h1>
          <p className="mt-2 text-gray-500">
            Run <code className="rounded bg-gray-100 px-2 py-1">npm run crawl:all</code> to fetch data first.
          </p>
        </div>
      </div>
    );
  }

  const conversations = loadConversations(date);
  const lifecycleEvents = loadLifecycleEvents(date);

  const adNameByContact = new Map<number, string>();
  const adNameByContactObj: Record<number, string> = {};
  for (const c of conversations) {
    adNameByContact.set(c.contactId, c.adName ?? "Unknown");
    adNameByContactObj[c.contactId] = c.adName ?? "Unknown";
  }

  const adPerformance = computeAdPerformance(conversations);
  const lifecycleByAd = computeLifecycleByAd(conversations);
  const dailyMovement = computeDailyLifecycleMovement(
    lifecycleEvents,
    adNameByContact
  );
  const dailySummary = computeDailySummary(
    conversations,
    lifecycleEvents,
    adNameByContact
  );
  const insights = generateInsights(adPerformance, dailySummary, conversations);

  const totalLeads = conversations.length;
  const totalWon = adPerformance.reduce((s, a) => s + a.won, 0);
  const totalPending = adPerformance.reduce(
    (s, a) => s + a.pendingInstallation,
    0
  );
  const overallWinRate =
    totalLeads > 0
      ? Math.round(
          ((totalWon + totalPending * 0.7) / totalLeads) * 1000
        ) / 10
      : 0;

  return (
    <DashboardClient
      date={date}
      totalLeads={totalLeads}
      totalWon={totalWon}
      totalPending={totalPending}
      overallWinRate={overallWinRate}
      adPerformance={adPerformance}
      lifecycleByAd={lifecycleByAd}
      dailySummary={dailySummary}
      dailyMovement={dailyMovement}
      insights={insights}
      lifecycleEvents={lifecycleEvents}
      adNameByContact={adNameByContactObj}
    />
  );
}
