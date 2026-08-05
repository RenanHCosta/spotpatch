# Segurança do MVP

## Fronteiras

Não há autenticação de usuários nem Supabase Auth. O token administrativo compartilhado protege operações e logs, mas não oferece identidade ou autorização pronta para produção. Fica em `sessionStorage`, vai no header `X-SpotPatch-Admin-Token`, é comparado no servidor e nunca é logado.

Extensão e dashboard não recebem service role, Deco API key, GitHub credentials ou agent secret. O GitHub existe somente como Connection Deco. Agent tools usam secret separado ou HMAC, validam escopo e não aceitam o admin token.

## Dados e abuso

- Domínio exato ou wildcard explícito, sem match inseguro por sufixo.
- Projeto, hostname, URL e origem lógica são cruzados na criação.
- Rate limit por IP e installation ID, limites por payload, screenshot e campo.
- `installationId` correlaciona/rate-limita; não autentica.
- Screenshots ficam em bucket privado; o banco guarda apenas paths e a API assina URLs curtas.
- Não são capturados cookies, Web Storage, clipboard, headers, histórico nem valores de formulário.
- Inputs, contenteditable, login, checkout, pagamento e `data-sensitive` são recusados.

## Conteúdo não confiável

Comentário, DOM, screenshot e repositório podem conter prompt injection. A sanitização remove scripts/styles/iframes, eventos, values e atributos secretos, limita comprimentos e aplica redaction. Prompt reforça limites, mas as tools impõem estado, schema, projeto, agente e arquivo independentemente do prompt.

Arquivos `.env*`, secrets, workflows, auth, pagamentos, permissões, infraestrutura, migrations, configuração de deploy, produção, branch protection, lockfiles sem dependência e postinstall são sensíveis. Investigação é bloqueada; tentativa de execução falha e audita. O agente de produção não edita esses arquivos: ele somente mergeia o PR persistido e aciona/verifica o deploy por tools dedicadas.

## Supabase

RLS está ativo sem políticas públicas. Grants de `anon`/`authenticated` são revogados; apenas `service_role` da API acessa. O bucket é privado. Para maior isolamento, produção pode mover tabelas para schema não exposto ou desativar a Data API.

## Logs e auditoria

Logs estruturados incluem request ID, operação, duração e status. Erros são truncados; tokens, keys, base64 e payload completo não são registrados. Mudanças relevantes geram `feedback_events`.

## Ameaças e produção

Token compartilhado vazado, XSS na origem, abuso distribuído, múltiplas instâncias sem rate limit compartilhado, screenshots pessoais, SSRF por configuração incorreta, replay de bearer agent secret e permissões excessivas do GitHub permanecem riscos. Produção precisa autenticação forte, RBAC por projeto, CSRF/origin allowlist, Redis, fila durável, secret rotation, KMS, retenção/remoção, malware scanning, CSP, auditoria imutável e revisão periódica de Connections.
