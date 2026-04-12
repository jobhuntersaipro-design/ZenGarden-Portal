export const LIFECYCLE_MAP: Record<number, string> = {
  678125: "New Lead",
  678126: "Plan Selected",
  678127: "Supporting Document Pending",
  678128: "Installation Done",
  678129: "Cold Lead",
  678626: "Supporting Document Submitted",
  686914: "Closing Script Agreed - Pending Human",
  686915: "Pending Installation",
  714695: "Pending Demand",
  722885: "Pending Transfer Request",
  741711: "Installation Done - Pending Free Gift",
  741712: "Installation Done - Free Gift Done",
  766841: "Follow Up",
};

export const LIFECYCLE_ORDER = [
  "New Lead",
  "Plan Selected",
  "Supporting Document Pending",
  "Supporting Document Submitted",
  "Closing Script Agreed - Pending Human",
  "Pending Demand",
  "Pending Installation",
  "Pending Transfer Request",
  "Installation Done",
  "Installation Done - Pending Free Gift",
  "Installation Done - Free Gift Done",
  "Follow Up",
  "Cold Lead",
];

export interface LifecycleEvent {
  contactId: number;
  lifecycleId: number;
  lifecycleName: string;
  previousLifecycleId: number | null;
  previousLifecycleName: string | null;
  timestamp: number;
  date: string;
  source: string | null;
}

export interface ConversationRecord {
  contactId: number;
  firstName: string;
  lastName: string;
  phone: string;
  lifecycle: string;
  conversationOpenedBy: string;
  adPlatform: string | null;
  adName: string | null;
  adId: string | null;
  status: string;
  assignee: string;
  conversationTimestamp: string;
  lifecycleHistory: LifecycleEvent[];
}

export interface AdPerformance {
  adName: string;
  total: number;
  won: number;
  pendingInstallation: number;
  weightedWins: number;
  winRate: number;
  lifecycleCounts: Record<string, number>;
}

export interface DailyMovement {
  date: string;
  adName: string;
  lifecycle: string;
  count: number;
}

export interface DailySummary {
  date: string;
  newLeads: number;
  conversions: number;
  totalMovements: number;
  byAd: Record<string, { newLeads: number; conversions: number }>;
}

export interface Insight {
  type: "success" | "warning" | "info" | "trend";
  title: string;
  description: string;
}
