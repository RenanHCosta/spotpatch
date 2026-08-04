import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  executionResultSchema,
  fail,
  feedbackCreateSchema,
  investigationResultSchema,
  ok,
  type Project,
} from "@spotpatch/shared";
import {
  consumeRateLimit,
  matchesDomain,
  normalizeUrl,
  validateAdminToken,
  verifyAgentSignature,
} from "@spotpatch/security";
import {
  assertTransition,
  investigationTarget,
  validateExecutionPolicy,
  validateInvestigationPolicy,
} from "@spotpatch/workflow";
import { getOrchestrator } from "./orchestrator";
import { getStore, type FeedbackRecord } from "./store";
import {
  agentToolDefinitions,
  agentToolNames,
  allowedRunTypes,
  parseAgentToolArguments,
  type AgentToolName,
} from "./agent-tools";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, X-SpotPatch-Admin-Token, X-SpotPatch-Agent-Timestamp, X-SpotPatch-Agent-Signature, Authorization, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
};
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors });
}
const routeError = (error: unknown, requestId: string) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      operation: "api_request",
      error: message.slice(0, 500),
    }),
  );
  const status = /not found/i.test(message)
    ? 404
    : /Invalid|cannot|requires|missing|configured|match|transition|risk/i.test(message)
      ? 409
      : 500;
  return json(
    fail(
      status === 500 ? "INTERNAL_ERROR" : "INVALID_STATE",
      status === 500 ? "Não foi possível concluir a operação." : message,
    ),
    status,
  );
};
async function body(request: NextRequest): Promise<unknown> {
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 12_000_000) throw new Error("Payload exceeds 12 MB");
  return request.json();
}
function requireAdmin(request: NextRequest) {
  if (
    !validateAdminToken(
      request.headers.get("x-spotpatch-admin-token"),
      process.env.SPOTPATCH_ADMIN_TOKEN,
    )
  )
    throw new Error("Invalid administrative token");
}
async function requireAgent(request: NextRequest, raw: string) {
  const secret = process.env.SPOTPATCH_AGENT_TOOLS_SECRET;
  if (!secret) throw new Error("Agent tools secret is not configured");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const signed = verifyAgentSignature(
    raw,
    secret,
    request.headers.get("x-spotpatch-agent-timestamp") ?? undefined,
    request.headers.get("x-spotpatch-agent-signature") ?? undefined,
  );
  if (bearer !== secret && !signed) throw new Error("Invalid agent tool credential");
}
function publicMarker(item: FeedbackRecord) {
  return {
    id: item.id,
    number: item.public_number,
    comment: item.comment.slice(0, 160),
    category: item.category,
    status: ["completed", "pull_request_opened"].includes(item.status)
      ? "resolved"
      : item.status === "rejected"
        ? "closed"
        : "open",
    selector: item.element.cssSelector,
    boundingBox: item.element.boundingBox,
    date: item.created_at,
  };
}
const projectInput = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  site_url: z.string().url(),
  allowed_domains: z.array(z.string().min(1).max(253)).min(1).max(50),
  repository_provider: z.string().default("github"),
  repository_owner: z.string().min(1),
  repository_name: z.string().min(1),
  default_branch: z.string().min(1).default("main"),
  agent_mode: z
    .enum(["investigation_only", "approval_required", "autonomous_pr"])
    .default("approval_required"),
  deco_studio_org_slug: z.string().nullable().optional(),
  investigation_agent_id: z.string().nullable().optional(),
  execution_agent_id: z.string().nullable().optional(),
  agent_tier: z.string().default("smart"),
  is_active: z.boolean().default(true),
});

async function handlePublic(request: NextRequest, parts: string[]) {
  const store = getStore();
  if (request.method === "GET" && parts.join("/") === "projects/resolve") {
    const hostname = request.nextUrl.searchParams.get("hostname");
    if (!hostname) return json(fail("INVALID_HOSTNAME", "Hostname é obrigatório."), 400);
    const project = await store.resolveProject(hostname);
    if (!project) return json(fail("PROJECT_NOT_FOUND", "Este domínio não está habilitado."), 404);
    return json(ok({ projectId: project.id, name: project.name, enabled: project.is_active }));
  }
  if (request.method === "POST" && parts[0] === "feedback" && !parts[1]) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
      parsed = feedbackCreateSchema.parse(await body(request));
    const ipLimit = consumeRateLimit(`ip:${ip}`, 20, 60_000),
      installationLimit = consumeRateLimit(
        `installation:${parsed.page.installationId}`,
        10,
        60_000,
      ),
      cooldown = consumeRateLimit(`cooldown:${parsed.page.installationId}`, 1, 2_000),
      projectLimit = consumeRateLimit(`project:${parsed.projectId}`, 100, 60_000),
      domainLimit = consumeRateLimit(`domain:${parsed.page.hostname}`, 60, 60_000);
    if (
      !ipLimit.allowed ||
      !installationLimit.allowed ||
      !cooldown.allowed ||
      !projectLimit.allowed ||
      !domainLimit.allowed
    )
      return json(fail("RATE_LIMITED", "Muitos feedbacks. Tente novamente em instantes."), 429);
    const origin = request.headers.get("origin");
    if (
      origin &&
      !origin.startsWith("chrome-extension://") &&
      (!origin.startsWith("http") || new URL(origin).hostname !== parsed.page.hostname)
    )
      return json(fail("ORIGIN_NOT_ALLOWED", "Origem não permitida para esta página."), 403);
    const project = await store.resolveProject(parsed.page.hostname);
    if (
      !project ||
      project.id !== parsed.projectId ||
      !matchesDomain(
        new URL(parsed.page.pageUrl).hostname,
        project.allowed_domains.find((d) => matchesDomain(parsed.page.hostname, d)) ?? "",
      )
    )
      return json(fail("DOMAIN_NOT_ALLOWED", "Projeto, URL e domínio não correspondem."), 403);
    if (normalizeUrl(parsed.page.pageUrl) !== parsed.page.normalizedUrl)
      return json(fail("INVALID_NORMALIZED_URL", "A URL normalizada não corresponde."), 400);
    const created = await store.createFeedback(parsed);
    return json(ok({ id: created.id, number: created.public_number, status: created.status }), 201);
  }
  if (request.method === "GET" && parts.join("/") === "feedback/page") {
    const projectId = request.nextUrl.searchParams.get("projectId"),
      url = request.nextUrl.searchParams.get("url");
    if (!projectId || !url)
      return json(fail("INVALID_QUERY", "projectId e url são obrigatórios."), 400);
    const project = (await store.listProjects()).find((p) => p.id === projectId && p.is_active);
    if (!project) return json(fail("PROJECT_NOT_FOUND", "Projeto não encontrado."), 404);
    const normalized = normalizeUrl(url);
    if (!project.allowed_domains.some((d) => matchesDomain(new URL(normalized).hostname, d)))
      return json(fail("DOMAIN_NOT_ALLOWED", "Domínio não permitido."), 403);
    return json(ok((await store.listPage(projectId, normalized)).map(publicMarker)));
  }
  return json(fail("NOT_FOUND", "Endpoint público não encontrado."), 404);
}

async function handleAdmin(request: NextRequest, parts: string[]) {
  requireAdmin(request);
  const store = getStore();
  if (request.method === "GET" && parts[0] === "dashboard")
    return json(ok(await store.dashboard()));
  if (request.method === "GET" && parts[0] === "feedback" && !parts[1])
    return json(ok(await store.listFeedback()));
  if (
    request.method === "GET" &&
    parts[0] === "feedback" &&
    parts[1] &&
    (!parts[2] || parts[2] === "events" || parts[2] === "screenshots")
  ) {
    const detail = await store.getFeedback(parts[1]);
    if (!detail) return json(fail("FEEDBACK_NOT_FOUND", "Feedback não encontrado."), 404);
    if (parts[2] === "events") return json(ok(detail.events));
    if (parts[2] === "screenshots") {
      const [viewportUrl, elementUrl] = await Promise.all([
        store.signedUrl(detail.screenshot_path),
        store.signedUrl(detail.element_screenshot_path),
      ]);
      return json(ok({ viewportUrl, elementUrl, expiresIn: 300 }));
    }
    return json(ok(detail));
  }
  if (request.method === "POST" && parts[0] === "feedback" && parts[1]) {
    const id = parts[1],
      action = parts[2],
      input = (await body(request).catch(() => ({}))) as Record<string, unknown>,
      key =
        request.headers.get("idempotency-key") ??
        String(input.idempotencyKey ?? crypto.randomUUID());
    if (action === "investigate")
      return json(
        ok(await getOrchestrator().startInvestigation({ feedbackId: id, idempotencyKey: key })),
        202,
      );
    if (action === "approve")
      return json(
        ok(await getOrchestrator().startExecution({ feedbackId: id, idempotencyKey: key })),
        202,
      );
    if (action === "reject") {
      const f = await store.getFeedback(id);
      if (!f) throw new Error("Feedback not found");
      assertTransition(f.status, "rejected");
      return json(
        ok(
          await store.transition(id, "rejected", "operator", "feedback_rejected", {
            reason: input.reason,
          }),
        ),
      );
    }
    if (action === "respond") {
      const f = await store.getFeedback(id);
      if (!f || f.status !== "needs_information")
        throw new Error("Feedback is not waiting for information");
      const response = z.string().min(1).max(4000).parse(input.response);
      await store.addEvent(id, "operator", "Operador", "information_provided", { response });
      return json(
        ok(await getOrchestrator().startInvestigation({ feedbackId: id, idempotencyKey: key })),
        202,
      );
    }
  }
  if (request.method === "POST" && parts[0] === "runs" && parts[1]) {
    const input = (await body(request).catch(() => ({}))) as { feedbackId?: string };
    if (!input.feedbackId) throw new Error("feedbackId is required");
    if (parts[2] === "sync")
      return json(
        ok(await getOrchestrator().syncRun({ runId: parts[1], feedbackId: input.feedbackId })),
      );
    if (parts[2] === "retry") {
      const f = await store.getFeedback(input.feedbackId);
      if (!f || f.status !== "failed") throw new Error("Only failed feedback can be retried");
      const last = f.runs.find((v) => v.id === parts[1]);
      if (!last) throw new Error("Run not found");
      return json(
        ok(
          last.run_type === "execution"
            ? await getOrchestrator().startExecution({
                feedbackId: f.id,
                idempotencyKey: crypto.randomUUID(),
              })
            : await getOrchestrator().startInvestigation({
                feedbackId: f.id,
                idempotencyKey: crypto.randomUUID(),
              }),
        ),
        202,
      );
    }
  }
  if (request.method === "GET" && parts[0] === "projects")
    return json(ok(await store.listProjects()));
  if (request.method === "POST" && parts[0] === "projects") {
    return json(
      ok(
        await store.createProject(
          projectInput.parse(await body(request)) as unknown as Partial<Project>,
        ),
      ),
      201,
    );
  }
  if (request.method === "PATCH" && parts[0] === "projects" && parts[1])
    return json(
      ok(
        await store.updateProject(
          parts[1],
          projectInput.partial().parse(await body(request)) as unknown as Partial<Project>,
        ),
      ),
    );
  if (request.method === "POST" && parts.join("/") === "integrations/deco/test") {
    const { decoClientFromEnv } = await import("@spotpatch/deco-studio");
    const input = z.object({ threadId: z.string().min(1) }).parse(await body(request));
    return json(ok(await decoClientFromEnv().getThread({ threadId: input.threadId })));
  }
  return json(fail("NOT_FOUND", "Endpoint administrativo não encontrado."), 404);
}

async function callAgentTool(name: AgentToolName, rawArgs: Record<string, unknown>) {
  const args = parseAgentToolArguments(name, rawArgs);
  const store = getStore(),
    feedbackId = args.feedbackId,
    feedback = await store.getFeedback(feedbackId);
  if (!feedback) throw new Error("Feedback not found");
  const runId = args.runId,
    run = feedback.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Run does not belong to feedback");
  if (run.agent_id !== args.agentId) throw new Error("Agent is not authorized for this run");
  if (!allowedRunTypes[name].includes(run.run_type as "investigation" | "execution"))
    throw new Error("Tool is not authorized for this run type");
  if (name === "GET_FEEDBACK_CONTEXT")
    return {
      feedback: {
        id: feedback.id,
        comment: feedback.comment,
        category: feedback.category,
        priority: feedback.priority,
        status: feedback.status,
      },
      page: {
        url: feedback.page_url,
        normalizedUrl: feedback.normalized_url,
        title: feedback.page_title,
        hostname: feedback.hostname,
        viewport: feedback.viewport,
      },
      element: feedback.element,
      screenshots: {
        viewportUrl: await store.signedUrl(feedback.screenshot_path),
        elementUrl: await store.signedUrl(feedback.element_screenshot_path),
      },
      codeSearchHints: feedback.code_search_hints,
    };
  if (name === "GET_PROJECT_CONTEXT")
    return {
      id: feedback.project.id,
      name: feedback.project.name,
      repository: {
        provider: feedback.project.repository_provider,
        owner: feedback.project.repository_owner,
        name: feedback.project.repository_name,
        defaultBranch: feedback.project.default_branch,
      },
      agentMode: feedback.project.agent_mode,
    };
  if (name === "GET_SIGNED_SCREENSHOT_URL") {
    const kind = z.enum(["viewport", "element"]).parse(args.kind);
    return {
      url: await store.signedUrl(
        kind === "viewport" ? feedback.screenshot_path : feedback.element_screenshot_path,
      ),
      expiresIn: 300,
    };
  }
  if (name === "SAVE_INVESTIGATION") {
    if (feedback.status !== "investigating" || !runId)
      throw new Error("Investigation is not active");
    const result = validateInvestigationPolicy(investigationResultSchema.parse(args.result));
    const saved = await store.saveInvestigation(feedbackId, runId, result);
    await store.transition(
      feedbackId,
      investigationTarget(result),
      "investigator_agent",
      "investigation_saved",
    );
    await store.updateRun(runId, {
      status: "completed",
      result_payload: result,
      finished_at: new Date().toISOString(),
    });
    return saved;
  }
  if (name === "MARK_FEEDBACK_NEEDS_INFORMATION") {
    if (feedback.status !== "investigating" || run.status !== "in_progress")
      throw new Error("Investigation is not active");
    await store.addEvent(
      feedbackId,
      "investigator_agent",
      "Investigator",
      "information_requested",
      { questions: args.questions },
    );
    const transitioned = await store.transition(
      feedbackId,
      "needs_information",
      "investigator_agent",
      "information_requested",
    );
    await store.updateRun(runId, {
      status: "completed",
      result_payload: { questions: args.questions },
      finished_at: new Date().toISOString(),
    });
    return transitioned;
  }
  if (name === "GET_APPROVED_INVESTIGATION") {
    if (
      !["queued_for_execution", "executing"].includes(feedback.status) ||
      !feedback.investigation?.canExecute
    )
      throw new Error("Investigation is not approved");
    return feedback.investigation;
  }
  if (name === "SAVE_EXECUTION_PROGRESS") {
    if (feedback.status !== "executing") throw new Error("Execution is not active");
    return store.addEvent(feedbackId, "executor_agent", "Executor", "execution_progress", {
      message: z.string().max(2000).parse(args.message),
    });
  }
  if (name === "SAVE_EXECUTION_RESULT") {
    if (feedback.status !== "executing" || !feedback.investigation || !runId)
      throw new Error("Execution is not active");
    const result = executionResultSchema.parse(args.result);
    validateExecutionPolicy(
      result,
      feedback.project.default_branch,
      feedback.project.repository_provider,
    );
    const saved = await store.saveExecution(feedbackId, feedback.investigation.id, runId, result);
    await store.transition(
      feedbackId,
      "pull_request_opened",
      "executor_agent",
      "execution_result_saved",
    );
    await store.updateRun(runId, {
      status: "completed",
      result_payload: result,
      finished_at: new Date().toISOString(),
    });
    return saved;
  }
  if (name === "MARK_EXECUTION_FAILED") {
    if (feedback.status !== "executing" || !runId) throw new Error("Execution is not active");
    await store.updateRun(runId, {
      status: "failed",
      error_message: z.string().max(2000).parse(args.error),
      finished_at: new Date().toISOString(),
    });
    return store.transition(feedbackId, "failed", "executor_agent", "execution_failed");
  }
  if (name === "ADD_FEEDBACK_EVENT") {
    const expectedActor =
      run.run_type === "investigation" ? "investigator_agent" : "executor_agent";
    if (args.actorType !== expectedActor) throw new Error("Actor does not match the active run");
    return store.addEvent(
      feedbackId,
      z.enum(["investigator_agent", "executor_agent"]).parse(args.actorType),
      "Agent",
      z.string().max(100).parse(args.eventType),
      args.payload,
    );
  }
  throw new Error("Unknown agent tool");
}
async function handleAgents(request: NextRequest, parts: string[]) {
  const raw = await request.text();
  await requireAgent(request, raw);
  if (parts[0] !== "mcp")
    return json(fail("NOT_FOUND", "Endpoint de agent tools não encontrado."), 404);
  if (request.method === "GET")
    return new NextResponse(null, { status: 405, headers: { ...cors, Allow: "POST" } });
  const rpc = z
    .object({
      jsonrpc: z.literal("2.0"),
      id: z.union([z.string(), z.number()]).optional(),
      method: z.string(),
      params: z.record(z.unknown()).optional(),
    })
    .parse(JSON.parse(raw));
  if (rpc.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  if (rpc.id === undefined)
    return json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Request id is required" },
    });
  if (rpc.method === "initialize") {
    const requested = z
      .object({ protocolVersion: z.string().min(1) })
      .passthrough()
      .parse(rpc.params);
    return json({
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        protocolVersion: requested.protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "spotpatch-agent-tools", version: "1.0.0" },
        instructions:
          "Use only the tools selected for the current SpotPatch agent and always pass the run context from the initiating message.",
      },
    });
  }
  if (rpc.method === "ping") return json({ jsonrpc: "2.0", id: rpc.id, result: {} });
  if (rpc.method === "tools/list")
    return json({
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        tools: agentToolDefinitions,
      },
    });
  if (rpc.method === "tools/call") {
    const params = z
      .object({
        name: z.enum(agentToolNames as [AgentToolName, ...AgentToolName[]]),
        arguments: z.record(z.unknown()),
      })
      .parse(rpc.params);
    try {
      const result = await callAgentTool(params.name, params.arguments);
      return json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      return json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          isError: true,
          content: [{ type: "text", text: message.slice(0, 500) }],
        },
      });
    }
  }
  return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Method not found" } });
}

export async function handleApiRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID(),
    started = Date.now();
  try {
    const path = (await params).path ?? [],
      scope = path.shift();
    const response =
      scope === "public"
        ? await handlePublic(request, path)
        : scope === "admin"
          ? await handleAdmin(request, path)
          : scope === "agents"
            ? await handleAgents(request, path)
            : json(fail("NOT_FOUND", "Endpoint não encontrado."), 404);
    console.info(
      JSON.stringify({
        level: "info",
        requestId,
        operation: `${request.method} /api/${scope}/${path.join("/")}`,
        durationMs: Date.now() - started,
        status: response.status,
      }),
    );
    return response;
  } catch (error) {
    return routeError(error, requestId);
  }
}
