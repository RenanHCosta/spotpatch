import { describe, expect, it } from "vitest";
import {
  assertFeedbackDeletionAllowed,
  assertTransition,
  canTransition,
  investigationTarget,
  validateProductionPolicy,
  validateInvestigationPolicy,
} from "./index";
describe("workflow", () => {
  it("allows declared transitions", () =>
    expect(canTransition("new", "queued_for_investigation")).toBe(true));
  it("rejects direct status jumps", () =>
    expect(() => assertTransition("new", "executing")).toThrow());
  it("allows deleting feedback without active agent runs", () =>
    expect(() => assertFeedbackDeletionAllowed(["completed", "failed"])).not.toThrow());
  it("blocks deleting feedback while an agent run is active", () =>
    expect(() => assertFeedbackDeletionAllowed(["completed", "in_progress"])).toThrow(
      "Feedback cannot be deleted while an agent run is active",
    ));
  it("queues executable investigations automatically", () =>
    expect(
      investigationTarget({
        interpretedRequest: "x",
        summary: "x",
        technicalHypothesis: "x",
        recommendedAction: "x",
        likelyFiles: [],
        riskLevel: "low",
        confidence: 1,
        requiresHumanInput: false,
        questions: [],
        canExecute: true,
      }),
    ).toBe("queued_for_execution"));
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
  it("requires a merged pull request for GitHub production delivery", () =>
    expect(() =>
      validateProductionPolicy(
        {
          summary: "published",
          productionUrl: "https://example.com",
          deploymentId: null,
          pullRequestMerged: false,
          deployedAt: new Date().toISOString(),
        },
        "github",
      ),
    ).toThrow("merge"));
});
