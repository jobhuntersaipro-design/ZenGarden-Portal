import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLocalOverrides,
  assertSafeForLocalDev,
  DEV_R2_BUCKET,
  isDevelopmentNeon,
  isProductionNeon,
  neonEndpoint,
  parseEnv,
  PRODUCTION_R2_BUCKET,
  serializeEnv,
} from "./preview-env.mjs";

const previewDev = {
  DATABASE_URL:
    "postgresql://user:secret@ep-mute-frog-a1b2c3-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  DIRECT_URL:
    "postgresql://user:secret@ep-mute-frog-a1b2c3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  R2_BUCKET: PRODUCTION_R2_BUCKET,
  APP_URL: "https://preview.example.vercel.app",
  SHOP_HOST: "shop.lovinghandsportal.com",
  AUTH_SECRET: "preview-secret",
  NEON_LOCAL: "1",
};

const production = {
  DATABASE_URL:
    "postgresql://user:secret@ep-polished-wildflower-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
};

describe("neonEndpoint", () => {
  it("extracts the ep- prefix and never needs the password", () => {
    const info = neonEndpoint(previewDev.DATABASE_URL);
    assert.equal(info?.endpoint, "ep-mute-frog-a1b2c3-pooler");
    assert.equal(isDevelopmentNeon(previewDev.DATABASE_URL), true);
    assert.equal(isProductionNeon(previewDev.DATABASE_URL), false);
    assert.equal(isProductionNeon(production.DATABASE_URL), true);
  });
});

describe("assertSafeForLocalDev", () => {
  it("accepts the development branch when it differs from production", () => {
    const result = assertSafeForLocalDev(previewDev, production);
    assert.equal(result.isKnownDevelopment, true);
  });

  it("refuses when Preview is the production endpoint", () => {
    assert.throws(
      () => assertSafeForLocalDev({ ...previewDev, ...production, DIRECT_URL: production.DATABASE_URL }, production),
      /production Neon/,
    );
  });

  it("refuses when Preview and Production share a host", () => {
    const same = {
      DATABASE_URL:
        "postgresql://user:secret@ep-other-branch-pooler.ap-southeast-1.aws.neon.tech/neondb",
      DIRECT_URL:
        "postgresql://user:secret@ep-other-branch.ap-southeast-1.aws.neon.tech/neondb",
    };
    assert.throws(
      () => assertSafeForLocalDev(same, { DATABASE_URL: same.DATABASE_URL }),
      /matches production/,
    );
  });
});

describe("applyLocalOverrides", () => {
  it("forces localhost, the dev R2 bucket, and drops NEON_LOCAL", () => {
    const wired = applyLocalOverrides(previewDev);
    assert.equal(wired.APP_URL, "http://localhost:3000");
    assert.equal(wired.R2_BUCKET, DEV_R2_BUCKET);
    assert.equal(wired.SHOP_HOST, "");
    assert.equal(wired.SHOP_URL, "");
    assert.equal(wired.NEON_LOCAL, undefined);
    assert.equal(wired.AUTH_SECRET, "preview-secret");
  });
});

describe("parseEnv / serializeEnv", () => {
  it("round-trips quoted values without exposing them in errors", () => {
    const text = serializeEnv({ HELLO: 'a "quoted"\nvalue' });
    assert.match(text, /^HELLO="/m);
    assert.doesNotMatch(text, /preview-secret/);
    const parsed = parseEnv(text);
    assert.equal(parsed.HELLO, 'a "quoted"\nvalue');
  });
});
