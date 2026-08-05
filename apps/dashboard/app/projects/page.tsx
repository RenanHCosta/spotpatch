"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AdminPage } from "@/components/page";
import { api } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  allowed_domains: z.string().min(1, "Informe pelo menos um domínio"),
});
type Form = z.infer<typeof schema>;
type Project = {
  id: string;
  name: string;
  slug: string;
  site_url: string;
  allowed_domains: string[];
  repository_owner: string;
  repository_name: string;
  default_branch: string;
  agent_mode: string;
  is_active: boolean;
  feedback_count?: number;
  created_at?: string;
};

function slugify(value: string) {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `projeto-${Date.now()}`;
}
function parseDomains(value: string) {
  return value.split(",").map((domain) => domain.trim()).filter(Boolean);
}
function siteUrlFromDomain(domain: string) {
  if (/^https?:\/\//i.test(domain)) return domain;
  const clean = domain.replace(/^\*\./, "");
  const protocol = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean) ? "http" : "https";
  return `${protocol}://${clean}`;
}

function ProjectDrawer({
  editing,
  onClose,
}: {
  editing: Project | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: editing?.name ?? "", allowed_domains: editing?.allowed_domains.join(", ") ?? "localhost" },
  });
  useEffect(() => {
    form.reset({
      name: editing?.name ?? "",
      allowed_domains: editing?.allowed_domains.join(", ") ?? "localhost",
    });
  }, [editing, form]);

  const save = useMutation({
    mutationFn: (values: Form) => {
      if (editing) {
        return api(`/api/admin/projects/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: values.name,
            allowed_domains: parseDomains(values.allowed_domains),
          }),
        });
      }
      const domains = parseDomains(values.allowed_domains);
      const slug = slugify(values.name);
      return api("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          slug,
          site_url: siteUrlFromDomain(domains[0] ?? "localhost"),
          allowed_domains: domains,
          repository_provider: "github",
          repository_owner: "deco-studio",
          repository_name: slug,
          default_branch: "main",
          agent_mode: "autonomous_pr",
          agent_tier: "smart",
          is_active: true,
        }),
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });

  return (
    <aside className="fixed inset-0 z-40 flex flex-col border-l border-line bg-surface min-[640px]:left-auto min-[640px]:top-10 min-[640px]:w-[360px]" aria-label={editing ? "Editar projeto" : "Novo projeto"}>
      <header className="flex h-10 items-center border-b border-line px-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
          {editing ? "Editar projeto" : "Novo projeto"}
        </h2>
        <button type="button" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded-[4px] text-mute hover:bg-canvas" aria-label="Fechar">
          <X size={16} />
        </button>
      </header>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          <label className="block px-3 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Nome do projeto</span>
            <input {...form.register("name")} autoFocus className="mt-2 h-9 w-full rounded-[4px] border border-line px-3 text-[12.5px]" />
            {form.formState.errors.name && <span className="mt-1 block text-[11.5px] text-danger">{form.formState.errors.name.message}</span>}
          </label>
          <label className="block px-3 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Domínios permitidos</span>
            <input {...form.register("allowed_domains")} className="mt-2 h-9 w-full rounded-[4px] border border-line px-3 font-mono text-[11.5px]" />
            {form.formState.errors.allowed_domains && <span className="mt-1 block text-[11.5px] text-danger">{form.formState.errors.allowed_domains.message}</span>}
          </label>
          <div className="px-3 py-3 text-[11.5px] leading-5 text-mute">
            Separe múltiplos domínios por vírgula. Wildcards de subdomínio são aceitos.
          </div>
        </div>
        {save.error && <div className="border-t border-danger px-3 py-2 text-[11.5px] text-danger">{save.error.message}</div>}
        <footer className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-line px-3">
          <button type="button" onClick={onClose} className="h-9 rounded-[4px] border border-line px-3 font-medium hover:bg-canvas">Cancelar</button>
          <button type="submit" disabled={save.isPending} className="h-9 rounded-[4px] bg-accent px-3 font-semibold text-surface hover:bg-accent-hover disabled:opacity-50">
            {editing ? "Salvar alterações" : "Salvar projeto"}
          </button>
        </footer>
      </form>
    </aside>
  );
}

export default function Projects() {
  const client = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const query = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/admin/projects") });
  const activeProjects = useMemo(() => query.data?.filter((project) => project.is_active) ?? [], [query.data]);
  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/api/admin/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects"] }),
  });

  function openEdit(project: Project) {
    setEditing(project);
    setDrawerOpen(true);
  }

  return (
    <AdminPage>
      <div className="min-h-[calc(100vh-104px)] bg-surface">
        <header className="flex h-9 items-center border-b border-line px-3">
          <h1 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">Projetos</h1>
          <span className="ml-3 font-mono text-[11px] text-mute-soft">{String(activeProjects.length).padStart(2, "0")} ativos</span>
          <button type="button" onClick={() => { setEditing(null); setDrawerOpen(true); }} className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline">
            <Plus size={14} /> Novo projeto
          </button>
        </header>
        {query.isLoading ? (
          <div className="space-y-1 p-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-9 border border-line bg-canvas" />)}</div>
        ) : query.error ? (
          <div className="border-t border-danger px-3 py-2 text-danger">{query.error.message}</div>
        ) : (
          <div>
            <div className="grid h-8 grid-cols-[minmax(0,1fr)_64px_72px] items-center border-b border-line px-3 text-[10px] uppercase tracking-[0.08em] text-mute min-[700px]:grid-cols-[minmax(0,1fr)_96px_120px_96px]">
              <span>domínio</span><span>feedbacks</span><span className="hidden min-[700px]:block">criado em</span><span className="text-right">ações</span>
            </div>
            <div className="divide-y divide-line">
              {activeProjects.length ? activeProjects.map((project) => (
                <div key={project.id} className="group grid min-h-9 grid-cols-[minmax(0,1fr)_64px_72px] items-center px-3 hover:bg-canvas min-[700px]:grid-cols-[minmax(0,1fr)_96px_120px_96px]">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11.5px]">{project.allowed_domains.join(", ")}</p>
                    <p className="truncate text-[10px] text-mute min-[700px]:hidden">{project.name}</p>
                  </div>
                  <span className="font-mono text-[11px] text-mute">{String(project.feedback_count ?? 0).padStart(2, "0")}</span>
                  <span className="hidden font-mono text-[11px] text-mute min-[700px]:block">{project.created_at ? new Date(project.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                  <div className="flex justify-end gap-1 opacity-100 min-[700px]:opacity-0 min-[700px]:group-hover:opacity-100">
                    <button type="button" onClick={() => openEdit(project)} className="grid size-7 place-items-center rounded-[4px] text-mute hover:bg-surface" aria-label={`Editar ${project.name}`}><Pencil size={14} /></button>
                    <button
                      type="button"
                      onClick={() => { if (window.confirm("Excluir este projeto da lista ativa?")) deactivate.mutate(project.id); }}
                      className="grid size-7 place-items-center rounded-[4px] text-danger hover:bg-surface"
                      aria-label={`Excluir ${project.name}`}
                    ><Trash2 size={14} /></button>
                  </div>
                </div>
              )) : <p className="px-3 py-3 text-mute-soft">Vazio. <button type="button" onClick={() => setDrawerOpen(true)} className="text-accent underline">Criar projeto</button></p>}
            </div>
          </div>
        )}
        {deactivate.error && <div className="border-t border-danger px-3 py-2 text-danger">{deactivate.error.message}</div>}
      </div>
      {drawerOpen && <ProjectDrawer editing={editing} onClose={() => setDrawerOpen(false)} />}
    </AdminPage>
  );
}
