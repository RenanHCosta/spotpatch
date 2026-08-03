import { AdminPage } from "@/components/page";
import { Badge, Card } from "@spotpatch/ui";
import { Cable, Database, GitPullRequest } from "lucide-react";
export default function Integrations() {
  return (
    <AdminPage>
      <header>
        <p className="text-sm font-semibold text-patch">CONEXÕES</p>
        <h1 className="mt-1 text-3xl font-black">Integrações</h1>
      </header>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {[
          {
            name: "Supabase",
            description: "Registro principal e screenshots privados",
            icon: Database,
            status: "Servidor",
          },
          {
            name: "Deco Studio",
            description: "Threads, agentes e observabilidade",
            icon: Cable,
            status: "Configurável",
          },
          {
            name: "GitHub",
            description: "Connection gerenciada no Deco Studio",
            icon: GitPullRequest,
            status: "Não armazenado",
          },
        ].map(({ name, description, icon: Icon, status }) => (
          <Card key={name} className="p-6">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-100">
              <Icon size={20} />
            </span>
            <div className="mt-5 flex items-center justify-between">
              <h2 className="font-bold">{name}</h2>
              <Badge>{status}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6 border-amber-200 bg-amber-50 p-6">
        <h2 className="font-bold text-amber-900">Segredos permanecem no servidor</h2>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          A Deco API key, service role, credencial das tools e credenciais do GitHub nunca são
          enviadas ao dashboard ou à extensão.
        </p>
      </Card>
    </AdminPage>
  );
}
