# Feature Blueprint: v3.1 — Stack Generators Internalizados + Unificação no `dare init`

> Derivado de [DESIGN-Feature-v3-1-stack-generators.md](DESIGN-Feature-v3-1-stack-generators.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs de execução virão em `/dare-tasks`.
> Branch: `feat/v3.1-stack-generators` · Target release: **v3.1.0** · License: MIT.

---

## 1. Visão Geral da Arquitetura

### 1.1 Diagrama

```mermaid
flowchart TB
    user[Dev na linha de comando] -->|"dare init"| init[init.ts]

    init -->|prompt| inquirer[Inquirer prompts<br/>category → stack → transport*]
    inquirer -->|"stackId, opts"| dispatch[init dispatcher]

    dispatch -->|"registry.resolve(stackId)"| registry[stacks/registry.ts<br/>STACK_REGISTRY: Map]

    registry -->|lazy import| ruby[ruby-rails-8/scaffold.ts]
    registry -->|lazy import| nestjs[node-nestjs/scaffold.ts]
    registry -->|lazy import| fastapi[python-fastapi/scaffold.ts]
    registry -->|lazy import| laravel[php-laravel/scaffold.ts]
    registry -->|lazy import| axum[rust-axum/scaffold.ts]
    registry -->|lazy import| gin[go-gin/scaffold.ts]
    registry -->|lazy import| gostd[go-stdlib/scaffold.ts]
    registry -->|lazy import| mcpnode[mcp-node-ts/scaffold.ts]
    registry -->|lazy import| mcppy[mcp-python/scaffold.ts]
    registry -->|lazy import| mcprs[mcp-rust/scaffold.ts]
    registry -->|lazy import| mcpgo[mcp-go/scaffold.ts]

    ruby -.->|impl| ifc[interface StackScaffold<br/>generate&#40;opts&#41; → result]
    nestjs -.->|impl| ifc
    fastapi -.->|impl| ifc
    laravel -.->|impl| ifc
    axum -.->|impl| ifc
    gin -.->|impl| ifc
    gostd -.->|impl| ifc
    mcpnode -.->|impl| ifc
    mcppy -.->|impl| ifc
    mcprs -.->|impl| ifc
    mcpgo -.->|impl| ifc

    ifc -->|"1. tool oficial"| boot[stack-bootstrap.ts<br/>shell out: composer/npx/cargo/go/python]
    ifc -->|"2. overlay templates"| tplengine[template-engine.ts<br/>handlebars/jinja2/ERB/tera/blade/gotmpl]
    ifc -->|"3. emit DNA artifacts"| dna[dna-emitter.ts<br/>7 artefatos invariantes]

    boot --> targetdir[(diretório-alvo<br/>do projeto gerado)]
    tplengine --> targetdir
    dna --> targetdir

    test[stacks/__tests__/dna.spec.ts] -.->|valida 11 stacks| targetdir
```

`*` Prompt secundário de transport aparece **apenas** quando categoria = `mcp`.

### 1.2 Decisões Arquiteturais (com justificativa)

| # | Decisão | Alternativas consideradas | Justificativa |
|---|---|---|---|
| A-1 | **Single npm package** (`@dewtech/dare-cli`) | Multi-pacote workspace publicado (1 por stack) | Origem do bug 404. Single-package: 1 tarball, 1 versão, 1 audit, 1 publish. Tamanho ainda dentro de 3 MB com 11 stacks. |
| A-2 | **Registry com lazy import** | Eager import (carregar 11 scaffolders no boot do CLI) | Cold start do `dare --help` precisa ser < 200ms. Lazy import só ativa o scaffolder escolhido. |
| A-3 | **Interface `StackScaffold` tipada** | Função solta com convenção | TypeScript pega divergência em compile-time; novo stack precisa implementar contrato completo ou não compila. |
| A-4 | **Templates como assets em `templates/stacks/<name>/`** (não strings inline) | Strings inline no .ts | Templates ficam editáveis sem rebuild; CI pode diff'ar templates; usuário avançado pode override por env. |
| A-5 | **1 engine de template por stack** (não engine único) | Handlebars universal | Devs Rails esperam ERB; FastAPI espera Jinja2. Manter idioma da stack reduz fricção. |
| A-6 | **Bootstrap roda tool oficial primeiro** depois overlay DARE | Scaffolder DARE escrevendo tudo do zero | Tool oficial cobre o "feijão com arroz" da stack (ex: estrutura Rails, autoload PSR-4); DARE adiciona só o que diferencia. Reduz manutenção. |
| A-7 | **DNA gate como teste** (não como check runtime) | Verificação no `dare init` em runtime | Falha em CI bloqueia merge; falha em runtime polui UX. Fail-fast no PR. |
| A-8 | **Transport MCP como flag de runtime** (não stack separado) | 12 stacks (4 langs × 3 transports) | Confirmado pelo autor (Opção A do DESIGN). Reduz polução do prompt; transport é arquivo trocado, não arquitetura. |
| A-9 | **`new.ts` removido direto, sem alias** | Alias `dare new` → `dare init --stack rails` | Confirmado pelo autor. Janela curta de exposição (v3.0.0 → v3.1.0); mensagem clara no CHANGELOG. |
| A-10 | **Bump pra v3.1.0** (não v4) | v4.0.0 por remoção de comando canônico | Confirmado pelo autor. Tratada como correção de bug bloqueante + completação da paridade — semântica de "fix v3", não major rework. |

## 2. Stack Técnica Definida (do CLI — não dos projetos gerados)

| Camada | Tecnologia | Versão fixa |
|---|---|---|
| Runtime alvo | Node.js | 18.x LTS **e** 20.x LTS (matriz CI) |
| Linguagem | TypeScript | 5.4.5 |
| Module system | ESM (`"type": "module"`) | — |
| Bundler/builder | já em uso no repo (tsup ou esbuild — verificar `packages/cli/tsup.config.ts`) | manter |
| Workspace | pnpm | 9.0.0 (declarado em `package.json` raiz) |
| Test runner | vitest | 1.6.x |
| Prompt lib | @inquirer/prompts | 7.x (já presente) |
| Color/UI | chalk | 5.3.x (já presente) |
| Cmd parser | commander | 11.x (já presente) |
| Filesystem helper | fs-extra | 11.x (já presente) |
| Template engines (per stack) | handlebars 4.7 (Node/Go), jinja2 via `nunjucks` 3.2 (Python templates), `ejs` 3.1 (Rails ERB — interpretador JS de ERB), tera-like via `nunjucks` (Rust .tera tratado como Jinja-compatível), `mustache` 4.2 fallback | fixar versões em `packages/cli/package.json` |

> **Decisão fina sobre templates Rust (.tera) e Rails (.erb):** ambos seguem suficientemente o dialeto Jinja para serem renderizados por `nunjucks` com flags `tags: { variableStart: '{{', variableEnd: '}}' }`. Evita 5 engines distintas. Se algum template usar feature exclusiva da engine real, fallback é gerar arquivo `.tera`/`.erb` cru e deixar o tool oficial do projeto-alvo interpretar — não interpretamos no CLI.

## 3. Estrutura de Pastas (pós-merge)

```
C:\projetos-dewtech\fermio-plataform\dare-method\
├─ packages\
│  └─ cli\
│     ├─ package.json                    # v3.1.0, sem workspace dep, files inclui templates/stacks/**
│     ├─ src\
│     │  ├─ index.ts                     # entry público
│     │  ├─ bin\
│     │  │  └─ dare.ts                   # registra commands; SEM 'new'
│     │  ├─ commands\
│     │  │  ├─ init.ts                   # único entrypoint de scaffolding
│     │  │  ├─ ax.ts                     # (inalterado)
│     │  │  ├─ blueprint.ts              # (inalterado)
│     │  │  ├─ bootstrap.ts              # (inalterado)
│     │  │  ├─ dag.ts                    # (inalterado)
│     │  │  ├─ design.ts                 # (inalterado)
│     │  │  ├─ discover.ts               # (inalterado)
│     │  │  ├─ execute.ts                # (inalterado)
│     │  │  ├─ frontend-design.ts        # (inalterado)
│     │  │  ├─ graph.ts                  # (inalterado)
│     │  │  ├─ info.ts                   # (inalterado)
│     │  │  ├─ layered-design.ts         # (inalterado)
│     │  │  ├─ llm-integration.ts        # (inalterado)
│     │  │  ├─ quality-telemetry.ts      # (inalterado)
│     │  │  ├─ realtime.ts               # (inalterado)
│     │  │  ├─ refine.ts                 # (inalterado)
│     │  │  ├─ review.ts                 # (inalterado)
│     │  │  ├─ update.ts                 # (inalterado)
│     │  │  ├─ validate.ts               # (inalterado)
│     │  │  ├─ welcome.ts                # (inalterado)
│     │  │  └─ ❌ new.ts                  # REMOVIDO
│     │  ├─ stacks\                      # NOVO — internalização
│     │  │  ├─ types.ts                  # StackScaffold, ScaffoldOpts, ScaffoldResult, StackId
│     │  │  ├─ registry.ts               # STACK_REGISTRY: Map<StackId, () => Promise<StackScaffold>>
│     │  │  ├─ dna-emitter.ts            # emit dos 7 artefatos invariantes
│     │  │  ├─ template-engine.ts        # render(content, vars, engine)
│     │  │  ├─ ruby-rails-8\
│     │  │  │  ├─ scaffold.ts
│     │  │  │  └─ __tests__\scaffold.spec.ts
│     │  │  ├─ node-nestjs\
│     │  │  │  ├─ scaffold.ts
│     │  │  │  └─ __tests__\scaffold.spec.ts
│     │  │  ├─ python-fastapi\           # mesma estrutura
│     │  │  ├─ php-laravel\              # mesma estrutura
│     │  │  ├─ rust-axum\                # mesma estrutura
│     │  │  ├─ go-gin\                   # mesma estrutura
│     │  │  ├─ go-stdlib\                # mesma estrutura
│     │  │  ├─ mcp-node-ts\              # mesma estrutura
│     │  │  ├─ mcp-python\               # mesma estrutura
│     │  │  ├─ mcp-rust\                 # mesma estrutura
│     │  │  ├─ mcp-go\                   # mesma estrutura
│     │  │  └─ __tests__\
│     │  │     ├─ dna.spec.ts            # gate dos 7 artefatos para todo stack
│     │  │     ├─ registry.spec.ts       # resolução, erro, lazy
│     │  │     └─ parity-rails.spec.ts   # diff Rails v3.0.0 vs v3.1.0
│     │  └─ utils\
│     │     └─ stack-bootstrap.ts        # reduzido: só helpers de invocar tool oficial
│     ├─ templates\
│     │  └─ stacks\
│     │     ├─ ruby-rails-8\             # movido de packages/stacks/ruby-rails-8/templates/
│     │     ├─ node-nestjs\
│     │     ├─ python-fastapi\
│     │     ├─ php-laravel\
│     │     ├─ rust-axum\
│     │     ├─ go-gin\
│     │     ├─ go-stdlib\
│     │     ├─ mcp-node-ts\
│     │     ├─ mcp-python\
│     │     ├─ mcp-rust\
│     │     └─ mcp-go\
│     └─ tsup.config.ts                  # incluir templates/** em outDir
├─ packages\
│  ├─ docs\                              # inalterado
│  ├─ skills\                            # inalterado
│  ├─ website\                           # inalterado
│  └─ ❌ stacks\                          # DIRETÓRIO INTEIRO REMOVIDO
├─ pnpm-workspace.yaml                   # remove 'packages/stacks/*'
├─ package.json                          # v3.1.0
├─ ROADMAP.md                            # atualizado: "Stacks com gerador completo (11)"
├─ README.md                             # atualizado: tabela de 11 stacks
├─ CHANGELOG.md                          # [3.1.0] — 2026-06
└─ DARE\
   ├─ DESIGN-Feature-v3-1-stack-generators.md
   └─ BLUEPRINT-Feature-v3-1-stack-generators.md   # ← este arquivo
```

## 4. Modelo de Dados (tipos TypeScript — não há banco)

Esta feature não persiste dados — é compile-time-typed. "Modelo" = contratos TS que governam o registry e os scaffolds.

### 4.1 `packages/cli/src/stacks/types.ts`

```ts
/* Identificadores fixos. Mudança aqui é breaking. */
export type BackendStackId =
  | 'ruby-rails-8'
  | 'node-nestjs'
  | 'python-fastapi'
  | 'php-laravel'
  | 'rust-axum'
  | 'go-gin'
  | 'go-stdlib';

export type McpStackId =
  | 'mcp-node-ts'
  | 'mcp-python'
  | 'mcp-rust'
  | 'mcp-go';

export type StackId = BackendStackId | McpStackId;

export type StackCategory = 'backend' | 'mcp';

export type ToolchainMode = 'native' | 'docker' | 'auto';

export type McpTransport = 'stdio' | 'sse' | 'http';

/** 7 artefatos DNA. Set fechado. */
export type DareDnaArtifact =
  | 'llms-txt'
  | 'openapi'
  | 'cli-json-flag'
  | 'env-example'
  | 'rate-limit'
  | 'skills-yml'
  | 'github-ci';

export const DARE_DNA: readonly DareDnaArtifact[] = [
  'llms-txt',
  'openapi',
  'cli-json-flag',
  'env-example',
  'rate-limit',
  'skills-yml',
  'github-ci',
] as const;

export interface LlmProvider {
  /** ex: 'openai', 'anthropic', 'dummy' — string livre, validada por enum no CLI. */
  readonly id: string;
  readonly defaultModel: string;
}

export interface ScaffoldOpts {
  readonly dir: string;            // diretório-alvo já criado e vazio
  readonly projectName: string;    // slug kebab-case, validado upstream
  readonly toolchain: ToolchainMode;
  /** Subconjunto de DARE_DNA. Default = todos os 7 (DNA mandatório). */
  readonly features: ReadonlySet<DareDnaArtifact>;
  /** Opcional. Quando ausente, scaffolder NÃO instala stack LLM. */
  readonly llm?: { providers: ReadonlyArray<LlmProvider> };
  /** Só para backends. Default 'ws' quando feature realtime ligada. */
  readonly realtime?: { transport: 'ws' | 'sse' };
  /** Obrigatório quando stack.category === 'mcp'. Default 'stdio'. */
  readonly mcp?: { transport: McpTransport };
  /** True quando o init detecta workspace pré-existente (Cargo workspace etc.). */
  readonly isMonorepo: boolean;
}

export interface ScaffoldResult {
  /** Caminhos relativos a opts.dir. Ordem = ordem de escrita. */
  readonly filesWritten: ReadonlyArray<string>;
  /** Comandos pós-instalação que o usuário deve rodar. Strings shell-quotadas. */
  readonly postInstallSteps: ReadonlyArray<string>;
  /** Avisos não-fatais. Vão pro stderr. */
  readonly warnings: ReadonlyArray<string>;
  /** Quais dos 7 artefatos DNA foram emitidos. Usado por dna.spec.ts. */
  readonly dnaEmitted: ReadonlySet<DareDnaArtifact>;
}

export interface StackScaffold {
  readonly id: StackId;
  readonly label: string;          // string exibida no prompt do inquirer
  readonly category: StackCategory;
  readonly status: 'stable' | 'beta';

  generate(opts: ScaffoldOpts): Promise<ScaffoldResult>;
}

export interface StackRegistryEntry {
  readonly id: StackId;
  readonly label: string;
  readonly category: StackCategory;
  readonly status: 'stable' | 'beta';
  /** Lazy import. Resolve quando o usuário escolhe o stack. */
  readonly load: () => Promise<StackScaffold>;
}
```

### 4.2 Invariantes do tipo

| Invariante | Como é garantido |
|---|---|
| `StackId` exaustivo no registry | `STACK_REGISTRY: ReadonlyMap<StackId, StackRegistryEntry>` + teste que itera `Object.keys(STACK_REGISTRY)` e compara com `StackId` literal union via `satisfies` |
| `ScaffoldOpts.mcp` presente sse `stack.category === 'mcp'` | Validação em `init.ts` antes de chamar `generate()`; teste em `init.integration.spec.ts` |
| `features` ⊇ `DARE_DNA` por default | Construtor de `ScaffoldOpts` em `init.ts` chama `new Set(DARE_DNA)` se usuário não passar `--features` |
| `dnaEmitted` retornado por `generate()` ⊇ `DARE_DNA` | Test `dna.spec.ts` (Seção 9) |
| `filesWritten` paths são todos relativos a `opts.dir` | Lint customizado em `dna.spec.ts`: `assert(!path.isAbsolute(f) && !f.startsWith('..'))` |

## 5. Contratos de "API" (CLI + funções públicas)

Este projeto **não expõe HTTP**. Contratos = (a) CLI surface, (b) funções públicas do registry/scaffolders.

### 5.1 CLI surface — comandos afetados

#### 5.1.1 `dare init` (modificado — passa a ser o único entrypoint)

| Aspecto | Valor |
|---|---|
| Invocação | `dare init [project-name] [options]` |
| Modo padrão | Interativo (prompts Inquirer) |
| Modo CI | `--non-interactive` exige todas as flags abaixo |

**Flags adicionadas/modificadas em v3.1:**

| Flag | Tipo | Default | Validação |
|---|---|---|---|
| `--stack <id>` | `StackId` | (perguntado) | Deve estar em `Object.keys(STACK_REGISTRY)`; case-sensitive |
| `--transport <mode>` | `McpTransport` | `stdio` | Só aceito quando stack começa com `mcp-`; outras combinações: erro |
| `--toolchain <mode>` | `ToolchainMode` | `auto` | Inalterado |
| `--features <list>` | CSV de `DareDnaArtifact` | `llms-txt,openapi,cli-json-flag,env-example,rate-limit,skills-yml,github-ci` (todos os 7) | Cada item deve estar em `DARE_DNA`; subconjunto vazio gera erro (DNA é mandatório) |
| `--dry-run` | boolean | `false` | Lista `filesWritten` sem escrever; útil pra preview |
| `--llm-provider <id>` | string | (omitido) | `openai \| anthropic \| dummy` |
| `--no-realtime` | boolean | `false` | Pula scaffolding de WS/SSE |
| `--non-interactive` | boolean | `false` | Quando true: `--stack` e `--name` obrigatórios; nenhum prompt aparece |

**Comportamento por status code (exit code do processo):**

| Exit | Quando |
|---|---|
| 0 | Scaffold completo + DNA emitido + pós-instalação imprimida |
| 1 | Erro de validação de flags (ex: `--transport http` com stack backend) |
| 2 | Erro de IO (dir não vazio, permissão negada, disco cheio) |
| 3 | Tool oficial faltando em modo `native` sem fallback Docker disponível |
| 4 | DNA emit falhou — bug no scaffolder (cobre algum dos 7 artefatos não emitidos) |
| 130 | Ctrl-C no prompt |

**Mensagens de erro — strings exatas (para teste):**

| Caso | Mensagem stderr |
|---|---|
| Stack desconhecido | `Error: unknown stack '<id>'. Valid stacks: <comma-separated sorted>` |
| Transport em backend | `Error: --transport is only valid for MCP stacks (got '<id>')` |
| Dir não vazio | `Error: target directory '<dir>' is not empty. Use --force to overwrite (NOT IMPLEMENTED in v3.1)` |
| Features inválidas | `Error: unknown feature '<x>'. Valid features: llms-txt, openapi, cli-json-flag, env-example, rate-limit, skills-yml, github-ci` |
| DNA gate falhou | `Error: scaffold for '<id>' did not emit required artifact '<x>'. This is a bug in the scaffolder.` |

#### 5.1.2 `dare new` — **REMOVIDO**

- Não está registrado em `bin/dare.ts`
- `dare --help` não lista
- `dare new <anything>` → erro do commander: `error: unknown command 'new'`
- Sem alias, sem mensagem de deprecação, sem hint pra `init`

#### 5.1.3 `dare stacks list` — **NOVO (RF-16, COULD)**

| Aspecto | Valor |
|---|---|
| Invocação | `dare stacks list [--json]` |
| Saída texto | Tabela: `ID`, `Label`, `Category`, `Status` |
| Saída `--json` | `{ "stacks": [{ "id": "...", "label": "...", "category": "...", "status": "..." }] }` |
| Exit | 0 sempre (read-only) |

### 5.2 Funções públicas — assinaturas executáveis

#### 5.2.1 `packages/cli/src/stacks/registry.ts`

```ts
import type { StackId, StackRegistryEntry, StackScaffold } from './types';

/** Map IMUTÁVEL. Singleton no módulo. */
export const STACK_REGISTRY: ReadonlyMap<StackId, StackRegistryEntry>;

/**
 * Resolve um stack pelo ID com lazy import.
 *
 * Pré-condições:
 *   - id é uma string qualquer (validação ocorre aqui)
 *
 * Pós-condições (sucesso):
 *   - Retorna instância de StackScaffold pronta para chamar generate()
 *   - O scaffolder está carregado em memória até o GC do processo
 *
 * Erros:
 *   - throws UnknownStackError com .stackId e .availableIds quando id ∉ STACK_REGISTRY
 *   - throws ScaffoldLoadError com .cause quando o import dinâmico falha (bug interno)
 *
 * Concorrência: idempotente; chamadas paralelas com mesmo id retornam mesma instância
 * (o `() => import(...)` é memoizado dentro do entry via Promise compartilhada).
 */
export async function resolve(id: string): Promise<StackScaffold>;

/**
 * Lista todos os stacks registrados, ordenados por category então id.
 *
 * Pré-condições: nenhuma.
 * Pós-condições: array de entries, ordem determinística (testável).
 * Erros: nenhum.
 * Concorrência: pura, sync seria possível mas mantemos async pra futuro.
 */
export function list(): ReadonlyArray<StackRegistryEntry>;

/**
 * Verifica se um id está registrado, sem disparar lazy import.
 *
 * Sync e barato. Usado por validação de flags no init.ts.
 */
export function has(id: string): id is StackId;

export class UnknownStackError extends Error {
  readonly stackId: string;
  readonly availableIds: ReadonlyArray<StackId>;
  constructor(stackId: string, availableIds: ReadonlyArray<StackId>);
}

export class ScaffoldLoadError extends Error {
  readonly stackId: StackId;
  readonly cause: unknown;
  constructor(stackId: StackId, cause: unknown);
}
```

#### 5.2.2 Contrato `generate()` por scaffolder

**Pré-condições verificáveis em todo scaffolder:**

1. `opts.dir` existe, é diretório, e está vazio (verificado por `init.ts` antes de delegar).
2. `opts.projectName` é kebab-case, `[a-z][a-z0-9-]{0,49}`, validado upstream.
3. `opts.features ⊇ DARE_DNA` (mandatório por construção).
4. Quando `stack.category === 'mcp'`, `opts.mcp` está presente.
5. Quando `stack.id` é go ou rust, `opts.isMonorepo` é informado (pode ser false).

**Pós-condições verificáveis (asserts no `dna.spec.ts`):**

1. Todos os paths em `result.filesWritten` existem em `opts.dir` após retorno.
2. `result.dnaEmitted ⊇ DARE_DNA`.
3. Cada um dos 7 artefatos DNA bate em forma:
   - `llms.txt` na raiz contém pelo menos as seções `# Project`, `## Setup`, `## Commands` (validado por regex).
   - Existe `openapi.json` na raiz **ou** o `main.<ext>` configura uma rota `/openapi.json` (grep pelo path no source).
   - O entrypoint CLI do app gerado (ex: `bin/<name>` em Rails) aceita flag `--json` (grep no template).
   - `.env.example` existe e **não contém** valores que pareçam segredos reais (regex contra padrões: chaves base64 longas, hex de 32+ chars, etc.).
   - Pelo menos 1 dos arquivos de config/middleware contém menção a rate limit (regex contra nomes idiomáticos por stack: `rack-attack`, `express-rate-limit`, `slowapi`, `tower::limit`, `gin-contrib/limiter`, `RateLimiter`, etc.).
   - `.dare/skills.yml` existe e tem ao menos uma entrada referenciando a skill da stack.
   - `.github/workflows/dare-ci.yml` existe e tem ao menos os jobs `audit`, `lint`, `test`.

**Estados de erro:**

| Erro | Quando | `result` vs throw |
|---|---|---|
| Tool oficial não encontrado em modo `native` (e Docker tb não) | Cargo/npm/composer/etc. fora do PATH | throw `ToolchainNotFoundError`, exit 3 |
| Falha no bootstrap (tool oficial retornou ≠ 0) | Output stderr do tool | throw `BootstrapFailedError` com `.exitCode` e `.stderr` |
| Falha no render de template | Sintaxe inválida ou var faltante | throw `TemplateRenderError` com `.template` e `.cause` — bug, não deve chegar em produção |
| IO error (disk full, permissão) | Escrita falhou | throw `IOError`, exit 2 |
| Pós-instalação falhou ao gerar script | Internal bug | throw `PostInstallScriptError`, raríssimo |

**Comportamento em concorrência:**

`generate()` **não é** thread-safe nem reentrante por design — assume escrita exclusiva em `opts.dir`. CLI nunca chama 2 generates concorrentes no mesmo dir; teste DNA roda 11 generates em **dirs separados** sequenciais.

#### 5.2.3 `packages/cli/src/stacks/dna-emitter.ts`

```ts
import type { DareDnaArtifact, ScaffoldOpts } from './types';

export interface DnaEmitOpts {
  readonly dir: string;
  readonly projectName: string;
  readonly stackId: StackId;
  readonly artifact: DareDnaArtifact;
  /** Conteúdo específico por stack (do scaffolder). */
  readonly content: string;
  /** Subpath relativo a opts.dir. Ex: '.env.example' ou '.github/workflows/dare-ci.yml' */
  readonly targetPath: string;
}

/**
 * Escreve um artefato DNA no disco e retorna o path relativo escrito.
 *
 * Pré-condições:
 *   - opts.dir existe
 *   - opts.targetPath é relativo, não contém '..', não é absoluto
 *
 * Pós-condições:
 *   - Arquivo existe em path.join(opts.dir, opts.targetPath)
 *   - Diretórios pais foram criados via fs-extra.ensureDir
 *
 * Erros:
 *   - IOError com .targetPath em falha de escrita
 *
 * Idempotente: sobrescreve sem aviso (CLI garante dir vazio upstream).
 */
export async function emit(opts: DnaEmitOpts): Promise<string>;

/**
 * Helper: emite todos os 7 artefatos DNA com defaults sensatos.
 * Cada scaffolder chama isso e depois faz overlay específico.
 *
 * Retorna Set com DareDnaArtifact emitidos.
 */
export async function emitDefaults(
  ctx: { dir: string; projectName: string; stackId: StackId },
): Promise<ReadonlySet<DareDnaArtifact>>;
```

#### 5.2.4 `packages/cli/src/stacks/template-engine.ts`

```ts
export type TemplateEngine = 'handlebars' | 'nunjucks' | 'mustache' | 'raw';

export interface RenderOpts {
  /** Caminho absoluto ou path relativo a packages/cli/templates/stacks/<stackId>/ */
  readonly templatePath: string;
  readonly engine: TemplateEngine;
  readonly vars: Readonly<Record<string, unknown>>;
}

/**
 * Renderiza um template e retorna o conteúdo.
 *
 * Pré-condições:
 *   - templatePath aponta para arquivo existente
 *   - vars contém todas as vars referenciadas pelo template (var faltante → throw)
 *
 * Pós-condições:
 *   - Retorna string com o conteúdo renderizado
 *
 * Erros:
 *   - TemplateNotFoundError se path não existe
 *   - TemplateRenderError com .cause em parse/runtime do engine
 *
 * Idempotente, pura. Sem IO de escrita.
 */
export async function render(opts: RenderOpts): Promise<string>;

/**
 * Helper: render + escreve em destPath.
 * destPath é relativo a um dir base passado.
 */
export async function renderToFile(
  opts: RenderOpts & { destPath: string; baseDir: string },
): Promise<void>;
```

### 5.3 Outputs concretos por stack — exemplo: NestJS

Para evitar stub na implementação, este é o **payload concreto** que o scaffolder do `node-nestjs` deve produzir. Mesmo nível de especificidade será replicado para os outros 6 backends + 4 MCP em `task-T-XXX-*.md` durante `/dare-tasks`. Aqui registramos o **modelo de exemplo**.

**Comando equivalente que o usuário executa:**

```bash
dare init my-api --stack node-nestjs --toolchain auto --features llms-txt,openapi,cli-json-flag,env-example,rate-limit,skills-yml,github-ci --llm-provider dummy
```

**`filesWritten` esperado (ordem determinística):**

```
package.json
tsconfig.json
nest-cli.json
.gitignore
.env.example
README.md
llms.txt
.dare/skills.yml
.github/workflows/dare-ci.yml
src/main.ts
src/app.module.ts
src/common/middleware/rate-limit.middleware.ts
src/common/filters/problem-details.filter.ts
src/common/interceptors/json-response.interceptor.ts
src/auth/auth.module.ts
src/auth/auth.controller.ts
src/auth/auth.service.ts
src/auth/dto/login.dto.ts
src/auth/dto/login-response.dto.ts
src/auth/jwt.strategy.ts
src/users/users.module.ts
src/users/users.controller.ts
src/users/users.service.ts
src/users/users.repository.ts
src/users/dto/user.dto.ts
src/users/entities/user.entity.ts
prisma/schema.prisma
prisma/seed.ts
test/auth.e2e-spec.ts
test/users.e2e-spec.ts
```

**Endpoints HTTP do app gerado (NestJS):**

| Método | Rota | Auth | Request body | Response 2xx | Erros |
|---|---|---|---|---|---|
| POST | `/auth/login` | none | `LoginDto { email: string (email), password: string (min 8) }` | 200 `LoginResponseDto { accessToken: string, expiresIn: number }` | 400 (validation), 401 (credentials) |
| GET | `/auth/me` | Bearer JWT | — | 200 `UserDto { id: uuid, email: string, createdAt: ISO }` | 401, 403 |
| GET | `/users` | Bearer JWT | query `?page=1&limit=20` | 200 `{ items: UserDto[], total: number, page: number }` | 401, 400 |
| POST | `/users` | Bearer JWT (admin only) | `CreateUserDto { email, password, role? }` | 201 `UserDto` | 400, 401, 403, 409 (email exists) |
| GET | `/openapi.json` | none | — | 200 OpenAPI 3.1 doc | — |

**Validações server-side enumeradas** (`class-validator` + `class-transformer`):

- `email`: `@IsEmail()`, lowercase, trim
- `password`: `@MinLength(8)`, `@Matches(/[A-Z]/)`, `@Matches(/[0-9]/)`
- `page`: `@IsInt() @Min(1)`, default 1
- `limit`: `@IsInt() @Min(1) @Max(100)`, default 20
- `role`: `@IsEnum(['user', 'admin'])`

**Side effects do POST `/users`:**

1. Hash da senha com `bcrypt` cost 12 (config via env `BCRYPT_COST`, default 12)
2. Insert em `User` table (Prisma)
3. Log de auditoria via Pino com `event=user.created, userId=<uuid>, by=<caller-id>`

**Modelos Prisma:**

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // bcrypt hash
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
}

enum Role {
  USER
  ADMIN
}
```

**Rate limit:**

- Lib: `@nestjs/throttler` v6.x
- Default: 60 requests / minute / IP, sobrescrevível por env `RATE_LIMIT_RPM` e `RATE_LIMIT_TTL`
- Aplicado globalmente em `app.module.ts` via `ThrottlerModule.forRoot()`

**`.env.example`:**

```env
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/myapi
JWT_SECRET=replace-me-in-prod
JWT_EXPIRES_IN=15m
BCRYPT_COST=12
RATE_LIMIT_RPM=60
RATE_LIMIT_TTL=60
LLM_PROVIDER=dummy
# LLM_PROVIDER=openai
# OPENAI_API_KEY=
LOG_LEVEL=info
```

**Comando pós-instalação imprimido:**

```
cd my-api
cp .env.example .env
docker compose up -d postgres   # OR your own DB
pnpm install                    # OR npm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm start:dev
```

**O mesmo nível de especificidade aplica-se a cada um dos 11 stacks**, materializado em `DARE/EXECUTION/task-T-XXX-stack-<id>.md` durante o `/dare-tasks`.

## 6. Plano de Execução (Fases)

> Convenção da skill: Fase 1 = containerização, Fase N-1 = security audit.
>
> **Adaptação justificada:** este artefato não é um serviço — é uma **CLI npm**. "Containerização" no sentido clássico (Dockerfile do produto) não se aplica; mas a CLI **gera** projetos que precisam de Dockerfile, e nós usamos Docker como fallback toolchain. Portanto Fase 1 = **Foundation de tipos/registry/DNA** (a "containerização" do contrato). Mantemos a Fase N-1 de auditoria de segurança intacta.

### Fase 1 — Foundation (Tipos + Registry + DNA emitter + Template engine)

**Objetivo:** estabelecer o contrato `StackScaffold` e o gate DNA antes de qualquer scaffolder concreto. Quem implementar um scaffolder vai *contra* este contrato — sem alvo móvel.

**Critério de DONE (verificável):**

- `packages/cli/src/stacks/{types,registry,dna-emitter,template-engine}.ts` existem e compilam (`tsc --noEmit`).
- `packages/cli/src/stacks/__tests__/registry.spec.ts` passa com 0 stacks registrados ainda (testa erro de stack desconhecido, lista vazia, etc.).
- `packages/cli/src/stacks/__tests__/dna.spec.ts` existe em modo "skeleton" — itera sobre `STACK_REGISTRY` (vazio nesta fase) e dá 0 testes verdes; **fail-when-empty** ativado: se `STACK_REGISTRY.size === 0` ao final do plano, gate falha.
- Sem mudança ainda em `init.ts` nem em `bin/dare.ts`.

**Entregáveis:**

1. `src/stacks/types.ts` conforme Seção 4.1
2. `src/stacks/registry.ts` esqueleto: `STACK_REGISTRY` como `Map` vazio + `resolve()`/`list()`/`has()` + error classes
3. `src/stacks/dna-emitter.ts` com `emit()` e `emitDefaults()`
4. `src/stacks/template-engine.ts` com `render()` e `renderToFile()`
5. Testes de unidade dos 4 módulos acima

### Fase 2 — Internalização do Rails 8 (snapshot baseline + mudança paths)

**Objetivo:** mover o único scaffolder existente sem mudar comportamento. Aprovação por paridade byte-a-byte (ignorando timestamps/UUIDs).

**Critério de DONE (verificável):**

- Snapshot baseline: rodar `dare new --stack rails` em tmp dir num commit pré-mudança; salvar tree-hash + lista ordenada de filesWritten em fixture `parity-rails.fixture.json`.
- Mover `packages/stacks/ruby-rails-8/src/index.ts` → `packages/cli/src/stacks/ruby-rails-8/scaffold.ts` ajustando imports (rel paths em vez de `@dewtech/...`).
- Mover `packages/stacks/ruby-rails-8/templates/` → `packages/cli/templates/stacks/ruby-rails-8/`.
- Atualizar `packages/cli/src/commands/new.ts:100` para `import { RailsScaffold } from '../stacks/ruby-rails-8/scaffold.js'` (temporariamente — `new.ts` será removido na Fase 6).
- Registrar Rails no `STACK_REGISTRY` (1 entrada).
- `parity-rails.spec.ts` passa: tree-hash do scaffold pós-mudança == fixture (timestamps/uuids ignorados).
- `dare new --stack rails` ainda funciona (não removemos ainda).
- `dare-stack-ruby-rails-8` ainda existe em `packages/stacks/` (apagamos só na Fase 6).

**Entregáveis:**

1. Fixture `parity-rails.fixture.json` (gerada de commit pré-mudança)
2. `src/stacks/ruby-rails-8/scaffold.ts` + 1 spec
3. `templates/stacks/ruby-rails-8/**`
4. Entrada no `STACK_REGISTRY`
5. `parity-rails.spec.ts` verde

### Fase 3 — Rails no fluxo `init` (sem remover `new` ainda)

**Objetivo:** habilitar Rails como opção em `dare init`. `new` continua funcionando em paralelo até Fase 6 — feature-flag implícita por presença do código.

**Critério de DONE (verificável):**

- `init.ts` faz lookup no `STACK_REGISTRY` para backend e MCP categories.
- Prompt do Inquirer lista Rails como opção `💎 Ruby / Rails 8` em backend.
- `dare init --non-interactive --stack ruby-rails-8 --name foo` em tmp dir produz scaffold válido.
- Diff entre output do `dare init --stack ruby-rails-8` (Fase 3) e `dare new --stack rails` (Fase 2 baseline) = 0 (ignorando timestamps/uuids).
- Test `init.integration.spec.ts` cobre cenário Rails via init.

### Fase 4 — Construir os 6 scaffolders backend (paralelizável)

**Objetivo:** trazer NestJS, FastAPI, Laravel, Axum, Gin, stdlib do estado "só bootstrap" pro estado "scaffolder completo com DNA".

**Critério de DONE por stack (aplicável aos 6):**

- Scaffolder `src/stacks/<id>/scaffold.ts` implementa `StackScaffold`.
- Templates em `templates/stacks/<id>/**`.
- Spec próprio (`__tests__/scaffold.spec.ts`) roda `generate()` em tmp dir e valida `filesWritten` ⊇ lista mínima da seção 5.3 (modelo NestJS — adaptado por stack em task-T-XXX).
- `dna.spec.ts` agora gera scaffold pro stack e valida os 7 artefatos.
- Registrado no `STACK_REGISTRY`.
- `init.ts` oferece como opção.
- Stack aparece em `dare stacks list --json` com `status: 'stable'`.

**Entregáveis (cada um dos 6):**

1. `src/stacks/<id>/scaffold.ts`
2. `templates/stacks/<id>/**`
3. `src/stacks/<id>/__tests__/scaffold.spec.ts`
4. Atualização do `STACK_REGISTRY`

Paralelismo: as 6 sub-tasks são **independentes entre si** após Fase 1. Podem ser executadas concorrentemente em worktrees separadas (uma worktree por stack). Pré-requisito Ralph Loop: ao mergear, conflitar só em `registry.ts` — resolução manual trivial.

### Fase 5 — Construir os 4 scaffolders MCP (paralelizável)

**Objetivo:** dar a cada linguagem MCP o mesmo tratamento dos backends, mais a dimensão de transport como flag.

**Critério de DONE por variante (aplicável aos 4):**

- Scaffolder `src/stacks/mcp-<lang>/scaffold.ts` implementa `StackScaffold` com `category: 'mcp'`.
- Templates em `templates/stacks/mcp-<lang>/**` cobrem **3 transports** (stdio/sse/http) — arquivo separado por transport em `src/transports/<transport>.<ext>`, escolhido pelo scaffolder conforme `opts.mcp.transport`.
- App gerado tem 1 tool `echo` que retorna o input + 1 prompt template no registry.
- Harness de teste no app gerado roda o transport ativo e verifica round-trip da tool.
- Spec próprio + DNA gate verdes.
- Registrado + listado.

**Paralelismo:** 4 sub-tasks independentes.

### Fase 6 — Remoção definitiva (`new.ts` + `packages/stacks/` + workspace)

**Objetivo:** consolidar a arquitetura — não há volta após esta fase.

**Critério de DONE (verificável):**

- `packages/cli/src/commands/new.ts` deletado.
- Registro do command no `bin/dare.ts` removido.
- `dare new` retorna `error: unknown command 'new'` (exit 1 do commander).
- `dare --help` não contém `new`.
- `packages/stacks/` deletado por completo.
- `pnpm-workspace.yaml` não contém `packages/stacks/*`.
- `packages/cli/package.json` não contém `@dewtech/dare-stack-ruby-rails-8` em `dependencies`.
- `pnpm install` na raiz roda sem warnings.
- `pnpm -r build` passa.
- `pnpm -r test` passa.

### Fase 7 — Auditoria de segurança e dependências (**Fase N-1**)

**Objetivo:** validar que (a) o CLI não introduziu vulnerabilidades; (b) todos os 11 templates emitem `.github/workflows/dare-ci.yml` com `audit` job; (c) nenhum scaffolder vaza segredo em `.env.example`.

**Critério de DONE (verificável):**

- `pnpm audit --audit-level=high` no CLI: 0 vulnerabilidades HIGH/CRITICAL.
- `pnpm audit --audit-level=high` em scaffold gerado de cada stack: 0 HIGH/CRITICAL (com pequeno período de tolerância documentado se algum tool oficial introduzir CVE conhecido — registrar em `KNOWN-CVES.md` com data e mitigação).
- Test `dna.spec.ts` — sub-spec `env-example-no-secrets`: para cada stack, lê `.env.example` gerado, valida que:
  - Nenhum valor tem padrão `[A-Za-z0-9+/]{32,}={0,2}` (base64 longo)
  - Nenhum valor tem padrão `[a-f0-9]{32,}` (hex de hash/key)
  - Linhas de comentário OK; linhas com `KEY=` permitido vazio, com placeholder, ou com URL ofuscada
- `gitleaks` (ou regex equivalente) roda sobre `templates/stacks/**` e não acha nada.
- Para cada `.github/workflows/dare-ci.yml` gerado: job `audit` presente, falha CI em HIGH+.

### Fase 8 — Docs + bump + release smoke

**Objetivo:** atualizar documentação, bumpar versão, validar tarball, publicar.

**Critério de DONE (verificável):**

- `README.md` — tabela de stacks suportadas atualizada (11 stacks).
- `ROADMAP.md` — linha "Stacks com gerador completo (1)" → "(11)"; mover item "generators p/ outras stacks" de pending → entregue v3.1.
- `CHANGELOG.md` — seção `[3.1.0] — 2026-06` completa: ✨ Adicionado · 🐛 Corrigido (404 npm) · ⚠️ Breaking (remoção `dare new`, remoção workspace dep) · 📁 Mudanças estruturais.
- `packages/cli/package.json` — `version: "3.1.0"`, `files` inclui `["dist/**", "templates/**"]`.
- `package.json` raiz — `version: "3.1.0"`.
- `npm pack --dry-run` em `packages/cli/`: tarball ≤ 3 MB, lista `templates/stacks/**`.
- Smoke test em VM/container Node 20 alpine: `npm install -g <tarball>.tgz` + `dare --version` retorna `3.1.0` + `dare stacks list` mostra 11.
- Tag `v3.1.0` empurrada; `publish.yml` dispara e cria GitHub Release.

## 7. Validation Gates por Stack

> Para o **CLI** (este projeto):

| Camada | Build | Test | Lint/Audit |
|---|---|---|---|
| Node/TypeScript (`packages/cli/`) | `pnpm --filter @dewtech/dare-cli build` | `pnpm --filter @dewtech/dare-cli test` | `pnpm --filter @dewtech/dare-cli lint && pnpm --filter @dewtech/dare-cli audit --audit-level=high` |

> Para os **projetos gerados** (DNA gate por linguagem-alvo):

| Stack gerado | Build | Test | Lint/Audit |
|---|---|---|---|
| Rust/Axum | `cargo build` | `cargo test --workspace` | `cargo clippy && cargo audit` |
| Node/NestJS | `pnpm build` (tsc) | `pnpm test` (vitest ou jest) | `pnpm lint` (eslint) + `pnpm audit --audit-level=high` |
| Python/FastAPI | `python -m compileall app` | `pytest` | `ruff check . && pip-audit` |
| PHP/Laravel | `php artisan config:cache` | `php artisan test` | `./vendor/bin/phpstan analyse && composer audit` |
| Go/Gin e Go/stdlib | `go build ./...` | `go test ./...` | `golangci-lint run && govulncheck ./...` |
| Ruby/Rails 8 | `bin/rails assets:precompile` | `bin/rails test` | `bundle audit check --update && rubocop` |
| MCP node-ts | `pnpm build` | `pnpm test` | `pnpm lint` |
| MCP python | `python -m compileall src` | `pytest` | `ruff check . && pip-audit` |
| MCP rust | `cargo build` | `cargo test` | `cargo clippy && cargo audit` |
| MCP go | `go build ./...` | `go test ./...` | `golangci-lint run && govulncheck ./...` |

Estes gates compõem o `dare-ci.yml` que cada scaffold emite — ou seja, ao gerar um projeto, esse mesmo gate vai ser quem trava o CI do projeto-alvo. **Coerência fim-a-fim.**

## 8. Controles de Segurança

Mapeamento dos RS-* do DESIGN para fases de execução:

| RS | Controle | Fase | Como é verificado |
|---|---|---|---|
| RS-01 | Validação de entrada (OWASP A03) | 4, 5 | Templates de cada stack incluem validação habilitada por padrão (class-validator, Pydantic, FormRequest, go-playground/validator, jsonschema_validator); test do scaffold tem caso de payload inválido → 400 |
| RS-02 | Hash de senha (OWASP A02) | 4 | Auth scaffold usa bcrypt cost 12 ou argon2id; test executa register + verifica `password` no DB é hash, não plaintext |
| RS-03 | Controle de acesso (OWASP A01) | 4 | Middleware/guard JWT em rotas autenticadas; test verifica 401 sem token, 403 com role insuficiente |
| RS-04 | Audit deps sem CVE HIGH (OWASP A06) | 7 | `dare-ci.yml` roda audit do ecossistema; CI falha em HIGH+ |
| RS-05 | Secrets via env (sem hardcode) | 1, 4, 5, 7 | `dna.spec.ts` sub-spec `env-example-no-secrets`; gitleaks sobre `templates/stacks/**` |
| RS-06 | Rate limit by default | 4, 5 | DNA gate `rate-limit` exige presença de middleware/handler com nome canônico do ecossistema |
| RS-07 | CORS restrito | 4 | Template default usa whitelist por env; sem `Access-Control-Allow-Origin: *` |
| RS-08 | CLI não vaza segredo | 1 | `dna-emitter.ts` valida `.env.example` antes de escrever (reuse do regex de RS-05) |
| RS-09 | Templates sem placeholders perigosos | 1, 4, 5 | Engines usam escaping default; `template-engine.ts` não expõe `safe`/`raw` — string crua só via fallback `raw` engine (auditável) |

## 9. Estratégia de Testes

### 9.1 Unitários

- `src/stacks/types.ts` — sem teste (só tipos).
- `src/stacks/registry.ts` — `registry.spec.ts`: resolve com id válido, throws com id inválido, lazy memoiza, list determinístico.
- `src/stacks/dna-emitter.ts` — `dna-emitter.spec.ts`: escreve em path correto, falha em path absoluto, validação de segredos.
- `src/stacks/template-engine.ts` — `template-engine.spec.ts`: render por engine, var faltante, path inexistente.
- Cada `src/stacks/<id>/__tests__/scaffold.spec.ts` — roda `generate()` em tmp dir + asserts em `filesWritten` mínimos da seção 5.3 (modelo NestJS) ou equivalente por stack.

### 9.2 Integração

- `src/commands/__tests__/init.integration.spec.ts` — invoca o command em tmp dir com flags variadas; valida exit code + filesWritten.
- `src/__tests__/dag-runner/ralph-loop.test.ts` — manter cobertura existente; ajustar paths atualizados de `ruby-rails-8`.

### 9.3 DNA Gate (single-source paridade)

- `src/stacks/__tests__/dna.spec.ts` — itera sobre `STACK_REGISTRY.values()`; para cada entry: `resolve()` → `generate()` em tmp dir → valida os 7 artefatos com regex/grep estrutural.
- **Fail-when-empty**: se `STACK_REGISTRY.size < 11` ao final do CI, gate falha.

### 9.4 Paridade Rails

- `src/stacks/__tests__/parity-rails.spec.ts` — diff entre fixture baseline (Fase 2) e output atual; ignora regex de timestamps + UUIDs; falha se diff != ∅.

### 9.5 Smoke do tarball publicado

- `.github/workflows/publish-smoke.yml` (a criar) — após `publish.yml`, baixa o tarball do registry, instala em `node:20-alpine`, roda `dare --version` + `dare stacks list --json` + valida JSON tem 11 entries.

### 9.6 Skill ↔ scaffold parity

- `src/skills/tests/skill-scaffold-parity.spec.ts` — para cada skill `skill-<x>-api.md` em `templates/ide/*/`: extrai files-âncora declarados na skill (via frontmatter `anchors:` ou seção `## Files`); roda scaffold do stack equivalente; valida que **todos** os anchors estão em `filesWritten`. Falha se divergência.

## 10. Estratégia de Deploy

Este artefato é uma **biblioteca npm CLI**, não um serviço — não tem ambientes "staging/prod". Estratégia:

| Ambiente | Artefato | Branch | Trigger | Infra |
|---|---|---|---|---|
| Pre-release local | tarball local (`npm pack`) | qualquer | manual | `node:20-alpine` em container local |
| Beta (npm tag `next`) | `@dewtech/dare-cli@3.1.0-beta.N` | `feat/v3.1-stack-generators` | manual `gh workflow run publish.yml --field tag=next` | npm registry |
| Stable | `@dewtech/dare-cli@3.1.0` | `main` | tag `v3.1.0` push | npm registry + GitHub Release |
| Smoke test pós-publish | execução do `publish-smoke.yml` | tag `v*` | automático após publish.yml verde | GitHub Actions runner ubuntu-latest + node:20-alpine |

Rollback: se v3.1.0 quebrar, `npm dist-tag add @dewtech/dare-cli@3.0.0 latest` reverte clientes novos; usuários em v3.1.0 continuam até downgrade explícito (sem mecanismo de auto-rollback no CLI).

## 11. Anti-Stub Contract — Aplicação a esta Feature

Esta seção formaliza o "anti-stub" do skill template para o nosso domínio (CLI scaffolders):

### 11.1 Para cada scaffolder novo (Fases 4 e 5)

Antes de marcar a task como DONE, validar com checklist:

- [ ] Lista de `filesWritten` está **enumerada** no spec do scaffold (não "and other files").
- [ ] Cada endpoint HTTP do app gerado tem método, rota, auth, request schema, response schema por status code (modelo seção 5.3).
- [ ] Validações server-side são listadas com regex ou regra concreta (não "validar email").
- [ ] Pré e pós-condições de cada função do scaffolder estão documentadas no JSDoc.
- [ ] Edge cases enumerados no spec do scaffold: dir não vazio, projectName inválido, tool oficial faltando, transport errado.
- [ ] `.env.example` listado com valores placeholders concretos (modelo seção 5.3).
- [ ] Comando pós-instalação imprimido é uma string shell-quotada **executável**, não "ajuste suas envs".
- [ ] DNA emit cobre os 7 artefatos.

### 11.2 Anti-padrões proibidos no PR

- Strings de marcador `TODO`, `FIXME`, `XXX`, `// stub`, `# placeholder` em código novo.
- Funções com 1 linha `throw new Error('not implemented')`.
- Templates com apenas comentário (sem conteúdo real).
- Test que apenas `expect(true).toBe(true)`.
- `scaffold.ts` que devolve `ScaffoldResult` sem ter escrito nada.

Lint customizado roda em pré-commit + em CI: regex pattern detect.

## 12. Checklist de Aprovação do BLUEPRINT

Para destravar `/dare-tasks`:

- [ ] Diagrama Mermaid (1.1) reflete a arquitetura desejada
- [ ] Decisões A-1 a A-10 (1.2) estão alinhadas com o DESIGN
- [ ] Tipos em `types.ts` (4.1) são suficientes — nenhum campo crítico faltando
- [ ] Contratos CLI (5.1) — strings de erro estão certas; exit codes fazem sentido
- [ ] Contratos `registry.ts` / `dna-emitter.ts` / `template-engine.ts` (5.2) são executáveis
- [ ] Modelo de output (NestJS, seção 5.3) é o **shape esperado** dos 11 stacks
- [ ] Plano de Fases (6) — Fase 1 adaptada (foundation, não containerização) é aceitável
- [ ] Gates por stack (7) batem com o que vai entrar no `dare-ci.yml` gerado
- [ ] Estratégia de teste (9) cobre DNA gate + paridade Rails + smoke do tarball
- [ ] Anti-stub (11) é o suficiente pra impedir scaffolds vazios

> **Próximo passo:** após sua aprovação, rodar `/dare-tasks` para gerar `DARE/TASKS-v3-1.md`, `DARE/dare-dag.yaml` (ou `dare-dag-v3-1.yaml`) e os `DARE/EXECUTION/task-T-XXX-*.md` com a especificação executável de cada uma das 11 stacks + foundation + remoção + release.
