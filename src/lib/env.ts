import { z } from "zod";

/**
 * Parsed once at import time; a missing key fails the build rather than
 * surfacing as undefined at runtime. Keys mirror docs/specs/00-master.md §6.
 */
const emptyAsUndefined = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), inner.optional());

const schema = z.object({
  // App
  APP_URL: z.url(),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  // .env.example ships these blank, and "" is not absent to Zod, so an unset
  // optional would otherwise fail validation on a fresh clone.
  AUTO_APPROVE_DOMAIN: emptyAsUndefined(z.string()),
  SEED_SUPER_ADMIN_EMAIL: emptyAsUndefined(z.email()),

  // Neon
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),

  // Resend
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),
  EXTRACTION_MODEL: z.string().min(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment. Check .env.local against .env.example:\n${missing}`,
  );
}

export const env = parsed.data;
