/**
 * mulberry32 — small, fast, and identical across runs. Seeded once in seed.ts
 * so every screen, filter and KPI agrees between re-seeds.
 */
export const SEED = 20260904;

export function createRng(seed: number = SEED) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const float = (min: number, max: number) => min + next() * (max - min);
  const int = (min: number, max: number) => Math.floor(float(min, max + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
  const chance = (probability: number) => next() < probability;

  /** Index into `weights`, proportional to weight. */
  const weighted = (weights: readonly number[]): number => {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let target = next() * total;
    for (let i = 0; i < weights.length; i++) {
      target -= weights[i];
      if (target <= 0) return i;
    }
    return weights.length - 1;
  };

  /** Deterministic 24-char id, so re-seeding reproduces the same rows. */
  const id = (prefix: string): string => {
    let out = "";
    while (out.length < 20) out += Math.floor(next() * 36 ** 6).toString(36).padStart(6, "0");
    return `${prefix}${out.slice(0, 20)}`;
  };

  return { next, float, int, pick, chance, weighted, id };
}

export type Rng = ReturnType<typeof createRng>;
