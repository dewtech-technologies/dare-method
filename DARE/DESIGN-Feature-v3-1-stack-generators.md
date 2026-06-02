# Feature Design: v3.1 — Stack Generators Internalizados + Unificação no `dare init`

> Gerado seguindo o próprio Método DARE (Fase D). Artefato de design para revisão humana
> antes da implementação. License: MIT (parte do DARE Method).
> Branch: `feat/v3.1-stack-generators` · Target release: **v3.1.0**
>
> **Versionamento confirmado pelo autor:** v3.1.0 (não v4). A remoção do `dare new` é
> tratada como **correção do bug 404 da v3** + completação da paridade prometida — não
> como redesenho de comandos canônicos. Sem período de deprecação.

---

## 1. Descrição

Esta feature corrige um **bug bloqueante de distribuição** e fecha a maior lacuna estrutural do v3.0.0: a falta de paridade entre stacks no scaffolding determinístico.

O bug: `npm install -g @dewtech/dare-cli` falha com **404** porque [packages/cli/package.json](../packages/cli/package.json) declara `"@dewtech/dare-stack-ruby-rails-8": "workspace:*"` como `dependencies`. O protocolo `workspace:*` só é resolvido por pnpm dentro do monorepo; quando npm instala publicamente, busca o pacote no registry e o pacote nunca foi publicado — nem será.

A correção arquitetural: **nenhum stack vira pacote isolado**. Tudo é internalizado no `@dewtech/dare-cli` como um único tarball publicável. Aproveitando o trabalho de internalização, esta versão também:

- **Remove o comando `dare new`** (Rails-only, fluxo paralelo) — `dare init` vira o único entrypoint de scaffolding.
- **Eleva os 6 stacks "skills-only"** (NestJS, FastAPI, Laravel, Rust/Axum, Go/Gin, Go/stdlib) ao mesmo nível do Rails 8: scaffolder completo com templates DARE-shaped, não só wrapper do tool oficial.
- **Internaliza MCP Server** como stack de primeira classe em **4 linguagens** (node-ts, python, rust, go), cada uma com transport selecionável via flag (stdio/sse/http).

Resultado: `dare init` oferece **7 stacks backend + 4 variantes de MCP server** com o mesmo DNA DARE (Layered Design, OpenAPI, llms.txt, --json, rate limit, env, CI gates).

## 2. Objetivos e Métricas de Sucesso

| # | Objetivo | Métrica verificável |
|---|---|---|
| O-01 | Eliminar 404 ao instalar o CLI publicamente | `npm install -g @dewtech/dare-cli` num shell limpo retorna exit 0 e instala o binário `dare` |
| O-02 | Tornar `dare init` o único entrypoint de scaffolding | `dare new` não existe; `dare --help` lista 1 comando de scaffolding, não 2 — remoção direta, sem deprecação |
| O-03 | Paridade de stacks backend + MCP | `dare init` oferece 7 stacks de backend (ruby-rails-8, node-nestjs, python-fastapi, php-laravel, rust-axum, go-gin, go-stdlib) + 4 variantes MCP (mcp-node-ts, mcp-python, mcp-rust, mcp-go) — **11 stacks no total**, cada um com scaffolder em `packages/cli/src/stacks/<name>/` (não apenas bootstrap do tool oficial) |
| O-04 | Templates embutidos no pacote npm | `npm pack --dry-run` em `packages/cli/` lista `templates/stacks/**` no tarball; tamanho compactado ≤ 3 MB (margem maior com 8 stacks) |
| O-05 | Zero pacotes workspace de stack | `pnpm-workspace.yaml` não menciona `packages/stacks`; diretório não existe |
| O-06 | Contrato uniforme entre scaffolders | Todos implementam `interface StackScaffold` com método `generate(opts): Promise<ScaffoldResult>` e expõem mesmo conjunto de hooks (DNA DARE) |
| O-07 | Cobertura de testes | Cada scaffolder tem teste de smoke (`generate()` em tmp dir + asserts em arquivos-chave); coverage de `src/stacks/` ≥ 70% |
| O-08 | Sem regressão de projetos v3.0.0 | Projetos Rails criados em v3.0.0 continuam abrindo no DAG runner sem retoque manual |

## 3. Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Coerência filosófica (1 CLI, 1 entrypoint, DNA único entre stacks) |
| Usuário final (dev) | adotantes do DARE | `npm install -g` que funciona; escolher stack sem cair em "skill only" |
| Mantenedores CLI | Dewtech | Contrato `StackScaffold` testável, sem dívida na fronteira pacote/template |
| Mantenedores de skill | Dewtech | Skills de IDE (`skill-*-api`) continuam válidas — agora respaldadas por código real |

## 4. Decisões Travadas (com o autor)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Empacotamento | **Single-package**: tudo dentro de `@dewtech/dare-cli`. `packages/stacks/` deixa de existir. |
| D-2 | Entrypoint de scaffolding | **`dare init` único**. `dare new` é **removido direto na v3.1.0**, sem período de deprecação, sem alias, sem aviso — confirmado pelo autor. |
| D-3 | Localização dos scaffolders | `packages/cli/src/stacks/<name>/scaffold.ts` (código) + `packages/cli/templates/stacks/<name>/` (templates ERB/jinja/handlebars/tera conforme stack). |
| D-4 | Contrato comum | Interface `StackScaffold` com `generate(opts: ScaffoldOpts): Promise<ScaffoldResult>`. Cada stack registra-se num `STACK_REGISTRY` lazy-loaded. |
| D-5 | DNA DARE obrigatório (7 artefatos) | Todo scaffolder emite **obrigatoriamente** os 7 artefatos da seção 5.4. Gate em CI (test `dna.spec.ts`) — scaffold que não emita os 7 falha no build. Confirmado pelo autor: artefatos são **invariantes**. |
| D-6 | Toolchain mode | Mantém `'native' \| 'docker' \| 'auto'` da v3.0.0. Scaffolder roda o tool oficial em modo `bootstrap`, depois overlay de templates DARE — fusão dos 2 mundos atuais. |
| D-7 | MCP server | **4 variantes por linguagem** (`mcp-node-ts`, `mcp-python`, `mcp-rust`, `mcp-go`). Transport é **flag de runtime** (`--transport stdio\|sse\|http`, default `stdio`), não stack separado — segue padrão da casa (toolchain mode também é flag). SDKs oficiais: `@modelcontextprotocol/sdk` (Node), `mcp[cli]` (Python), `rmcp` (Rust), `mcp-go` (Go). Cada variante traz 1 tool exemplo (`echo`) + 1 prompt no registry + harness de teste do transport ativo. |
| D-8 | Migração silenciosa | Projetos Rails v3.0.0 → zero quebra. O código da `RailsScaffold` move sem alteração semântica; só muda o import path. |
| D-9 | Skills de IDE | Inalteradas. Continuam guiando o agente; agora há código de verdade por trás (skill ↔ scaffold, dois lados do mesmo stack). |

## 5. Arquitetura

### 5.1 Antes (v3.0.0)

```
packages/
  cli/
    src/
      commands/
        init.ts     ← prompt → bootstrapBackend() → roda npx/composer/pip/go (sem DARE)
        new.ts      ← Rails-only → import('@dewtech/dare-stack-ruby-rails-8') ← workspace:*
      utils/
        stack-bootstrap.ts  ← wrappers finos do tool oficial
  stacks/
    ruby-rails-8/   ← pacote workspace separado, ~440 LOC + templates ERB
      package.json  ← name: @dewtech/dare-stack-ruby-rails-8 (nunca publicado)
      src/index.ts  ← class RailsScaffold
      templates/
```

Fluxos paralelos. Rails completo via `new`; resto raso via `init`. Pacote workspace quebra `npm install`.

### 5.2 Depois (v3.1.0)

```
packages/
  cli/
    src/
      commands/
        init.ts     ← único entrypoint; prompt → dispatcher do registry
      stacks/
        registry.ts        ← STACK_REGISTRY: Map<StackId, () => Promise<StackScaffold>>
        types.ts           ← interface StackScaffold, ScaffoldOpts, ScaffoldResult
        ruby-rails-8/scaffold.ts
        node-nestjs/scaffold.ts
        python-fastapi/scaffold.ts
        php-laravel/scaffold.ts
        rust-axum/scaffold.ts
        go-gin/scaffold.ts
        go-stdlib/scaffold.ts
        mcp-node-ts/scaffold.ts
        mcp-python/scaffold.ts
        mcp-rust/scaffold.ts
        mcp-go/scaffold.ts
      utils/
        stack-bootstrap.ts ← reduzido: só helpers de invocar tool oficial; chamado pelos scaffolders
    templates/
      stacks/
        ruby-rails-8/      ← tudo que estava em packages/stacks/ruby-rails-8/templates/
        node-nestjs/
        python-fastapi/
        php-laravel/
        rust-axum/
        go-gin/
        go-stdlib/
        mcp-node-ts/
        mcp-python/
        mcp-rust/
        mcp-go/
```

`packages/stacks/` **não existe mais**. `pnpm-workspace.yaml` perde a entrada `packages/stacks/*`. Único pacote publicável continua sendo `@dewtech/dare-cli`.

### 5.3 Contrato `StackScaffold`

```ts
export interface StackScaffold {
  readonly id: StackId;                  // 'ruby-rails-8' | 'node-nestjs' | ...
  readonly label: string;                // string exibida no prompt
  readonly category: 'backend' | 'mcp';

  generate(opts: ScaffoldOpts): Promise<ScaffoldResult>;
}

export interface ScaffoldOpts {
  dir: string;                           // diretório-alvo já criado
  projectName: string;
  toolchain: 'native' | 'docker' | 'auto';
  features: Set<DareDnaFeature>;         // 'llms-txt' | 'openapi' | 'rate-limit' | ...
  llm?: { providers: LlmProvider[] };    // opcional, decidido no prompt
  realtime?: { transport: 'ws' | 'sse' }; // só backends
  mcp?: { transport: 'stdio' | 'sse' | 'http' }; // só stacks da categoria 'mcp'
}

export interface ScaffoldResult {
  filesWritten: string[];
  postInstallSteps: string[];            // ex: "cd app && bundle install"
  warnings: string[];
}
```

Toda stack se registra em `registry.ts` com lazy import; `init.ts` consulta o registry para montar o prompt e dispatch.

### 5.4 DNA DARE (7 artefatos obrigatórios — invariantes)

Confirmado pelo autor: estes 7 artefatos são **mandatórios**. Scaffold que não emita qualquer um deles **falha no CI** (test `stacks/__tests__/dna.spec.ts`).

| # | Artefato | Função | Origem da exigência |
|---|---|---|---|
| 1 | `llms.txt` na raiz | descoberta para LLM/agente | métrica M-01 (Agent eXperience) |
| 2 | `openapi.json` na raiz **ou** rota `/openapi.json` servida | superfície HTTP machine-readable | métrica M-02 |
| 3 | Flag `--json` em todos os comandos CLI do app gerado | scriptabilidade | métrica M-03 |
| 4 | `.env.example` versionado, **sem valores reais** | secrets fora do código | RS-05 |
| 5 | Rate limit configurado por middleware/handler com knob em env | defesa contra abuso | RS-06 |
| 6 | `.dare/skills.yml` apontando para as skills da stack | rastreabilidade skill ↔ scaffold | governance |
| 7 | `.github/workflows/dare-ci.yml` com gate de qualidade (audit + lint + test) | CI determinístico | RS-04 + RNF-01 |

O test `dna.spec.ts` itera sobre **todo stack registrado** em `STACK_REGISTRY` e valida presença e shape mínimo de cada um dos 7 — gate single-source pra paridade total entre as 8 stacks. Stack novo só vira "released" quando passa nesse gate.

## 6. Requisitos Funcionais

| # | Prioridade | Requisito | Critério de aceite verificável |
|---|---|---|---|
| RF-01 | MUST | `npm install -g @dewtech/dare-cli` funciona | Em VM/container limpa com Node 20: instala, expõe binário `dare`, exit 0 |
| RF-02 | MUST | Comando `dare new` removido direto | `grep -r "command('new')" packages/cli/src` retorna vazio; `dare --help` não lista; sem alias, sem aviso, sem deprecação |
| RF-03 | MUST | `dare init` oferece 7 backends + 4 MCP | Run interativo agrupa: "Backend" com os 7 stacks; "MCP server" com 4 variantes de linguagem (node-ts, python, rust, go). Após escolher MCP, prompt secundário pergunta transport (stdio default, sse, http) |
| RF-04 | MUST | Cada stack tem scaffolder próprio | `packages/cli/src/stacks/<name>/scaffold.ts` existe pros 11 stacks (7 backend + 4 MCP) |
| RF-05 | MUST | Rails 8 migrado sem regressão | `dare init --stack ruby-rails-8 --non-interactive` em tmp dir produz mesmos arquivos que `dare new --stack rails` produzia em v3.0.0 (diff ignorando timestamps/uuids = vazio) |
| RF-06 | MUST | NestJS scaffolder produz Layered Design completo | Tem `src/{handlers,services,repositories,models}/`, Prisma schema seed, Swagger habilitado em `main.ts`, JWT auth funcional com endpoints `/auth/login` e `/auth/me` |
| RF-07 | MUST | FastAPI scaffolder | Pydantic models, SQLAlchemy + Alembic init, OpenAPI auto, JWT (python-jose), client LLM async opcional, endpoint SSE exemplo |
| RF-08 | MUST | Laravel scaffolder | Sanctum auth, FormRequest exemplo, Eloquent model + migration, Pail config, Reverb config + Echo no front-bootstrap, abstração `App\Llm\Provider` |
| RF-09 | MUST | Rust/Axum scaffolder | Cargo workspace-aware, Tower middleware (rate limit + CORS), `utoipa` para OpenAPI, JWT (jsonwebtoken), sqlx + migrations, exemplo WebSocket `axum::extract::ws` |
| RF-10 | MUST | Go/Gin scaffolder | sqlc configurado, swag init com docs.go gerado, middleware JWT, handler WebSocket com gorilla/websocket |
| RF-11 | MUST | Go/stdlib scaffolder | `net/http` puro com router 1.22+ (`http.ServeMux`), sqlc, OpenAPI gerado por anotações, middleware JWT custom, WebSocket com `nhooyr.io/websocket` |
| RF-12 | MUST | MCP scaffolders nas 4 linguagens (node-ts, python, rust, go) | Cada um: servidor com 1 tool exemplo (`echo`), 1 prompt template, scripts `dev`/`build`/`test`. Flag `--transport stdio\|sse\|http` (default `stdio`) seleciona o transport. SDK oficial: `@modelcontextprotocol/sdk`, `mcp[cli]`, `rmcp`, `mcp-go` respectivamente |
| RF-13 | MUST | DNA DARE em todos os 11 stacks | Test `dna.spec.ts` passa pros 11 scaffolds gerados — 7 artefatos presentes em cada |
| RF-14 | SHOULD | `dare init --non-interactive` aceita flags pra CI | `--stack=<id> --name=<x> --features=llms-txt,openapi --toolchain=docker` produz scaffold sem prompt |
| RF-15 | SHOULD | `dare init --dry-run` lista arquivos sem escrever | Útil pra preview em PR e docs |
| RF-16 | COULD | `dare stacks list` (subcomando) | Imprime registry: id, label, category, status (stable/beta) |

## 7. Requisitos Não-Funcionais

| # | Requisito | Métrica/Critério |
|---|---|---|
| RNF-01 | Performance — scaffold | `dare init` (modo `--non-interactive`) ≤ 30 s em SSD pra qualquer stack (excluindo `npm install`/`composer install` do projeto gerado) |
| RNF-02 | Tamanho do tarball | `@dewtech/dare-cli` publicado ≤ 3 MB compactado (margem maior com 8 stacks; medido por `npm pack --dry-run`) |
| RNF-03 | Disponibilidade — distribuição | `npm install -g @dewtech/dare-cli` retorna sucesso em ≥ 99% dos runs (excluindo outages do npm) |
| RNF-04 | Manutenibilidade | Adicionar novo stack = criar 1 pasta em `src/stacks/<name>/` + 1 em `templates/stacks/<name>/` + 1 linha no `registry.ts`. Sem outras mudanças no CLI. |
| RNF-05 | Testabilidade | Cada scaffolder roda em tmp dir, sem side-effects fora do `opts.dir`. Testes ≤ 5 s por stack. |
| RNF-06 | Compatibilidade Node | Suporta Node 18.x e 20.x (matriz de CI atual) |
| RNF-07 | Observabilidade do CLI | Comandos emitem JSON estruturado em stderr se `DARE_LOG=json` (não bloqueante, já existe — manter) |
| RNF-08 | Internacionalização | Mensagens do prompt em PT-BR (padrão atual do CLI) |

## 8. Requisitos de Segurança

| # | Requisito | OWASP/Origem | Como o scaffolder cumpre |
|---|---|---|---|
| RS-01 | Validação de entrada nos projetos gerados | A03 | Todo stack vem com lib de validação habilitada (Pydantic / FormRequest / class-validator / go-playground/validator) e exemplo de uso |
| RS-02 | Proteção de dados sensíveis | A02 | Auth scaffold usa hash recomendado pela stack (bcrypt/argon2id); senhas nunca em texto plano no DB |
| RS-03 | Controle de acesso por recurso | A01 | Endpoints autenticados protegidos por middleware; exemplo de policy/guard por resource owner |
| RS-04 | Auditoria de dependências sem CVE HIGH/CRITICAL | A06 | `dare-ci.yml` roda `pnpm audit --audit-level=high` (ou equivalente por stack); CI falha se HIGH+ |
| RS-05 | Secrets via env | — | `.env.example` versionado **sem valores reais**; `.env` no `.gitignore`; scanner de segredo no CI (gitleaks ou pattern grep mínimo) |
| RS-06 | Rate limit por padrão | A04 | Middleware/handler configurado em cada stack (rack-attack/express-rate-limit/slowapi/tower-governor/Laravel ThrottleRequests) |
| RS-07 | CORS restrito | A05 | CORS habilitado com whitelist em env, **nunca `*`** no template |
| RS-08 | CLI não vaza segredos | — | `dare init` nunca grava tokens/keys no scaffold; só placeholders em `.env.example` |
| RS-09 | Templates sem placeholders perigosos | A03 | Templates ERB/jinja2/handlebars usam escaping default; nenhum `raw`/`safe` sem justificativa documentada |

## 9. Stack Técnica (do CLI, não dos projetos gerados)

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js | 18.x e 20.x |
| Linguagem | TypeScript | 5.4+ |
| Empacotador | tsup ou esbuild (já em uso) | atual |
| Workspace | pnpm | 9.x |
| Test runner | vitest (já em uso) | atual |
| Templating | per-stack: ERB (Rails), Handlebars/Mustache (Node/Go), jinja2 (Python), Blade (Laravel) — `applyTemplate(content, vars)` per stack |
| Distribuição | npm (registry público) | — |

## 10. Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados trocados | Responsável |
|---|---|---|---|---|---|
| npm registry | distribuição | HTTPS | publish (out) | tarball `@dewtech/dare-cli` | maintainer + CI publish.yml |
| GitHub Releases | distribuição | HTTPS | publish (out) | release notes + tag | release.yml automático |
| Tool oficial por stack | scaffolder externo | shell exec | local (out) | invocação `composer create-project`, `npx @nestjs/cli`, `rails new`, `go mod init`, `python -m venv` | `stack-bootstrap.ts` helpers |

## 11. Restrições

- **Compat Node 18+** mantida (matriz atual de CI).
- **Não introduzir** dependências runtime grandes (≥ 500 KB unpacked) sem justificativa no DESIGN.
- **Não usar** `workspace:*` em deps publicáveis (regra que originou este DESIGN).
- **Não publicar** subpacotes de stack — decisão D-1 trava isso.
- **Mensagens do prompt** em PT-BR.
- Templates pesados (binários, ícones) **fora** do tarball; baixados sob demanda em pós-install se necessário (não há caso conhecido hoje).

## 12. Fora do Escopo (v3.1)

| Item | Motivo |
|---|---|
| Stack Java/Spring, Kotlin, Elixir/Phoenix, C#/.NET | Não pediu; backlog pra v3.2+ |
| Stacks frontend (react, vue, rust-leptos, rust-leptos-csr) | Já têm bootstrap razoável; não recebem upgrade de scaffolder completo nesta release (trilha separada) |
| Plugin system pra stack third-party | Conflito com D-1 (single-package); reconsiderar em v4.0 |
| GUI/TUI de seleção de features | `inquirer` atual atende; backlog UX |
| Telemetria opt-in de uso do CLI | Discussão de privacidade pendente; v3.2 |
| Renomear/redistribuir `@dewtech/dare-cli` | Fora de escopo — esta release mantém o nome |

## 13. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R-01 | Regressão silenciosa no scaffold Rails (move quebra paths internos) | Média | Alto | Snapshot test: `dare init --stack ruby-rails-8` antes/depois → diff vazio (ignorando timestamps) |
| R-02 | Tarball estourar 2 MB com 5 stacks novos + templates | Média | Médio | Medir em CI (`npm pack --dry-run`); gate em RNF-02. Templates só assets essenciais; nada de fixtures |
| R-03 | Dependência circular `init.ts ↔ registry ↔ scaffold` | Baixa | Médio | `registry.ts` faz lazy import via `() => import('./stacks/X/scaffold.ts')`. Lint rule contra import direto cross-stack |
| R-04 | Tool oficial mudar API e quebrar bootstrap (ex: NestJS CLI flags) | Média | Médio | Pin de versão major do tool no comando shell; teste de smoke roda no CI semanalmente |
| R-05 | Quebrar projeto v3.0.0 já criado | Baixa | Alto | Migração só move arquivos de origem; **não toca** em projetos já gerados. CHANGELOG nota explícita "0 ação requerida em projetos existentes" |
| R-06 | Templates específicos por OS (CRLF/LF) | Média | Baixo | Forçar LF nos templates (`.gitattributes` em `templates/stacks/**`); teste no Windows CI |
| R-07 | Escopo inflar (queremos meter Spring/Axum no meio) | Alta | Médio | Lista fora-de-escopo explícita (seção 12); rejeitar PRs que ampliem sem novo DESIGN |
| R-08 | Skill da IDE divergir do scaffold | Média | Médio | Test de paridade: presença dos files-âncora descritos na skill deve casar com o que o scaffold emite |

## 14. Plano de Migração `new.ts` → `init.ts` sem regressão

1. **Fase preparatória (sem remover nada)** — adicionar registry + tipos; mover Rails para `src/stacks/ruby-rails-8/`; `new.ts` continua funcionando, mas import passa a vir do path interno.
2. **Snapshot baseline** — rodar `dare new --stack rails` em tmp; salvar tree hash como fixture. Servirá de oráculo até o fim.
3. **Cobrir Rails no `init`** — adicionar `ruby-rails-8` no prompt e dispatcher de `init.ts`; rodar `dare init --stack ruby-rails-8 --non-interactive` e diff contra baseline. Itera até zero.
4. **Construir os 4 stacks novos + MCP**, um por vez, cada um com seu próprio snapshot test.
5. **Remover `new.ts`** + entradas no help; rodar suíte completa.
6. **Apagar `packages/stacks/`** + entradas no `pnpm-workspace.yaml` + dep do `package.json` do CLI.
7. **Atualizar docs**: README, ROADMAP, CHANGELOG. Tag `v3.1.0`.

## 15. Estratégia de Teste

| Camada | Tipo | Onde |
|---|---|---|
| Unit — registry | Resolução de id, lazy import, erro pra id inválido | `src/stacks/__tests__/registry.spec.ts` |
| Unit — scaffold (per stack) | `generate()` em tmp dir, asserts em arquivos-chave | `src/stacks/<name>/__tests__/scaffold.spec.ts` |
| DNA gate | Para todo stack registrado, presença dos artefatos da seção 5.4 | `src/stacks/__tests__/dna.spec.ts` |
| Integração — init | `dare init --non-interactive --stack <id>` em tmp; verifica filesWritten | `src/commands/__tests__/init.integration.spec.ts` |
| Snapshot — paridade Rails | Diff contra baseline do v3.0.0 | `src/stacks/ruby-rails-8/__tests__/parity.spec.ts` |
| Distribuição | `npm pack` em CI; instala o tarball numa imagem Node:20 alpine; roda `dare --version`; assert exit 0 | `.github/workflows/publish-smoke.yml` (novo) |
| Skill ↔ scaffold | Files-âncora declarados na skill batem com `filesWritten` | `src/skills/tests/skill-scaffold-parity.spec.ts` |

## 16. Inventário de Templates (alto nível)

Detalhamento fino entra no BLUEPRINT. Aqui o "shape" de cada pasta:

```
templates/stacks/ruby-rails-8/      ← já existe, será movido
  Gemfile.erb · llms.txt.erb · .dare/skills.yml · app/{controllers,handlers,services,...} · ...

templates/stacks/node-nestjs/
  package.json.hbs · nest-cli.json · src/main.ts.hbs · src/{handlers,services,repositories,models}/
  prisma/schema.prisma · llms.txt.hbs · .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/python-fastapi/
  pyproject.toml.j2 · app/{routers,services,repositories,models,schemas}/ · alembic.ini.j2
  llms.txt.j2 · .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/php-laravel/
  composer.json.blade.php · app/{Http/{Controllers,Requests},Services,Repositories,Models,Llm}/
  config/{reverb,sanctum}.php · llms.txt.blade.php · .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/rust-axum/
  Cargo.toml.tera · src/{main.rs,handlers/,services/,repositories/,models/,llm/}.tera
  migrations/ · llms.txt.tera · .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/go-gin/
  go.mod.tpl · cmd/server/main.go.tpl · internal/{handler,service,repository,model}/ · sqlc.yaml
  docs/ (swag gerado) · llms.txt.tpl · .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/go-stdlib/
  go.mod.tpl · cmd/server/main.go.tpl · internal/{handler,service,repository,model}/ · sqlc.yaml
  openapi.json.tpl · llms.txt.tpl · .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/mcp-node-ts/
  package.json.hbs · tsconfig.json · src/{server.ts.hbs, tools/echo.ts, prompts/index.ts}
  src/transports/{stdio.ts, sse.ts, http.ts} · tests/ · llms.txt.hbs
  .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/mcp-python/
  pyproject.toml.j2 · src/{server.py.j2, tools/echo.py, prompts/__init__.py}
  src/transports/{stdio.py, sse.py, http.py} · tests/ · llms.txt.j2
  .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/mcp-rust/
  Cargo.toml.tera · src/{main.rs.tera, tools/mod.rs, tools/echo.rs, prompts/mod.rs}
  src/transports/{stdio.rs, sse.rs, http.rs} · tests/ · llms.txt.tera
  .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml

templates/stacks/mcp-go/
  go.mod.tpl · cmd/server/main.go.tpl · internal/{tools/echo.go, prompts/registry.go}
  internal/transports/{stdio.go, sse.go, http.go} · tests/ · llms.txt.tpl
  .dare/skills.yml · .env.example · .github/workflows/dare-ci.yml
```

## 17. Impacto Documental

| Arquivo | Mudança |
|---|---|
| `README.md` | Seção "Stacks suportadas" — atualizar tabela: 7 backends + 4 MCP, todos com gerador completo |
| `ROADMAP.md` | "Stacks com gerador completo (1)" → **(11)**; mover item "Generators p/ nestjs/fastapi/laravel/rust-axum/go-gin/go-stdlib/mcp" de pendente → entregue em v3.1; adicionar MCP-Rust e MCP-Go como inéditos |
| `CHANGELOG.md` | Seção `[3.1.0] — 2026-06`: ✨ Adicionado · 🐛 Corrigido (404 npm) · 📁 Mudanças estruturais (remoção `packages/stacks/`, remoção `dare new`) · ⚠️ Breaking (remoção de `dare new`) |
| `docs/skills/INDEX.md` | Atualizar status dos stacks: "skill + scaffold" |
| `packages/cli/README.md` | Lista de comandos sem `new`; tabela de stacks |
| `packages/cli/package.json` | Bump `version: 3.1.0`; remover `dependencies."@dewtech/dare-stack-ruby-rails-8"`; ajustar `files` |
| `package.json` (raiz) | Bump `version: 3.1.0` |
| `pnpm-workspace.yaml` | Remover `packages/stacks/*` |

## 18. Métricas de Telemetria Específicas

Vão pro `dare-quality-telemetry`:

- **M-stacks-01**: número de stacks no registry (deve ser **11** após release: 7 backend + 4 MCP)
- **M-stacks-02**: presença dos 7 artefatos do DNA (seção 5.4) em scaffold de teste — gate em CI
- **M-stacks-03**: tamanho do tarball `@dewtech/dare-cli` — gate ≤ 2 MB
- **M-stacks-04**: tempo médio de `generate()` por stack — gate ≤ 30 s

## 19. Checklist de Aprovação

Para marcar o DESIGN como **APROVADO** e avançar ao `/dare-blueprint`, o autor confirma:

- [x] Versionamento: **v3.1.0** (confirmado pelo autor — bug fix da v3, não major redesign)
- [x] Remoção do `dare new`: **direta, sem deprecação** (confirmado pelo autor)
- [x] DNA DARE com 7 artefatos obrigatórios: **invariantes** (confirmado pelo autor)
- [x] Inventário de stacks: **7 backend + 4 MCP (node-ts, python, rust, go)** — backends batem com `BackendStack` em [stack-bootstrap.ts:18-24](../packages/cli/src/utils/stack-bootstrap.ts); MCP expandido pra 4 linguagens com transport como flag (Opção A confirmada pelo autor) |
- [ ] Decisões D-1 a D-9 refletem a intenção arquitetural
- [ ] Critérios de aceite (seção 2 + RF) são verificáveis em CI
- [ ] Plano de migração `new.ts` → `init.ts` (seção 14) preserva paridade
- [ ] Riscos R-01 a R-08 estão cobertos por mitigação concreta
- [ ] Fora-de-escopo (seção 12) é defensável — nada disso é blocker pra v3.1
- [ ] Impacto documental (seção 17) está completo

**Pronto para `/dare-blueprint`** assim que o autor der OK final nos itens não-marcados acima.
