import { AdminPage } from "@/components/page";
import { Badge, Card } from "@spotpatch/ui";
export default function Settings() {
  return (
    <AdminPage>
      <header>
        <p className="text-sm font-semibold text-patch">SISTEMA</p>
        <h1 className="mt-1 text-3xl font-black">Configurações</h1>
      </header>
      <Card className="mt-7 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Provider dos agentes</h2>
          <Badge className="bg-orange-100 text-orange-800">Modo demonstração</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          O modo demo usa resultados determinísticos e Pull Requests claramente simulados. Defina{" "}
          <code>SPOTPATCH_AGENT_PROVIDER=deco_studio</code> somente depois de configurar agentes,
          API key e tools.
        </p>
      </Card>
      <Card className="mt-4 p-6">
        <h2 className="font-bold">Proteção administrativa do MVP</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          O token compartilhado é uma barreira simples para demonstração e instalações gerenciadas.
          Não oferece identidade, revogação por operador, MFA ou autorização granular.
        </p>
      </Card>
    </AdminPage>
  );
}
