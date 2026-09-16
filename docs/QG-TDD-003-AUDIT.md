# QualityGuard — QG-TDD-003: GitHub PR Governance Automation Audit

## 1. Contexto & Objetivos

O objetivo do **QG-TDD-003** é transformar o QualityGuard em um mecanismo automatizado de governança de Pull Requests para o GitHub, executando verificação rigorosa de webhooks, proteção contra replay, deduplicação de eventos, mapeamento de findings para diffs unificados, emissão de Check Runs e publicação de comentários inline (incluindo suporte multi-linha) em PRs.

---

## 2. Auditoria do Estado Atual

### 2.1. Webhook & Autenticação
- **Endpoint**: `POST /webhooks/github` em `apps/api/src/server.ts`.
- **Assinatura**: Utiliza `verifyGitHubWebhook(payload, signature, secret)`.
- **Gap**: Não há verificação ou persistência de `x-github-delivery`. Replay attacks e entregas duplicadas executam análises redundantes.
- **Autenticação de App**: `createInstallationToken` gera token de acesso via JWT assinado (`RS256`) com `GITHUB_APP_ID` e `GITHUB_APP_PRIVATE_KEY`.

### 2.2. Modelo de Eventos de PR
- **Interface**: `PullRequestEvent` em `integrations/github/src/webhook.ts`.
- **Ações Tratadas**: `opened`, `synchronize`, `reopened`.
- **Gaps**:
  - Falta validação estruturada com erros tipados (`GitHubPRValidationError`, `GitHubWebhookSignatureError`, `GitHubWebhookReplayError`).
  - Faltam campos de branch base/head (`base.ref`, `head.ref`) e URLs seguras de clone.

### 2.3. Análise de Diff & Mapeamento de Linhas
- **Estado Atual**: `analyzeDiff(diff)` em `packages/analyzer` executa regras de AST apenas sobre o texto do patch bruto do diff.
- **Gaps**:
  - Não há conversor de `Finding` ➔ `DiffPosition` para posicionamento de comentários inline na API do GitHub.
  - Não há validação se a linha do finding pertence ao lado direito (`RIGHT`) das alterações adicionadas/modificadas.
  - Não há suporte a comentários multi-linha (`start_line`, `start_side`, `line`, `side`).
  - Findings fora do diff ou em linhas removidas precisam de fallback gracioso (resumo no Check Run, sem gerar erro de API no GitHub).

### 2.4. Integração com GitHub API
- **Cliente Atual**: `createGitHubClient(token)` em `integrations/github/src/client.ts`.
- **Métodos Atuais**: `getPullRequestDiff`, `createCheck`, `comment`.
- **Gaps**:
  - Falta suporte à API de Pull Request Reviews (`POST /repos/{owner}/{repo}/pulls/{number}/reviews`) com comentários inline estruturados.
  - Falta suporte a Check Runs com anotações e status detalhados (`in_progress` ➔ `completed`).
  - Falta tratamento de erros tipados (`GitHubApiError`, `GitHubRateLimitError`, `GitHubReviewCommentError`).

---

## 3. Vulnerabilidades e Ameaças (Threat Model)

| Ameaça | Impacto | Mitigação no QG-TDD-003 |
| :--- | :--- | :--- |
| **Webhook Spoofing** | Requisições falsas fingindo ser o GitHub. | Validação HMAC SHA-256 sobre o RAW BODY com comparação timing-safe; rejeição de assinaturas ausentes ou inválidas. |
| **Replay Attacks** | Reenvio de webhooks capturados para causar sobrecarga (DoS). | Rastreamento do header `x-github-delivery` no Store (Memory e Postgres). Entregas repetidas retornam idempotentemente status 200/202 sem reprocessar. |
| **Invalid Comment Crash** | Envio de comentários com números de linha que não existem no diff do PR, causando falha 422 na API do GitHub. | Algoritmo `mapFindingToDiffPosition` que valida rigorosamente se a linha e o intervalo pertencem a linhas adicionadas/modificadas (`+`) no diff. Fallback para anotação no Check Run se unmapped. |
| **Vazamento de Segredos em Logs** | Impressão de `GITHUB_WEBHOOK_SECRET` ou `GITHUB_APP_PRIVATE_KEY` em exceções. | Erros tipados sanitizados que nunca concatenam ou exibem secrets. |

---

## 4. Arquivos que Serão Criados e Modificados

1. **`integrations/github/src/errors.ts`** *(Criar)*:
   - Erros tipados (`GitHubWebhookSignatureError`, `GitHubWebhookReplayError`, `GitHubPRValidationError`, `GitHubDiffMappingError`, `GitHubApiError`, `GitHubRateLimitError`, `GitHubReviewCommentError`).
2. **`integrations/github/src/diff-mapping.ts`** *(Criar)*:
   - Funções de parsing e mapeamento de diff: `parseDiffChunks`, `mapFindingToDiffPosition`, `formatInlineComment`, `formatReviewBody`.
3. **`integrations/github/src/client.ts`** *(Expandir)*:
   - Métodos: `getPullRequest`, `getPullRequestDiff`, `createCheckRun`, `updateCheckRun`, `createReview`, `comment`.
4. **`integrations/github/src/webhook.ts`** *(Expandir)*:
   - Validação com verificação de delivery ID e filtros estritos.
5. **`integrations/github/src/governance.ts`** *(Criar)*:
   - Orquestrador do fluxo: `handlePullRequestGovernance(client, event, analyzerRunner)`.
6. **`apps/api/src/store.ts` & `apps/api/src/db.ts`** *(Modificar)*:
   - Suporte a registro de `x-github-delivery` para idempotência.
7. **`apps/api/src/server.ts`** *(Modificar)*:
   - Atualização do webhook `POST /webhooks/github` integrado ao novo orquestrador e fila.
8. **`integrations/github/src/governance.test.ts` & `integrations/github/src/diff-mapping.test.ts`** *(Criar - Fase RED)*:
   - Cobertura dos 55 cenários exigidos.

---

## 5. Estratégia de Testes (RED → GREEN → REFACTOR)

- **Webhook Security & Replay**:
  - Assinatura válida, inválida, ausente, secret incorreto, payload adulterado.
  - Replay de `x-github-delivery`, idempotência em memória e banco.
- **Diff Parsing & Mapping**:
  - Arquivos adicionados, modificados, deletados, renomeados.
  - Findings de linha única e multi-linha mapped vs unmapped.
- **GitHub API & Check Runs**:
  - Check Run `in_progress` ➔ `completed` (`success`/`failure`/`neutral`).
  - Criação de Review com comentários inline apenas para `critical`/`high` findings válidos.
- **E2E & Regressão**:
  - Pipeline completo simulado e real sem regressão em QG-TDD-001 e QG-TDD-002.
