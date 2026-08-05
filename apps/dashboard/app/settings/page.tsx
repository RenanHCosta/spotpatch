import { AdminPage } from "@/components/page";

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <header className="flex h-8 items-center border-y border-line px-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">{title}</h2>
      </header>
      <div className="divide-y divide-line">{children}</div>
      {action && <footer className="flex h-12 items-center justify-end border-t border-line px-3">{action}</footer>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[200px_1fr]">
      <span className="text-[11.5px] text-mute">{label}</span>
      <div className="min-w-0 text-[12.5px]">{children}</div>
    </div>
  );
}

export default function Settings() {
  return (
    <AdminPage>
      <div className="min-h-[calc(100vh-104px)] bg-surface">
        <header className="flex h-9 items-center px-3">
          <h1 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Configurações</h1>
        </header>
        <Section title="Provider dos agentes">
          <Field label="Modo atual">
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warn" />demonstração</span>
          </Field>
          <Field label="Variável de ambiente">
            <code className="break-all font-mono text-[11px]">SPOTPATCH_AGENT_PROVIDER=deco_studio</code>
          </Field>
          <Field label="Execução">
            <p className="max-w-2xl leading-5 text-mute">O modo demo usa resultados determinísticos e Pull Requests claramente simulados. Ative o provider somente depois de configurar agentes, API key e tools.</p>
          </Field>
        </Section>
        <Section title="Proteção administrativa do MVP">
          <Field label="Credencial">
            <code className="font-mono text-[11px]">SPOTPATCH_ADMIN_TOKEN</code>
          </Field>
          <Field label="Escopo">
            <p className="max-w-2xl leading-5 text-mute">Barreira simples para demonstração e instalações gerenciadas. Não oferece identidade, revogação por operador, MFA ou autorização granular.</p>
          </Field>
        </Section>
      </div>
    </AdminPage>
  );
}
