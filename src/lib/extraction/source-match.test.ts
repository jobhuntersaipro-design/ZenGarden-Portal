import { describe, expect, it } from "vitest";
import { markSources, sourceRanges } from "@/lib/extraction/source-match";

describe("sourceRanges", () => {
  it("finds a money figure printed with separators and a currency", () => {
    expect(sourceRanges("RM 70,680.00", [{ kind: "money", value: "70680.00" }])).toEqual([[3, 12]]);
    expect(sourceRanges("RM 70,680.01", [{ kind: "money", value: "70680.00" }])).toEqual([]);
  });

  it("never marks a zero, which is everywhere", () => {
    expect(sourceRanges("Sales tax 0.00", [{ kind: "money", value: "0.00" }])).toEqual([]);
  });

  it("finds an ISO date in the layout the document printed", () => {
    expect(sourceRanges("Date: 02-Oct-26", [{ kind: "date", value: "2026-10-02" }])).toEqual([[6, 15]]);
    expect(sourceRanges("2 October 2026", [{ kind: "date", value: "2026-10-02" }])).toEqual([[0, 14]]);
    expect(sourceRanges("02/10/2026", [{ kind: "date", value: "2026-10-02" }])).toEqual([[0, 10]]);
  });

  it("matches text without regard to case", () => {
    expect(sourceRanges("PO. Number: po-lhm-and-018-26", [{ kind: "text", value: "PO-LHM-AND-018-26" }])).toEqual([[12, 29]]);
  });

  it("marks a long item printed shorter than the value, not a short one", () => {
    const buyer = [{ kind: "text" as const, value: "PT. AKSES NUSANTARA DISTRIBUSI" }];
    expect(sourceRanges("AKSES NUSANTARA DISTRIBUSI", buyer)).toEqual([[0, 26]]);
    expect(sourceRanges("PT.", buyer)).toEqual([]);
  });

  it("merges overlapping ranges from several sources", () => {
    expect(
      sourceRanges("RM 6.20 RM 6.20", [
        { kind: "money", value: "6.20" },
        { kind: "text", value: "RM 6.20" },
      ]),
    ).toEqual([[0, 7], [8, 15]]);
  });
});

describe("markSources", () => {
  it("wraps the match and escapes the rest", () => {
    expect(markSources("<b> RM 9.00", [{ kind: "money", value: "9" }], "m")).toBe(
      '&lt;b&gt; RM <mark class="m">9.00</mark>',
    );
  });
});
