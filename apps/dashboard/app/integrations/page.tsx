import { AdminPage } from "@/components/page";
import { ArrowUpRight } from "lucide-react";

const integrations = [
  { name: "Supabase", description: "Registro principal e screenshots privados", status: "servidor" },
  { name: "Deco Studio", description: "Threads, agentes e observabilidade", status: "configurável" },
  { name: "GitHub", description: "Connection gerenciada no Deco Studio", status: "não armazenado" },
];

export default function Integrations() {
  return (
    <AdminPage>
      <div className="min-h-[calc(100vh-104px)] bg-surface">
        <header className="flex h-9 items-center border-b border-line px-3">
          <h1 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Integrações</h1>
          <span className="ml-auto font-mono text-[11px] text-mute-soft">03 conexões</span>
        </header>
        <div className="divide-y divide-line">
          {integrations.map((integration) => (
            <div key={integration.name} className="flex min-h-14 items-center gap-4 px-3 py-2.5 hover:bg-canvas">
              <div className="min-w-0 flex-1">
                <h2 className="text-[12.5px] font-semibold">{integration.name}</h2>
                <p className="mt-0.5 truncate text-[11.5px] text-mute">{integration.description}</p>
              </div>
              <span className="hidden items-center gap-1.5 text-[11.5px] text-mute sm:inline-flex">
                <span className="size-1.5 rounded-full bg-accent" />
                {integration.status}
              </span>
              <button type="button" className="grid size-7 place-items-center rounded-[4px] text-mute hover:bg-surface" aria-label={`Abrir ${integration.name}`}>
                <ArrowUpRight size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="border-y border-line bg-accent-soft px-3 py-3 text-[12.5px] leading-5 text-ink">
          <strong>Secrets permanecem no servidor.</strong> A Deco API key, service role, credencial das tools e credenciais do GitHub nunca são enviadas ao dashboard ou à extensão.
        </div>
      </div>
    </AdminPage>
  );
}
