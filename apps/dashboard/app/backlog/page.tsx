"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DragEvent, useMemo, useState } from "react";
import { AdminPage } from "@/components/page";
import { Status } from "@/components/status";
import { api } from "@/lib/api";
import { Badge, Card, cn } from "@spotpatch/ui";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  GitPullRequest,
  GripVertical,
  MoreHorizontal,
  Search,
  Timer,
  type LucideIcon,
} from "lucide-react";

type Item = {
  id: string;
  public_number: number;
  title: string;
  comment: string;
  project: { name: string };
  page_url: string;
  category: string;
  priority: string;
  status: string;
  author_name: string | null;
  created_at: string;
  investigation: { confidence: number; riskLevel: string } | null;
  execution: { pullRequestUrl: string | null } | null;
};
type KanbanColumn = {
  id: string;
  title: string;
  description: string;
  statuses: string[];
  icon: LucideIcon;
  accent: string;
};

const kanbanColumns: KanbanColumn[] = [
  {
    id: "intake",
    title: "Entrada",
    description: "Feedbacks capturados e prontos para o agente iniciar.",
    statuses: ["new", "queued_for_investigation"],
    icon: Timer,
    accent: "border-t-slate-500",
  },
  {
    id: "investigation",
    title: "Investigação",
    description: "O agente está entendendo impacto, arquivos e risco.",
    statuses: ["investigating"],
    icon: Bot,
    accent: "border-t-blue-500",
  },
  {
    id: "approval",
    title: "Aprovação",
    description: "Análise pronta para revisão antes de executar.",
    statuses: ["awaiting_approval", "queued_for_execution"],
    icon: CheckCircle2,
    accent: "border-t-amber-500",
  },
  {
    id: "execution",
    title: "Execução",
    description: "Mudança em andamento pelo agente executor.",
    statuses: ["executing"],
    icon: Bot,
    accent: "border-t-indigo-500",
  },
  {
    id: "pr",
    title: "PR / concluído",
    description: "Resultado gerado, fechado ou aguardando revisão externa.",
    statuses: ["pull_request_opened", "completed"],
    icon: GitPullRequest,
    accent: "border-t-emerald-500",
  },
  {
    id: "blocked",
    title: "Bloqueados",
    description: "Itens que exigem informação, retry ou decisão manual.",
    statuses: ["needs_information", "failed", "rejected"],
    icon: AlertTriangle,
    accent: "border-t-red-500",
  },
];
const statusOptions = [
  ["all", "Todos os status"],
  ["new", "Novos"],
  ["queued_for_investigation", "Investigação na fila"],
  ["investigating", "Investigando"],
  ["needs_information", "Precisa de informação"],
  ["awaiting_approval", "Aguardando aprovação"],
  ["queued_for_execution", "Execução na fila"],
  ["executing", "Executando"],
  ["pull_request_opened", "PR aberto"],
  ["completed", "Concluídos"],
  ["failed", "Falhas"],
  ["rejected", "Rejeitados"],
] as const;
const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

function canStartInvestigation(item: Item) {
  return ["new", "failed", "needs_information"].includes(item.status);
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function priorityClass(priority: string) {
  if (priority === "critical") return "bg-red-100 text-red-700 ring-1 ring-red-200";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  return "bg-slate-100 text-slate-700";
}

export default function Backlog() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [intakeMenuOpen, setIntakeMenuOpen] = useState(false);
  const client = useQueryClient();
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
    onSuccess: () => client.invalidateQueries({ queryKey: ["feedback"] }),
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
    onSuccess: () => {
      setSelectedIds(new Set());
      client.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
  const rows = useMemo(
    () =>
      query.data?.filter(
        (item) =>
          (status === "all" || item.status === status) &&
          `${item.title} ${item.project.name} ${item.page_url}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) ?? [],
    [query.data, search, status],
  );
  const selectableRows = useMemo(
    () =>
      rows
        .filter((item) =>
          kanbanColumns.find((column) => column.id === "intake")?.statuses.includes(item.status),
        )
        .filter(canStartInvestigation),
    [rows],
  );
  const selectedActionIds = useMemo(
    () => selectableRows.filter((item) => selectedIds.has(item.id)).map((item) => item.id),
    [selectableRows, selectedIds],
  );
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((item) => selectedIds.has(item.id));
  const totalByStatus = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of query.data ?? []) totals[item.status] = (totals[item.status] ?? 0) + 1;
    return totals;
  }, [query.data]);
  const visibleColumns = useMemo(
    () =>
      kanbanColumns.map((column) => ({
        ...column,
        items: rows.filter((item) => column.statuses.includes(item.status)),
        total: column.statuses.reduce(
          (sum, itemStatus) => sum + (totalByStatus[itemStatus] ?? 0),
          0,
        ),
      })),
    [rows, totalByStatus],
  );
  const draggedItem = useMemo(
    () => query.data?.find((item) => item.id === draggingId) ?? null,
    [draggingId, query.data],
  );
  const canDropOnInvestigation = Boolean(draggedItem && canStartInvestigation(draggedItem));

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelectableSelected) {
        for (const item of selectableRows) next.delete(item.id);
      } else {
        for (const item of selectableRows) next.add(item.id);
      }
      return next;
    });
  }
  function moveSelectedToInvestigation() {
    if (selectedActionIds.length === 0) return;
    startSelectedInvestigations.mutate(selectedActionIds);
  }
  function handleDragStart(event: DragEvent<HTMLElement>, item: Item) {
    if (!canStartInvestigation(item)) return;
    setDraggingId(item.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }
  function handleDragOver(event: DragEvent<HTMLElement>, columnId: string) {
    if (columnId !== "investigation" || !canDropOnInvestigation) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(columnId);
  }
  function handleDrop(event: DragEvent<HTMLElement>, columnId: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    const item = query.data?.find((candidate) => candidate.id === id);
    setDraggingId(null);
    setDropTarget(null);
    if (columnId !== "investigation" || !item || !canStartInvestigation(item)) return;
    startInvestigation.mutate(item.id);
  }

  return (
    <AdminPage>
      <div className="flex h-[calc(100vh-80px)] min-h-0 flex-col">
        <header>
          <p className="text-sm font-semibold text-patch">BACKLOG</p>
          <h1 className="mt-1 text-3xl font-black">Feedbacks</h1>
        </header>
        <Card className="mt-5 shrink-0 p-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <label className="flex flex-1 items-center gap-2 rounded-lg border px-3">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar feedback, projeto ou página"
                className="h-10 flex-1 outline-none"
              />
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-lg border px-3"
            >
              {statusOptions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </Card>
        {(startInvestigation.error || startSelectedInvestigations.error) && (
          <p className="mt-4 text-sm text-red-600">
            {startInvestigation.error?.message || startSelectedInvestigations.error?.message}
          </p>
        )}
        {query.isLoading ? (
          <p className="mt-8">Carregando backlog...</p>
        ) : query.error ? (
          <button onClick={() => query.refetch()} className="mt-8 text-red-600">
            Erro ao carregar. Tentar novamente.
          </button>
        ) : rows.length === 0 ? (
          <Card className="mt-6 p-12 text-center text-slate-500">Nenhum feedback encontrado.</Card>
        ) : (
          <div className="mt-5 min-h-0 flex-1 overflow-x-auto pb-1">
            <div className="grid h-full min-h-0 min-w-[1180px] grid-cols-6 gap-4">
              {visibleColumns.map((column) => {
                const Icon = column.icon;
                const isInvestigationDrop = column.id === "investigation" && canDropOnInvestigation;
                return (
                  <section
                    className={cn(
                      "flex min-h-0 flex-col rounded-lg border border-slate-200 border-t-4 bg-slate-50 transition",
                      column.accent,
                      dropTarget === column.id && "border-blue-400 bg-blue-50",
                      isInvestigationDrop && "ring-2 ring-blue-100",
                    )}
                    key={column.id}
                    onDragOver={(event) => handleDragOver(event, column.id)}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(event) => handleDrop(event, column.id)}
                  >
                    <div className="border-b border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-slate-500" />
                          <h2 className="text-sm font-black uppercase tracking-wide">
                            {column.title}
                          </h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{column.items.length}</Badge>
                          {column.id === "intake" && (
                            <div className="relative">
                              <button
                                className="inline-flex size-8 items-center justify-center rounded-lg border bg-white text-slate-500 hover:bg-slate-100"
                                onClick={() => setIntakeMenuOpen((open) => !open)}
                                title="Ações da entrada"
                              >
                                <MoreHorizontal size={16} />
                              </button>
                              {intakeMenuOpen && (
                                <div className="absolute right-0 top-9 z-10 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                                  <button
                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                                    disabled={selectableRows.length === 0}
                                    onClick={toggleAllVisible}
                                  >
                                    {allSelectableSelected ? "Limpar seleção" : "Marcar todas"}
                                  </button>
                                  <button
                                    className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:text-slate-400"
                                    disabled={
                                      selectedActionIds.length === 0 ||
                                      startSelectedInvestigations.isPending
                                    }
                                    onClick={moveSelectedToInvestigation}
                                  >
                                    Mover marcadas ({selectedActionIds.length})
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
                        {column.description}
                      </p>
                      {column.id === "investigation" && canDropOnInvestigation && (
                        <p className="mt-2 rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                          Solte aqui para iniciar a investigação.
                        </p>
                      )}
                      {column.total !== column.items.length && (
                        <p className="mt-2 text-xs font-semibold text-slate-400">
                          {column.total} no total desta etapa
                        </p>
                      )}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                      {column.items.length === 0 ? (
                        <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-slate-300 px-3 text-center text-xs text-slate-400">
                          Sem tarefas nesta coluna.
                        </div>
                      ) : (
                        column.items.map((item) => {
                          const selectable = canStartInvestigation(item);
                          const draggable = column.id === "intake" && selectable;
                          return (
                            <article
                              draggable={draggable}
                              key={item.id}
                              onDragEnd={handleDragEnd}
                              onDragStart={(event) => handleDragStart(event, item)}
                              className={cn(
                                "group",
                                draggingId === item.id && "opacity-50",
                                draggable && "cursor-grab active:cursor-grabbing",
                              )}
                            >
                              <Card
                                className={cn(
                                  "p-3 transition hover:border-slate-400 hover:shadow-md",
                                  selectedIds.has(item.id) &&
                                    "border-slate-500 ring-2 ring-slate-200",
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 flex-1 gap-2">
                                    <input
                                      checked={selectedIds.has(item.id)}
                                      className="mt-1 size-4 shrink-0"
                                      disabled={!selectable}
                                      onChange={() => toggleSelection(item.id)}
                                      type="checkbox"
                                    />
                                    <Link href={`/backlog/${item.id}`} className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-slate-400">
                                        #{item.public_number}
                                      </p>
                                      <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5">
                                        {item.title}
                                      </h3>
                                    </Link>
                                  </div>
                                  {draggable && (
                                    <GripVertical className="mt-1 size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
                                  )}
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                  <p className="text-xs text-slate-500">
                                    {formatDate(item.created_at)}
                                  </p>
                                  <Badge className={cn("shrink-0", priorityClass(item.priority))}>
                                    {priorityLabels[item.priority] ?? item.priority}
                                  </Badge>
                                </div>
                                <div className="mt-3">
                                  <Status value={item.status} />
                                </div>
                              </Card>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
