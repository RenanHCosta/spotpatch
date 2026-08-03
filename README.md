# SpotPatch

> Clique em qualquer parte do seu site, explique o que precisa mudar e receba um Pull Request pronto para revisão.

SpotPatch é um MVP gerenciado que transforma feedback visual em investigação técnica e, após aprovação, execução por agentes do Deco Studio. Não é um SaaS aberto: não há cadastro, login, Supabase Auth, organizações internas ou conexão de GitHub pelo visitante.

## Arquitetura

```text
Extensão Chromium ─┐
Dashboard ─────────┼──> API SpotPatch ──> Supabase PostgreSQL + Storage privado
                   │          └─────────> Deco Studio ──> GitHub Connection
                   └── nunca acessa Supabase, Deco ou GitHub diretamente
```

SpotPatch controla projetos, captura, backlog, estados, aprovação, timeline e persistência. Deco Studio controla agentes, threads, raciocínio, tools, acesso ao repositório, branch, commits e Pull Request. O Supabase é o registro principal; a thread Deco é auditoria complementar.

## Estrutura

- `apps/dashboard`: dashboard administrativo e `/demo`.
- `apps/api`: APIs pública, administrativa e MCP para agents.
- `apps/extension`: extensão Chromium WXT.
- `packages/database`: cliente Supabase exclusivamente servidor.
- `packages/shared`: tipos e schemas Zod.
- `packages/security`: domínios, sanitização, redaction, HMAC e limites.
- `packages/workflow`: transições, risco e validação de execução.
- `packages/deco-studio`: cliente HTTP sem regras SpotPatch.
- `packages/extension-core`: captura e locators DOM.
- `packages/ui`: componentes no padrão shadcn/ui.
- `supabase`: migration e seed.

## Pré-requisitos e instalação

- Node.js 22+
- pnpm 10+
- Chrome ou Edge atuais
- Supabase CLI para banco local ou um projeto Supabase

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

Dashboard: `http://localhost:3000`. API: `http://localhost:3001`. WXT dev server: `http://localhost:3002`. Demo: `http://localhost:3000/demo`.

Para uma demonstração sem serviços externos, configure:

```text
SPOTPATCH_ADMIN_TOKEN=troque-este-token
SPOTPATCH_AGENT_TOOLS_SECRET=troque-este-secret
SPOTPATCH_AGENT_PROVIDER=demo
NEXT_PUBLIC_SPOTPATCH_API_URL=http://localhost:3001
```

Os secrets pertencem ao ambiente de `apps/api`; `NEXT_PUBLIC_SPOTPATCH_API_URL` é apenas o endereço público da API.

## Supabase

```powershell
supabase start
supabase db reset
```

Em projeto remoto, vincule o CLI e use `supabase db push`. A migration cria tabelas, índices de runs ativos, RLS fechado, grants de `service_role` e o bucket privado `spotpatch-feedback`. O seed cadastra `localhost` como Loja Demo. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente na API.

Não existem políticas baseadas em `auth.uid()`. `anon` e `authenticated` não recebem acesso; extensão e dashboard usam a API. URLs de screenshots são assinadas por cinco minutos no servidor.

## Token administrativo

Rotas `/api/admin/*` exigem `X-SpotPatch-Admin-Token`. O dashboard pede o token e o mantém em `sessionStorage`; “Sair do modo administrativo” o remove. Isso é apenas proteção compartilhada para MVP, sem identidade, MFA, autorização granular ou revogação individual.

## Extensão no Chrome e Edge

```powershell
pnpm --filter @spotpatch/extension build
```

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o modo de desenvolvedor.
3. Escolha “Carregar sem compactação”.
4. Selecione `apps/extension/.output/chrome-mv3`.

Defina `WXT_PUBLIC_SPOTPATCH_API_URL=http://localhost:3001` no ambiente do build se a API não estiver no endereço padrão. O fluxo manual é: abrir `/demo`, extensão, “Comentar na página”, selecionar “Comprar”, escrever “No mobile, faça este botão ocupar toda a largura.” e enviar.

## Projetos

Cadastre pelo dashboard ou `POST /api/admin/projects`. `allowed_domains` aceita domínio exato e wildcard explícito (`*.example.com`). O apex não é incluído automaticamente. `evil-example.com` nunca corresponde a `example.com`. O endpoint público de resolução devolve apenas ID, nome e ativo.

## Deco Studio e GitHub

Veja [docs/deco-studio.md](docs/deco-studio.md). Em resumo:

1. Crie Investigator e Executor no Deco Studio.
2. Registre a API MCP do SpotPatch como Connection com secret próprio.
3. Conceda ao Investigator apenas leitura no GitHub; ao Executor, branch/arquivo/commit/PR.
4. Não exponha merge, deploy, secrets ou controles administrativos do repositório.
5. Crie API key pelo diálogo “Call from your app”, configure IDs e use `SPOTPATCH_AGENT_PROVIDER=deco_studio`.

## Modo demo

O provider demo não raciocina e não altera repositórios. Em cada sync, produz contratos determinísticos, arquivos fictícios e URL sob `.invalid`. A UI mostra “Modo demonstração” e “Pull Request simulado”.

## Qualidade

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Limitações e próximos passos

- Rate limit, cooldown, repositório demo e scheduler são locais ao processo; produção precisa Redis/Upstash e worker durável.
- Não há autenticação real. Produção precisa identidade, sessões, autorização por projeto, rotação e auditoria externa.
- A captura cobre a viewport da aba ativa. Chrome pages, iframes cross-origin e alguns ambientes protegidos não podem ser capturados.
- Shadow DOM aberto pode aparecer no `composedPath`; selectors que cruzam shadow roots não são reancorados automaticamente.
- O crop é aproximado e limitado à parte visível do elemento.
- A integração real depende de Supabase e Deco configurados; sem credenciais, somente o fluxo demo pode ser provado.
- Próximos passos: fila/worker, rate limit distribuído, retention de screenshots, CSRF/origin allowlist de produção, SSE de UI, políticas específicas por repositório e testes de extensão automatizados em Chromium persistente.

Documentos: [arquitetura](docs/architecture.md), [Deco Studio](docs/deco-studio.md), [contratos](docs/agent-contracts.md), [segurança](docs/security.md), [extensão](docs/extension.md), [workflow](docs/workflow.md) e [decisões](docs/decisions.md).
