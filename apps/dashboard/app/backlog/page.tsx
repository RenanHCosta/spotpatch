"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AdminPage } from "@/components/page";
import { Status } from "@/components/status";
import { api } from "@/lib/api";
import { Card } from "@spotpatch/ui";
import { Search } from "lucide-react";
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
export default function Backlog() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["feedback"],
    queryFn: () => api<Item[]>("/api/admin/feedback"),
    refetchInterval: 4000,
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
  return (
    <AdminPage>
      <header>
        <p className="text-sm font-semibold text-patch">BACKLOG</p>
        <h1 className="mt-1 text-3xl font-black">Feedbacks</h1>
      </header>
      <Card className="mt-7 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
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
            <option value="all">Todos os status</option>
            <option value="new">Novos</option>
            <option value="investigating">Investigando</option>
            <option value="awaiting_approval">Aguardando aprovação</option>
            <option value="executing">Executando</option>
            <option value="pull_request_opened">PR aberto</option>
            <option value="failed">Falhas</option>
          </select>
        </div>
      </Card>
      {query.isLoading ? (
        <p className="mt-8">Carregando backlog…</p>
      ) : query.error ? (
        <button onClick={() => query.refetch()} className="mt-8 text-red-600">
          Erro ao carregar. Tentar novamente.
        </button>
      ) : rows.length === 0 ? (
        <Card className="mt-6 p-12 text-center text-slate-500">Nenhum feedback encontrado.</Card>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((item) => (
            <Link href={`/backlog/${item.id}`} key={item.id}>
              <Card className="mb-3 grid gap-4 p-5 transition hover:border-slate-400 md:grid-cols-[64px_1fr_auto]">
                <div className="grid size-14 place-items-center rounded-xl bg-slate-950 text-lg font-black text-white">
                  #{item.public_number}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold">{item.title}</h2>
                    <Status value={item.status} />
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-500">{item.comment}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {item.project.name} · {new URL(item.page_url).pathname} ·{" "}
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p className="font-bold uppercase">{item.priority}</p>
                  {item.investigation && (
                    <>
                      <p className="mt-2">
                        Confiança {Math.round(item.investigation.confidence * 100)}%
                      </p>
                      <p>Risco {item.investigation.riskLevel}</p>
                    </>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
