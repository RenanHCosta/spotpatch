"use client";
import { useQuery } from "@tanstack/react-query";
import { AdminPage } from "@/components/page";
import { MetricsStrip } from "@/components/metrics-strip";
import { Status } from "@/components/status";
import { api } from "@/lib/api";

type Dashboard = {
  counts: Record<string, number>;
  last24Hours: number;
  recentActivity: Array<{ id: string; event_type: string; created_at: string }>;
  byProject: Array<{ name: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
};

function time(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Overview() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/admin/dashboard"),
    refetchInterval: 5000,
  });
  const maxProjectCount = Math.max(1, ...(query.data?.byProject.map((row) => row.count) ?? [1]));

  return (
    <AdminPage>
      <div className="min-h-[calc(100vh-104px)] bg-surface">
        <MetricsStrip counts={query.data?.counts ?? {}} last24Hours={query.data?.last24Hours ?? 0} />
        <header className="flex h-9 items-center border-b border-line px-3">
          <h1 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
            Atividade recente
          </h1>
          <span className="ml-auto font-mono text-[11px] text-mute-soft">
            atualização automática · 05s
          </span>
        </header>
        {query.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-9 border border-line bg-canvas" />
            ))}
          </div>
        ) : query.error ? (
          <div className="border-t border-danger px-3 py-2 text-danger">{query.error.message}</div>
        ) : (
          <div className="grid min-[800px]:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)]">
            <section className="min-w-0 border-b border-line min-[800px]:border-b-0 min-[800px]:border-r">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="w-14" />
                  <col />
                  <col className="w-28" />
                  <col className="w-16" />
                </colgroup>
                <thead>
                  <tr className="h-8 border-b border-line text-left text-[10px] uppercase tracking-[0.08em] text-mute">
                    <th className="px-3 font-semibold">hora</th>
                    <th className="px-2 font-semibold">evento</th>
                    <th className="px-2 font-semibold">projeto</th>
                    <th className="px-2 font-semibold">status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {query.data?.recentActivity.length ? (
                    query.data.recentActivity.map((event) => (
                      <tr key={event.id} className="h-9 transition-colors duration-100 hover:bg-canvas">
                        <td className="px-3 font-mono text-[11px] text-mute-soft">{time(event.created_at)}</td>
                        <td className="truncate px-2 text-[12.5px]">{event.event_type.replaceAll("_", " ")}</td>
                        <td className="truncate px-2 font-mono text-[11px] text-mute">sistema</td>
                        <td className="px-2"><Status value="completed" compact /></td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={4} className="h-9 px-3 text-mute-soft">Vazio.</td></tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="min-w-0">
              <div className="flex h-8 items-center border-b border-line px-3">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
                  Distribuição por projeto
                </h2>
              </div>
              <div className="divide-y divide-line">
                {query.data?.byProject.length ? (
                  query.data.byProject.map((row) => (
                    <div key={row.name} className="px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[12.5px]">{row.name}</span>
                        <span className="font-mono text-[11px]">{String(row.count).padStart(2, "0")}</span>
                      </div>
                      <div className="mt-2 h-0.5 bg-line">
                        <div className="h-0.5 bg-accent" style={{ width: `${(row.count / maxProjectCount) * 100}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-3 text-mute-soft">Vazio.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
