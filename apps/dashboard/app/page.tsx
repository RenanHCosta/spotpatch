"use client";
import { useQuery } from "@tanstack/react-query";
import { AdminPage } from "@/components/page";
import { api } from "@/lib/api";
import { Card } from "@spotpatch/ui";
import { Activity } from "lucide-react";
type Dashboard = {
  counts: Record<string, number>;
  last24Hours: number;
  recentActivity: Array<{ id: string; event_type: string; created_at: string }>;
  byProject: Array<{ name: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
};
const cards = [
  "new",
  "investigating",
  "awaiting_approval",
  "executing",
  "pull_request_opened",
  "completed",
  "failed",
];
export default function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/admin/dashboard"),
    refetchInterval: 5000,
  });
  return (
    <AdminPage>
      <header>
        <p className="text-sm font-semibold text-patch">OPERAÇÃO</p>
        <h1 className="mt-1 text-3xl font-black">Visão geral</h1>
        <p className="mt-2 text-slate-500">Acompanhe o caminho do clique até o Pull Request.</p>
      </header>
      {isLoading ? (
        <p className="mt-8">Carregando…</p>
      ) : error ? (
        <p className="mt-8 text-red-600">{error.message}</p>
      ) : (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((key) => (
              <Card key={key} className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {key.replaceAll("_", " ")}
                </p>
                <p className="mt-3 text-3xl font-black">{data?.counts[key] ?? 0}</p>
              </Card>
            ))}
            <Card className="border-patch/20 bg-orange-50 p-5">
              <p className="text-xs font-bold uppercase text-patch">Últimas 24h</p>
              <p className="mt-3 text-3xl font-black">{data?.last24Hours ?? 0}</p>
            </Card>
          </section>
          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-bold">
                <Activity size={18} />
                Atividade recente
              </h2>
              <div className="mt-4 space-y-3">
                {data?.recentActivity.length ? (
                  data.recentActivity.map((event) => (
                    <div key={event.id} className="border-l-2 border-slate-200 pl-4">
                      <p className="text-sm font-medium">{event.event_type.replaceAll("_", " ")}</p>
                      <time className="text-xs text-slate-500">
                        {new Date(event.created_at).toLocaleString("pt-BR")}
                      </time>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Nenhuma atividade ainda.</p>
                )}
              </div>
            </Card>
            <Card className="p-6">
              <h2 className="font-bold">Distribuição por projeto</h2>
              <div className="mt-5 space-y-4">
                {data?.byProject.map((row) => (
                  <div key={row.name}>
                    <div className="flex justify-between text-sm">
                      <span>{row.name}</span>
                      <strong>{row.count}</strong>
                    </div>
                    <div className="mt-2 h-2 rounded bg-slate-100">
                      <div
                        className="h-2 rounded bg-patch"
                        style={{ width: `${Math.max(4, row.count * 10)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        </>
      )}
    </AdminPage>
  );
}
