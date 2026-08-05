import { expect, test, type APIRequestContext } from "@playwright/test";

const apiUrl = "http://localhost:3001";
const adminHeaders = { "X-SpotPatch-Admin-Token": "e2e-admin-token" };
const projectId = "11111111-1111-4111-8111-111111111111";

function feedbackPayload() {
  const installationId = crypto.randomUUID();
  return {
    idempotencyKey: crypto.randomUUID(),
    projectId,
    comment: "No mobile, faça este botão ocupar toda a largura.",
    category: "ux_improvement",
    priority: "medium",
    page: {
      pageUrl: "http://localhost:3000/demo",
      normalizedUrl: "http://localhost:3000/demo",
      hostname: "localhost",
      pathname: "/demo",
      pageTitle: "SpotPatch demo",
      referrer: null,
      userAgent: "Playwright",
      timestamp: new Date().toISOString(),
      viewport: { width: 390, height: 844, devicePixelRatio: 1 },
      scroll: { x: 0, y: 0 },
      installationId,
      sessionId: crypto.randomUUID(),
    },
    element: {
      tagName: "button",
      textContent: "Comprar",
      cssSelector: '[data-agent-id="product-buy-button"]',
      xpath: "/html[1]/body[1]/main[1]/button[1]",
      outerHTML: '<button data-agent-id="product-buy-button">Comprar</button>',
      attributes: { "data-agent-id": "product-buy-button" },
      classList: ["buy-button"],
      boundingBox: { x: 10, y: 300, top: 300, left: 10, width: 180, height: 44 },
      computedStyles: { display: "inline-flex", width: "180px" },
      parentContext: [],
      nearbyText: "Tênis Orbit R$ 489 Comprar",
      dataAgentId: "product-buy-button",
    },
  };
}

async function createFeedback(request: APIRequestContext) {
  const response = await request.post(`${apiUrl}/api/public/feedback`, { data: feedbackPayload() });
  expect(response.status()).toBe(201);
  return (await response.json()).data as { id: string; number: number };
}

test("resolves configured and rejects unknown domains", async ({ request }) => {
  const resolved = await request.get(`${apiUrl}/api/public/projects/resolve?hostname=localhost`);
  expect(resolved.ok()).toBeTruthy();
  expect((await resolved.json()).data).toMatchObject({ projectId, enabled: true });
  const unknown = await request.get(
    `${apiUrl}/api/public/projects/resolve?hostname=evil-example.com`,
  );
  expect(unknown.status()).toBe(404);
});

test("creates feedback, lists markers and completes demo workflow", async ({ request }) => {
  const feedback = await createFeedback(request);
  const markers = await request.get(
    `${apiUrl}/api/public/feedback/page?projectId=${projectId}&url=${encodeURIComponent("http://localhost:3000/demo")}`,
  );
  expect((await markers.json()).data).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: feedback.id })]),
  );
  const unauthorized = await request.get(`${apiUrl}/api/admin/feedback`);
  expect(unauthorized.ok()).toBeFalsy();
  const investigate = await request.post(
    `${apiUrl}/api/admin/feedback/${feedback.id}/investigate`,
    { headers: adminHeaders, data: {} },
  );
  const run = (await investigate.json()).data as { id: string };
  await new Promise((resolve) => setTimeout(resolve, 800));
  await request.post(`${apiUrl}/api/admin/runs/${run.id}/sync`, {
    headers: adminHeaders,
    data: { feedbackId: feedback.id },
  });
  let detail = await request.get(`${apiUrl}/api/admin/feedback/${feedback.id}`, {
    headers: adminHeaders,
  });
  const investigatingDetail = (await detail.json()).data as {
    status: string;
    runs: Array<{ id: string; run_type: string }>;
  };
  expect(investigatingDetail.status).toBe("executing");
  const executionRun = investigatingDetail.runs.find((item) => item.run_type === "execution");
  expect(executionRun).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 800));
  await request.post(`${apiUrl}/api/admin/runs/${executionRun!.id}/sync`, {
    headers: adminHeaders,
    data: { feedbackId: feedback.id },
  });
  detail = await request.get(`${apiUrl}/api/admin/feedback/${feedback.id}`, {
    headers: adminHeaders,
  });
  expect((await detail.json()).data).toMatchObject({
    status: "pull_request_opened",
    execution: { pullRequestUrl: expect.stringContaining(".invalid") },
  });
});

test("dashboard asks for token and exposes backlog after access", async ({ page }) => {
  await page.goto("/backlog");
  await expect(page.getByText("Acesso administrativo")).toBeVisible();
  await page.getByLabel("SPOTPATCH_ADMIN_TOKEN").fill("e2e-admin-token");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Feedbacks" })).toBeVisible();
});

test("rejects feedback and resumes after an information request", async ({ request }) => {
  const rejected = await createFeedback(request);
  const rejection = await request.post(`${apiUrl}/api/admin/feedback/${rejected.id}/reject`, {
    headers: adminHeaders,
    data: { reason: "Duplicado" },
  });
  expect((await rejection.json()).data.status).toBe("rejected");

  const pending = await createFeedback(request);
  const started = await request.post(`${apiUrl}/api/admin/feedback/${pending.id}/investigate`, {
    headers: adminHeaders,
    data: {},
  });
  const run = (await started.json()).data as { id: string; agent_id: string };
  const saved = await request.post(`${apiUrl}/api/agents/mcp`, {
    headers: { Authorization: "Bearer e2e-agent-secret" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "SAVE_INVESTIGATION",
        arguments: {
          feedbackId: pending.id,
          runId: run.id,
          agentId: run.agent_id,
          result: {
            interpretedRequest: "Ajustar botão",
            summary: "Falta confirmar o breakpoint.",
            technicalHypothesis: "Regra responsiva indefinida.",
            recommendedAction: "Confirmar breakpoint com o operador.",
            likelyFiles: [],
            riskLevel: "low",
            confidence: 0.6,
            requiresHumanInput: true,
            questions: ["Qual breakpoint deve ser usado?"],
            canExecute: false,
          },
        },
      },
    },
  });
  expect(saved.ok()).toBeTruthy();
  expect((await saved.json()).result).toMatchObject({
    structuredContent: expect.objectContaining({ id: expect.any(String) }),
  });
  const response = await request.post(`${apiUrl}/api/admin/feedback/${pending.id}/respond`, {
    headers: adminHeaders,
    data: { response: "Use 768px." },
  });
  expect(response.status()).toBe(202);
  expect((await response.json()).data.status).toBe("in_progress");
});
