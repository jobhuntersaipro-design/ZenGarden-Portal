/**
 * The welcome card's words, and the rule that keeps them from repeating
 * (2026-09-24, "show a warm welcome message when user login to portal …
 * randomised, not repeated frequently").
 *
 * Pure, so the rule can be tested without a browser: which line comes next is
 * decided here, and the component only stores what it was told.
 */

export const WELCOME_MESSAGES: readonly string[] = [
  "Every order you move along is a shelf somewhere that stays full. Thank you.",
  "Small steps, done well, add up to a great week. Let's take the first one.",
  "Buyers notice when things just work — and that's you making it happen.",
  "Today's a fresh page. Here's to smooth orders and good news.",
  "The best teams look after each other first. Check in with someone today.",
  "Progress beats perfect. Pick one thing and see it through.",
  "Every carton that leaves on time started with someone like you paying attention.",
  "You're part of why Zen Garden is on shelves across the region.",
  "A clear head does better work than a rushed one. Take a breath — you've got this.",
  "Good work is quiet. Thank you for all the parts nobody sees.",
  "One tidy order today saves three phone calls tomorrow.",
  "Great things are built one confirmed PO at a time.",
  "Your care shows up in every delivery. Have a good one.",
  "Stuck on something? Ask a teammate — two heads are faster than one.",
  "Start with the hardest task first — the rest of the day gets lighter.",
  "A late order caught early is a customer kept happy. Nice eye.",
  "Celebrate the small wins today. They count.",
  "Behind every product on the shelf is a team that got it there. That's us.",
  "Focus on what you can move today. Tomorrow can wait its turn.",
  "Kindness is contagious — pass a little on to the next person you talk to.",
  "Consistency wins. Showing up like this is how good weeks are made.",
  "The dashboard tells the numbers. You're the story behind them.",
  "Deep breath, clear list, one thing at a time. You've done this before.",
  "Every buyer who orders again is trusting the work you did last time.",
  "Remember to stand up, stretch and drink some water today.",
  "Well done for being here. The rest is just one step after another.",
  "Good planning is a gift to your future self. Enjoy giving it.",
  "Mistakes are how we get better. Fix it, learn it, move on.",
  "Let's make today the kind of day you're glad you had.",
  "Thank you for keeping things moving. It doesn't go unnoticed.",
];

/**
 * How many of the most recent lines are held back from the draw. A third of
 * the list: someone signing in twice a day sees a line again at the earliest
 * after five days, and the draw still has twenty to choose from, so it never
 * turns into a fixed rota.
 */
export const RECENT_WINDOW = 10;

/** "Good morning" by the hour in Kuala Lumpur, the business's clock. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The next line: a random one of those not shown recently. `random` is
 * injected so a test can pin the draw. A `recent` naming every line (it
 * cannot, with the window a third of the list, but a stored value is outside
 * this code's control) falls back to the whole list rather than to nothing.
 */
export function pickWelcome(
  recent: readonly number[],
  random: () => number = Math.random,
  count: number = WELCOME_MESSAGES.length,
): number {
  const held = new Set(recent.slice(-RECENT_WINDOW));
  const pool = Array.from({ length: count }, (_, i) => i).filter(
    (i) => !held.has(i),
  );
  const from = pool.length > 0 ? pool : Array.from({ length: count }, (_, i) => i);
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))];
}

/** The history with `index` appended, trimmed to the window. */
export function rememberShown(recent: readonly number[], index: number): number[] {
  return [...recent.filter((i) => i !== index), index].slice(-RECENT_WINDOW);
}

/**
 * A stored history, read defensively: it lives in the browser and can hold
 * anything, from another version of this list to a hand edit.
 */
export function parseRecent(raw: string | null, count = WELCOME_MESSAGES.length): number[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (i): i is number => Number.isInteger(i) && i >= 0 && i < count,
    );
  } catch {
    return [];
  }
}
