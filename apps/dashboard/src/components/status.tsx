import { cn } from "@spotpatch/ui";

const labels: Record<string, string> = {
  new: "Novo",
  queued_for_investigation: "Na fila",
  investigating: "Investigando",
  needs_information: "Precisa de informação",
  queued_for_execution: "Execução na fila",
  executing: "Executando",
  pull_request_opened: "PR aberto",
  completed: "Concluído",
  failed: "Falhou",
  rejected: "Rejeitado",
};

export function Status({ value, compact = false }: { value: string; compact?: boolean }) {
  const isOk = ["new", "pull_request_opened", "completed"].includes(value);
  const isWarn = ["needs_information"].includes(value);
  const isDanger = ["failed", "rejected"].includes(value);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-mute">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-mute-soft",
          isOk && "bg-accent",
          isWarn && "bg-warn",
          isDanger && "bg-danger",
        )}
      />
      {!compact && <span className="truncate">{labels[value] ?? value}</span>}
    </span>
  );
}
