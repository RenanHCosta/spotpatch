"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { AdminPage } from "@/components/page";
import { Status } from "@/components/status";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@spotpatch/ui";
import { ArrowLeft, CheckCircle2, Code2, ExternalLink, Play } from "lucide-react";
import Link from "next/link";
type Detail = {
  id: string;
  public_number: number;
  title: string;
  comment: string;
  status: string;
  author_name: string | null;
  author_email: string | null;
  page_url: string;
  hostname: string;
  viewport: { width: number; height: number };
  screenshot_path: string | null;
  element_screenshot_path: string | null;
  element: {
    tagName: string;
    cssSelector: string;
    xpath: string;
    outerHTML: string;
    classList: string[];
    attributes: Record<string, string>;
    computedStyles: Record<string, string>;
    parentContext: unknown[];
    boundingBox: unknown;
  };
  code_search_hints: Array<{ type: string; value: string; weight: number }>;
  project: { name: string };
  investigation: {
    id: string;
    summary: string;
    technicalHypothesis: string;
    recommendedAction: string;
    likelyFiles: Array<{ path: string; reason: string; confidence: number }>;
    riskLevel: string;
    confidence: number;
    questions: string[];
    canExecute: boolean;
  } | null;
  execution: {
    summary: string;
    branchName: string;
    pullRequestUrl: string | null;
    changedFiles: Array<{ path: string; summary: string }>;
    checks: Array<{ name: string; status: string }>;
    warnings: string[];
  } | null;
  runs: Array<{ id: string; status: string; run_type: string; thread_id: string | null }>;
  events: Array<{
    id: string;
    event_type: string;
    actor_label: string;
    created_at: string;
    payload: unknown;
  }>;
};
export default function Feedback() {
  const { id } = useParams<{ id: string }>(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["feedback", id],
    queryFn: async () => {
      const detail = await api<Detail>(`/api/admin/feedback/${id}`);
      const active = detail.runs.find((r) => r.status === "in_progress");
      if (active)
        await api(`/api/admin/runs/${active.id}/sync`, {
          method: "POST",
          body: JSON.stringify({ feedbackId: id }),
        });
      return active ? api<Detail>(`/api/admin/feedback/${id}`) : detail;
    },
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => r.status === "in_progress") ? 1000 : 4000,
  });
  const action = useMutation({
    mutationFn: (name: string) =>
      api(`/api/admin/feedback/${id}/${name}`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: "{}",
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["feedback", id] }),
  });
  if (query.isLoading)
    return (
      <AdminPage>
        <p>Carregando…</p>
      </AdminPage>
    );
  if (!query.data)
    return (
      <AdminPage>
        <p>Feedback não encontrado.</p>
      </AdminPage>
    );
  const d = query.data;
  return (
    <AdminPage>
      <Link href="/backlog" className="flex items-center gap-2 text-sm text-slate-500">
        <ArrowLeft size={16} />
        Voltar ao backlog
      </Link>
      <header className="mt-5 flex flex-col justify-between gap-4 md:flex-row">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black">Feedback #{d.public_number}</h1>
            <Status value={d.status} />
          </div>
          <p className="mt-2 text-slate-500">
            {d.project.name} · {d.hostname}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["new", "failed", "needs_information"].includes(d.status) && (
            <Button disabled={action.isPending} onClick={() => action.mutate("investigate")}>
              <Play className="mr-2" size={16} />
              Iniciar investigação
            </Button>
          )}
          {d.status === "awaiting_approval" && (
            <Button
              disabled={!d.investigation?.canExecute || action.isPending}
              onClick={() => action.mutate("approve")}
            >
              <CheckCircle2 className="mr-2" size={16} />
              Aprovar execução
            </Button>
          )}
          {!["completed", "rejected", "pull_request_opened"].includes(d.status) && (
            <Button
              className="bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
              onClick={() => action.mutate("reject")}
            >
              Rejeitar
            </Button>
          )}
        </div>
      </header>
      {action.error && <p className="mt-4 text-sm text-red-600">{action.error.message}</p>}
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <p className="text-xs font-bold uppercase text-slate-500">Comentário original</p>
            <p className="mt-3 text-lg font-medium leading-8">{d.comment}</p>
            {(d.author_name || d.author_email) && (
              <p className="mt-4 text-sm text-slate-500">
                Informado por {d.author_name || "Anônimo"} {d.author_email && `· ${d.author_email}`}
              </p>
            )}
          </Card>
          <Card className="overflow-hidden">
            <div className="spot-grid grid aspect-video place-items-center bg-slate-100">
              <div className="rounded-xl border bg-white p-5 text-center shadow-sm">
                <Code2 className="mx-auto text-patch" />
                <p className="mt-2 text-sm font-bold">Captura privada</p>
                <p className="text-xs text-slate-500">
                  {d.screenshot_path
                    ? "Disponível via URL assinada no servidor"
                    : "Screenshot indisponível neste feedback"}
                </p>
              </div>
            </div>
            <div className="border-t p-5 text-sm">
              <a href={d.page_url} target="_blank" className="font-semibold text-patch">
                {d.page_url}
              </a>
              <p className="mt-2 text-slate-500">
                Viewport {d.viewport.width} × {d.viewport.height}
              </p>
            </div>
          </Card>
          {d.investigation && (
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">Investigação</h2>
                <div className="flex gap-2">
                  <Badge>Confiança {Math.round(d.investigation.confidence * 100)}%</Badge>
                  <Badge>Risco {d.investigation.riskLevel}</Badge>
                </div>
              </div>
              <h3 className="mt-6 font-bold">Diagnóstico</h3>
              <p className="mt-2 leading-7 text-slate-600">{d.investigation.summary}</p>
              <h3 className="mt-5 font-bold">Hipótese técnica</h3>
              <p className="mt-2 leading-7 text-slate-600">{d.investigation.technicalHypothesis}</p>
              <h3 className="mt-5 font-bold">Recomendação</h3>
              <p className="mt-2 leading-7 text-slate-600">{d.investigation.recommendedAction}</p>
              <h3 className="mt-5 font-bold">Arquivos prováveis</h3>
              <div className="mt-3 space-y-2">
                {d.investigation.likelyFiles.map((file) => (
                  <div key={file.path} className="rounded-lg bg-slate-50 p-3">
                    <code className="text-sm font-bold">{file.path}</code>
                    <p className="mt-1 text-sm text-slate-500">{file.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {d.execution && (
            <Card className="border-emerald-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black">Execução</h2>
                <Badge className="bg-amber-100 text-amber-800">Pull Request simulado</Badge>
              </div>
              <p className="mt-4 text-slate-600">{d.execution.summary}</p>
              <p className="mt-4 text-sm">
                <strong>Branch:</strong> <code>{d.execution.branchName}</code>
              </p>
              <div className="mt-4 space-y-2">
                {d.execution.changedFiles.map((file) => (
                  <div key={file.path} className="rounded-lg bg-slate-50 p-3">
                    <code>{file.path}</code>
                    <p className="text-sm text-slate-500">{file.summary}</p>
                  </div>
                ))}
              </div>
              {d.execution.pullRequestUrl && (
                <a
                  href={d.execution.pullRequestUrl}
                  className="mt-5 inline-flex items-center gap-2 font-bold text-emerald-700"
                >
                  Abrir resultado simulado <ExternalLink size={16} />
                </a>
              )}
            </Card>
          )}
        </div>
        <aside className="space-y-6">
          <Card className="p-6">
            <h2 className="font-bold">Elemento selecionado</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">Seletor</dt>
                <dd className="mt-1 break-all font-mono text-xs">{d.element.cssSelector}</dd>
              </div>
              <div>
                <dt className="text-slate-500">XPath</dt>
                <dd className="mt-1 break-all font-mono text-xs">{d.element.xpath}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Classes</dt>
                <dd className="mt-1">{d.element.classList.join(" · ") || "—"}</dd>
              </div>
            </dl>
            <details className="mt-5">
              <summary className="cursor-pointer font-semibold">HTML sanitizado</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-200">
                {d.element.outerHTML}
              </pre>
            </details>
          </Card>
          <Card className="p-6">
            <h2 className="font-bold">Pistas de código</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {d.code_search_hints.map((hint, index) => (
                <Badge key={`${hint.type}-${index}`}>
                  {hint.type}: {hint.value}
                </Badge>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="font-bold">Timeline</h2>
            <div className="mt-5 space-y-5">
              {d.events.map((event) => (
                <div key={event.id} className="relative border-l-2 border-slate-200 pl-4">
                  <span className="absolute -left-[5px] top-1 size-2 rounded-full bg-patch" />
                  <p className="text-sm font-semibold">{event.event_type.replaceAll("_", " ")}</p>
                  <p className="text-xs text-slate-500">
                    {event.actor_label} · {new Date(event.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
            {d.runs.some((r) => r.thread_id) && (
              <div className="mt-5 border-t pt-4">
                <p className="text-xs font-bold uppercase text-slate-500">Threads Deco Studio</p>
                {d.runs
                  .filter((r) => r.thread_id)
                  .map((r) => (
                    <code key={r.id} className="mt-2 block break-all text-xs">
                      {r.thread_id}
                    </code>
                  ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </AdminPage>
  );
}
