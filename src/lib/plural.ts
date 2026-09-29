/**
 * "1 buyer", "2 buyers", "1,200 cartons" (S-20, 2026-09-29). A count label
 * written as `${n} buyers` reads "1 buyers" on exactly the rows a reader is
 * most likely to look at — a product one customer buys — so every count of a
 * thing goes through here. The number is grouped the way the rest of the
 * portal groups it.
 */
export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count.toLocaleString("en-MY")} ${count === 1 ? noun : many}`;
}
