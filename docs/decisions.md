# Architectural decisions

## 2026-08-03 — Deco Studio HTTP surface

The current official documentation was read before implementation. SpotPatch uses only organization-scoped endpoints:

- `POST /api/:org/tools/COLLECTION_THREADS_CREATE`
- `POST /api/:org/decopilot/threads/:threadId/messages`
- `GET /api/:org/decopilot/threads/:threadId/stream`
- `POST /api/:org/tools/COLLECTION_THREAD_MESSAGES_LIST`
- `POST /api/:org/tools/COLLECTION_THREADS_GET`

The run request is strict: it contains only `messages`, `agent`, and optional `tier` or `temperature`, with exactly one non-system message. A successful enqueue is HTTP 202 and returns `taskId`. Durable status is the thread status (`in_progress`, `completed`, `failed`); the SSE stream is ephemeral and is not the source of record.

The Connection Proxy (`POST /api/:org/mcp/:connectionId`) proxies one upstream MCP connection. It is not used to run an agent. The legacy unscoped `/mcp/:connectionId` form is deliberately not implemented because it is deprecated. This clarifies the prompt's conceptual interface without inventing endpoints.

## 2026-08-03 — Agent tools connection

SpotPatch exposes a restricted HTTP MCP-compatible JSON-RPC endpoint. The operator registers it as a Deco Studio Connection using a server-only bearer secret. The connection must not mark tools public. This follows the documented proxy behavior while keeping SpotPatch tool authorization independent from the administrative token.

## 2026-08-03 — Supabase access

There is no Supabase Auth. Tables have RLS enabled, public Data API roles are revoked, and only the server-side service role has grants. The private screenshot bucket is written and signed only by the API. This is defense in depth; authorization happens in the SpotPatch API.

## 2026-08-03 — MVP runtime

Demo mode is deterministic and contains no local reasoning. It persists the same contracts as the real orchestrator. Its simulated PR URL uses the reserved `.invalid` domain. In-process polling and rate limiting are acceptable only for a single local instance and are documented as production limitations.
