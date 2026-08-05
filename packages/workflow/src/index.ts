import type {
  ExecutionResult,
  FeedbackStatus,
  InvestigationResult,
  ProductionResult,
} from "@spotpatch/shared";
import { isSensitiveFile } from "@spotpatch/security";
const transitions: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  new: ["queued_for_investigation", "rejected"],
  queued_for_investigation: ["investigating", "failed"],
  investigating: ["needs_information", "queued_for_execution", "failed"],
  needs_information: ["queued_for_investigation", "rejected"],
  queued_for_execution: ["executing", "failed"],
  executing: ["pull_request_opened", "failed"],
  pull_request_opened: ["completed", "failed"],
  completed: [],
  failed: ["queued_for_investigation", "queued_for_execution", "rejected"],
  rejected: [],
};
export function canTransition(from: FeedbackStatus, to: FeedbackStatus): boolean {
  return transitions[from].includes(to);
}
export function assertTransition(from: FeedbackStatus, to: FeedbackStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid feedback transition: ${from} -> ${to}`);
}
export function investigationTarget(result: InvestigationResult): FeedbackStatus {
  if (result.requiresHumanInput) return "needs_information";
  return result.canExecute ? "queued_for_execution" : "needs_information";
}
export function validateInvestigationPolicy(result: InvestigationResult): InvestigationResult {
  const sensitive = result.likelyFiles.some((f) => isSensitiveFile(f.path));
  if (!sensitive) return result;
  return {
    ...result,
    riskLevel: "critical",
    canExecute: false,
    requiresHumanInput: true,
    questions: [...result.questions, "A alteração envolve arquivo sensível e exige ação manual."],
  };
}
export function validateExecutionPolicy(
  result: ExecutionResult,
  defaultBranch: string,
  provider: string,
): void {
  if (result.branchName === defaultBranch)
    throw new Error("Execution branch cannot be the default branch");
  if (result.baseBranch !== defaultBranch)
    throw new Error("Execution base branch does not match the project");
  if (!result.pullRequestUrl || !result.pullRequestNumber)
    throw new Error("Execution must finish with a pull request");
  const url = new URL(result.pullRequestUrl);
  if (
    provider === "github" &&
    !(/(^|\.)github\.com$/i.test(url.hostname) || url.hostname.endsWith(".invalid"))
  )
    throw new Error("Pull request URL does not match provider");
  if (result.changedFiles.some((f) => isSensitiveFile(f.path)))
    throw new Error("Execution attempted to change a sensitive file");
}
export function validateProductionPolicy(result: ProductionResult, provider: string): void {
  const url = new URL(result.productionUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Production URL must use HTTP or HTTPS");
  if (provider === "github" && !result.pullRequestMerged)
    throw new Error("Production delivery must merge the pull request");
}
export function idempotencyScope(operation: string, id: string, key: string): string {
  return `${operation}:${id}:${key}`;
}
export const activeInvestigationStatuses = ["queued_for_investigation", "investigating"] as const;
export const activeExecutionStatuses = ["queued_for_execution", "executing"] as const;
