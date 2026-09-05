import { describe, expect, it } from "vitest";
import { summariseQueue } from "@/components/upload/summarise-queue";
import type { UploadRow, UploadStatus } from "@/components/upload/queue-types";

const row = (status: UploadStatus, over: Partial<UploadRow> = {}): UploadRow => ({
  id: `row-${Math.random()}`,
  file: null,
  name: "PO.pdf",
  size: 1000,
  status,
  progress: 100,
  ...over,
});

const ready = (id: string) => row("ready", { extractionId: id });

describe("summariseQueue", () => {
  it("counts only ready rows", () => {
    const summary = summariseQueue([
      ready("e1"),
      ready("e2"),
      ready("e3"),
      row("uploading"),
      row("failed"),
    ]);
    // Acceptance criterion 8, quoted back verbatim.
    expect(summary.ready).toBe(3);
    expect(summary.excluded).toBe("1 still uploading · 1 failed");
  });

  it("names extraction separately from upload", () => {
    const summary = summariseQueue([ready("e1"), row("extracting"), row("uploading")]);
    expect(summary.excluded).toBe("1 still uploading · 1 still extracting");
  });

  it("says nothing when nothing is excluded", () => {
    expect(summariseQueue([ready("e1"), ready("e2")]).excluded).toBeNull();
  });

  it("does not count a row whose extraction failed as ready", () => {
    // The bug this function exists to prevent: an upload that landed but could
    // not be read must never be offered for review.
    const summary = summariseQueue([
      ready("e1"),
      row("failed", { extractionId: "e2", reason: "Could not read the PDF" }),
    ]);
    expect(summary.ready).toBe(1);
    expect(summary.readyIds).toEqual(["e1"]);
    expect(summary.excluded).toBe("1 failed");
  });

  it("does not count a ready row with no extraction to open", () => {
    const summary = summariseQueue([row("ready"), ready("e2")]);
    expect(summary.readyIds).toEqual(["e2"]);
  });

  it("keeps the on-screen order so Review 1 of 3 follows the list", () => {
    expect(summariseQueue([ready("a"), row("failed"), ready("b")]).readyIds).toEqual([
      "a",
      "b",
    ]);
  });

  it("reports zero for an all-failed queue", () => {
    const summary = summariseQueue([row("failed"), row("failed")]);
    expect(summary.ready).toBe(0);
    expect(summary.excluded).toBe("2 failed");
  });
});
