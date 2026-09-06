/** `12,480` — units are whole and grouped, never abbreviated. */
export const formatUnits = (value: number): string =>
  Math.round(value).toLocaleString("en-MY");
