import { describe, expect, it } from "vitest";
import {
  approximateWordCount,
  buildCongratsLine,
  buildMotivationLine,
  buildPrefetchLines,
  buildStartLine,
  clampFloat,
  clampInt,
  CONGRATS_BANK,
  computeMilestones,
  formatMMSS,
  padShortUtterance,
  START_BANK,
} from "./ttsUtils";

describe("ttsUtils", () => {
  it("clamps ints and floats", () => {
    expect(clampInt(0, 1, 5)).toBe(1);
    expect(clampInt(9, 1, 5)).toBe(5);
    expect(clampFloat(1.5, 0.8, 1.2)).toBe(1.2);
  });

  it("formats mm:ss", () => {
    expect(formatMMSS(0)).toBe("00:00");
    expect(formatMMSS(61)).toBe("01:01");
  });

  it("builds start/congrats from random banks", () => {
    const start = buildStartLine();
    expect(typeof start).toBe("string");
    expect(start.length).toBeGreaterThan(0);
    expect(START_BANK).toContain(start);

    const congrats = buildCongratsLine();
    expect(typeof congrats).toBe("string");
    expect(congrats.length).toBeGreaterThan(0);
    expect(CONGRATS_BANK).toContain(congrats);

    expect(buildMotivationLine("Base", "rehab")).toContain("rehab");
  });

  it("pads short utterances", () => {
    const shortText = "Time.";
    const padded = padShortUtterance(shortText);
    expect(approximateWordCount(shortText)).toBeLessThan(10);
    expect(approximateWordCount(padded)).toBeGreaterThanOrEqual(10);
  });

  it("builds prefetch lines with milestones and cadence", () => {
    const lines = buildPrefetchLines(120, "physio");
    const keys = new Set(lines.map((l) => l.key));

    expect(keys.has("start")).toBe(true);
    expect(keys.has("end")).toBe(true);
    expect(keys.has("m25")).toBe(true);
    expect(keys.has("m50")).toBe(true);
    expect(keys.has("m75")).toBe(true);
    expect(keys.has("m90")).toBe(true);
    expect(keys.has("t0")).toBe(true);

    // Should not include regular cadence at milestone timestamps.
    expect(keys.has("t30")).toBe(false);
    expect(keys.has("t60")).toBe(false);
    expect(keys.has("t90")).toBe(false);
  });

  it("keeps milestones within bounds", () => {
    const ms = computeMilestones(37);
    for (const m of ms) {
      expect(m.elapsed).toBeGreaterThanOrEqual(0);
      expect(m.elapsed).toBeLessThanOrEqual(37);
    }
  });
});
