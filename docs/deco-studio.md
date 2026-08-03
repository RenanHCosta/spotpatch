# Integração com Deco Studio

Base oficial consultada: [Call an Agent from Your App](https://docs.decocms.com/deco-studio/en/studio/api-reference/external-agent-integration/) e [Connection Proxy](https://docs.decocms.com/deco-studio/en/studio/api-reference/connection-proxy/).

## Investigator

Crie um Agent/Virtual MCP com o prompt de `docs/agent-contracts.md`. Conecte:

- SpotPatch tools: `GET_FEEDBACK_CONTEXT`, `GET_PROJECT_CONTEXT`, `GET_SIGNED_SCREENSHOT_URL`, `SAVE_INVESTIGATION`, `ADD_FEEDBACK_EVENT`, `MARK_FEEDBACK_NEEDS_INFORMATION`.
- GitHub Connection somente leitura: árvore, busca, arquivo, branch e histórico.

Copie o Virtual MCP ID da URL do agente ou de `COLLECTION_CONNECTIONS_LIST` para `DECO_STUDIO_INVESTIGATION_AGENT_ID` ou o projeto.

## Executor

Crie outro Agent com tools SpotPatch de execução e uma GitHub Connection restrita a ler, criar branch, criar/atualizar arquivo, commit e abrir PR. Não conceda merge, deploy, delete, secrets, permissões ou branch protection. Copie o ID para `DECO_STUDIO_EXECUTION_AGENT_ID`.

## API key

No Agent, abra **Connect → Call from your app → Create API key**. A chave deve ser por integração, ter expiração e ser rotacionada. O escopo de threads documentado inclui:

```json
{
  "self": [
    "COLLECTION_THREADS_CREATE",
    "COLLECTION_THREADS_GET",
    "COLLECTION_THREAD_MESSAGES_LIST",
    "COLLECTION_THREADS_LIST"
  ]
}
```

O valor aparece uma vez. Salve somente como `DECO_STUDIO_API_KEY` no servidor. A chave é vinculada à organização; `DECO_STUDIO_ORG` deve ser o slug imutável correto.

## SpotPatch tools Connection

Publique `/api/agents/mcp` por HTTPS e configure `Authorization: Bearer <SPOTPATCH_AGENT_TOOLS_SECRET>` na Connection. Não marque nenhuma tool como pública. A API também aceita assinatura HMAC `sha256(timestamp.body)` nos headers `X-SpotPatch-Agent-Timestamp` e `X-SpotPatch-Agent-Signature`, com janela de cinco minutos.

O Deco Connection Proxy canônico é `POST /api/:org/mcp/:connectionId`; a forma sem organização é legada. Esse proxy dá acesso a uma Connection específica. Para executar Agents, SpotPatch usa os endpoints abaixo, não o Connection Proxy.

## Threads e runs

1. `POST /api/:org/tools/COLLECTION_THREADS_CREATE` com `data.title` e `data.virtual_mcp_id`.
2. `POST /api/:org/decopilot/threads/:threadId/messages` com exatamente uma mensagem não-system, `agent.id` e tier opcional.
3. Resposta `202` imediata; persistir `taskId`.
4. Poll `POST /api/:org/tools/COLLECTION_THREADS_GET` com `{ "id": threadId }`.
5. O resultado oficial chega por uma tool SAVE e é validado com Zod.
6. Ao terminar, ler transcript durável por `COLLECTION_THREAD_MESSAGES_LIST` com `thread_id` e limite de até 200.

O stream `GET /api/:org/decopilot/threads/:threadId/stream` é SSE efêmero. Se usado, abra antes de postar a mensagem; use `fetch` porque `EventSource` não envia Authorization. O stream nunca substitui o transcript.

## Troubleshooting

- `401`: chave ausente, expirada ou inválida.
- `403`: permissão/tool não concedida.
- `404`: organização, agent, thread ou connection incorretos; também pode ocultar falta de acesso.
- `409`: conflito; o cliente usa backoff e idempotência.
- `429`: limite; respeitar backoff.
- `500`/`503`: falha temporária, Connection inativa ou upstream indisponível.
- Thread concluída sem SAVE: run incompleto; não derive contrato do texto final.
- GitHub falha: verifique Connection ativa e o conjunto mínimo de tools, nunca adicione merge como atalho.
