"use client";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AdminPage } from "@/components/page";
import { Status } from "@/components/status";
import { api } from "@/lib/api";

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
  element: { cssSelector: string; xpath: string; outerHTML: string; classList: string[]; boundingBox: { width: number; height: number } };
  code_search_hints: Array<{ type: string; value: string; weight: number }>;
  project: { name: string };
  investigation: {
    summary: string;
    technicalHypothesis: string;
    recommendedAction: string;
    likelyFiles: Array<{ path: string; reason: string; confidence: number }>;
    riskLevel: string;
    confidence: number;
    canExecute: boolean;
  } | null;
  execution: {
    summary: string;
    branchName: string;
    pullRequestUrl: string | null;
    changedFiles: Array<{ path: string; summary: string }>;
  } | null;
  runs: Array<{ id: string; status: string; thread_id: string | null }>;
  events: Array<{ id: string; event_type: string; actor_label: string; created_at: string }>;
};
type SignedScreenshots = { viewportUrl: string | null; elementUrl: string | null; expiresIn: number };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="flex h-8 items-center border-y border-line px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">{children}</h2>;
}

export default function Feedback() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["feedback", id],
    queryFn: async () => {
      const current = await api<Detail>(`/api/admin/feedback/${id}`);
      const active = current.runs.find((run) => run.status === "in_progress");
      if (active) await api(`/api/admin/runs/${active.id}/sync`, { method: "POST", body: JSON.stringify({ feedbackId: id }) });
      return active ? api<Detail>(`/api/admin/feedback/${id}`) : current;
    },
    refetchInterval: (state) => state.state.data?.runs.some((run) => run.status === "in_progress") ? 1000 : 4000,
  });
  const screenshots = useQuery({
    queryKey: ["feedback-screenshots", id],
    queryFn: () => api<SignedScreenshots>(`/api/admin/feedback/${id}/screenshots`),
    enabled: Boolean(query.data),
    staleTime: 240000,
  });
  const action = useMutation({
    mutationFn: (name: string) => api(`/api/admin/feedback/${id}/${name}`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: "{}",
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["feedback", id] }),
  });

  if (query.isLoading) return <AdminPage><div className="space-y-1 p-3">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-9 border border-line bg-canvas" />)}</div></AdminPage>;
  if (!query.data) return <AdminPage><div className="border-t border-danger p-3 text-danger">Feedback não encontrado.</div></AdminPage>;
  const data = query.data;
  const canInvestigate = ["new", "failed", "needs_information"].includes(data.status);

  return (
    <AdminPage>
      <div className="min-h-[calc(100vh-104px)] bg-surface">
        <header className="flex min-h-10 items-center gap-3 border-b border-line px-3 py-1.5">
          <Link href="/backlog" className="grid size-7 shrink-0 place-items-center rounded-[4px] text-mute hover:bg-canvas" aria-label="Voltar ao backlog"><ArrowLeft size={16} /></Link>
          <span className="font-mono text-[11px] text-mute">#{String(data.public_number).padStart(2, "0")}</span>
          <h1 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{data.title}</h1>
          <Status value={data.status} />
          <div className="hidden gap-2 sm:flex">
            {canInvestigate && <button type="button" disabled={action.isPending} onClick={() => action.mutate("investigate")} className="h-8 rounded-[4px] bg-accent px-3 font-semibold text-surface hover:bg-accent-hover">Investigar</button>}
            {!["completed", "rejected", "pull_request_opened"].includes(data.status) && <button type="button" onClick={() => action.mutate("reject")} className="h-8 rounded-[4px] border border-line px-3 hover:bg-canvas">Rejeitar</button>}
          </div>
        </header>
        {action.error && <div className="border-b border-danger px-3 py-2 text-danger">{action.error.message}</div>}
        <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
          <main className="min-w-0 min-[900px]:border-r min-[900px]:border-line">
            <SectionTitle>Comentário original</SectionTitle>
            <div className="px-3 py-4 text-[13.5px] leading-6">{data.comment}</div>
            <SectionTitle>Captura da viewport</SectionTitle>
            <div className="bg-canvas">
              {screenshots.data?.viewportUrl ? (
                <a href={screenshots.data.viewportUrl} target="_blank" rel="noreferrer">
                  <Image src={screenshots.data.viewportUrl} alt={`Screenshot do feedback ${data.public_number}`} width={Math.max(1, data.viewport.width)} height={Math.max(1, data.viewport.height)} className="max-h-[640px] w-full object-contain" unoptimized />
                </a>
              ) : (
                <div className="grid aspect-video place-items-center border-b border-line font-mono text-[11px] text-mute-soft">
                  {screenshots.isLoading ? "carregando captura" : "captura indisponível"}
                </div>
              )}
            </div>
            {data.investigation && (
              <>
                <SectionTitle>Investigação · confiança {String(Math.round(data.investigation.confidence * 100)).padStart(2, "0")}% · risco {data.investigation.riskLevel}</SectionTitle>
                <div className="divide-y divide-line">
                  {[["Diagnóstico", data.investigation.summary], ["Hipótese técnica", data.investigation.technicalHypothesis], ["Recomendação", data.investigation.recommendedAction]].map(([label, value]) => (
                    <div key={label} className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[140px_1fr]"><h3 className="text-[11.5px] font-semibold">{label}</h3><p className="leading-5 text-mute">{value}</p></div>
                  ))}
                  {data.investigation.likelyFiles.map((file) => <div key={file.path} className="px-3 py-3"><code className="font-mono text-[11px]">{file.path}</code><p className="mt-1 text-[11.5px] text-mute">{file.reason}</p></div>)}
                </div>
              </>
            )}
            {data.execution && (
              <>
                <SectionTitle>Execução</SectionTitle>
                <div className="px-3 py-3"><p className="leading-5 text-mute">{data.execution.summary}</p><code className="mt-2 block font-mono text-[11px]">{data.execution.branchName}</code>
                  {data.execution.pullRequestUrl && <a href={data.execution.pullRequestUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-accent underline">Abrir Pull Request <ExternalLink size={14} /></a>}
                </div>
              </>
            )}
          </main>
          <aside className="min-w-0">
            <SectionTitle>Definição</SectionTitle>
            <dl className="divide-y divide-line">
              {[["Projeto", data.project.name], ["Página", data.page_url], ["Seletor", data.element.cssSelector], ["XPath", data.element.xpath]].map(([label, value]) => (
                <div key={label} className="px-3 py-2"><dt className="text-[10px] uppercase tracking-[0.08em] text-mute">{label}</dt><dd className="mt-1 break-all font-mono text-[11px]">{value}</dd></div>
              ))}
            </dl>
            <SectionTitle>Timeline</SectionTitle>
            <ol className="divide-y divide-line">
              {data.events.map((event) => <li key={event.id} className="relative px-3 py-2 pl-7"><span className="absolute left-3 top-3.5 size-1.5 rounded-full bg-mute-soft" /><p className="text-[11.5px]">{event.event_type.replaceAll("_", " ")}</p><p className="font-mono text-[10px] text-mute">{new Date(event.created_at).toLocaleString("pt-BR")} · {event.actor_label}</p></li>)}
            </ol>
          </aside>
        </div>
      </div>
    </AdminPage>
  );
}
