"use client";

import Image from "next/image";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AdminPage } from "@/components/page";
import { MetricsStrip } from "@/components/metrics-strip";
import { Status } from "@/components/status";
import { api } from "@/lib/api";
import { cn } from "@spotpatch/ui";

type Item = {
  id: string;
  public_number: number;
  title: string;
  comment: string;
  project: { id: string; name: string };
  page_url: string;
  hostname?: string;
  category: string;
  priority: string;
  status: string;
  author_name: string | null;
  created_at: string;
  investigation: { confidence: number; riskLevel: string; canExecute?: boolean } | null;
  execution: { pullRequestUrl: string | null; previewUrl: string | null } | null;
};

type Detail = Item & {
  viewport: { width: number; height: number };
  element: { boundingBox: { width: number; height: number } };
  runs: Array<{ id: string; status: string; run_type: string }>;
  events: Array<{
    id: string;
    event_type: string;
    actor_label: string;
    created_at: string;
  }>;
};

type SignedScreenshots = {
  viewportUrl: string | null;
  elementUrl: string | null;
  expiresIn: number;
};

const columns = [
  {
    id: "intake",
    title: "Recebido",
    statuses: ["new", "queued_for_investigation"],
  },
  { id: "investigation", title: "Investigação", statuses: ["investigating"] },
  { id: "execution", title: "Execução", statuses: ["queued_for_execution", "executing"] },
  { id: "pr", title: "Pull request", statuses: ["pull_request_opened"] },
  { id: "completed", title: "Concluído", statuses: ["completed"] },
  {
    id: "blocked",
    title: "Bloqueados",
    statuses: ["needs_information", "failed", "rejected"],
  },
] as const;

const priorityLabels: Record<string, string> = {
  low: "baixa",
  medium: "média",
  high: "alta",
  critical: "alta",
};

function canStartInvestigation(item: Item) {
  return ["new", "failed", "needs_information"].includes(item.status);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityClass(priority: string) {
  if (["high", "critical"].includes(priority)) return "text-ink";
  if (priority === "medium") return "text-mute";
  return "text-mute-soft";
}

function FeedbackPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient();
  const [width, setWidth] = useState(420);
  const query = useQuery({
    queryKey: ["feedback", id],
    queryFn: async () => {
      const current = await api<Detail>("/api/admin/feedback/" + id);
      const active = current.runs.find((run) => run.status === "in_progress");
      if (active) await api(`/api/admin/runs/${active.id}/sync`, { method: "POST", body: JSON.stringify({ feedbackId: id }) });
      return active ? api<Detail>("/api/admin/feedback/" + id) : current;
    },
    refetchInterval: (state) => state.state.data?.runs.some((run) => run.status === "in_progress") ? 1000 : 4000,
  });
  const screenshots = useQuery({
    queryKey: ["feedback-screenshots", id],
    queryFn: () => api<SignedScreenshots>("/api/admin/feedback/" + id + "/screenshots"),
    enabled: Boolean(query.data),
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
  });
  const action = useMutation({
    mutationFn: (name: string) =>
      api("/api/admin/feedback/" + id + "/" + name, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: "{}",
      }),
    onMutate: async (name) => {
      if (name !== "investigate") return undefined;
      await client.cancelQueries({ queryKey: ["feedback"] });
      const previousList = client.getQueryData<Item[]>(["feedback"]);
      const previousDetail = client.getQueryData<Detail>(["feedback", id]);
      client.setQueryData<Item[]>(["feedback"], (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, status: "investigating" } : item,
        ),
      );
      client.setQueryData<Detail>(["feedback", id], (current) =>
        current ? { ...current, status: "investigating" } : current,
      );
      return { previousList, previousDetail };
    },
    onError: (_error, name, context) => {
      if (name !== "investigate" || !context) return;
      client.setQueryData(["feedback"], context.previousList);
      client.setQueryData(["feedback", id], context.previousDetail);
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["feedback", id] }),
        client.invalidateQueries({ queryKey: ["feedback"], exact: true }),
      ]);
    },
  });
  const deleteFeedback = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/admin/feedback/" + id, { method: "DELETE" }),
    onSuccess: async () => {
      client.setQueryData<Item[]>(["feedback"], (current) =>
        current?.filter((item) => item.id !== id),
      );
      client.removeQueries({ queryKey: ["feedback", id], exact: true });
      client.removeQueries({ queryKey: ["feedback-screenshots", id], exact: true });
      onClose();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["feedback"], exact: true }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  useEffect(() => {
    const saved = Number(localStorage.getItem("spotpatch_detail_width"));
    if (Number.isFinite(saved) && saved >= 300) setWidth(saved);
  }, []);

  function resizeBy(nextWidth: number) {
    setWidth(Math.min(Math.max(300, window.innerWidth * 0.72), Math.max(300, nextWidth)));
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (window.innerWidth < 640) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (pointerEvent: globalThis.PointerEvent) =>
      resizeBy(startWidth + startX - pointerEvent.clientX);
    const finish = (pointerEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.min(
        Math.max(300, window.innerWidth * 0.72),
        Math.max(300, startWidth + startX - pointerEvent.clientX),
      );
      setWidth(nextWidth);
      localStorage.setItem("spotpatch_detail_width", String(Math.round(nextWidth)));
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }

  const detail = query.data;
  const deletionBlocked = detail?.runs.some(
    (run) => run.status === "queued" || run.status === "in_progress",
  );
  const productionInProgress = detail?.runs.some(
    (run) => run.run_type === "production" && ["queued", "in_progress"].includes(run.status),
  );
  const panelStyle = { "--detail-width": width + "px" } as CSSProperties;

  return (
    <aside
      className="fixed inset-0 z-40 flex w-full flex-col border-l border-line bg-surface min-[640px]:relative min-[640px]:inset-auto min-[640px]:z-auto min-[640px]:h-full min-[640px]:w-[var(--detail-width)] min-[640px]:shrink-0"
      style={panelStyle}
      aria-label="Detalhe do feedback"
    >
      <button
        type="button"
        onPointerDown={beginResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") resizeBy(width + 24);
          if (event.key === "ArrowRight") resizeBy(width - 24);
        }}
        className="absolute bottom-0 left-0 top-0 z-10 hidden w-2 -translate-x-1/2 cursor-col-resize border-0 bg-transparent transition-colors duration-100 hover:bg-accent focus-visible:bg-accent min-[640px]:block"
        aria-label="Redimensionar painel de detalhes"
        title="Arraste para redimensionar"
      />
      <div className="flex h-10 shrink-0 items-center border-b border-line px-3">
        <button type="button" onClick={onClose} className="mr-2 grid size-7 place-items-center rounded-[4px] text-mute hover:bg-canvas min-[640px]:hidden" aria-label="Voltar">
          <ChevronLeft size={16} />
        </button>
        <span className="font-mono text-[11.5px] text-mute">
          {detail ? "#" + String(detail.public_number).padStart(2, "0") : "carregando"}
        </span>
        <span className="ml-2 hidden font-mono text-[10px] text-mute-soft min-[640px]:inline">{Math.round(width)}px</span>
        {detail && (
          <button
            type="button"
            disabled={deletionBlocked || deleteFeedback.isPending}
            onClick={() => {
              if (window.confirm(`Excluir o feedback #${String(detail.public_number).padStart(2, "0")} do board?`))
                deleteFeedback.mutate();
            }}
            className="ml-auto grid size-7 place-items-center rounded-[4px] text-danger hover:bg-canvas disabled:cursor-not-allowed disabled:text-mute-soft"
            aria-label="Excluir feedback do board"
            title={deletionBlocked ? "Aguarde a execução ativa terminar" : "Excluir do board"}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-[4px] text-mute hover:bg-canvas" aria-label="Fechar detalhe">
          <X size={16} />
        </button>
      </div>

      {query.isLoading ? (
        <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-9 border border-line bg-canvas" />)}</div>
      ) : !detail ? (
        <div className="border-t border-danger p-3 text-danger">Não foi possível carregar o detalhe.</div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="border-b border-line p-3">
              <h2 className="text-[13.5px] font-semibold leading-snug">{detail.title}</h2>
              <p className="mt-2 text-[12.5px] leading-5 text-mute">{detail.comment}</p>
            </section>
            <dl className="divide-y divide-line border-b border-line">
              {[
                ["Projeto", detail.project.name],
                ["Página", detail.page_url],
                ["Criado", formatDate(detail.created_at)],
                ["Prioridade", priorityLabels[detail.priority] ?? detail.priority],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[72px_1fr] gap-2 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">{label}</dt>
                  <dd className="min-w-0 break-all font-mono text-[11px] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <section className="border-b border-line p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Capturas</p>
              <div className="space-y-3">
                <Screenshot label="Viewport" url={screenshots.data?.viewportUrl} loading={screenshots.isLoading} width={detail.viewport.width} height={detail.viewport.height} />
                <Screenshot label="Elemento" url={screenshots.data?.elementUrl} loading={screenshots.isLoading} width={Math.max(1, Math.round(detail.element.boundingBox.width))} height={Math.max(1, Math.round(detail.element.boundingBox.height))} />
              </div>
              {screenshots.error && (
                <button type="button" onClick={() => screenshots.refetch()} className="mt-2 text-[11.5px] text-danger underline">
                  Falha ao carregar as capturas. Tentar novamente.
                </button>
              )}
            </section>
            <section className="p-3">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Timeline</p>
              <ol className="space-y-4">
                {detail.events.map((event) => (
                  <li key={event.id} className="relative pl-4">
                    <span className="absolute left-0 top-1.5 size-1.5 rounded-full bg-mute-soft" />
                    <p className="text-[11.5px] text-ink">{event.event_type.replaceAll("_", " ")}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-mute">{formatTime(event.created_at)} · {event.actor_label}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {(action.error || deleteFeedback.error) && (
            <div className="border-t border-danger px-3 py-2 text-[11.5px] text-danger">
              {action.error?.message || deleteFeedback.error?.message}
            </div>
          )}
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-line bg-surface p-3">
            {canStartInvestigation(detail) && <button type="button" disabled={action.isPending} onClick={() => action.mutate("investigate")} className="h-9 flex-1 rounded-[4px] bg-accent px-3 font-semibold text-surface hover:bg-accent-hover disabled:opacity-50">Investigar</button>}
            {detail.status === "pull_request_opened" && detail.execution?.previewUrl && <a href={detail.execution.previewUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-[4px] border border-line bg-surface px-3 font-semibold text-ink hover:bg-canvas">Ver preview <ExternalLink size={14} /></a>}
            {detail.status === "pull_request_opened" && <button type="button" disabled={action.isPending || productionInProgress} onClick={() => action.mutate("production")} className="h-9 flex-1 rounded-[4px] bg-accent px-3 font-semibold text-surface hover:bg-accent-hover disabled:opacity-50">{productionInProgress ? "Subindo..." : "Subir para produção"}</button>}
            {detail.status === "pull_request_opened" && detail.execution?.pullRequestUrl && <a href={detail.execution.pullRequestUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-[4px] border border-line bg-surface px-3 font-semibold text-ink hover:bg-canvas">Abrir PR <ExternalLink size={14} /></a>}
            {!["completed", "rejected", "pull_request_opened"].includes(detail.status) && <button type="button" disabled={action.isPending} onClick={() => action.mutate("reject")} className="h-9 rounded-[4px] border border-line bg-surface px-3 font-medium text-ink hover:bg-canvas disabled:opacity-50">Rejeitar</button>}
          </div>
        </>
      )}
    </aside>
  );
}

function Screenshot({ label, url, loading, width, height }: {
  label: string;
  url: string | null | undefined;
  loading: boolean;
  width: number;
  height: number;
}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] text-mute">{label}</p>
      {loading ? (
        <div className="aspect-video border border-line bg-canvas" />
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block border border-line bg-canvas">
          <Image src={url} alt={"Captura: " + label.toLowerCase()} width={Math.max(1, width)} height={Math.max(1, height)} className="max-h-80 w-full object-contain" referrerPolicy="no-referrer" unoptimized />
        </a>
      ) : (
        <div className="grid aspect-video place-items-center border border-line bg-canvas font-mono text-[11px] text-mute-soft">captura indisponível</div>
      )}
    </div>
  );
}

export default function Backlog() {
  const client = useQueryClient();
  const [view, setViewState] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [mobileColumn, setMobileColumn] = useState("intake");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [intakeMenuOpen, setIntakeMenuOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get("view");
    const savedView = localStorage.getItem("spotpatch_backlog_view");
    const nextView = urlView === "table" || urlView === "board"
      ? urlView
      : savedView === "table" ? "table" : "board";
    setViewState(nextView);
    setStatusState(params.get("status") ?? "all");
    setSearch(params.get("search") ?? "");
    setProjectFilter(params.get("project") ?? localStorage.getItem("spotpatch_current_project") ?? "all");
    const handleProjectChange = (event: Event) =>
      setProjectFilter((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener("spotpatch:project-change", handleProjectChange);
    return () => window.removeEventListener("spotpatch:project-change", handleProjectChange);
  }, []);

  function updateUrl(next: { view?: string; status?: string; search?: string }) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    window.history.replaceState(null, "", `/backlog${queryString ? `?${queryString}` : ""}`);
  }

  function setView(next: "board" | "table") {
    setViewState(next);
    localStorage.setItem("spotpatch_backlog_view", next);
    updateUrl({ view: next });
  }

  function setStatus(next: string) {
    setStatusState(next);
    updateUrl({ status: next });
  }

  const query = useQuery({
    queryKey: ["feedback"],
    queryFn: () => api<Item[]>("/api/admin/feedback"),
    refetchInterval: 4000,
  });
  const startInvestigation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/feedback/${id}/investigate`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: "{}",
      }),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: ["feedback"], exact: true });
      const previous = client.getQueryData<Item[]>(["feedback"]);
      setOptimisticStatuses((current) => ({ ...current, [id]: "investigating" }));
      client.setQueryData<Item[]>(["feedback"], (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, status: "investigating" } : item,
        ),
      );
      return { previous };
    },
    onError: (_error, id, context) => {
      client.setQueryData(["feedback"], context?.previous);
      setOptimisticStatuses((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    onSuccess: async (_data, id) => {
      await client.invalidateQueries({ queryKey: ["feedback"], exact: true });
      setOptimisticStatuses((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
  });
  const startSelectedInvestigations = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          api(`/api/admin/feedback/${id}/investigate`, {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: "{}",
          }),
        ),
      ),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: ["feedback"], exact: true });
      const previous = client.getQueryData<Item[]>(["feedback"]);
      setOptimisticStatuses((current) => ({
        ...current,
        ...Object.fromEntries(ids.map((id) => [id, "investigating"])),
      }));
      client.setQueryData<Item[]>(["feedback"], (current) =>
        current?.map((item) =>
          ids.includes(item.id) ? { ...item, status: "investigating" } : item,
        ),
      );
      return { previous };
    },
    onError: (_error, ids, context) => {
      client.setQueryData(["feedback"], context?.previous);
      setOptimisticStatuses((current) => {
        const next = { ...current };
        for (const id of ids) delete next[id];
        return next;
      });
    },
    onSuccess: async (_data, ids) => {
      setSelectedIds(new Set());
      await client.invalidateQueries({ queryKey: ["feedback"], exact: true });
      setOptimisticStatuses((current) => {
        const next = { ...current };
        for (const id of ids) delete next[id];
        return next;
      });
    },
  });

  const feedbackRows = useMemo(
    () =>
      (query.data ?? []).map((item) => {
        const optimisticStatus = optimisticStatuses[item.id];
        return optimisticStatus ? { ...item, status: optimisticStatus } : item;
      }),
    [optimisticStatuses, query.data],
  );
  const projectRows = useMemo(
    () => feedbackRows.filter((item) => projectFilter === "all" || item.project.id === projectFilter),
    [feedbackRows, projectFilter],
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of projectRows) result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, [projectRows]);
  const last24Hours = useMemo(
    () => projectRows.filter((item) => Date.now() - new Date(item.created_at).getTime() <= 86400000).length,
    [projectRows],
  );
  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return projectRows.filter((item) => {
      const matchesStatus =
        status === "all" ||
        (status === "last24h"
          ? Date.now() - new Date(item.created_at).getTime() <= 86400000
          : item.status === status);
      const matchesSearch =
        !normalizedSearch ||
        `${item.title} ${item.project.name} ${item.page_url}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [projectRows, search, status]);
  const visibleColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        items: rows.filter((item) => column.statuses.some((value) => value === item.status)),
      })),
    [rows],
  );
  const selectableRows = rows.filter(canStartInvestigation);
  const selectedActionIds = selectableRows
    .filter((item) => selectedIds.has(item.id))
    .map((item) => item.id);
  const draggedItem = feedbackRows.find((item) => item.id === draggingId);
  const canDropOnInvestigation = Boolean(draggedItem && canStartInvestigation(draggedItem));

  function handleDragStart(event: DragEvent<HTMLElement>, item: Item) {
    if (!canStartInvestigation(item)) return;
    setDraggingId(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }

  function handleDrop(event: DragEvent<HTMLElement>, columnId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    const item = feedbackRows.find((candidate) => candidate.id === id);
    setDraggingId(null);
    setDropTarget(null);
    if (columnId === "investigation" && item && canStartInvestigation(item)) {
      startInvestigation.mutate(item.id);
    }
  }

  return (
    <AdminPage>
      <div className="flex h-[calc(100vh-104px)] min-h-[520px] overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
        <MetricsStrip
          counts={counts}
          last24Hours={last24Hours}
          active={status}
          onSelect={(next) => setStatus(status === next ? "all" : next)}
        />

        <div className="flex h-9 shrink-0 items-center border-b border-line bg-surface px-3">
          <div className="flex h-7 rounded-[4px] border border-line p-px" aria-label="Modo de visualização">
            {(["table", "board"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "h-6 rounded-[3px] px-2.5 text-[11.5px] text-mute transition-colors duration-100",
                  view === mode && "bg-ink text-surface",
                )}
                aria-pressed={view === mode}
              >
                {mode === "table" ? "Tabela" : "Board"}
              </button>
            ))}
          </div>
          <span className="ml-3 hidden font-mono text-[11px] text-mute sm:inline">
            {rows.length} {rows.length === 1 ? "item" : "itens"} · agrupado por status
          </span>
          <label className="ml-auto hidden h-7 w-44 items-center border-l border-line pl-3 md:flex">
            <Search size={14} className="text-mute" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                updateUrl({ search: event.target.value });
              }}
              placeholder="Filtrar"
              aria-label="Filtrar backlog"
              className="min-w-0 flex-1 bg-transparent px-2 text-[11.5px]"
            />
          </label>
          <a href="/demo" className="ml-3 inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline">
            <Plus size={14} />
            Novo
          </a>
        </div>

        <div className="scrollbar-none flex h-9 shrink-0 items-center gap-4 overflow-x-auto border-b border-line px-3 min-[640px]:hidden">
          {columns.map((column) => (
            <button
              key={column.id}
              type="button"
              onClick={() => setMobileColumn(column.id)}
              className={cn(
                "relative h-9 shrink-0 text-[11.5px] text-mute",
                mobileColumn === column.id &&
                  "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink",
              )}
            >
              {column.title}
            </button>
          ))}
        </div>

        {(startInvestigation.error || startSelectedInvestigations.error || query.error) && (
          <div className="border-b border-t border-danger px-3 py-2 text-[11.5px] text-danger">
            {query.error?.message ||
              startInvestigation.error?.message ||
              startSelectedInvestigations.error?.message}
            {query.error && (
              <button type="button" onClick={() => query.refetch()} className="ml-2 underline">
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {query.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-9 border border-line bg-canvas" />
            ))}
          </div>
        ) : view === "board" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="hidden h-full overflow-x-auto overscroll-x-contain min-[640px]:flex">
              {visibleColumns.map((column) => (
                <section
                  key={column.id}
                  className={cn(
                    "flex h-full w-[248px] shrink-0 flex-col border-r border-line",
                    dropTarget === column.id && "border-t-2 border-t-accent",
                  )}
                  onDragOver={(event) => {
                    if (column.id !== "investigation" || !canDropOnInvestigation) return;
                    event.preventDefault();
                    setDropTarget(column.id);
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => handleDrop(event, column.id)}
                >
                  <ColumnHeader
                    title={column.title}
                    count={column.items.length}
                    menu={
                      column.id === "intake" ? (
                        <div className="relative">
                          <button
                            type="button"
                            className="grid size-7 place-items-center rounded-[4px] text-mute hover:bg-canvas"
                            onClick={() => setIntakeMenuOpen((open) => !open)}
                            aria-label="Ações da entrada"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {intakeMenuOpen && (
                            <div className="absolute right-0 top-7 z-20 w-44 border border-line bg-surface p-1">
                              <button
                                type="button"
                                className="h-8 w-full px-2 text-left text-[11.5px] hover:bg-canvas"
                                onClick={() =>
                                  setSelectedIds(new Set(selectableRows.map((item) => item.id)))
                                }
                              >
                                Marcar disponíveis
                              </button>
                              <button
                                type="button"
                                disabled={!selectedActionIds.length || startSelectedInvestigations.isPending}
                                className="h-8 w-full px-2 text-left text-[11.5px] hover:bg-canvas disabled:text-mute-soft"
                                onClick={() => startSelectedInvestigations.mutate(selectedActionIds)}
                              >
                                Investigar ({String(selectedActionIds.length).padStart(2, "0")})
                              </button>
                            </div>
                          )}
                        </div>
                      ) : undefined
                    }
                  />
                  <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
                    {column.items.length ? (
                      column.items.map((item) => (
                        <FeedbackRow
                          key={item.id}
                          item={item}
                          selected={selectedIds.has(item.id)}
                          dragging={draggingId === item.id}
                          onOpen={() => setSelectedId(item.id)}
                          onToggle={() => {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                          onDragStart={(event) => handleDragStart(event, item)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                        />
                      ))
                    ) : (
                      <p className="px-3 py-3 text-[11.5px] text-mute-soft">Vazio.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
            <div className="h-full min-[640px]:hidden">
              {visibleColumns
                .filter((column) => column.id === mobileColumn)
                .map((column) => (
                  <div key={column.id} className="h-full divide-y divide-line overflow-y-auto">
                    {column.items.length ? (
                      column.items.map((item) => (
                        <FeedbackRow
                          key={item.id}
                          item={item}
                          selected={selectedIds.has(item.id)}
                          dragging={false}
                          onOpen={() => setSelectedId(item.id)}
                          onToggle={() => undefined}
                          onDragStart={() => undefined}
                          onDragEnd={() => undefined}
                        />
                      ))
                    ) : (
                      <p className="px-3 py-3 text-[11.5px] text-mute-soft">Vazio.</p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length ? (
              <>
                <table className="hidden w-full table-fixed border-collapse min-[640px]:table">
                  <colgroup>
                    <col className="w-12" />
                    <col className="w-12" />
                    <col />
                    <col className="w-32" />
                    <col className="w-20" />
                  </colgroup>
                  <thead className="sticky top-0 bg-surface">
                    <tr className="h-8 border-b border-line text-left text-[10px] uppercase tracking-[0.08em] text-mute">
                      <th className="px-2 font-semibold">id</th>
                      <th className="px-2 font-semibold">hora</th>
                      <th className="px-2 font-semibold">feedback</th>
                      <th className="px-2 font-semibold">projeto</th>
                      <th className="px-2 font-semibold">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((item) => (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelectedId(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") setSelectedId(item.id);
                        }}
                        className="h-9 cursor-pointer transition-colors duration-100 hover:bg-canvas"
                      >
                        <td className="truncate px-2 font-mono text-[11px] text-mute">
                          {String(item.public_number).padStart(2, "0")}
                        </td>
                        <td className="px-2 font-mono text-[11px] text-mute-soft">{formatTime(item.created_at)}</td>
                        <td className="truncate px-2 text-[12.5px]">{item.title}</td>
                        <td className="truncate px-2 font-mono text-[11px] text-mute">{item.project.name}</td>
                        <td className="px-2"><Status value={item.status} compact /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="divide-y divide-line min-[640px]:hidden">
                  {rows.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="block w-full px-3 py-2.5 text-left hover:bg-canvas"
                    >
                      <span className="line-clamp-2 text-[12.5px] leading-snug">{item.title}</span>
                      <span className="mt-1 block font-mono text-[11px] text-mute">
                        #{String(item.public_number).padStart(2, "0")} · {formatTime(item.created_at)} · {item.project.name}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="px-3 py-3 text-mute-soft">
                Vazio.{" "}
                <button type="button" onClick={() => setStatus("all")} className="text-accent underline">
                  Limpar filtro
                </button>
              </p>
            )}
          </div>
        )}
      </div>
      {selectedId && <FeedbackPanel id={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </AdminPage>
  );
}

function ColumnHeader({
  title,
  count,
  menu,
}: {
  title: string;
  count: number;
  menu?: React.ReactNode;
}) {
  return (
    <header className="flex h-8 shrink-0 items-center border-b border-line px-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">{title}</h2>
      <span className="ml-2 font-mono text-[11px] text-mute-soft">
        {String(count).padStart(2, "0")}
      </span>
      <span className="ml-auto">{menu}</span>
    </header>
  );
}

function FeedbackRow({
  item,
  selected,
  dragging,
  onOpen,
  onToggle,
  onDragStart,
  onDragEnd,
}: {
  item: Item;
  selected: boolean;
  dragging: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const draggable = canStartInvestigation(item);
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative px-3 py-2.5 transition-colors duration-100 hover:bg-canvas",
        dragging && "opacity-50",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="flex items-center justify-between gap-2 font-mono text-[11px]">
          <span className="text-mute">#{String(item.public_number).padStart(2, "0")}</span>
          <span className="text-mute-soft">{formatTime(item.created_at)}</span>
        </span>
        <span className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug">{item.title}</span>
        <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[11.5px]">
          <Status value={item.status} compact />
          <span className={priorityClass(item.priority)}>
            {priorityLabels[item.priority] ?? item.priority}
          </span>
          <span className="ml-auto max-w-24 truncate font-mono text-[11px] text-mute">
            {item.project.name}
          </span>
        </span>
      </button>
      {draggable && (
        <div className="absolute bottom-1.5 right-2 hidden items-center gap-1 group-hover:flex">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "grid size-5 place-items-center rounded-[4px] border border-line bg-surface text-mute",
              selected && "border-accent text-accent",
            )}
            aria-label={selected ? "Desmarcar feedback" : "Marcar feedback"}
          >
            {selected && <Check size={12} />}
          </button>
          <GripVertical size={14} className="text-mute" aria-hidden />
        </div>
      )}
    </article>
  );
}
