import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
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
    expect(payload.result.tools).toHaveLength(13);
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining([
        "GET_PRODUCTION_CONTEXT",
        "SAVE_PRODUCTION_RESULT",
        "MARK_PRODUCTION_FAILED",
      ]),
    );
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

describe("SpotPatch administrative configuration", () => {
  const previous = {
    adminToken: process.env.SPOTPATCH_ADMIN_TOKEN,
    provider: process.env.SPOTPATCH_AGENT_PROVIDER,
    baseUrl: process.env.DECO_STUDIO_BASE_URL,
    org: process.env.DECO_STUDIO_ORG,
    apiKey: process.env.DECO_STUDIO_API_KEY,
    investigator: process.env.DECO_STUDIO_INVESTIGATION_AGENT_ID,
    executor: process.env.DECO_STUDIO_EXECUTION_AGENT_ID,
  };

  beforeEach(() => {
    process.env.SPOTPATCH_ADMIN_TOKEN = "test-admin-token";
    process.env.SPOTPATCH_AGENT_PROVIDER = "deco_studio";
    process.env.DECO_STUDIO_BASE_URL = "https://studio.example";
    process.env.DECO_STUDIO_ORG = "example-org";
    process.env.DECO_STUDIO_API_KEY = "secret-value";
    process.env.DECO_STUDIO_INVESTIGATION_AGENT_ID = "investigator";
    process.env.DECO_STUDIO_EXECUTION_AGENT_ID = "executor";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      SPOTPATCH_ADMIN_TOKEN: previous.adminToken,
      SPOTPATCH_AGENT_PROVIDER: previous.provider,
      DECO_STUDIO_BASE_URL: previous.baseUrl,
      DECO_STUDIO_ORG: previous.org,
      DECO_STUDIO_API_KEY: previous.apiKey,
      DECO_STUDIO_INVESTIGATION_AGENT_ID: previous.investigator,
      DECO_STUDIO_EXECUTION_AGENT_ID: previous.executor,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("reports provider readiness without exposing credentials", async () => {
    const response = await handleApiRequest(
      new NextRequest("http://localhost:3001/api/admin/configuration", {
        headers: { "X-SpotPatch-Admin-Token": "test-admin-token" },
      }),
      { params: Promise.resolve({ path: ["admin", "configuration"] }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: { agentProvider: "deco_studio", decoStudioConfigured: true },
    });
    expect(JSON.stringify(payload)).not.toContain("secret-value");
  });
});

describe("GitHub integration webhook", () => {
  const previousSecret = process.env.SPOTPATCH_GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.SPOTPATCH_GITHUB_WEBHOOK_SECRET = "github-webhook-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.SPOTPATCH_GITHUB_WEBHOOK_SECRET;
    else process.env.SPOTPATCH_GITHUB_WEBHOOK_SECRET = previousSecret;
  });

  it("rejects unsigned events", async () => {
    const response = await handleApiRequest(
      new NextRequest("http://localhost:3001/api/integrations/github/webhook", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ path: ["integrations", "github", "webhook"] }) },
    );
    expect(response.status).toBe(401);
  });

  it("accepts a signed non-PR event without changing state", async () => {
    const raw = "{}";
    const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(raw).digest("hex")}`;
    const response = await handleApiRequest(
      new NextRequest("http://localhost:3001/api/integrations/github/webhook", {
        method: "POST",
        headers: { "X-GitHub-Event": "ping", "X-Hub-Signature-256": signature },
        body: raw,
      }),
      { params: Promise.resolve({ path: ["integrations", "github", "webhook"] }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { ignored: true } });
  });
});
