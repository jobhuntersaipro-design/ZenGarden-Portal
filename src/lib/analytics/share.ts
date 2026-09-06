/** One entity folded into the "Other" slice. */
export type ShareMember = {
  id: string;
  label: string;
  value: number;
  /** Percent of the whole, 0-100 — of the whole, not of Other. */
  share: number;
};

export type ShareSlice = {
  id: string;
  label: string;
  value: number;
  /** Percent of the whole, 0-100. */
  share: number;
  isOther: boolean;
  /**
   * What "Other" is hiding, ranked, so the legend can unfold it. Present on
   * the Other slice alone; every other slice is one entity already.
   */
  members?: ShareMember[];
};

/**
 * Top N by value, everything else folded into one "Other (n)" slice.
 *
 * Folding rather than cycling colours is the rule the categorical palette
 * depends on: a ninth slice is never a generated hue.
 */
export function shareBy<Row>(
  rows: Row[],
  key: (row: Row) => { id: string; label: string } | null,
  valueFn: (row: Row) => number,
  topN = 5,
): ShareSlice[] {
  const totals = new Map<string, { label: string; value: number }>();

  for (const row of rows) {
    const identity = key(row);
    if (!identity) continue;
    const entry = totals.get(identity.id) ?? { label: identity.label, value: 0 };
    entry.value += valueFn(row);
    totals.set(identity.id, entry);
  }

  const ranked = [...totals.entries()]
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => b.value - a.value);

  const whole = ranked.reduce((sum, entry) => sum + entry.value, 0);
  const pct = (value: number) => (whole > 0 ? (value / whole) * 100 : 0);

  const top = ranked.slice(0, topN).map((entry) => ({
    id: entry.id,
    label: entry.label,
    value: entry.value,
    share: pct(entry.value),
    isOther: false,
  }));

  const rest = ranked.slice(topN);
  if (rest.length === 0) return top;

  const otherValue = rest.reduce((sum, entry) => sum + entry.value, 0);
  return [
    ...top,
    {
      id: "__other",
      label: `Other (${rest.length})`,
      value: otherValue,
      share: pct(otherValue),
      isOther: true,
      // Kept so the legend can open it. Shares stay percentages of the whole,
      // so an unfolded member reads on the same scale as a top-five slice.
      members: rest.map((entry) => ({
        id: entry.id,
        label: entry.label,
        value: entry.value,
        share: pct(entry.value),
      })),
    },
  ];
}
