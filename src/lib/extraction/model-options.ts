// No server imports: the Settings card reads this list in the browser.

/** The only account that may change the model (asked for 2026-10-09). */
export const MODEL_OWNER_EMAIL = "jobhunters.ai.pro@gmail.com";

export const isModelOwner = (email: string) =>
  email.toLowerCase() === MODEL_OWNER_EMAIL;

/** Each reads PDFs and images and supports structured outputs. */
export const EXTRACTION_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-fable-5-1", label: "Fable 5.1" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
] as const;

export const isExtractionModel = (id: string) =>
  EXTRACTION_MODELS.some((m) => m.id === id);
