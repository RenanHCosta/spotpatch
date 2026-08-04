import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { handleApiRequest } from "./server";

const endpoint = "http://localhost:3001/api/agents/mcp";

function rpc(body: Record<string, unknown>) {
  return handleApiRequest(
    new NextRequest(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-agent-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: ["agents", "mcp"] }) },
  );
}

describe("SpotPatch MCP endpoint", () => {
  const previousSecret = process.env.SPOTPATCH_AGENT_TOOLS_SECRET;

  beforeEach(() => {
    process.env.SPOTPATCH_AGENT_TOOLS_SECRET = "test-agent-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.SPOTPATCH_AGENT_TOOLS_SECRET;
    else process.env.SPOTPATCH_AGENT_TOOLS_SECRET = previousSecret;
  });

  it("negotiates initialization and tool capabilities", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "spotpatch-agent-tools" },
      },
    });
  });

  it("accepts the initialized notification without requiring an id", async () => {
    const response = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("lists explicit tool schemas", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: "tools", method: "tools/list" });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.result.tools).toHaveLength(10);
    expect(payload.result.tools[0].inputSchema.required).toEqual(
      expect.arrayContaining(["feedbackId", "runId", "agentId"]),
    );
  });

  it("returns argument validation as an MCP tool error", async () => {
    const response = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "GET_FEEDBACK_CONTEXT", arguments: {} },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: { isError: true, content: [{ type: "text" }] },
    });
  });
});
