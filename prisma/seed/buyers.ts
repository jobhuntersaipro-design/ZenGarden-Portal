/**
 * Eleven buyers, per the design reference §5. The first three carry roughly
 * 55% of value — `weight` drives how often they order, `valueScale` how large
 * those orders run.
 */
export const BUYERS = [
  { name: "Acme Industrial Sdn Bhd", weight: 11, valueScale: 1.35, terms: "30 days" },
  { name: "Northwind Traders", weight: 10, valueScale: 1.3, terms: "30 days" },
  { name: "Kelana Steel", weight: 9, valueScale: 1.25, terms: "45 days" },
  { name: "Sunway Packaging", weight: 6, valueScale: 0.9, terms: "30 days" },
  { name: "Bluewave Logistics", weight: 6, valueScale: 0.85, terms: "14 days" },
  { name: "Meridian Chemicals", weight: 5, valueScale: 0.85, terms: "30 days" },
  { name: "Orchid Textiles", weight: 5, valueScale: 0.8, terms: "30 days" },
  { name: "Tanjung Electrical", weight: 5, valueScale: 0.8, terms: "60 days" },
  { name: "Pacific Timber", weight: 4, valueScale: 0.8, terms: "30 days" },
  { name: "Selatan Plastics", weight: 4, valueScale: 0.75, terms: "14 days" },
  { name: "Hexa Components", weight: 4, valueScale: 0.75, terms: "30 days" },
] as const;

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 14);

export const buyerContact = (name: string) => ({
  email: `orders@${slug(name)}.com.my`,
  phone: "+60 3-7890 1234",
});
