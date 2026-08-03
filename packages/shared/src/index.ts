import { z } from "zod";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
export const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });
export const fail = (code: string, message: string, details?: unknown): ApiError => ({
  success: false,
  error: details === undefined ? { code, message } : { code, message, details },
});

export const feedbackStatuses = [
  "new",
  "queued_for_investigation",
  "investigating",
  "needs_information",
  "awaiting_approval",
  "queued_for_execution",
  "executing",
  "pull_request_opened",
  "completed",
  "failed",
  "rejected",
] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];
export const feedbackCategories = [
  "visual_bug",
  "functional_bug",
  "content_change",
  "ux_improvement",
  "performance",
  "accessibility",
  "other",
] as const;
export const feedbackPriorities = ["low", "medium", "high", "critical"] as const;

const boundedText = (max: number) => z.string().trim().max(max);
export const boundingBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  top: z.number().finite(),
  left: z.number().finite(),
  width: z.number().nonnegative().max(100_000),
  height: z.number().nonnegative().max(100_000),
});
export const capturedPageContextSchema = z.object({
  pageUrl: z.string().url().max(4096),
  normalizedUrl: z.string().url().max(4096),
  hostname: boundedText(253),
  pathname: boundedText(2048),
  pageTitle: boundedText(500),
  referrer: z.string().url().max(4096).nullable(),
  userAgent: boundedText(1000),
  timestamp: z.string().datetime(),
  viewport: z.object({
    width: z.number().int().positive().max(20_000),
    height: z.number().int().positive().max(20_000),
    devicePixelRatio: z.number().positive().max(10),
  }),
  scroll: z.object({ x: z.number().finite(), y: z.number().finite() }),
  installationId: z.string().uuid(),
  sessionId: z.string().uuid(),
});
export type CapturedPageContext = z.infer<typeof capturedPageContextSchema>;
export const capturedElementContextSchema = z.object({
  tagName: boundedText(50),
  textContent: boundedText(4000),
  cssSelector: boundedText(2000),
  xpath: boundedText(2000),
  outerHTML: boundedText(30_000),
  attributes: z
    .record(z.string().max(1000))
    .refine((v) => Object.keys(v).length <= 50, "Too many attributes"),
  classList: z.array(boundedText(200)).max(50),
  boundingBox: boundingBoxSchema,
  computedStyles: z
    .record(z.string().max(500))
    .refine((v) => Object.keys(v).length <= 30, "Too many styles"),
  parentContext: z
    .array(
      z.object({
        tagName: boundedText(50),
        id: boundedText(200).nullable(),
        classList: z.array(boundedText(200)).max(30),
        textContent: boundedText(1000),
      }),
    )
    .max(5),
  nearbyText: boundedText(4000),
  dataAgentId: boundedText(200).nullable(),
});
export type CapturedElementContext = z.infer<typeof capturedElementContextSchema>;

export const feedbackCreateSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    projectId: z.string().uuid(),
    comment: z.string().trim().min(5).max(2000),
    category: z.enum(feedbackCategories),
    priority: z.enum(feedbackPriorities),
    authorName: z.string().trim().max(100).optional(),
    authorEmail: z.string().trim().email().max(320).optional(),
    page: capturedPageContextSchema,
    element: capturedElementContextSchema,
    screenshot: z.string().max(8_000_000).optional(),
    elementScreenshot: z.string().max(3_000_000).optional(),
  })
  .superRefine((v, ctx) => {
    if (JSON.stringify(v).length > 12_000_000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Payload exceeds 12 MB" });
  });
export type FeedbackCreateInput = z.infer<typeof feedbackCreateSchema>;

export const likelyFileSchema = z.object({
  path: z.string().min(1).max(500),
  reason: boundedText(1000),
  confidence: z.number().min(0).max(1),
});
export const investigationResultSchema = z.object({
  interpretedRequest: boundedText(2000),
  summary: boundedText(5000),
  technicalHypothesis: boundedText(5000),
  recommendedAction: boundedText(5000),
  likelyFiles: z.array(likelyFileSchema).max(20),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  requiresHumanInput: z.boolean(),
  questions: z.array(boundedText(1000)).max(10),
  canExecute: z.boolean(),
});
export type InvestigationResult = z.infer<typeof investigationResultSchema>;
export const executionResultSchema = z.object({
  summary: boundedText(5000),
  branchName: boundedText(255),
  baseBranch: boundedText(255),
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{7,64}$/i)
    .nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestUrl: z.string().url().max(2048).nullable(),
  changedFiles: z
    .array(
      z.object({
        path: boundedText(500),
        changeType: z.enum(["created", "updated", "deleted"]),
        summary: boundedText(1000),
      }),
    )
    .max(100),
  checks: z
    .array(
      z.object({
        name: boundedText(200),
        status: z.enum(["passed", "failed", "skipped"]),
        details: boundedText(2000).optional(),
      }),
    )
    .max(50),
  warnings: z.array(boundedText(1000)).max(50),
});
export type ExecutionResult = z.infer<typeof executionResultSchema>;

export type CodeSearchHint = {
  value: string;
  type:
    | "data_agent_id"
    | "element_id"
    | "text"
    | "aria_label"
    | "class"
    | "url"
    | "route"
    | "ancestor";
  weight: number;
};
export type Project = {
  id: string;
  name: string;
  slug: string;
  site_url: string;
  allowed_domains: string[];
  repository_provider: string;
  repository_owner: string;
  repository_name: string;
  default_branch: string;
  agent_mode: "investigation_only" | "approval_required" | "autonomous_pr";
  deco_studio_org_slug: string | null;
  investigation_agent_id: string | null;
  execution_agent_id: string | null;
  agent_tier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type AgentRun = {
  id: string;
  project_id: string;
  feedback_item_id: string;
  run_type: "investigation" | "execution" | "validation";
  provider: "deco_studio" | "demo";
  agent_id: string | null;
  thread_id: string | null;
  task_id: string | null;
  status: string;
  request_payload: unknown;
  result_payload: unknown;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};
