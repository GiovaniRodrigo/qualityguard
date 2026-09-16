# QualityGuard — QG-TDD-002: Implementation Report
**Secure Sandboxed Repository Cloner**

---

## 1. Problema

Antes desta implementação, o QualityGuard realizava a clonagem de repositórios diretamente através de invocações síncronas/assíncronas do comando `git clone` em diretórios temporários genéricos sem validação estruturada de protocolos, sem limites de tamanho em disco, sem desativação de submodules perigosos e sem proteção formal contra flag/command injection. Repositórios externos podiam causar esgotamento de disco (Disk DoS), processos órfãos bloqueando CPUs por tempo indeterminado e riscos de segurança via argumentos maliciosos de Git.

---

## 2. Threat Model (Modelo de Ameaças)

O repositório e os parâmetros de entrada (`repository`, `branch`) são tratados como **Untrusted Input**:
- **Command Injection**: Vetor neutralizado ao rejeitar metacaracteres e utilizar `spawn` com argumentos em `Array<string>` sem uso de shell (`sh -c`/`bash -c`).
- **Flag Injection**: Vetor neutralizado ao rejeitar prefixos com `-` e utilizar o separador `--` antes da URL e do diretório de destino.
- **Protocol Hijacking**: Vetor neutralizado ao impor protocolo HTTPS estrito e bloquear `protocol.file.allow=never`.
- **Submodule Bomb / LFI**: Vetor neutralizado com `--recurse-submodules=no` e `-c submodule.recurse=false`.
- **Timeout DoS**: Vetor neutralizado com hard timeout de 45 segundos e `SIGKILL`.
- **Exaustão de Disco**: Vetor neutralizado com verificação recursiva de tamanho limitando workspaces a 50 MB.
- **Vazamento de Workspaces**: Vetor neutralizado com `finally` determinístico e remoção em qualquer ponto de erro.

---

## 3. Arquitetura

O componente `SandboxedRepositoryCloner` foi encapsulado em [`apps/api/src/cloner.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/cloner.ts):

```
Untrusted Input ➔ validateRepositoryUrl() & validateBranch()
                       ↓
         mkdir(/tmp/qualityguard/workspaces/job-<uuid>)
                       ↓
     spawn('git', ['-c', 'protocol.file.allow=never',
                   '-c', 'submodule.recurse=false',
                   'clone', '--depth', '1', '--no-tags',
                   '--recurse-submodules=no', '--', url, targetPath])
                       ↓
              Timeout Controller (45s)
                       ↓
          calculateDirectorySize() (<= 50MB)
                       ↓
          git rev-parse HEAD (commitSha)
                       ↓
              ClonedWorkspace Object
             { path, commitSha, sizeBytes, cleanup() }
```

---

## 4. Arquivos Criados e Modificados

| Arquivo | Ação | Descrição |
| :--- | :--- | :--- |
| [`apps/api/src/cloner.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/cloner.ts) | **Criado** | `SandboxedRepositoryCloner`, validações de URL/branch, cálculo de tamanho de diretório e classes de erro tipadas (`RepositoryValidationError`, `RepositoryCloneTimeoutError`, `RepositorySizeLimitError`, `RepositoryCloneError`, `RepositoryWorkspaceError`). |
| [`apps/api/src/cloner.test.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/cloner.test.ts) | **Criado** | Suíte de testes TDD cobrindo 17 cenários unitários e de segurança com Vitest. |
| [`apps/api/src/analysis.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/analysis.ts) | **Modificado** | Integração do `SandboxedRepositoryCloner` em `runRepositoryAnalysis` com garantia de cleanup em bloco `finally`. |
| [`apps/web/app/api/[...path]/route.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/web/app/api/[...path]/route.ts) | **Modificado** | Aplicação das flags de segurança e timeout seguro no proxy standalone. |
| [`docs/QG-TDD-002-AUDIT.md`](file:///home/isabelle/teste_qualityguard/qualityguard/docs/QG-TDD-002-AUDIT.md) | **Criado** | Auditoria prévia dos gaps e do plano de testes. |
| [`docs/QG-TDD-002-SECURITY.md`](file:///home/isabelle/teste_qualityguard/qualityguard/docs/QG-TDD-002-SECURITY.md) | **Criado** | Documentação detalhada do Threat Model e políticas de segurança. |
| [`docs/TDD_BACKLOG.md`](file:///home/isabelle/teste_qualityguard/qualityguard/docs/TDD_BACKLOG.md) | **Modificado** | Atualização do status de `QG-TDD-002` para `COMPLETED & VERIFIED`. |

---

## 5. Ciclo TDD: RED → GREEN → REFACTOR

1. **Fase RED**: Os testes foram redigidos em `apps/api/src/cloner.test.ts` antes da criação de `cloner.ts`, falhando inicialmente por ausência do módulo.
2. **Fase GREEN**: Implementação de `SandboxedRepositoryCloner` com validações, spawn seguro, controle de timeout, quota de disco de 50MB e extração de SHA. Todos os 17 testes passaram.
3. **Fase REFACTOR**: Refinamento de tipagens estritas no TypeScript (`exactOptionalPropertyTypes`), paralelização de testes concorrentes com `Promise.all` e integração limpa com `apps/api/src/analysis.ts`.

---

## 6. Testes de Segurança Validados

1. Aceitação de URLs HTTPS válidas e notação resumida `owner/repo`.
2. Rejeição de sintaxe malformada e strings vazias.
3. Rejeição de protocolos proibidos (`file://`, `ftp://`, `ssh://`, `data:`, `javascript:`, `http://`).
4. Rejeição de injeção de comandos de shell (`;&|`$`).
5. Rejeição de injeção de flags do Git (`--upload-pack`, `-u`, `--config`).
6. Validação e sanitização estrita de branch (bloqueio de path traversal `..` e flags).
7. Cálculo recursivo de tamanho em disco e rejeição de repositórios > 50 MB (`RepositorySizeLimitError`).
8. Hard timeout de 45s com cancelamento de processo e erro tipado (`RepositoryCloneTimeoutError`).
9. Isolamento total de diretórios em clones concorrentes simultâneos.
10. Garantia de limpeza completa do diretório em sucesso, erro, falha do Git ou timeout.
11. Clonagem shallow (`--depth 1`), desativação de tags (`--no-tags`) e desativação de submodules (`--recurse-submodules=no`, `-c submodule.recurse=false`, `-c protocol.file.allow=never`).

---

## 7. Validação Real Ponta a Ponta (E2E)

Execução real contra o repositório oficial:
- **Repositório**: `https://github.com/akitaonrails/ai-memory`
- **Branch**: `release/2.2`
- **Fluxo Validado**:
  - `POST /auth/register` ➔ 201 Created
  - `POST /projects` ➔ 201 Created
  - `POST /projects/:id/analyses` ➔ 202 Accepted (Async Job Enqueued)
  - `GET /analyses/:id` ➔ Polling de progresso (`queued` ➔ `cloning` ➔ `analyzing` ➔ `completed`)
  - **Métricas Reais Obtidas**:
    - Arquivos Analisados: 43 arquivos
    - Quality Score: 80 / 100
    - Findings: 1 finding real de complexidade ciclomática
    - Quality Gate: Aprovado
    - Grafo de Arquitetura: Nódulos e dependências gerados
    - Commit SHA: Resolvido via `rev-parse HEAD`
    - Workspace Temporário: 100% limpo após conclusão da análise

---

## 8. Resultados da Suíte de Verificação

- **`pnpm typecheck`**: **0 erros** em todos os 8 pacotes/apps do monorepo.
- **`pnpm test`**: **56 testes executados e 100% aprovados** (Vitest verde em todos os pacotes).
- **`pnpm lint`**: **0 avisos/erros**.
- **`pnpm build`**: Build de produção compilado com sucesso.

---

## 9. Limitações Conhecidas

- Repositórios com tamanho compactado superior a 50MB são rejeitados por design para proteger os recursos do servidor host. Suporte a cotas personalizadas será configurável por organização/plano em iterações futuras.
- Autenticação para repositórios privados (GitHub Apps / SSH keys) será gerenciada no módulo de integrações.

---

## 10. Próximo Item do Backlog

- **`QG-TDD-003` (P1)**: *GitHub Webhooks Security Hardening* (validação de assinatura criptográfica `x-hub-signature-256`, deduplicação de eventos e proteção contra replay attacks).
