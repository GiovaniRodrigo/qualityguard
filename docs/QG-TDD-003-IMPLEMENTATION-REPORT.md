# QualityGuard — QG-TDD-003: Implementation Report
**GitHub PR Governance Automation & Webhook Hardening**

---

## 1. Auditoria e Problema

Antes da implementação do item **QG-TDD-003**, a integração com GitHub limitava-se a uma verificação elementar de webhooks e a emissão de um status genérico via Checks API, sem:
- Proteção contra ataques de replay e deduplicação de eventos (`x-github-delivery`).
- Validação estruturada de webhooks com modelo de erros tipados.
- Parser estendido de diffs unificados com mapeamento preciso de linhas e blocos multi-linha (`start_line`, `start_side`, `line`, `side`).
- Postagem de comentários inline na API de Pull Requests do GitHub (`POST /repos/{owner}/{repo}/pulls/{number}/reviews`).
- Integração profunda do Quality Gate com a decisão de aprovação (`APPROVE`) ou bloqueio (`REQUEST_CHANGES`).

---

## 2. Threat Model (Modelo de Ameaças)

1. **Webhook Forgery**: Neutralizado com verificação HMAC SHA-256 (`x-hub-signature-256`) sobre o corpo bruto (`rawBody`) e comparação timing-safe (`timingSafeEqual`).
2. **Replay & Duplicação**: Neutralizado pelo registro idempotente do header `x-github-delivery` no `MemoryStore` e `PostgresStore`.
3. **Falhas por Linhas Inválidas no Diff (HTTP 422)**: Neutralizado pelo algoritmo de mapeamento que verifica se o finding está contido nos blocos de código adicionados/modificados (`+`), com fallback de anotações no Check Run para findings unmapped.
4. **Vazamento de Credenciais**: Neutralizado pelo encapsulamento de chaves privadas e tokens de instalação em memória sem exposição nos logs.

---

## 3. Ciclo TDD: RED → GREEN → REFACTOR

1. **Fase RED**: Redação de suítes de testes abrangentes cobrindo 23 cenários unitários e de integração em `integrations/github/src/diff-mapping.test.ts`, `integrations/github/src/governance.test.ts` e `integrations/github/src/webhook.test.ts`.
2. **Fase GREEN**:
   - Implementação de `errors.ts` com hierarquia de erros tipados (`GitHubWebhookSignatureError`, `GitHubWebhookReplayError`, `GitHubPRValidationError`, `GitHubDiffMappingError`, `GitHubApiError`, `GitHubRateLimitError`, `GitHubReviewCommentError`).
   - Implementação de `diff-mapping.ts` com parser de hunks, algoritmo de mapeamento e gerador de comentários markdown com distinção de fontes determinísticas vs AI.
   - Implementação de `client.ts` com suporte a Check Runs, Reviews e Diff API.
   - Implementação de `governance.ts` com o orquestrador do ciclo de vida de PRs.
   - Atualização do endpoint `/webhooks/github` em `apps/api/src/server.ts`.
3. **Fase REFACTOR**:
   - Ajuste da interface de domínio `Finding` em `packages/domain` para suportar nativamente `startLine` e `endLine`.
   - Compatibilização com o modo estrito de tipos do TypeScript (`exactOptionalPropertyTypes`).

---

## 4. Webhook Security & Replay Protection

- **Endpoint**: `POST /webhooks/github`
- **Validação de Assinatura**:
  ```typescript
  const isValid = verifyGitHubWebhook(rawBody, signature, secret);
  ```
- **Proteção contra Replay**:
  ```typescript
  const isFresh = await store.recordWebhookDelivery(deliveryId);
  if (!isFresh) {
    return json(res, 200, { accepted: true, duplicate: true, deliveryId });
  }
  ```
- **Resposta Imediata**: Retorna `202 Accepted` em < 50ms, processando a governança de forma assíncrona.

---

## 5. Algoritmo de Diff Mapping & Comentários Inline

O algoritmo analisa o diff unificado retornado pela API do GitHub e realiza a correspondência exata:
1. Identifica o arquivo no diff correspondente ao `finding.file`.
2. Localiza o hunk onde `finding.line` reside dentro do intervalo de linhas novas (`+`).
3. Se `finding.startLine` existir e estiver no mesmo hunk, gera mapeamento multi-linha (`start_line`, `start_side: 'RIGHT'`).
4. Se o finding estiver fora das alterações do PR ou em linhas deletadas, retorna `null` e o finding é mantido exclusivamente no sumário do Check Run.
5. Comentários inline são publicados com cabeçalho de severidade, categoria, descrição, bloco de código com a evidência, recomendação e badge da fonte (`Deterministic Rule` ou `AI Intelligence`).

---

## 6. Integração do Quality Gate com Check Runs & Reviews

- **Check Run Inicial**: `status: 'in_progress'`
- **Avaliação do Quality Gate**:
  - Se `decision === 'block'` ou findings críticos/altos abertos ➔ Check Run `conclusion: 'failure'`, PR Review `event: 'REQUEST_CHANGES'`.
  - Se `decision === 'review_required'` ➔ Check Run `conclusion: 'neutral'`, PR Review `event: 'COMMENT'`.
  - Se `decision === 'approve'` ➔ Check Run `conclusion: 'success'`, PR Review `event: 'APPROVE'`.

---

## 7. Resultados da Suíte de Verificação

- **`pnpm typecheck`**: **0 erros** nos 8 pacotes/apps do monorepo.
- **`pnpm lint`**: **0 erros/avisos**.
- **`pnpm build`**: Build de produção compilado com sucesso.
- **`pnpm test`**: **75 testes executados e 100% aprovados**:
  - `packages/domain`: 2/2 testes aprovados
  - `packages/analyzer`: 4/4 testes aprovados
  - `packages/architecture`: 2/2 testes aprovados
  - `packages/ai`: 2/2 testes aprovados
  - `apps/cli`: 3/3 testes aprovados
  - `integrations/github`: 23/23 testes aprovados (`diff-mapping.test.ts`, `governance.test.ts`, `webhook.test.ts`)
  - `apps/web`: 11/11 testes aprovados (`api.test.ts`)
  - `apps/api`: 28/28 testes aprovados (`cloner.test.ts`, `queue.test.ts`, `auth.test.ts`, `billing.test.ts`, `e2e.test.ts`)

---

## 8. Verificação de Regressão

- **QG-TDD-001 (Async Job Queue & Polling)**: 100% funcional e aprovado nos testes unitários e E2E.
- **QG-TDD-002 (Sandboxed Repository Cloner)**: 100% funcional com validação real contra `akitaonrails/ai-memory` (branch `release/2.2`), mantendo 43 arquivos analisados, Quality Score 80/100, 1 finding de complexidade e 0 vazamentos de diretórios temporários.

---

## 9. Próximos Passos no Backlog

- **QG-TDD-004 (P2)**: *Architecture Drift Interactive Visualization* (visualização interativa de violações de camadas e dependências circulares com filtros por módulo).
