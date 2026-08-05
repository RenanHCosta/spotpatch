import { afterEach, describe, expect, it } from "vitest";
import { getOrchestrator } from "./orchestrator";
import { getStore } from "./store";

const previousProvider = process.env.SPOTPATCH_AGENT_PROVIDER;

afterEach(() => {
  if (previousProvider === undefined) delete process.env.SPOTPATCH_AGENT_PROVIDER;
  else process.env.SPOTPATCH_AGENT_PROVIDER = previousProvider;
});

describe("demo delivery workflow", () => {
  it("persists a preview and completes after production", async () => {
    delete process.env.SPOTPATCH_AGENT_PROVIDER;
    const store = getStore();
    const feedback = await store.createFeedback({
      idempotencyKey: crypto.randomUUID(),
      projectId: "11111111-1111-4111-8111-111111111111",
      comment: "Ajustar o botão de compra no mobile",
      category: "visual_bug",
      priority: "medium",
      page: {
        pageUrl: "http://localhost:3000/demo",
        normalizedUrl: "http://localhost:3000/demo",
        hostname: "localhost",
        pathname: "/demo",
        pageTitle: "Demo",
        referrer: null,
        userAgent: "vitest",
        timestamp: new Date().toISOString(),
        viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
        scroll: { x: 0, y: 0 },
        installationId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
      },
      element: {
        tagName: "button",
        textContent: "Comprar",
        cssSelector: "button[data-agent-id='buy']",
        xpath: "//button",
        outerHTML: '<button data-agent-id="buy">Comprar</button>',
        attributes: { "data-agent-id": "buy" },
        classList: [],
        boundingBox: { x: 0, y: 0, top: 0, left: 0, width: 120, height: 40 },
        computedStyles: {},
        parentContext: [],
        nearbyText: "Comprar",
        dataAgentId: "buy",
      },
    });
    const orchestrator = getOrchestrator();
    const investigation = await orchestrator.startInvestigation({
      feedbackId: feedback.id,
      idempotencyKey: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 720));
    await orchestrator.syncRun({ runId: investigation.id, feedbackId: feedback.id });

    const execution = (await store.getFeedback(feedback.id))?.runs.find(
      (run) => run.run_type === "execution" && run.status === "in_progress",
    );
    expect(execution).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 720));
    await orchestrator.syncRun({ runId: execution!.id, feedbackId: feedback.id });

    const pullRequest = await store.getFeedback(feedback.id);
    expect(pullRequest?.status).toBe("pull_request_opened");
    expect(pullRequest?.execution?.previewUrl).toMatch(/^https:\/\/preview\.invalid\//);

    const production = await orchestrator.startProduction({
      feedbackId: feedback.id,
      idempotencyKey: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 720));
    await orchestrator.syncRun({ runId: production.id, feedbackId: feedback.id });

    const completed = await store.getFeedback(feedback.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.execution?.productionUrl).toBe(completed?.project.site_url);
    expect(completed?.events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["production_requested", "production_deployed"]),
    );
  });
});
