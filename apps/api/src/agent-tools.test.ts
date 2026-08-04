import { describe, expect, it } from "vitest";
import {
  agentToolDefinitions,
  executionAgentMessage,
  investigationAgentMessage,
  parseAgentToolArguments,
} from "./agent-tools";

const context = {
  feedbackId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  agentId: "vir_spotpatch_investigator",
};

describe("SpotPatch agent tools", () => {
  it("publishes explicit closed schemas and safety annotations", () => {
    expect(agentToolDefinitions).toHaveLength(10);
    for (const definition of agentToolDefinitions) {
      expect(definition.inputSchema.required).toEqual(
        expect.arrayContaining(["feedbackId", "runId", "agentId"]),
      );
      expect(definition.inputSchema.additionalProperties).toBe(false);
      expect(definition.annotations.openWorldHint).toBe(false);
      expect(definition.description.length).toBeGreaterThan(20);
    }
    expect(
      agentToolDefinitions.find((tool) => tool.name === "SAVE_INVESTIGATION")?.inputSchema
        .properties.result,
    ).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("rejects missing run identity before a tool reaches the store", () => {
    expect(() =>
      parseAgentToolArguments("GET_FEEDBACK_CONTEXT", { feedbackId: context.feedbackId }),
    ).toThrow();
    expect(parseAgentToolArguments("GET_FEEDBACK_CONTEXT", context)).toEqual(context);
  });

  it("puts the complete immutable run context in investigation messages", () => {
    const message = investigationAgentMessage({ ...context, projectId: "project-1" });
    expect(message).toContain(`feedbackId=${context.feedbackId}`);
    expect(message).toContain(`runId=${context.runId}`);
    expect(message).toContain(`agentId=${context.agentId}`);
    expect(message).toContain("SAVE_INVESTIGATION");
    expect(message).toContain("MARK_FEEDBACK_NEEDS_INFORMATION");
  });

  it("puts the complete immutable run context in execution messages", () => {
    const message = executionAgentMessage({ ...context, investigationId: "investigation-1" });
    expect(message).toContain(`feedbackId=${context.feedbackId}`);
    expect(message).toContain(`runId=${context.runId}`);
    expect(message).toContain(`agentId=${context.agentId}`);
    expect(message).toContain("SAVE_EXECUTION_RESULT");
    expect(message).toContain("MARK_EXECUTION_FAILED");
  });
});
