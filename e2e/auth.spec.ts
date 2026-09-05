import { expect, test } from "@playwright/test";

/**
 * The seeded member (prisma/seed.ts) carries `mustChangePassword`, which is
 * what makes this the interesting path: sign in, get pushed to the change
 * form, change it, land in the portal (docs/specs/02-auth.md §7).
 */
const EMAIL = "aisha@lovinghandsportal.com";
const SEEDED_PASSWORD = "Password123!";
const NEW_PASSWORD = `E2e-${Date.now()}-1`;

test("a signed-out visitor is sent to sign in and returned afterwards", async ({
  page,
}) => {
  await page.goto("/purchase-orders");
  await expect(page).toHaveURL(/\/signin\?next=%2Fpurchase-orders/);
  await expect(page.getByRole("heading", { name: "Sign in to Loving Hands" })).toBeVisible();
});

test("the sign-in card signposts both paths", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByText("Members", { exact: true })).toBeVisible();
  await expect(page.getByText("New here?", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Use Continue with Google to request access. An admin approves it."),
  ).toBeVisible();
});

test("a wrong password never says which half was wrong", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-it-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
});

test("the seeded member is forced to change the password, then lands in the portal", async ({
  page,
}) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(SEEDED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/account\/password/);
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  // The forced case does not ask for the current password.
  await expect(page.getByLabel("Current password")).toHaveCount(0);

  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});
