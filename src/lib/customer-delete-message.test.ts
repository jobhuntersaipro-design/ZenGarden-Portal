import { describe, expect, it } from "vitest";
import { blockedMessage } from "@/lib/customer-delete-message";

describe("blockedMessage", () => {
  it("agrees the verb with exactly one purchase order", () => {
    expect(blockedMessage(1, 0)).toBe(
      "1 purchase order references this customer, so it can't be deleted. Disable their shop contacts instead.",
    );
  });

  it("agrees the verb with exactly one shop order", () => {
    expect(blockedMessage(0, 1)).toBe(
      "1 shop order references this customer, so it can't be deleted. Disable their shop contacts instead.",
    );
  });

  it("uses the plural verb for one of each (two references)", () => {
    expect(blockedMessage(1, 1)).toBe(
      "1 purchase order and 1 shop order reference this customer, so it can't be deleted. Disable their shop contacts instead.",
    );
  });

  it("uses the plural verb and plural nouns for several", () => {
    expect(blockedMessage(3, 2)).toBe(
      "3 purchase orders and 2 shop orders reference this customer, so it can't be deleted. Disable their shop contacts instead.",
    );
  });
});
