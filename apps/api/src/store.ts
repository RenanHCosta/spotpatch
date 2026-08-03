import { getSupabase, hasSupabaseConfig, uploadScreenshot } from "@spotpatch/database";
import type {
  AgentRun,
  ExecutionResult,
  FeedbackCreateInput,
  FeedbackStatus,
  InvestigationResult,
  Project,
} from "@spotpatch/shared";
import { generateCodeSearchHints, matchesDomain } from "@spotpatch/security";

export type FeedbackRecord = {
  id: string;
  project_id: string;
  public_number: number;
  title: string;
  comment: string;
  category: string;
  priority: string;
  status: FeedbackStatus;
  author_name: string | null;
  author_email: string | null;
  installation_id: string;
  session_id: string;
  page_url: string;
  normalized_url: string;
  hostname: string;
  page_title: string;
  viewport: unknown;
  scroll_position: unknown;
  screenshot_path: string | null;
  element_screenshot_path: string | null;
  created_at: string;
  updated_at: string;
  element: FeedbackCreateInput["element"];
  code_search_hints: ReturnType<typeof generateCodeSearchHints>;
};
export type InvestigationRecord = InvestigationResult & {
  id: string;
  feedback_item_id: string;
  agent_run_id: string;
  created_at: string;
};
export type ExecutionRecord = ExecutionResult & {
  id: string;
  feedback_item_id: string;
  investigation_id: string;
  agent_run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
};
export type EventRecord = {
  id: string;
  feedback_item_id: string;
  actor_type: string;
  actor_label: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  payload: unknown;
  created_at: string;
};
export type FeedbackDetail = FeedbackRecord & {
  project: Project;
  investigation: InvestigationRecord | null;
  execution: ExecutionRecord | null;
  runs: AgentRun[];
  events: EventRecord[];
};
export interface SpotPatchStore {
  resolveProject(hostname: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  createProject(input: Partial<Project>): Promise<Project>;
  updateProject(id: string, input: Partial<Project>): Promise<Project>;
  createFeedback(input: FeedbackCreateInput): Promise<FeedbackRecord>;
  listPage(projectId: string, url: string): Promise<FeedbackRecord[]>;
  listFeedback(): Promise<FeedbackDetail[]>;
  getFeedback(id: string): Promise<FeedbackDetail | null>;
  transition(
    id: string,
    next: FeedbackStatus,
    actor: string,
    eventType: string,
    payload?: unknown,
  ): Promise<FeedbackDetail>;
  createRun(
    feedback: FeedbackDetail,
    type: "investigation" | "execution",
    provider: "demo" | "deco_studio",
    key: string,
  ): Promise<AgentRun>;
  updateRun(id: string, patch: Partial<AgentRun>): Promise<AgentRun>;
  saveInvestigation(
    feedbackId: string,
    runId: string,
    result: InvestigationResult,
  ): Promise<InvestigationRecord>;
  saveExecution(
    feedbackId: string,
    investigationId: string,
    runId: string,
    result: ExecutionResult,
  ): Promise<ExecutionRecord>;
  addEvent(
    feedbackId: string,
    actorType: string,
    label: string,
    eventType: string,
    payload?: unknown,
  ): Promise<EventRecord>;
  dashboard(): Promise<Record<string, unknown>>;
  signedUrl(path: string | null): Promise<string | null>;
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

const now = () => new Date().toISOString();
const DEMO_PROJECT: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Loja Demo SpotPatch",
  slug: "loja-demo",
  site_url: "http://localhost:3000/demo",
  allowed_domains: ["localhost", "127.0.0.1"],
  repository_provider: "github",
  repository_owner: "spotpatch-demo",
  repository_name: "storefront",
  default_branch: "main",
  agent_mode: "approval_required",
  deco_studio_org_slug: null,
  investigation_agent_id: null,
  execution_agent_id: null,
  agent_tier: "smart",
  is_active: true,
  created_at: now(),
  updated_at: now(),
};
class MemoryStore implements SpotPatchStore {
  private projects = [DEMO_PROJECT];
  private feedback = new Map<string, FeedbackRecord>();
  private investigations = new Map<string, InvestigationRecord>();
  private executions = new Map<string, ExecutionRecord>();
  private runs = new Map<string, AgentRun>();
  private events: EventRecord[] = [];
  private number = 1;
  async resolveProject(hostname: string) {
    return (
      this.projects.find(
        (p) => p.is_active && p.allowed_domains.some((d) => matchesDomain(hostname, d)),
      ) ?? null
    );
  }
  async listProjects() {
    return this.projects;
  }
  async createProject(input: Partial<Project>) {
    const project = {
      ...DEMO_PROJECT,
      ...input,
      id: crypto.randomUUID(),
      created_at: now(),
      updated_at: now(),
    } as Project;
    this.projects.push(project);
    return project;
  }
  async updateProject(id: string, input: Partial<Project>) {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index < 0) throw new Error("Project not found");
    const project = { ...this.projects[index], ...input, id, updated_at: now() } as Project;
    this.projects[index] = project;
    return project;
  }
  async createFeedback(input: FeedbackCreateInput) {
    const existing = [...this.feedback.values()].find(
      (f) =>
        f.project_id === input.projectId &&
        (f as FeedbackRecord & { idempotency_key?: string }).idempotency_key ===
          input.idempotencyKey,
    );
    if (existing) return existing;
    const id = crypto.randomUUID();
    const record = {
      id,
      project_id: input.projectId,
      public_number: this.number++,
      title: input.comment.slice(0, 80),
      comment: input.comment,
      category: input.category,
      priority: input.priority,
      status: "new",
      author_name: input.authorName ?? null,
      author_email: input.authorEmail ?? null,
      installation_id: input.page.installationId,
      session_id: input.page.sessionId,
      page_url: input.page.pageUrl,
      normalized_url: input.page.normalizedUrl,
      hostname: input.page.hostname,
      page_title: input.page.pageTitle,
      viewport: input.page.viewport,
      scroll_position: input.page.scroll,
      screenshot_path: input.screenshot ? `demo/${id}/viewport.png` : null,
      element_screenshot_path: input.elementScreenshot ? `demo/${id}/element.png` : null,
      created_at: now(),
      updated_at: now(),
      element: input.element,
      code_search_hints: generateCodeSearchHints(input.element, input.page.pageUrl),
      idempotency_key: input.idempotencyKey,
    } as FeedbackRecord;
    this.feedback.set(id, record);
    await this.addEvent(id, "visitor", "Visitante", "feedback_created");
    return record;
  }
  async listPage(projectId: string, url: string) {
    return [...this.feedback.values()].filter(
      (f) => f.project_id === projectId && f.normalized_url === url,
    );
  }
  async listFeedback() {
    return Promise.all(
      [...this.feedback.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((f) => this.getFeedback(f.id) as Promise<FeedbackDetail>),
    );
  }
  async getFeedback(id: string) {
    const f = this.feedback.get(id);
    if (!f) return null;
    return {
      ...f,
      project: this.projects.find((p) => p.id === f.project_id)!,
      investigation:
        [...this.investigations.values()].filter((v) => v.feedback_item_id === id).at(-1) ?? null,
      execution:
        [...this.executions.values()].filter((v) => v.feedback_item_id === id).at(-1) ?? null,
      runs: [...this.runs.values()].filter((v) => v.feedback_item_id === id),
      events: this.events.filter((v) => v.feedback_item_id === id),
    };
  }
  async transition(
    id: string,
    next: FeedbackStatus,
    actor: string,
    eventType: string,
    payload: unknown = {},
  ) {
    const item = this.feedback.get(id);
    if (!item) throw new Error("Feedback not found");
    const previous = item.status;
    item.status = next;
    item.updated_at = now();
    await this.addEvent(id, actor === "operator" ? "operator" : "system", actor, eventType, {
      previousStatus: previous,
      newStatus: next,
      payload,
    });
    return (await this.getFeedback(id))!;
  }
  async createRun(
    feedback: FeedbackDetail,
    type: "investigation" | "execution",
    provider: "demo" | "deco_studio",
    key: string,
  ) {
    const existing = [...this.runs.values()].find(
      (v) =>
        v.feedback_item_id === feedback.id &&
        v.run_type === type &&
        (v.request_payload as { idempotencyKey?: string })?.idempotencyKey === key,
    );
    if (existing) return existing;
    const run: AgentRun = {
      id: crypto.randomUUID(),
      project_id: feedback.project_id,
      feedback_item_id: feedback.id,
      run_type: type,
      provider,
      agent_id:
        type === "investigation"
          ? feedback.project.investigation_agent_id
          : feedback.project.execution_agent_id,
      thread_id: null,
      task_id: null,
      status: "queued",
      request_payload: { idempotencyKey: key },
      result_payload: null,
      error_message: null,
      started_at: null,
      finished_at: null,
      created_at: now(),
      updated_at: now(),
    };
    this.runs.set(run.id, run);
    return run;
  }
  async updateRun(id: string, patch: Partial<AgentRun>) {
    const run = this.runs.get(id);
    if (!run) throw new Error("Run not found");
    const updated = { ...run, ...patch, id, updated_at: now() };
    this.runs.set(id, updated);
    return updated;
  }
  async saveInvestigation(feedbackId: string, runId: string, result: InvestigationResult) {
    const existing = [...this.investigations.values()].find((v) => v.agent_run_id === runId);
    if (existing) return existing;
    const row = {
      ...result,
      id: crypto.randomUUID(),
      feedback_item_id: feedbackId,
      agent_run_id: runId,
      created_at: now(),
    };
    this.investigations.set(row.id, row);
    return row;
  }
  async saveExecution(
    feedbackId: string,
    investigationId: string,
    runId: string,
    result: ExecutionResult,
  ) {
    const existing = [...this.executions.values()].find((v) => v.agent_run_id === runId);
    if (existing) return existing;
    const row = {
      ...result,
      id: crypto.randomUUID(),
      feedback_item_id: feedbackId,
      investigation_id: investigationId,
      agent_run_id: runId,
      status: "pull_request_opened",
      started_at: now(),
      finished_at: now(),
    };
    this.executions.set(row.id, row);
    return row;
  }
  async addEvent(
    feedbackId: string,
    actorType: string,
    label: string,
    eventType: string,
    payload: unknown = {},
  ): Promise<EventRecord> {
    const event = {
      id: crypto.randomUUID(),
      feedback_item_id: feedbackId,
      actor_type: actorType,
      actor_label: label,
      event_type: eventType,
      previous_status: null,
      new_status: null,
      payload,
      created_at: now(),
    };
    this.events.push(event);
    return event;
  }
  async dashboard() {
    const items = [...this.feedback.values()];
    const counts = Object.fromEntries(
      [
        "new",
        "investigating",
        "awaiting_approval",
        "executing",
        "pull_request_opened",
        "completed",
        "failed",
      ].map((status) => [status, items.filter((f) => f.status === status).length]),
    );
    return {
      counts,
      last24Hours: items.filter((f) => Date.now() - Date.parse(f.created_at) < 86_400_000).length,
      recentActivity: this.events.slice(-8).reverse(),
      byProject: this.projects.map((p) => ({
        name: p.name,
        count: items.filter((f) => f.project_id === p.id).length,
      })),
      byCategory: countBy(items, (item) => item.category).map(({ name, count }) => ({
        category: name,
        count,
      })),
    };
  }
  async signedUrl(path: string | null): Promise<string | null> {
    return path ? null : null;
  }
}

class SupabaseStore extends MemoryStore {
  // The server-side Supabase implementation mirrors the demo contracts. Queries remain behind this class so no browser can bypass API validation.
  override async resolveProject(hostname: string) {
    const { data, error } = await getSupabase().from("projects").select("*").eq("is_active", true);
    if (error) throw error;
    return (
      ((data ?? []) as Project[]).find((p) =>
        p.allowed_domains.some((d) => matchesDomain(hostname, d)),
      ) ?? null
    );
  }
  override async listProjects() {
    const { data, error } = await getSupabase().from("projects").select("*").order("created_at");
    if (error) throw error;
    return data as Project[];
  }
  override async createProject(input: Partial<Project>) {
    const { data, error } = await getSupabase().from("projects").insert(input).select().single();
    if (error) throw error;
    return data as Project;
  }
  override async updateProject(id: string, input: Partial<Project>) {
    const { data, error } = await getSupabase()
      .from("projects")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  }
  override async createFeedback(input: FeedbackCreateInput) {
    const id = crypto.randomUUID();
    const viewportPath = input.screenshot ? `${input.projectId}/${id}/viewport.png` : null;
    const elementPath = input.elementScreenshot ? `${input.projectId}/${id}/element.png` : null;
    if (input.screenshot && viewportPath) await uploadScreenshot(viewportPath, input.screenshot);
    if (input.elementScreenshot && elementPath)
      await uploadScreenshot(elementPath, input.elementScreenshot);
    const row = {
      id,
      project_id: input.projectId,
      title: input.comment.slice(0, 80),
      comment: input.comment,
      category: input.category,
      priority: input.priority,
      author_name: input.authorName ?? null,
      author_email: input.authorEmail ?? null,
      installation_id: input.page.installationId,
      session_id: input.page.sessionId,
      page_url: input.page.pageUrl,
      normalized_url: input.page.normalizedUrl,
      hostname: input.page.hostname,
      page_title: input.page.pageTitle,
      viewport: input.page.viewport,
      scroll_position: input.page.scroll,
      screenshot_path: viewportPath,
      element_screenshot_path: elementPath,
      idempotency_key: input.idempotencyKey,
    };
    const { data, error } = await getSupabase()
      .from("feedback_items")
      .upsert(row, { onConflict: "project_id,idempotency_key", ignoreDuplicates: true })
      .select()
      .maybeSingle();
    if (error) throw error;
    const feedback = (data ??
      (
        await getSupabase()
          .from("feedback_items")
          .select("*")
          .eq("project_id", input.projectId)
          .eq("idempotency_key", input.idempotencyKey)
          .single()
      ).data) as Omit<FeedbackRecord, "element" | "code_search_hints">;
    await getSupabase().from("selected_elements").upsert(
      {
        feedback_item_id: feedback.id,
        tag_name: input.element.tagName,
        text_content: input.element.textContent,
        css_selector: input.element.cssSelector,
        xpath: input.element.xpath,
        outer_html: input.element.outerHTML,
        attributes: input.element.attributes,
        class_list: input.element.classList,
        bounding_box: input.element.boundingBox,
        computed_styles: input.element.computedStyles,
        parent_context: input.element.parentContext,
        nearby_text: input.element.nearbyText,
        data_agent_id: input.element.dataAgentId,
      },
      { onConflict: "feedback_item_id" },
    );
    await this.addEvent(feedback.id, "visitor", "Visitante", "feedback_created");
    return {
      ...feedback,
      element: input.element,
      code_search_hints: generateCodeSearchHints(input.element, input.page.pageUrl),
    };
  }
  private mapElement(row: Record<string, unknown>): FeedbackCreateInput["element"] {
    return {
      tagName: String(row.tag_name),
      textContent: String(row.text_content),
      cssSelector: String(row.css_selector),
      xpath: String(row.xpath),
      outerHTML: String(row.outer_html),
      attributes: row.attributes as Record<string, string>,
      classList: row.class_list as string[],
      boundingBox: row.bounding_box as FeedbackCreateInput["element"]["boundingBox"],
      computedStyles: row.computed_styles as Record<string, string>,
      parentContext: row.parent_context as FeedbackCreateInput["element"]["parentContext"],
      nearbyText: String(row.nearby_text),
      dataAgentId: row.data_agent_id === null ? null : String(row.data_agent_id),
    };
  }
  private async hydrate(row: Record<string, unknown>): Promise<FeedbackRecord> {
    const { data, error } = await getSupabase()
      .from("selected_elements")
      .select("*")
      .eq("feedback_item_id", row.id)
      .single();
    if (error) throw error;
    const element = this.mapElement(data as Record<string, unknown>);
    return {
      ...row,
      element,
      code_search_hints: generateCodeSearchHints(element, String(row.page_url)),
    } as unknown as FeedbackRecord;
  }
  override async listPage(projectId: string, url: string) {
    const { data, error } = await getSupabase()
      .from("feedback_items")
      .select("*")
      .eq("project_id", projectId)
      .eq("normalized_url", url)
      .order("created_at");
    if (error) throw error;
    return Promise.all((data as Record<string, unknown>[]).map((row) => this.hydrate(row)));
  }
  override async listFeedback() {
    const { data, error } = await getSupabase()
      .from("feedback_items")
      .select("id")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const values = await Promise.all(
      (data as { id: string }[]).map((row) => this.getFeedback(row.id)),
    );
    return values.filter((value): value is FeedbackDetail => value !== null);
  }
  override async getFeedback(id: string) {
    const supabase = getSupabase();
    const [feedback, element, projects, investigations, executions, runs, events] =
      await Promise.all([
        supabase.from("feedback_items").select("*").eq("id", id).maybeSingle(),
        supabase.from("selected_elements").select("*").eq("feedback_item_id", id).maybeSingle(),
        supabase.from("projects").select("*"),
        supabase
          .from("investigations")
          .select("*")
          .eq("feedback_item_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("executions")
          .select("*")
          .eq("feedback_item_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("agent_runs").select("*").eq("feedback_item_id", id).order("created_at"),
        supabase.from("feedback_events").select("*").eq("feedback_item_id", id).order("created_at"),
      ]);
    if (feedback.error) throw feedback.error;
    if (!feedback.data || !element.data) return null;
    const f = feedback.data as Record<string, unknown>,
      el = this.mapElement(element.data as Record<string, unknown>),
      project = (projects.data as Project[]).find((p) => p.id === f.project_id);
    if (!project) throw new Error("Project not found");
    const investigationRow = (investigations.data?.[0] ?? null) as Record<string, unknown> | null;
    const executionRow = (executions.data?.[0] ?? null) as Record<string, unknown> | null;
    const investigation = investigationRow ? this.mapInvestigation(investigationRow) : null;
    const execution = executionRow ? this.mapExecution(executionRow) : null;
    return {
      ...f,
      element: el,
      code_search_hints: generateCodeSearchHints(el, String(f.page_url)),
      project,
      investigation,
      execution,
      runs: (runs.data ?? []) as AgentRun[],
      events: (events.data ?? []) as EventRecord[],
    } as unknown as FeedbackDetail;
  }
  private mapInvestigation(row: Record<string, unknown>): InvestigationRecord {
    return {
      id: String(row.id),
      feedback_item_id: String(row.feedback_item_id),
      agent_run_id: String(row.agent_run_id),
      interpretedRequest: String(row.interpreted_request),
      summary: String(row.summary),
      technicalHypothesis: String(row.technical_hypothesis),
      recommendedAction: String(row.recommended_action),
      likelyFiles: row.likely_files as InvestigationResult["likelyFiles"],
      riskLevel: row.risk_level as InvestigationResult["riskLevel"],
      confidence: Number(row.confidence),
      requiresHumanInput: Boolean(row.requires_human_input),
      questions: row.questions as string[],
      canExecute: Boolean(row.can_execute),
      created_at: String(row.created_at),
    };
  }
  private mapExecution(row: Record<string, unknown>): ExecutionRecord {
    return {
      id: String(row.id),
      feedback_item_id: String(row.feedback_item_id),
      investigation_id: String(row.investigation_id),
      agent_run_id: String(row.agent_run_id),
      status: String(row.status),
      summary: String(row.summary),
      branchName: String(row.branch_name),
      baseBranch: String(row.base_branch),
      commitSha: row.commit_sha === null ? null : String(row.commit_sha),
      pullRequestNumber: row.pull_request_number === null ? null : Number(row.pull_request_number),
      pullRequestUrl: row.pull_request_url === null ? null : String(row.pull_request_url),
      changedFiles: row.changed_files as ExecutionResult["changedFiles"],
      checks: row.checks as ExecutionResult["checks"],
      warnings: row.warnings as string[],
      started_at: String(row.started_at),
      finished_at: row.finished_at === null ? null : String(row.finished_at),
    };
  }
  override async transition(
    id: string,
    next: FeedbackStatus,
    actor: string,
    eventType: string,
    payload: unknown = {},
  ) {
    const current = await this.getFeedback(id);
    if (!current) throw new Error("Feedback not found");
    const { error } = await getSupabase()
      .from("feedback_items")
      .update({ status: next })
      .eq("id", id);
    if (error) throw error;
    await this.addEvent(id, actor === "operator" ? "operator" : "system", actor, eventType, {
      previousStatus: current.status,
      newStatus: next,
      payload,
    });
    return (await this.getFeedback(id))!;
  }
  override async createRun(
    feedback: FeedbackDetail,
    type: "investigation" | "execution",
    provider: "demo" | "deco_studio",
    key: string,
  ) {
    const row = {
      project_id: feedback.project_id,
      feedback_item_id: feedback.id,
      run_type: type,
      provider,
      agent_id:
        type === "investigation"
          ? feedback.project.investigation_agent_id
          : feedback.project.execution_agent_id,
      status: "queued",
      request_payload: { idempotencyKey: key },
      idempotency_key: key,
    };
    const { data, error } = await getSupabase()
      .from("agent_runs")
      .upsert(row, {
        onConflict: "run_type,feedback_item_id,idempotency_key",
        ignoreDuplicates: true,
      })
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return data as AgentRun;
    const existing = await getSupabase()
      .from("agent_runs")
      .select("*")
      .eq("feedback_item_id", feedback.id)
      .eq("run_type", type)
      .eq("idempotency_key", key)
      .single();
    if (existing.error) throw existing.error;
    return existing.data as AgentRun;
  }
  override async updateRun(id: string, patch: Partial<AgentRun>) {
    const { data, error } = await getSupabase()
      .from("agent_runs")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as AgentRun;
  }
  override async saveInvestigation(feedbackId: string, runId: string, result: InvestigationResult) {
    const existing = await getSupabase()
      .from("investigations")
      .select("*")
      .eq("agent_run_id", runId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return this.mapInvestigation(existing.data as Record<string, unknown>);
    const row = {
      feedback_item_id: feedbackId,
      agent_run_id: runId,
      interpreted_request: result.interpretedRequest,
      summary: result.summary,
      technical_hypothesis: result.technicalHypothesis,
      recommended_action: result.recommendedAction,
      likely_files: result.likelyFiles,
      risk_level: result.riskLevel,
      confidence: result.confidence,
      requires_human_input: result.requiresHumanInput,
      questions: result.questions,
      can_execute: result.canExecute,
      raw_agent_result: result,
    };
    const { data, error } = await getSupabase()
      .from("investigations")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return this.mapInvestigation(data as Record<string, unknown>);
  }
  override async saveExecution(
    feedbackId: string,
    investigationId: string,
    runId: string,
    result: ExecutionResult,
  ) {
    const existing = await getSupabase()
      .from("executions")
      .select("*")
      .eq("agent_run_id", runId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return this.mapExecution(existing.data as Record<string, unknown>);
    const row = {
      feedback_item_id: feedbackId,
      investigation_id: investigationId,
      agent_run_id: runId,
      status: "pull_request_opened",
      branch_name: result.branchName,
      base_branch: result.baseBranch,
      commit_sha: result.commitSha,
      pull_request_number: result.pullRequestNumber,
      pull_request_url: result.pullRequestUrl,
      summary: result.summary,
      changed_files: result.changedFiles,
      checks: result.checks,
      warnings: result.warnings,
      started_at: now(),
      finished_at: now(),
    };
    const { data, error } = await getSupabase().from("executions").insert(row).select().single();
    if (error) throw error;
    return this.mapExecution(data as Record<string, unknown>);
  }
  override async addEvent(
    feedbackId: string,
    actorType: string,
    label: string,
    eventType: string,
    payload: unknown = {},
  ) {
    const { data, error } = await getSupabase()
      .from("feedback_events")
      .insert({
        feedback_item_id: feedbackId,
        actor_type: actorType,
        actor_label: label,
        event_type: eventType,
        payload,
      })
      .select()
      .single();
    if (error) throw error;
    return data as EventRecord;
  }
  override async dashboard() {
    const items = await this.listFeedback();
    const counts = Object.fromEntries(
      [
        "new",
        "investigating",
        "awaiting_approval",
        "executing",
        "pull_request_opened",
        "completed",
        "failed",
      ].map((status) => [status, items.filter((f) => f.status === status).length]),
    );
    return {
      counts,
      last24Hours: items.filter((f) => Date.now() - Date.parse(f.created_at) < 86_400_000).length,
      recentActivity: items
        .flatMap((f) => f.events)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8),
      byProject: countBy(items, (item) => item.project.name),
      byCategory: countBy(items, (item) => item.category).map(({ name, count }) => ({
        category: name,
        count,
      })),
    };
  }
  override async signedUrl(path: string | null) {
    if (!path) return null;
    const { createSignedScreenshotUrl } = await import("@spotpatch/database");
    return createSignedScreenshotUrl(path);
  }
}
let singleton: SpotPatchStore | undefined;
export function getStore() {
  return (singleton ??= hasSupabaseConfig() ? new SupabaseStore() : new MemoryStore());
}
