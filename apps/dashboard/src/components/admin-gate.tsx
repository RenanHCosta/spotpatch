"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, tokenKey } from "@/lib/api";

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

  if (!token || query.isError) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface p-5">
        <div className="w-full max-w-[320px]">
          <p className="font-mono text-[13px] font-semibold">spotpatch</p>
          <h1 className="mt-8 text-[13.5px] font-semibold">Acesso administrativo</h1>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("token")?.toString() ?? "";
              sessionStorage.setItem(tokenKey, value);
              setToken(value);
            }}
          >
            <label
              htmlFor="spotpatch-admin-token"
              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute"
            >
              SPOTPATCH_ADMIN_TOKEN
            </label>
            <input
              id="spotpatch-admin-token"
              name="token"
              type="password"
              autoFocus
              aria-invalid={query.isError}
              className="mt-2 h-9 w-full rounded-[4px] border border-line bg-surface px-3 font-mono text-[11.5px] text-ink"
            />
            {query.isError && (
              <p className="mt-2 text-[11.5px] text-danger">Token inválido. Verifique e tente novamente.</p>
            )}
            <button
              className="mt-4 h-9 w-full rounded-[4px] bg-accent font-semibold text-surface transition-colors duration-100 hover:bg-accent-hover"
              type="submit"
            >
              Entrar
            </button>
          </form>
          <p className="mt-4 text-[11.5px] leading-5 text-mute">
            O token permanece somente nesta sessão.
          </p>
        </div>
      </main>
    );
  }

  if (query.isLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-[560px] bg-surface pt-24">
        <div className="h-9 border border-line bg-canvas" />
        <div className="mt-2 h-9 border border-line bg-canvas" />
        <div className="mt-2 h-9 border border-line bg-canvas" />
      </main>
    );
  }

  return children;
}
