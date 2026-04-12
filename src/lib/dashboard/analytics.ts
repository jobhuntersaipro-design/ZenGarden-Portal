import type {
  ConversationRecord,
  LifecycleEvent,
  AdPerformance,
  DailyMovement,
  DailySummary,
  Insight,
} from "./types";
import { LIFECYCLE_ORDER } from "./types";

export function computeAdPerformance(
  conversations: ConversationRecord[]
): AdPerformance[] {
  const byAd = new Map<string, ConversationRecord[]>();

  for (const c of conversations) {
    const ad = c.adName ?? "Unknown";
    const arr = byAd.get(ad) ?? [];
    arr.push(c);
    byAd.set(ad, arr);
  }

  const results: AdPerformance[] = [];
  for (const [adName, convos] of byAd) {
    const lifecycleCounts: Record<string, number> = {};
    for (const c of convos) {
      const lc = c.lifecycle || "Unknown";
      lifecycleCounts[lc] = (lifecycleCounts[lc] ?? 0) + 1;
    }

    const won =
      (lifecycleCounts["Installation Done"] ?? 0) +
      (lifecycleCounts["Installation Done - Free Gift Done"] ?? 0) +
      (lifecycleCounts["Installation Done - Pending Free Gift"] ?? 0);
    const pending = lifecycleCounts["Pending Installation"] ?? 0;
    const weightedWins = won + pending * 0.7;
    const total = convos.length;

    results.push({
      adName,
      total,
      won,
      pendingInstallation: pending,
      weightedWins: Math.round(weightedWins * 10) / 10,
      winRate: total > 0 ? Math.round((weightedWins / total) * 1000) / 10 : 0,
      lifecycleCounts,
    });
  }

  return results.sort((a, b) => b.total - a.total);
}

export function computeLifecycleByAd(
  conversations: ConversationRecord[]
): { adName: string; lifecycle: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of conversations) {
    const key = `${c.adName ?? "Unknown"}||${c.lifecycle || "Unknown"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [adName, lifecycle] = key.split("||");
    return { adName, lifecycle, count };
  });
}

export function computeDailyLifecycleMovement(
  events: LifecycleEvent[],
  adNameByContact: Map<number, string>
): DailyMovement[] {
  const counts = new Map<string, number>();

  for (const evt of events) {
    const ad = adNameByContact.get(evt.contactId) ?? "Unknown";
    const key = `${evt.date}||${ad}||${evt.lifecycleName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, count]) => {
      const [date, adName, lifecycle] = key.split("||");
      return { date, adName, lifecycle, count };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeDailySummary(
  conversations: ConversationRecord[],
  events: LifecycleEvent[],
  adNameByContact: Map<number, string>
): DailySummary[] {
  const summaryMap = new Map<string, DailySummary>();

  // New leads by conversation date
  for (const c of conversations) {
    const date = c.conversationTimestamp
      ? c.conversationTimestamp.split("T")[0]
      : "";
    if (!date) continue;

    if (!summaryMap.has(date)) {
      summaryMap.set(date, {
        date,
        newLeads: 0,
        conversions: 0,
        totalMovements: 0,
        byAd: {},
      });
    }

    const s = summaryMap.get(date)!;
    s.newLeads++;

    const ad = c.adName ?? "Unknown";
    if (!s.byAd[ad]) s.byAd[ad] = { newLeads: 0, conversions: 0 };
    s.byAd[ad].newLeads++;
  }

  // Lifecycle movements by event date
  const winStages = new Set([
    "Installation Done",
    "Installation Done - Free Gift Done",
    "Installation Done - Pending Free Gift",
  ]);

  for (const evt of events) {
    const date = evt.date;
    if (!date) continue;

    if (!summaryMap.has(date)) {
      summaryMap.set(date, {
        date,
        newLeads: 0,
        conversions: 0,
        totalMovements: 0,
        byAd: {},
      });
    }

    const s = summaryMap.get(date)!;
    s.totalMovements++;

    if (winStages.has(evt.lifecycleName)) {
      s.conversions++;
      const ad = adNameByContact.get(evt.contactId) ?? "Unknown";
      if (!s.byAd[ad]) s.byAd[ad] = { newLeads: 0, conversions: 0 };
      s.byAd[ad].conversions++;
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

export function generateInsights(
  adPerformance: AdPerformance[],
  dailySummary: DailySummary[],
  conversations: ConversationRecord[]
): Insight[] {
  const insights: Insight[] = [];
  const validAds = adPerformance.filter((a) => a.total >= 5);

  // Best performing ad by win rate
  if (validAds.length > 0) {
    const best = validAds.reduce((a, b) =>
      a.winRate > b.winRate ? a : b
    );
    insights.push({
      type: "success",
      title: `Best Ad: ${best.adName}`,
      description: `${best.winRate}% win rate with ${best.total} leads. ${best.won} installations done, ${best.pendingInstallation} pending.`,
    });
  }

  // Worst performing ad
  if (validAds.length > 1) {
    const worst = validAds.reduce((a, b) =>
      a.winRate < b.winRate ? a : b
    );
    if (worst.winRate < 5) {
      insights.push({
        type: "warning",
        title: `Low Performer: ${worst.adName}`,
        description: `Only ${worst.winRate}% win rate from ${worst.total} leads. Consider pausing or optimizing this ad.`,
      });
    }
  }

  // Lifecycle bottleneck
  const allLifecycles: Record<string, number> = {};
  for (const c of conversations) {
    const lc = c.lifecycle || "Unknown";
    allLifecycles[lc] = (allLifecycles[lc] ?? 0) + 1;
  }

  const coldLeads = allLifecycles["Cold Lead"] ?? 0;
  const total = conversations.length;
  if (total > 0 && coldLeads / total > 0.2) {
    insights.push({
      type: "warning",
      title: `${Math.round((coldLeads / total) * 100)}% are Cold Leads`,
      description: `${coldLeads} of ${total} contacts are cold. Review follow-up strategy and response times.`,
    });
  }

  // New Lead volume
  const newLeads = allLifecycles["New Lead"] ?? 0;
  if (newLeads > 0) {
    insights.push({
      type: "info",
      title: `${newLeads} New Leads in pipeline`,
      description: `${Math.round((newLeads / total) * 100)}% of contacts haven't progressed past New Lead. Quick follow-up can improve conversion.`,
    });
  }

  // Ad source split
  const googleCount = conversations.filter(
    (c) => c.conversationOpenedBy === "contact"
  ).length;
  const metaCount = conversations.filter(
    (c) => c.conversationOpenedBy === "ctc_ads"
  ).length;
  if (googleCount > 0 && metaCount > 0) {
    const googlePct = Math.round((googleCount / total) * 100);
    const metaPct = Math.round((metaCount / total) * 100);
    insights.push({
      type: "info",
      title: `Traffic Split: Google ${googlePct}% vs Meta ${metaPct}%`,
      description: `Google Ads drives ${googleCount} leads, Meta ads drive ${metaCount} leads. Compare cost-per-lead to optimize budget allocation.`,
    });
  }

  // Daily trend
  const recent = dailySummary.slice(-7);
  if (recent.length >= 3) {
    const firstHalf = recent
      .slice(0, Math.floor(recent.length / 2))
      .reduce((s, d) => s + d.newLeads, 0);
    const secondHalf = recent
      .slice(Math.floor(recent.length / 2))
      .reduce((s, d) => s + d.newLeads, 0);
    if (secondHalf > firstHalf * 1.2) {
      insights.push({
        type: "trend",
        title: "Lead Volume Trending Up",
        description: `Recent days show increasing lead volume. Ensure team capacity can handle the growth.`,
      });
    } else if (secondHalf < firstHalf * 0.8) {
      insights.push({
        type: "trend",
        title: "Lead Volume Declining",
        description: `Recent lead volume is dropping. Review ad spend and campaign performance.`,
      });
    }
  }

  // Lifecycle ordering for pipeline progression
  const pipelineStages = LIFECYCLE_ORDER.filter(
    (s) => !["Cold Lead", "Follow Up"].includes(s)
  );
  for (let i = 1; i < pipelineStages.length - 1; i++) {
    const current = allLifecycles[pipelineStages[i]] ?? 0;
    const prev = allLifecycles[pipelineStages[i - 1]] ?? 0;
    if (prev > 0 && current === 0 && prev > 10) {
      insights.push({
        type: "warning",
        title: `Bottleneck at ${pipelineStages[i]}`,
        description: `${prev} contacts in "${pipelineStages[i - 1]}" but none moved to "${pipelineStages[i]}". Check process flow.`,
      });
    }
  }

  return insights;
}
