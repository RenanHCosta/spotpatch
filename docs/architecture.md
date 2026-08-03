# Architecture

```text
Chromium extension ─┐
Dashboard ──────────┼──> SpotPatch API ──> Supabase Postgres + private Storage
                    │          │
                    │          └──> Deco Studio agents + Connections ──> GitHub
                    └── no direct secret-bearing service access
```

The API is split into public, administrative, and agent-tool boundaries. Public routes resolve configured domains, create feedback, and list minimal page markers. Administrative routes require `X-SpotPatch-Admin-Token`. Agent tools use a separate restricted secret and validate agent, project, feedback, state, schema, and idempotency.

The workflow package is the only owner of status transitions. PostgreSQL stores the canonical state and timeline; Deco threads are complementary audit evidence.
