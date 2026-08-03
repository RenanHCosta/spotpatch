# Workflow

```text
new → queued_for_investigation → investigating
  ├→ needs_information → queued_for_investigation
  └→ awaiting_approval → queued_for_execution → executing
       └→ pull_request_opened → completed
```

Estados operacionais podem ir a `failed`; `new`, `needs_information` e `awaiting_approval` podem ser rejeitados conforme regras de domínio. A UI nunca escreve status: cada ação chama orquestrador/store, valida transição e grava evento.

Investigation: valida token/projeto/status/run ativo, persiste fila/run, cria thread, inicia agente, acompanha thread, aguarda SAVE, valida risco e escolhe `needs_information` ou `awaiting_approval`.

Execution: exige investigação executável, risco aceitável, aprovação e ausência de run ativo. O executor cria branch/commit/PR via Deco GitHub Connection. SAVE valida base, branch, provider, arquivos e PR, então move para `pull_request_opened`. Nunca há merge automático.

Dashboard usa polling curto. Backend sincroniza status durável do Deco; SSE é melhoria futura. O demo completa após sync com atraso determinístico e mantém os mesmos contratos.
