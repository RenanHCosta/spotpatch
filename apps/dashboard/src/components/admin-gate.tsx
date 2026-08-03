"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card } from "@spotpatch/ui";
import { api, tokenKey } from "@/lib/api";
import { Target } from "lucide-react";
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem(tokenKey) ?? ""),
  );
  const query = useQuery({
    queryKey: ["admin-check", token],
    queryFn: () => api("/api/admin/dashboard"),
    enabled: Boolean(token),
    retry: false,
  });
  if (!token || query.isError)
    return (
      <main className="grid min-h-screen place-items-center p-5">
        <Card className="w-full max-w-md p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-patch text-white">
              <Target />
            </span>
            <div>
              <h1 className="font-black">Acesso administrativo</h1>
              <p className="text-sm text-slate-500">Proteção simplificada do MVP</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("token")?.toString() ?? "";
              sessionStorage.setItem(tokenKey, value);
              setToken(value);
            }}
          >
            <label htmlFor="spotpatch-admin-token" className="text-sm font-semibold">
              SPOTPATCH_ADMIN_TOKEN
            </label>
            <input
              id="spotpatch-admin-token"
              name="token"
              type="password"
              autoFocus
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3"
            />
            <Button className="mt-4 w-full">Entrar</Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            O token fica somente no sessionStorage e não representa autenticação pronta para
            produção.
          </p>
        </Card>
      </main>
    );
  if (query.isLoading)
    return (
      <main className="grid min-h-screen place-items-center text-sm text-slate-500">
        Validando acesso…
      </main>
    );
  return children;
}
