# Workflow

```text
new → queued_for_investigation → investigating
  ├→ needs_information → queued_for_investigation
  └→ queued_for_execution → executing
       └→ pull_request_opened → completed
```

Estados operacionais podem ir a `failed`; `new` e `needs_information` podem ser rejeitados conforme regras de domínio. A UI usa atualização otimista, mas toda mudança durável passa pelo orquestrador/store, valida a transição e grava um evento.

Investigation: valida token/projeto/status/run ativo, persiste fila/run antes da chamada remota, cria a thread, inicia o agente, acompanha a thread, aguarda SAVE, valida risco e escolhe `needs_information` ou inicia automaticamente a execução.

Execution: exige investigação executável, risco aceitável e ausência de run ativo. O executor é iniciado automaticamente, cria branch/commit/PR via Deco GitHub Connection e o SAVE valida base, branch, provider, arquivos, PR e preview antes de mover para `pull_request_opened`. O executor não pode fazer merge ou deploy.

Production: começa somente por ação explícita do operador em `pull_request_opened`. Um agente de produção separado recebe o PR persistido, pode fazer merge desse PR e publicar exatamente essa revisão. O resultado validado registra URL/ID do deploy, emite timeline e move para `completed`. Um webhook GitHub assinado também move o card para `completed` quando o PR é mergeado fora do SpotPatch.

Dashboard usa polling curto. Backend sincroniza status durável do Deco; SSE é melhoria futura. O demo completa após sync com atraso determinístico e mantém os mesmos contratos.
