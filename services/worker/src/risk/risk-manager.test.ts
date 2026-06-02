import { describe, expect, it } from "vitest";
import { requiredConfidence } from "./risk-manager";

describe("requiredConfidence ramp", () => {
  const BASE = 67;
  const CAP = 10;

  it("returns the base score below the soft cap", () => {
    for (let open = 0; open < CAP; open += 1) {
      expect(requiredConfidence(open, BASE, CAP)).toBe(BASE);
    }
  });

  it("steps up by 1 for each open trade at or past the soft cap", () => {
    expect(requiredConfidence(10, BASE, CAP)).toBe(68);
    expect(requiredConfidence(11, BASE, CAP)).toBe(69);
    expect(requiredConfidence(12, BASE, CAP)).toBe(70);
    expect(requiredConfidence(20, BASE, CAP)).toBe(78);
  });

  it("resets to base once the open count falls back under the cap", () => {
    // The function is stateless — a lower open count yields the base again.
    expect(requiredConfidence(15, BASE, CAP)).toBe(73);
    expect(requiredConfidence(9, BASE, CAP)).toBe(BASE);
  });

  it("never drops below the base for tiny books", () => {
    expect(requiredConfidence(0, BASE, CAP)).toBe(BASE);
    expect(requiredConfidence(1, BASE, CAP)).toBe(BASE);
  });
});
