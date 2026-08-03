import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, validateInvestigationPolicy } from "./index";
describe("workflow", () => {
  it("allows declared transitions", () =>
    expect(canTransition("new", "queued_for_investigation")).toBe(true));
  it("rejects direct status jumps", () =>
    expect(() => assertTransition("new", "executing")).toThrow());
  it("blocks sensitive investigations", () =>
    expect(
      validateInvestigationPolicy({
        interpretedRequest: "x",
        summary: "x",
        technicalHypothesis: "x",
        recommendedAction: "x",
        likelyFiles: [{ path: ".env", reason: "x", confidence: 1 }],
        riskLevel: "low",
        confidence: 1,
        requiresHumanInput: false,
        questions: [],
        canExecute: true,
      }).canExecute,
    ).toBe(false));
});
