"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, ClipboardList, LogOut, Plug, Settings, Target } from "lucide-react";
import { cn } from "@spotpatch/ui";
import { tokenKey } from "@/lib/api";
const items = [
  { href: "/", label: "Visão geral", icon: BarChart3 },
  { href: "/backlog", label: "Backlog", icon: ClipboardList },
  { href: "/projects", label: "Projetos", icon: Boxes },
  { href: "/integrations", label: "Integrações", icon: Plug },
  { href: "/settings", label: "Configurações", icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-r border-slate-200 bg-white p-5">
        <Link href="/" className="mb-9 flex items-center gap-3 text-lg font-black">
          <span className="grid size-9 place-items-center rounded-xl bg-patch text-white">
            <Target size={20} />
          </span>
          SpotPatch
        </Link>
        <nav className="flex gap-2 overflow-auto lg:flex-col">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600",
                path === href || (href !== "/" && path.startsWith(href))
                  ? "bg-slate-950 text-white"
                  : "hover:bg-slate-100",
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => {
            sessionStorage.removeItem(tokenKey);
            location.reload();
          }}
          className="mt-10 flex items-center gap-2 text-sm text-slate-500"
        >
          <LogOut size={16} />
          Sair do modo administrativo
        </button>
      </aside>
      <main className="min-w-0 p-5 md:p-8 lg:p-10">{children}</main>
    </div>
  );
}
