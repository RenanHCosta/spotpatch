"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, LogOut, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@spotpatch/ui";
import { api, tokenKey } from "@/lib/api";

const items = [
  { href: "/", label: "Visão geral" },
  { href: "/backlog", label: "Backlog" },
  { href: "/projects", label: "Projetos" },
  { href: "/integrations", label: "Integrações" },
  { href: "/settings", label: "Configurações" },
];

type Project = { id: string; name: string; is_active: boolean };

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const projectMenu = useRef<HTMLDetailsElement>(null);
  const [projectId, setProjectId] = useState("all");
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/api/admin/projects"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProjectId(params.get("project") ?? localStorage.getItem("spotpatch_current_project") ?? "all");

    const closeMenu = (event: PointerEvent) => {
      if (!projectMenu.current?.contains(event.target as Node)) projectMenu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  const availableProjects = projects.data?.filter((project) => project.is_active) ?? [];
  const selectedProject = availableProjects.find((project) => project.id === projectId);

  function selectProject(project: Project | null) {
    const nextId = project?.id ?? "all";
    setProjectId(nextId);
    if (project) localStorage.setItem("spotpatch_current_project", project.id);
    else localStorage.removeItem("spotpatch_current_project");

    const params = new URLSearchParams(window.location.search);
    if (project) params.set("project", project.id);
    else params.delete("project");
    const search = params.toString();
    router.replace(`${path}${search ? `?${search}` : ""}`);
    window.dispatchEvent(
      new CustomEvent("spotpatch:project-change", {
        detail: { id: nextId, name: project?.name ?? "Todos os projetos" },
      }),
    );
    projectMenu.current?.removeAttribute("open");
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-10 shrink-0 items-center bg-ink px-3 text-surface">
        <Link href="/" className="shrink-0 font-mono text-[13px] font-semibold">
          spotpatch
        </Link>
        <details ref={projectMenu} className="group relative ml-4">
          <summary className="flex h-7 min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-[4px] px-2 text-[11.5px] transition-colors duration-100 hover:bg-ink-soft [&::-webkit-details-marker]:hidden">
            <span className="max-w-40 truncate">{selectedProject?.name ?? "Todos os projetos"}</span>
            <ChevronDown size={14} className="transition-transform duration-100 group-open:rotate-180" />
          </summary>
          <div className="absolute left-0 top-8 z-50 w-56 border border-ink-soft bg-ink py-1">
            <button
              type="button"
              onClick={() => selectProject(null)}
              className="flex h-8 w-full items-center gap-2 px-2 text-left text-[11.5px] text-surface transition-colors duration-100 hover:bg-ink-soft"
            >
              <Check size={14} className={projectId === "all" ? "opacity-100" : "opacity-0"} />
              <span className="truncate">Todos os projetos</span>
            </button>
            {projects.isLoading && (
              <div className="mx-2 my-1 h-8 border border-ink-soft" aria-label="Carregando projetos" />
            )}
            {projects.error && (
              <p className="border-t border-danger px-2 py-2 text-[11px] text-surface">
                Projetos indisponíveis
              </p>
            )}
            {availableProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => selectProject(project)}
                className="flex h-8 w-full items-center gap-2 px-2 text-left text-[11.5px] text-surface transition-colors duration-100 hover:bg-ink-soft"
              >
                <Check size={14} className={projectId === project.id ? "opacity-100" : "opacity-0"} />
                <span className="truncate">{project.name}</span>
              </button>
            ))}
            {!projects.isLoading && !projects.error && availableProjects.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-mute-soft">Nenhum projeto disponível.</p>
            )}
          </div>
        </details>

        <form
          className="ml-auto hidden h-7 w-56 items-center border border-ink-soft px-2 sm:flex"
          onSubmit={(event) => {
            event.preventDefault();
            const search = new FormData(event.currentTarget).get("global-search")?.toString();
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (projectId !== "all") params.set("project", projectId);
            router.push(`/backlog${params.size ? `?${params}` : ""}`);
          }}
        >
          <Search size={14} className="shrink-0 text-mute-soft" />
          <input name="global-search" aria-label="Busca global" placeholder="Buscar" className="min-w-0 flex-1 bg-transparent px-2 text-[11.5px] text-surface placeholder:text-mute-soft" />
          <kbd className="font-mono text-[10px] text-mute-soft">⌘K</kbd>
        </form>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(tokenKey);
            location.reload();
          }}
          className="ml-2 grid size-7 shrink-0 place-items-center rounded-[4px] text-mute-soft transition-colors duration-100 hover:bg-ink-soft hover:text-surface"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut size={14} />
        </button>
      </header>

      <nav className="scrollbar-none flex h-9 shrink-0 overflow-x-auto border-b border-line bg-surface px-3">
        {items.map(({ href, label }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex h-9 shrink-0 items-center px-3 text-[12.5px] text-mute transition-colors duration-100 hover:text-ink",
                active && "font-medium text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-ink",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <main className="min-h-0 min-w-0 flex-1 bg-surface">{children}</main>

      <footer className="flex h-7 shrink-0 items-center border-t border-line bg-canvas px-3 font-mono text-[11px] text-mute">
        <span className="max-w-44 truncate">{selectedProject?.name ?? "todos os projetos"}</span>
        <span className="mx-2 text-line">·</span>
        <span>últimas 24h</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-ink">
          <span className="size-1.5 rounded-full bg-accent" />
          conectado
        </span>
      </footer>
    </div>
  );
}
