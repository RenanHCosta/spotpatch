"use client";
import { useRouter } from "next/navigation";
import { cn } from "@spotpatch/ui";

export const metricItems = [
  ["new", "Novos"],
  ["investigating", "Investigando"],
  ["awaiting_approval", "Aguardando aprovação"],
  ["executing", "Executando"],
  ["pull_request_opened", "PR aberto"],
  ["completed", "Concluídos"],
  ["failed", "Falhas"],
] as const;

type Props = {
  counts: Record<string, number>;
  last24Hours?: number;
  onSelect?: (status: string) => void;
  active?: string;
};

export function MetricsStrip({ counts, last24Hours = 0, onSelect, active }: Props) {
  const router = useRouter();
  const items = [
    ...metricItems.map(([key, label]) => ({ key, label, value: counts[key] ?? 0 })),
    { key: "last24h", label: "Últimas 24h", value: last24Hours },
  ];

  return (
    <section
      aria-label="Métricas do backlog"
      className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line bg-surface min-[481px]:grid-cols-4 min-[901px]:grid-cols-8 min-[901px]:divide-y-0"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() =>
            onSelect ? onSelect(item.key) : router.push(`/backlog?status=${item.key}`)
          }
          className={cn(
            "min-w-0 px-3 py-3 text-left transition-colors duration-100 hover:bg-canvas",
            active === item.key && "bg-canvas",
          )}
          aria-pressed={active === item.key}
        >
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
            {item.label}
          </span>
          <span
            className={cn(
              "mt-1 block font-mono text-[19px] leading-none",
              item.value === 0 ? "text-mute-soft" : "text-ink",
            )}
          >
            {String(item.value).padStart(2, "0")}
          </span>
        </button>
      ))}
    </section>
  );
}
