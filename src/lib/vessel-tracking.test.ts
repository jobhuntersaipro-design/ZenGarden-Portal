import { describe, expect, it } from "vitest";
import { vesselName, vesselSearchUrl } from "@/lib/vessel-tracking";

describe("vesselName", () => {
  it.each([
    ["HG SKYLINE V. CS10G0S89", "HG SKYLINE"],
    ["DANUM 172 / 72123W", "DANUM 172"],
    ["KOTA LAYANG VOY 123N", "KOTA LAYANG"],
    ["MAERSK EMDEN V.245E", "MAERSK EMDEN"],
    ["  EVER GIVEN  ", "EVER GIVEN"],
    // A V inside a name is not a voyage.
    ["VIVALDI", "VIVALDI"],
    ["SEA VOYAGER", "SEA VOYAGER"],
  ])("%s → %s", (printed, name) => expect(vesselName(printed)).toBe(name));
});

describe("vesselSearchUrl", () => {
  it("searches VesselFinder by the name alone", () => {
    expect(vesselSearchUrl("HG SKYLINE V. CS10G0S89")).toBe(
      "https://www.vesselfinder.com/vessels?name=HG%20SKYLINE",
    );
  });
  it("gives no link for nothing", () => {
    expect(vesselSearchUrl(" / 123")).toBeNull();
  });
});
