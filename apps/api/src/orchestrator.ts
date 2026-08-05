import { decoClientFromEnv, mapDecoStatus } from "@spotpatch/deco-studio";
import type { AgentRun } from "@spotpatch/shared";
import { investigationResultSchema, executionResultSchema } from "@spotpatch/shared";
import {
  assertTransition,
  investigationTarget,
  validateExecutionPolicy,
  validateInvestigationPolicy,
} from "@spotpatch/workflow";
import { getStore } from "./store";
import { executionAgentMessage, investigationAgentMessage } from "./agent-tools";
export interface AgentOrchestrator {
  startInvestigation(input: { feedbackId: string; idempotencyKey: string }): Promise<AgentRun>;
  startExecution(input: { feedbackId: string; idempotencyKey: string }): Promise<AgentRun>;
  syncRun(input: { runId: string; feedbackId: string }): Promise<AgentRun>;
}
async function requireFeedback(id: string) {
  const value = await getStore().getFeedback(id);
  if (!value) throw new Error("Feedback not found");
  return value;
}
export class DemoAgentOrchestrator implements AgentOrchestrator {
  async startInvestigation({
    feedbackId,
    idempotencyKey,
  }: {
    feedbackId: string;
    idempotencyKey: string;
  }) {
    const store = getStore(),
      feedback = await requireFeedback(feedbackId);
    assertTransition(feedback.status, "queued_for_investigation");
    await store.transition(
      feedbackId,
      "queued_for_investigation",
      "operator",
      "investigation_queued",
    );
    const queued = await store.createRun(feedback, "investigation", "demo", idempotencyKey);
    await store.transition(feedbackId, "investigating", "system", "investigation_started");
    return store.updateRun(queued.id, {
      agent_id: "demo-investigator",
      status: "in_progress",
      thread_id: `demo-thread-${queued.id}`,
      task_id: `demo-task-${queued.id}`,
      started_at: new Date().toISOString(),
    });
  }
  async startExecution({
    feedbackId,
    idempotencyKey,
  }: {
    feedbackId: string;
    idempotencyKey: string;
  }) {
    const store = getStore(),
      feedback = await requireFeedback(feedbackId);
    if (!feedback.investigation?.canExecute) throw new Error("Investigation cannot be executed");
    if (["high", "critical"].includes(feedback.investigation.riskLevel))
      throw new Error("High-risk investigation requires manual handling");
    if (feedback.status !== "queued_for_execution") {
      assertTransition(feedback.status, "queued_for_execution");
      await store.transition(
        feedbackId,
        "queued_for_execution",
        "system",
        "execution_queued_automatically",
      );
    }
    const queued = await store.createRun(feedback, "execution", "demo", idempotencyKey);
    await store.transition(feedbackId, "executing", "system", "execution_started");
    return store.updateRun(queued.id, {
      agent_id: "demo-executor",
      status: "in_progress",
      thread_id: `demo-thread-${queued.id}`,
      task_id: `demo-task-${queued.id}`,
      started_at: new Date().toISOString(),
    });
  }
  async syncRun({ runId, feedbackId }: { runId: string; feedbackId: string }) {
    const store = getStore(),
      feedback = await requireFeedback(feedbackId),
      run = feedback.runs.find((v) => v.id === runId);
    if (!run) throw new Error("Run not found");
    if (run.status !== "in_progress") return run;
    if (Date.now() - Date.parse(run.started_at ?? run.created_at) < 700) return run;
    if (run.run_type === "investigation") {
      const result = investigationResultSchema.parse({
        interpretedRequest: feedback.comment,
        summary: "O botão de compra precisa adaptar sua largura no breakpoint mobile.",
        technicalHypothesis:
          "O componente ProductCard usa largura automática sem uma regra responsiva para o CTA.",
        recommendedAction:
          "Aplicar largura total no CTA em telas pequenas e manter largura automática a partir do breakpoint médio.",
        likelyFiles: [
          {
            path: "src/components/ProductCard.tsx",
            reason: "O data-agent-id e o texto Comprar apontam para o CTA deste componente.",
            confidence: 0.92,
          },
          {
            path: "src/styles/product-card.css",
            reason: "Possível origem da regra responsiva.",
            confidence: 0.67,
          },
        ],
        riskLevel: "low",
        confidence: 0.91,
        requiresHumanInput: false,
        questions: [],
        canExecute: true,
      });
      const safe = validateInvestigationPolicy(result);
      await store.saveInvestigation(feedbackId, run.id, safe);
      const target = investigationTarget(safe);
      const completed = await store.updateRun(run.id, {
        status: "completed",
        result_payload: safe,
        finished_at: new Date().toISOString(),
      });
      if (target === "needs_information") {
        await store.transition(
          feedbackId,
          target,
          "investigator_agent",
          "investigation_saved",
          { mode: "demo" },
        );
      } else {
        await this.startExecution({ feedbackId, idempotencyKey: `auto:${run.id}` });
      }
      return completed;
    }
    const investigation = feedback.investigation;
    if (!investigation) throw new Error("Executable investigation not found");
    const result = executionResultSchema.parse({
      summary: "CTA atualizado com largura total no mobile e largura automática no desktop.",
      branchName: `spotpatch/feedback-${feedback.public_number}-mobile-cta`,
      baseBranch: feedback.project.default_branch,
      commitSha: "d3adbeef42",
      pullRequestNumber: feedback.public_number,
      pullRequestUrl: `https://pull-request.invalid/spotpatch-demo/${feedback.public_number}`,
      changedFiles: [
        {
          path: "src/components/ProductCard.tsx",
          changeType: "updated",
          summary: "Adiciona classe responsiva ao botão Comprar.",
        },
      ],
      checks: [
        { name: "typecheck", status: "passed" },
        { name: "unit-tests", status: "passed" },
      ],
      warnings: ["Execução simulada: nenhum repositório foi alterado."],
    });
    validateExecutionPolicy(
      result,
      feedback.project.default_branch,
      feedback.project.repository_provider,
    );
    await store.saveExecution(feedbackId, investigation.id, run.id, result);
    await store.transition(
      feedbackId,
      "pull_request_opened",
      "executor_agent",
      "execution_result_saved",
      { simulated: true },
    );
    return store.updateRun(run.id, {
      status: "completed",
      result_payload: result,
      finished_at: new Date().toISOString(),
    });
  }
}
export class DecoStudioAgentOrchestrator implements AgentOrchestrator {
  async startInvestigation({
    feedbackId,
    idempotencyKey,
  }: {
    feedbackId: string;
    idempotencyKey: string;
  }) {
    const store = getStore(),
      feedback = await requireFeedback(feedbackId),
      agentId =
        feedback.project.investigation_agent_id || process.env.DECO_STUDIO_INVESTIGATION_AGENT_ID;
    if (!agentId) throw new Error("Investigation agent is not configured");
    assertTransition(feedback.status, "queued_for_investigation");
    await store.transition(
      feedbackId,
      "queued_for_investigation",
      "operator",
      "investigation_queued",
    );
    const run = await store.createRun(feedback, "investigation", "deco_studio", idempotencyKey);
    await store.transition(feedbackId, "investigating", "system", "investigation_started");
    await store.updateRun(run.id, { agent_id: agentId });
    const client = decoClientFromEnv(),
      thread = await client.createThread({
        title: `SpotPatch investigation ${feedback.id}`,
        agentId,
      });
    const started = await client.runAgent({
      threadId: thread.id,
      agentId,
      tier: feedback.project.agent_tier,
      message: investigationAgentMessage({
        feedbackId: feedback.id,
        projectId: feedback.project_id,
        runId: run.id,
        agentId,
      }),
    });
    return store.updateRun(run.id, {
      status: "in_progress",
      thread_id: thread.id,
      task_id: started.taskId,
      started_at: new Date().toISOString(),
    });
  }
  async startExecution({
    feedbackId,
    idempotencyKey,
  }: {
    feedbackId: string;
    idempotencyKey: string;
  }) {
    const store = getStore(),
      feedback = await requireFeedback(feedbackId),
      investigation = feedback.investigation,
      agentId = feedback.project.execution_agent_id || process.env.DECO_STUDIO_EXECUTION_AGENT_ID;
    if (!investigation?.canExecute || !agentId) throw new Error("Execution is not available");
    if (feedback.status !== "queued_for_execution") {
      assertTransition(feedback.status, "queued_for_execution");
      await store.transition(
        feedbackId,
        "queued_for_execution",
        "system",
        "execution_queued_automatically",
      );
    }
    const run = await store.createRun(feedback, "execution", "deco_studio", idempotencyKey);
    await store.updateRun(run.id, { agent_id: agentId });
    await store.transition(feedbackId, "executing", "system", "execution_started");
    const client = decoClientFromEnv(),
      thread = await client.createThread({ title: `SpotPatch execution ${feedback.id}`, agentId });
    const started = await client.runAgent({
      threadId: thread.id,
      agentId,
      tier: feedback.project.agent_tier,
      message: executionAgentMessage({
        feedbackId: feedback.id,
        investigationId: investigation.id,
        runId: run.id,
        agentId,
      }),
    });
    return store.updateRun(run.id, {
      status: "in_progress",
      thread_id: thread.id,
      task_id: started.taskId,
      started_at: new Date().toISOString(),
    });
  }
  async syncRun({ runId, feedbackId }: { runId: string; feedbackId: string }) {
    const store = getStore(),
      feedback = await requireFeedback(feedbackId),
      run = feedback.runs.find((v) => v.id === runId);
    if (!run?.thread_id) throw new Error("Run thread is missing");
    const thread = await decoClientFromEnv().getThread({ threadId: run.thread_id }),
      mapped = mapDecoStatus(thread.status);
    if (mapped === "failed") {
      await store.transition(feedbackId, "failed", "system", "agent_run_failed");
      return store.updateRun(run.id, {
        status: "failed",
        error_message: "Deco Studio thread failed",
        finished_at: new Date().toISOString(),
      });
    }
    return store.updateRun(run.id, {
      status: mapped,
      result_payload: { threadStatus: thread.status },
    });
  }
}
export function getOrchestrator(): AgentOrchestrator {
  return process.env.SPOTPATCH_AGENT_PROVIDER === "deco_studio"
    ? new DecoStudioAgentOrchestrator()
    : new DemoAgentOrchestrator();
}
