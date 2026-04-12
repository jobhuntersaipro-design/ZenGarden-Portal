"use client";

import type { Insight } from "@/lib/dashboard/types";

const ICONS: Record<string, string> = {
  success: "checkmark",
  warning: "warning",
  info: "info",
  trend: "trending",
};

const STYLES: Record<string, string> = {
  success: "border-green-200 bg-green-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-blue-200 bg-blue-50",
  trend: "border-purple-200 bg-purple-50",
};

const ICON_STYLES: Record<string, string> = {
  success: "text-green-600",
  warning: "text-amber-600",
  info: "text-blue-600",
  trend: "text-purple-600",
};

interface Props {
  insights: Insight[];
}

export default function InsightPanel({ insights }: Props) {
  if (!insights.length) return null;

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <div
          key={i}
          className={`rounded-lg border p-4 ${STYLES[insight.type] ?? STYLES.info}`}
        >
          <div className="flex items-start gap-3">
            <span className={`text-lg ${ICON_STYLES[insight.type] ?? ""}`}>
              {insight.type === "success" && "✅"}
              {insight.type === "warning" && "⚠️"}
              {insight.type === "info" && "ℹ️"}
              {insight.type === "trend" && "📈"}
            </span>
            <div>
              <h4 className="font-semibold text-gray-900">{insight.title}</h4>
              <p className="mt-0.5 text-sm text-gray-600">
                {insight.description}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
