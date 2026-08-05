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

describe("SpotPatch feedback deletion", () => {
  const previousAdminToken = process.env.SPOTPATCH_ADMIN_TOKEN;

  beforeEach(() => {
    process.env.SPOTPATCH_ADMIN_TOKEN = "test-admin-token";
  });

  afterEach(() => {
    if (previousAdminToken === undefined) delete process.env.SPOTPATCH_ADMIN_TOKEN;
    else process.env.SPOTPATCH_ADMIN_TOKEN = previousAdminToken;
  });

  it("removes a feedback from administrative listings", async () => {
    const createResponse = await handleApiRequest(
      new NextRequest("http://localhost:3001/api/public/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          projectId: "11111111-1111-4111-8111-111111111111",
          comment: "Remover este feedback do board",
          category: "visual_bug",
          priority: "medium",
          page: {
            pageUrl: "http://localhost:3000/demo",
            normalizedUrl: "http://localhost:3000/demo",
            hostname: "localhost",
            pathname: "/demo",
            pageTitle: "Demo",
            referrer: null,
            userAgent: "Vitest",
            timestamp: new Date().toISOString(),
            viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
            scroll: { x: 0, y: 0 },
            installationId: crypto.randomUUID(),
            sessionId: crypto.randomUUID(),
          },
          element: {
            tagName: "button",
            textContent: "Comprar",
            cssSelector: "button.buy",
            xpath: "/html/body/button",
            outerHTML: '<button class="buy">Comprar</button>',
            attributes: { class: "buy" },
            classList: ["buy"],
            boundingBox: { x: 0, y: 0, top: 0, left: 0, width: 100, height: 40 },
            computedStyles: { display: "block" },
            parentContext: [],
            nearbyText: "Comprar",
            dataAgentId: null,
          },
        }),
      }),
      { params: Promise.resolve({ path: ["public", "feedback"] }) },
    );
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);

    const feedbackId = created.data.id as string;
    const deleteResponse = await handleApiRequest(
      new NextRequest(`http://localhost:3001/api/admin/feedback/${feedbackId}`, {
        method: "DELETE",
        headers: { "X-SpotPatch-Admin-Token": "test-admin-token" },
      }),
      { params: Promise.resolve({ path: ["admin", "feedback", feedbackId] }) },
    );
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ success: true, data: { id: feedbackId } });

    const listResponse = await handleApiRequest(
      new NextRequest("http://localhost:3001/api/admin/feedback", {
        headers: { "X-SpotPatch-Admin-Token": "test-admin-token" },
      }),
      { params: Promise.resolve({ path: ["admin", "feedback"] }) },
    );
    const list = await listResponse.json();
    expect(list.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: feedbackId })]));

    const detailResponse = await handleApiRequest(
      new NextRequest(`http://localhost:3001/api/admin/feedback/${feedbackId}`, {
        headers: { "X-SpotPatch-Admin-Token": "test-admin-token" },
      }),
      { params: Promise.resolve({ path: ["admin", "feedback", feedbackId] }) },
    );
    expect(detailResponse.status).toBe(404);
  });
});
