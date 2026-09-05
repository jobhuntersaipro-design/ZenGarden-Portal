import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  PO_STAGES,
  isFinalStage,
  nextStage,
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
    expect(stageLabel(PoStage.QC_PASSED)).toBe("QC passed");
  });

  it("labels every stage", () => {
    for (const stage of PO_STAGES) expect(stageLabel(stage)).toBeTruthy();
  });
});

describe("stageColorVar", () => {
  it("maps stages to the six palette tokens in order", () => {
    expect(PO_STAGES.map(stageColorVar)).toEqual([
      "--color-stage-1",
      "--color-stage-2",
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
      PoStage.QC_PASSED,
    ]);
  });

  it("returns one entry at the start and all six at the end", () => {
    expect(stagesUpTo(PoStage.ORDER_PLACED)).toHaveLength(1);
    expect(stagesUpTo(PoStage.DELIVERED)).toHaveLength(6);
    expect(stageIndex(PoStage.DELIVERED)).toBe(5);
  });
});
