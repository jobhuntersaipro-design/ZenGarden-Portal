import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  PO_STAGES,
  buyerStage,
  holdStage,
  isFinalStage,
  nextStage,
  prevStage,
  stageColorVar,
  stageIndex,
  stageLabel,
  stagesUpTo,
} from "@/lib/po-stages";

describe("PO_STAGES", () => {
  it("covers every enum member exactly once, in order", () => {
    expect([...PO_STAGES]).toEqual(Object.values(PoStage));
    expect(new Set(PO_STAGES).size).toBe(PO_STAGES.length);
  });
});

describe("stageLabel", () => {
  it("is sentence case, not the enum name", () => {
    expect(stageLabel(PoStage.IN_PRODUCTION)).toBe("In production");
    expect(stageLabel(PoStage.QC_PASSED)).toBe("Production done - QC hold");
  });

  it("labels every stage", () => {
    for (const stage of PO_STAGES) expect(stageLabel(stage)).toBeTruthy();
  });
});

describe("stageColorVar", () => {
  it("maps stages to the palette tokens in order, the hold its own", () => {
    expect(PO_STAGES.map(stageColorVar)).toEqual([
      "--color-stage-1",
      "--color-stage-2",
      "--color-stage-hold",
      "--color-stage-3",
      "--color-stage-4",
      "--color-stage-5",
      "--color-stage-6",
    ]);
  });
});

describe("nextStage", () => {
  it("advances one step", () => {
    expect(nextStage(PoStage.ORDER_PLACED)).toBe(PoStage.IN_PRODUCTION);
  });

  it("stops at delivered", () => {
    expect(nextStage(PoStage.DELIVERED)).toBeNull();
    expect(isFinalStage(PoStage.DELIVERED)).toBe(true);
    expect(isFinalStage(PoStage.DELIVERING)).toBe(false);
  });
});

describe("stagesUpTo", () => {
  it("is inclusive of the current stage", () => {
    expect(stagesUpTo(PoStage.QC_PASSED)).toEqual([
      PoStage.ORDER_PLACED,
      PoStage.IN_PRODUCTION,
      PoStage.QC_HOLD,
      PoStage.QC_PASSED,
    ]);
  });

  it("returns one entry at the start and every stage at the end", () => {
    expect(stagesUpTo(PoStage.ORDER_PLACED)).toHaveLength(1);
    expect(stagesUpTo(PoStage.DELIVERED)).toHaveLength(7);
    expect(stageIndex(PoStage.DELIVERED)).toBe(6);
  });
});

describe("prevStage", () => {
  it("walks back one stage", () => {
    expect(prevStage(PoStage.QC_PASSED)).toBe(PoStage.IN_PRODUCTION);
    expect(prevStage(PoStage.DELIVERED)).toBe(PoStage.DELIVERING);
  });

  it("has nowhere to go from the first stage", () => {
    expect(prevStage(PoStage.ORDER_PLACED)).toBeNull();
  });

  it("is the inverse of nextStage everywhere it is defined", () => {
    for (const stage of PO_STAGES) {
      const next = nextStage(stage);
      // A release from QC hold goes back to In production, not to the hold.
      if (next && stage !== PoStage.QC_HOLD) expect(prevStage(next)).toBe(stage);
    }
  });
});

// Phase 67.
describe("QC hold", () => {
  it("is a detour: In production passes straight to QC passed", () => {
    expect(nextStage(PoStage.IN_PRODUCTION)).toBe(PoStage.QC_PASSED);
    expect(holdStage(PoStage.IN_PRODUCTION)).toBe(PoStage.QC_HOLD);
    expect(holdStage(PoStage.QC_PASSED)).toBeNull();
    expect(nextStage(PoStage.QC_HOLD)).toBe(PoStage.QC_PASSED);
    expect(prevStage(PoStage.QC_HOLD)).toBe(PoStage.IN_PRODUCTION);
  });
});

describe("buyerStage", () => {
  it("shows a buyer the last of their four stages the order has reached", () => {
    expect(PO_STAGES.map(buyerStage)).toEqual([
      PoStage.ORDER_PLACED,
      PoStage.ORDER_PLACED,
      PoStage.ORDER_PLACED,
      PoStage.QC_PASSED,
      PoStage.QC_PASSED,
      PoStage.DELIVERING,
      PoStage.DELIVERED,
    ]);
  });
});
