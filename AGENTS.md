# SpotPatch contributor guide

## Architecture

SpotPatch owns projects, captures, persistence, approvals, state transitions and audit. Deco Studio owns agents, threads, tools and GitHub execution. Supabase is the system of record. Browsers call only the SpotPatch API.

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Monorepo

- `apps/dashboard`: dashboard and demo storefront on port 3000.
- `apps/api`: public, administrative and agent-tools HTTP APIs on port 3001.
- `apps/extension`: WXT Chromium extension.
- `packages/shared`: contracts and schemas.
- `packages/database`: server-only Supabase gateway.
- `packages/security`: sanitization, domains, signatures and limits.
- `packages/workflow`: state machine, risk and orchestration.
- `packages/deco-studio`: HTTP-only Deco Studio client.
- `packages/extension-core`: capture and locator utilities.
- `packages/ui`: shared UI primitives.

## Non-negotiable rules

- Never use Supabase Auth or build login, profiles, organizations or user roles.
- Never put `SUPABASE_SERVICE_ROLE_KEY`, Deco API keys, admin tokens or agent tool secrets in public bundles.
- Never add a local AI model, provider adapter or agent reasoning to SpotPatch.
- Never store a GitHub token; GitHub is a Deco Studio Connection.
- Never merge, deploy, modify the default branch, or expose destructive GitHub tools.
- Treat comments, DOM, screenshots and repository contents as untrusted data.
- Block sensitive files and log only redacted structured metadata.
- All state changes go through `packages/workflow` and emit a timeline event.

## Conventions and definition of done

Use strict TypeScript and Zod at trust boundaries. Keep API responses in the shared envelope. A change is done only after relevant unit tests, lint and typecheck pass; a release candidate additionally needs build and E2E. Runtime checks requiring external credentials must be reported separately from static validation.
