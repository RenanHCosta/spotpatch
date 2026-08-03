"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AdminPage } from "@/components/page";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@spotpatch/ui";
const schema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  site_url: z.string().url(),
  allowed_domains: z.string().min(1),
  repository_owner: z.string().min(1),
  repository_name: z.string().min(1),
  default_branch: z.string().min(1),
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
export default function Projects() {
  const client = useQueryClient(),
    query = useQuery({
      queryKey: ["projects"],
      queryFn: () => api<Project[]>("/api/admin/projects"),
    });
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      slug: "",
      site_url: "http://localhost:3000/demo",
      allowed_domains: "localhost",
      repository_owner: "",
      repository_name: "",
      default_branch: "main",
    },
  });
  const create = useMutation({
    mutationFn: (values: Form) =>
      api("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          allowed_domains: values.allowed_domains
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          repository_provider: "github",
          agent_mode: "approval_required",
          agent_tier: "smart",
          is_active: true,
        }),
      }),
    onSuccess: () => {
      form.reset();
      client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  return (
    <AdminPage>
      <header>
        <p className="text-sm font-semibold text-patch">CONFIGURAÇÃO</p>
        <h1 className="mt-1 text-3xl font-black">Projetos</h1>
        <p className="mt-2 text-slate-500">
          Domínios, repositório e agentes previamente cadastrados.
        </p>
      </header>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {query.data?.map((project) => (
            <Card key={project.id} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{project.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {project.allowed_domains.join(", ")} · {project.repository_owner}/
                    {project.repository_name}
                  </p>
                </div>
                <Badge className={project.is_active ? "bg-emerald-100 text-emerald-700" : ""}>
                  {project.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Base {project.default_branch} · {project.agent_mode}
              </p>
            </Card>
          ))}
          {query.data?.length === 0 && (
            <Card className="p-10 text-center text-slate-500">Nenhum projeto.</Card>
          )}
        </div>
        <Card className="p-6">
          <h2 className="font-bold">Cadastrar projeto</h2>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="mt-5 space-y-3">
            {(
              [
                "name",
                "slug",
                "site_url",
                "allowed_domains",
                "repository_owner",
                "repository_name",
                "default_branch",
              ] as const
            ).map((name) => (
              <label key={name} className="block text-xs font-bold uppercase text-slate-500">
                {name.replaceAll("_", " ")}
                <input
                  {...form.register(name)}
                  className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal normal-case text-slate-900"
                />
              </label>
            ))}
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
