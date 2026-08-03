import { Badge, cn } from "@spotpatch/ui";
const labels: Record<string, string> = {
  new: "Novo",
  queued_for_investigation: "Na fila",
  investigating: "Investigando",
  needs_information: "Precisa de informação",
  awaiting_approval: "Aguardando aprovação",
  queued_for_execution: "Execução na fila",
  executing: "Executando",
  pull_request_opened: "PR aberto",
  completed: "Concluído",
  failed: "Falhou",
  rejected: "Rejeitado",
};
export function Status({ value }: { value: string }) {
  return (
    <Badge
      className={cn(
        value === "failed" && "bg-red-100 text-red-700",
        value === "awaiting_approval" && "bg-amber-100 text-amber-800",
        value === "pull_request_opened" && "bg-emerald-100 text-emerald-800",
        value === "investigating" && "bg-blue-100 text-blue-700",
      )}
    >
      {labels[value] ?? value}
    </Badge>
  );
}
