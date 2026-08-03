import { z } from "zod";
export type CreateThreadInput = { title: string; agentId: string; id?: string };
export type CreatedThread = { id: string; status: string };
export type RunAgentInput = {
  threadId: string;
  agentId: string;
  message: string;
  tier?: string;
  temperature?: number;
};
export type StartedAgentRun = { threadId: string; taskId: string };
export type GetThreadInput = { threadId: string };
export type DecoThread = {
  id: string;
  status: "in_progress" | "completed" | "failed" | string;
  raw: unknown;
};
export type ListThreadMessagesInput = { threadId: string; limit?: number };
export type DecoThreadMessage = {
  id?: string;
  role?: string;
  parts?: unknown;
  created_at?: string;
  [key: string]: unknown;
};
export type StreamThreadInput = { threadId: string; signal?: AbortSignal };
export type StreamHandlers = {
  onChunk?: (chunk: string) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
};
export interface DecoStudioClient {
  createThread(input: CreateThreadInput): Promise<CreatedThread>;
  runAgent(input: RunAgentInput): Promise<StartedAgentRun>;
  getThread(input: GetThreadInput): Promise<DecoThread>;
  listThreadMessages(input: ListThreadMessagesInput): Promise<DecoThreadMessage[]>;
  streamThread(input: StreamThreadInput, handlers: StreamHandlers): Promise<void>;
}
export class DecoStudioError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DecoStudioError";
  }
}
const itemSchema = z.object({
  item: z.object({ id: z.string(), status: z.string().default("unknown") }),
});
const runSchema = z.object({ taskId: z.string() });
export function mapDecoStatus(status: string): "in_progress" | "completed" | "failed" | "unknown" {
  if (["in_progress", "running", "queued", "pending"].includes(status)) return "in_progress";
  if (["completed", "complete", "succeeded", "success"].includes(status)) return "completed";
  if (["failed", "error", "cancelled", "canceled"].includes(status)) return "failed";
  return "unknown";
}
export class HttpDecoStudioClient implements DecoStudioClient {
  constructor(
    private readonly config: {
      baseUrl: string;
      org: string;
      apiKey: string;
      timeoutMs?: number;
      maxRetries?: number;
    },
  ) {}
  private url(path: string) {
    return `${this.config.baseUrl.replace(/\/$/, "")}/api/${encodeURIComponent(this.config.org)}/${path}`;
  }
  private async request(path: string, init: RequestInit): Promise<Response> {
    const max = this.config.maxRetries ?? 3;
    let last: Error | undefined;
    for (let attempt = 0; attempt < max; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
      try {
        const response = await fetch(this.url(path), {
          ...init,
          signal: init.signal ?? controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
            ...init.headers,
          },
        });
        if (response.ok) return response;
        const retryable = [409, 429, 500, 503].includes(response.status);
        const message = `Deco Studio request failed (${response.status})`;
        if (!retryable) throw new DecoStudioError(message, response.status, false);
        last = new DecoStudioError(message, response.status, true);
      } catch (error) {
        last = error instanceof Error ? error : new Error(String(error));
        if (error instanceof DecoStudioError && !error.retryable) throw error;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < max - 1)
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    throw last ?? new Error("Deco Studio request failed");
  }
  async createThread(input: CreateThreadInput) {
    const response = await this.request("tools/COLLECTION_THREADS_CREATE", {
      method: "POST",
      body: JSON.stringify({
        data: {
          ...(input.id ? { id: input.id } : {}),
          title: input.title,
          virtual_mcp_id: input.agentId,
        },
      }),
    });
    const parsed = itemSchema.parse(await response.json());
    return { id: parsed.item.id, status: parsed.item.status };
  }
  async runAgent(input: RunAgentInput) {
    const body = {
      messages: [{ role: "user", parts: [{ type: "text", text: input.message }] }],
      agent: { id: input.agentId },
      ...(input.tier ? { tier: input.tier } : {}),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    };
    const response = await this.request(
      `decopilot/threads/${encodeURIComponent(input.threadId)}/messages`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (response.status !== 202)
      throw new DecoStudioError("Expected HTTP 202 when enqueuing agent", response.status, false);
    const parsed = runSchema.parse(await response.json());
    return { threadId: input.threadId, taskId: parsed.taskId };
  }
  async getThread(input: GetThreadInput) {
    const response = await this.request("tools/COLLECTION_THREADS_GET", {
      method: "POST",
      body: JSON.stringify({ id: input.threadId }),
    });
    const parsed = itemSchema.parse(await response.json());
    return { id: parsed.item.id, status: parsed.item.status, raw: parsed.item };
  }
  async listThreadMessages(input: ListThreadMessagesInput) {
    const response = await this.request("tools/COLLECTION_THREAD_MESSAGES_LIST", {
      method: "POST",
      body: JSON.stringify({ thread_id: input.threadId, limit: Math.min(input.limit ?? 200, 200) }),
    });
    const json = (await response.json()) as { items?: unknown[] };
    return z.array(z.record(z.unknown())).parse(json.items ?? json);
  }
  async streamThread(input: StreamThreadInput, handlers: StreamHandlers) {
    try {
      const response = await this.request(
        `decopilot/threads/${encodeURIComponent(input.threadId)}/stream`,
        {
          method: "GET",
          ...(input.signal ? { signal: input.signal } : {}),
          headers: { Accept: "text/event-stream" },
        },
      );
      if (!response.body) throw new Error("Deco stream has no body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        handlers.onChunk?.(decoder.decode(value, { stream: true }));
      }
      handlers.onDone?.();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      handlers.onError?.(normalized);
      throw normalized;
    }
  }
}
export function decoClientFromEnv(): HttpDecoStudioClient {
  const baseUrl = process.env.DECO_STUDIO_BASE_URL,
    org = process.env.DECO_STUDIO_ORG,
    apiKey = process.env.DECO_STUDIO_API_KEY;
  if (!baseUrl || !org || !apiKey) throw new Error("Deco Studio configuration is missing");
  return new HttpDecoStudioClient({ baseUrl, org, apiKey });
}
