# QualityGuard — QG-TDD-002: Sandboxed Repository Cloner Audit

## 1. Contexto & Visão Geral

O QualityGuard analisa repositórios de código estático (JavaScript, TypeScript, Rust, Python, Go, etc.) através de clonagem e análise de AST. O item **QG-TDD-001** estabeleceu o pipeline assíncrono de jobs com estados (`queued` ➔ `cloning` ➔ `analyzing` ➔ `completed`/`failed`). 

O item **QG-TDD-002** tem como objetivo transformar o processo de clonagem de repositórios em uma **fronteira segura e isolada (Sandboxed Cloner)**, tratando todo repositório Git e parâmetro fornecido pelo usuário como **Untrusted Input**.

---

## 2. Fluxo Atual de Clonagem

No código atual (`apps/api/src/analysis.ts` e `apps/web/app/api/[...path]/route.ts`):
1. A função `runRepositoryAnalysis(repository, branch)` recebe a string do repositório.
2. É feita uma verificação de prefixo simples:
   - Se não iniciar com `http://`, `https://` ou `git@`, concatena `https://github.com/${repository}.git`.
3. Cria diretório temporário com `mkdtemp(join(tmpdir(), 'qg-repo-'))`.
4. Invoca `execFileAsync('git', ['clone', '--depth', '1', ...])` com timeout de 60 segundos.
5. Percorre arquivos com `collectFilesFromDir(targetDir)`.
6. Executa as regras de AST do analyzer e o grafo de arquitetura.
7. Remove o diretório em bloco `finally`.

---

## 3. Vulnerabilidades e Gaps Identificados

| Categoria | Vulnerabilidade Atual | Risco | Mitigação Necessária (QG-TDD-002) |
| :--- | :--- | :--- | :--- |
| **Validação de URL** | Apenas prefixos básicos são verificados. Aceita strings com flags do git (ex: `--upload-pack`) ou caracteres de controle. | Flag injection, SSRF, execução de protocolos não autorizados (`file://`, `ftp://`, `ssh://`). | Validação estrita por regex/parser de URL HTTPS/SSH permitidos, bloqueando flags ou esquemas não suportados. |
| **Execução do Git** | Executa sem `--no-tags` e sem desabilitar submodules explicitamente. | Clone de submodules maliciosos ou commit recursive bombs; consumo excessivo de tráfego com tags. | `git clone --depth 1 --no-tags --recurse-submodules=no` e `-c protocol.file.allow=never` `-c submodule.recurse=false`. |
| **Controle de Timeout** | Timeout de 60s via `execFile` sem garantia de terminação de processos filhos e sem erro tipado específico. | Processos órfãos consumindo CPU/RAM indefinidamente. | Hard timeout de **45 segundos** com terminação forçada (`SIGKILL`), cancelamento via `AbortController` e erro `RepositoryCloneTimeoutError`. |
| **Controle de Tamanho** | Inexistente. Repositórios de qualquer tamanho (ex: 500MB+) são baixados e processados. | Esgotamento de espaço em disco (DoS) e estouro de memória no AST parser. | Verificação de quota de disco (**limite de 50 MB**). Abortar com `RepositorySizeLimitError` (mapeável para `413 Payload Too Large`). |
| **Isolamento de Workspace** | Diretórios temporários criados genericamente em `/tmp/qg-repo-*`. | Falta de estrutura hierárquica por job, risco de colisões em execuções paralelas. | Estrutura `/tmp/qualityguard/jobs/<job-id>/workspace` com permissões restritas e garantia absoluta de limpeza em `finally`. |
| **Modelo de Erros** | Todos os erros lançam `new Error("Failed to clone...")` genérico. | A camada de API/Queue não consegue distinguir erro de validação (400), timeout (408/504), tamanho excedido (413) ou falha de rede (502). | Erros tipados: `RepositoryValidationError`, `RepositoryCloneTimeoutError`, `RepositorySizeLimitError`, `RepositoryCloneError`, `RepositoryWorkspaceError`. |

---

## 4. Pontos de Integração

1. **`AnalysisQueue` (`apps/api/src/queue.ts`)**:
   - O worker invoca o cloner seguro e relata progresso (`cloning` ➔ `analyzing`).
   - Erros tipados são capturados e refletidos no estado do job (`status: 'failed'`, `error: errorMessage`).
2. **`runRepositoryAnalysis` (`apps/api/src/analysis.ts`)**:
   - Delega a criação do workspace, validação, clone e cleanup para o `SandboxedRepositoryCloner`.
   - Executa a análise AST de arquivos apenas sobre o workspace validado e restrito a 50MB.
3. **`API Server` (`apps/api/src/server.ts`)**:
   - Mapeamento adequado de erros de entrada (validação de URL na criação de projeto ou disparo de análise).

---

## 5. Arquivos que Serão Criados e Modificados

1. **`apps/api/src/cloner.ts`** *(Criar)*:
   - Classe `SandboxedRepositoryCloner` e funções utilitárias:
     - `validateRepositoryUrl(url: string): { url: string; sanitizedBranch?: string }`
     - `calculateDirectorySize(dirPath: string): Promise<number>`
     - `clone(options: CloneOptions): Promise<ClonedWorkspace>`
     - Classes de erro customizadas (`RepositoryValidationError`, etc.).
2. **`apps/api/src/cloner.test.ts`** *(Criar - Fase RED)*:
   - Suíte abrangente de testes unitários e de integração cobrindo os 22 cenários exigidos.
3. **`apps/api/src/analysis.ts`** *(Modificar)*:
   - Integração com `SandboxedRepositoryCloner`.
4. **`apps/api/src/server.ts`** & **`apps/api/src/queue.ts`** *(Revisar/Ajustar)*:
   - Tratamento dos novos erros tipados e preservação de compatibilidade total com QG-TDD-001.
5. **`docs/QG-TDD-002-SECURITY.md`** *(Criar)*:
   - Threat model detalhado e garantias de segurança.

---

## 6. Estratégia de Testes (TDD: RED → GREEN → REFACTOR)

A suíte de testes em `apps/api/src/cloner.test.ts` validará os seguintes 22 cenários antes de qualquer código de produção ser alterado:

1. **URL Válida**: Aceita URLs HTTPS (`https://github.com/owner/repo.git`, `https://gitlab.com/owner/repo`).
2. **URL Válida Short**: Aceita formato de repositório `owner/repo`.
3. **URL Inválida**: Rejeita formatos malformados (`not-a-url`, strings com caracteres inválidos).
4. **URL Vazia**: Rejeita strings vazias ou compostas de whitespace.
5. **Protocolo Não Permitido**: Rejeita esquemas `file://`, `ftp://`, `data:`, `javascript:`, `http://` (inseguro).
6. **Command Injection em URL**: Bloqueia payloads como `https://github.com/owner/repo; rm -rf /`.
7. **Argument / Flag Injection**: Bloqueia URLs ou branches que começam com hífen ou contêm flags como `--upload-pack=...`, `-u`, `--config`.
8. **Clone Timeout (Hard 45s)**: Aborta e mata processos que excederem o timeout configurado, lançando `RepositoryCloneTimeoutError`.
9. **Clone Lento / Simulado**: Aborta graciosamente em timeout customizado nos testes.
10. **Limite de Tamanho (> 50 MB)**: Rejeita repositórios cujo tamanho clonado ultrapassa 50 MB, lançando `RepositorySizeLimitError`.
11. **Limite de Tamanho Customizado**: Aborta ao ultrapassar limite em diretório simulado.
12. **Cleanup após Sucesso**: Garante que o workspace é deletado após o consumo.
13. **Cleanup após Erro**: Garante que o diretório é limpo se o Git falhar.
14. **Cleanup após Timeout**: Garante que o diretório é limpo mesmo quando o processo sofre timeout/kill.
15. **Ausência de Submodules**: Garante passagem explícita de flags que impedem recursão de submodules.
16. **Clone Shallow**: Garante passagem de `--depth 1`.
17. **Ausência de Tags**: Garante passagem de `--no-tags`.
18. **Dois Clones Simultâneos**: Execução paralela sem colisão de diretórios temporários.
19. **Isolamento de Workspaces**: Cada job tem caminho único baseado em UUID.
20. **Falha do Git / Repositório Inexistente**: Trata erro com `RepositoryCloneError` informativo.
21. **Repositório Válido Real**: Clona com sucesso repositório real em profundidade 1.
22. **E2E Real com `akitaonrails/ai-memory` (branch `release/2.2`)**: Validação ponta a ponta com extração de commit SHA, 43 arquivos analisados e score 80/100.
