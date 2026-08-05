import { describe, expect, it } from "vitest";
import { executionResultSchema, investigationResultSchema, productionResultSchema } from "./index";

describe("agent result schemas", () => {
  it("rejects investigation confidence outside 0..1", () => {
    expect(() =>
      investigationResultSchema.parse({
        interpretedRequest: "x",
        summary: "x",
        technicalHypothesis: "x",
        recommendedAction: "x",
        likelyFiles: [],
        riskLevel: "low",
        confidence: 1.1,
        requiresHumanInput: false,
        questions: [],
        canExecute: true,
      }),
    ).toThrow();
  });

  it("requires a valid execution contract", () => {
    expect(() => executionResultSchema.parse({ summary: "incomplete" })).toThrow();
  });

  it("requires a verified production URL and timestamp", () => {
    expect(
      productionResultSchema.parse({
        summary: "published",
        productionUrl: "https://example.com",
        deploymentId: "deployment-1",
        pullRequestMerged: true,
        deployedAt: new Date().toISOString(),
      }),
    ).toMatchObject({ pullRequestMerged: true });
  });
});
