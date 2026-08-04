"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AdminPage } from "@/components/page";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@spotpatch/ui";

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
};

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `projeto-${Date.now()}`;
}
function parseDomains(value: string) {
  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
}
function siteUrlFromDomain(domain: string) {
  if (/^https?:\/\//i.test(domain)) return domain;
  const clean = domain.replace(/^\*\./, "");
  const protocol = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean) ? "http" : "https";
  return `${protocol}://${clean}`;
}

export default function Projects() {
  const client = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Form>({ name: "", allowed_domains: "" });
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/api/admin/projects"),
  });
  const activeProjects = useMemo(
    () => query.data?.filter((project) => project.is_active) ?? [],
    [query.data],
  );
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      allowed_domains: "localhost",
    },
  });
  const create = useMutation({
    mutationFn: (values: Form) => {
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
          agent_mode: "approval_required",
          agent_tier: "smart",
          is_active: true,
        }),
      });
    },
    onSuccess: () => {
      form.reset();
      client.setQueryData<Project[]>(
        ["projects"],
        (current) => current?.filter((project) => project.is_active) ?? [],
      );
      client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<Form> & { is_active?: boolean } }) =>
      api(`/api/admin/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...("name" in values ? { name: values.name } : {}),
          ...("allowed_domains" in values
            ? { allowed_domains: parseDomains(values.allowed_domains ?? "") }
            : {}),
          ...(typeof values.is_active === "boolean" ? { is_active: values.is_active } : {}),
        }),
      }),
    onSuccess: (_data, variables) => {
      setEditingId(null);
      if (variables.values.is_active === false) {
        client.setQueryData<Project[]>(
          ["projects"],
          (current) => current?.filter((project) => project.id !== variables.id) ?? [],
        );
      }
      client.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  useEffect(() => {
    const project = query.data?.find((item) => item.id === editingId);
    if (project) {
      setEditValues({
        name: project.name,
        allowed_domains: project.allowed_domains.join(", "),
      });
    }
  }, [editingId, query.data]);

  function submitEdit(id: string) {
    update.mutate({ id, values: editValues });
  }
  function deactivate(id: string) {
    const confirmed = window.confirm("Excluir este projeto da lista ativa?");
    if (!confirmed) return;
    update.mutate({ id, values: { is_active: false } });
  }

  return (
    <AdminPage>
      <header>
        <p className="text-sm font-semibold text-patch">CONFIGURAÇÃO</p>
        <h1 className="mt-1 text-3xl font-black">Projetos</h1>
        <p className="mt-2 text-slate-500">Domínios habilitados para captura de feedback.</p>
      </header>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {activeProjects.map((project) => {
            const isEditing = editingId === project.id;
            return (
              <Card key={project.id} className="p-5">
                {isEditing ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-bold uppercase text-slate-500">
                      Nome do projeto
                      <input
                        value={editValues.name}
                        onChange={(event) =>
                          setEditValues((current) => ({ ...current, name: event.target.value }))
                        }
                        className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal normal-case text-slate-900"
                      />
                    </label>
                    <label className="block text-xs font-bold uppercase text-slate-500">
                      Domínios permitidos
                      <input
                        value={editValues.allowed_domains}
                        onChange={(event) =>
                          setEditValues((current) => ({
                            ...current,
                            allowed_domains: event.target.value,
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal normal-case text-slate-900"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={update.isPending} onClick={() => submitEdit(project.id)}>
                        Salvar alterações
                      </Button>
                      <Button
                        className="bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="mr-2" size={16} />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="font-bold">{project.name}</h2>
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {project.allowed_domains.join(", ")}
                        </p>
                      </div>
                      <Badge className={project.is_active ? "bg-emerald-100 text-emerald-700" : ""}>
                        {project.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <p className="truncate text-xs text-slate-400">{project.slug}</p>
                      <div className="flex gap-2">
                        <button
                          className="inline-flex size-9 items-center justify-center rounded-lg border text-slate-600 hover:bg-slate-100"
                          onClick={() => setEditingId(project.id)}
                          title="Editar projeto"
                        >
                          <Pencil size={16} />
                        </button>
                        {project.is_active && (
                          <button
                            className="inline-flex size-9 items-center justify-center rounded-lg border text-red-600 hover:bg-red-50"
                            onClick={() => deactivate(project.id)}
                            title="Excluir projeto"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
          {activeProjects.length === 0 && (
            <Card className="p-10 text-center text-slate-500">Nenhum projeto.</Card>
          )}
          {update.error && <p className="text-sm text-red-600">{update.error.message}</p>}
        </div>
        <Card className="p-6">
          <h2 className="font-bold">Cadastrar projeto</h2>
          <form
            onSubmit={form.handleSubmit((values) => create.mutate(values))}
            className="mt-5 space-y-3"
          >
            <label className="block text-xs font-bold uppercase text-slate-500">
              Nome do projeto
              <input
                {...form.register("name")}
                className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal normal-case text-slate-900"
              />
            </label>
            {form.formState.errors.name && (
              <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
            )}
            <label className="block text-xs font-bold uppercase text-slate-500">
              Domínios permitidos
              <input
                {...form.register("allowed_domains")}
                className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal normal-case text-slate-900"
              />
            </label>
            {form.formState.errors.allowed_domains && (
              <p className="text-sm text-red-600">
                {form.formState.errors.allowed_domains.message}
              </p>
            )}
            <Button className="w-full" disabled={create.isPending}>
              Salvar projeto
            </Button>
            {create.error && <p className="text-sm text-red-600">{create.error.message}</p>}
          </form>
        </Card>
      </div>
    </AdminPage>
  );
}
