# Feature Design: `dare dna` — DNA do Projeto (convenções de legado)

> Gerado seguindo o próprio Método DARE (Fase D). License: MIT (parte do DARE Method).
> Companheiro de [`DESIGN-Feature-dare-reverse.md`](./DESIGN-Feature-dare-reverse.md).

## Contexto no Projeto Existente

O `dare reverse` reconstrói **o QUE** um software legado é (arquitetura, módulos → `IDEIA.md`).
Falta o complemento: **COMO** aquele codebase faz as coisas — suas convenções. Em projeto legado
você normalmente **não pode reescrever**; então o método precisa **se adaptar ao padrão do projeto**,
não impor o default genérico do DARE.

Hoje o `/dare-feature-design` prega *"siga os padrões locais"*, mas o agente tem que
**redescobrir** isso a cada vez. O `dare dna` **persiste** essas convenções num ruleset reutilizável.

## Objetivos da Feature

- [O-01] Rodar `dare dna` em qualquer repositório e extrair as **convenções reais** do código.
- [O-02] Gerar `DARE/PROJECT-DNA.md` — um ruleset acionável que o agente segue ao trabalhar no projeto.
- [O-03] **Zero LLM no CLI**: camada determinística extrai os fatos; a skill `/dare-dna` redige as regras.
- [O-04] **Reuso**: `detectProject` (stack), `detectModules`/`reverse-facts.json` (inventário), `isTestFile`.

## Decisões Travadas (com o autor)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Onde o DNA mora | **Só `DARE/PROJECT-DNA.md`** (v1). Sem injetar em CLAUDE.md/.cursorrules ainda |
| D-2 | Integração com reverse | **Independente**, mas reaproveita `DARE/REVERSE/reverse-facts.json` se existir |
| D-3 | Escopo v1 | Tooling, naming, layering, testing, libs-chave, commits. Sem AST |

## Arquitetura (duas camadas — regra de ouro)

### Camada A — CLI determinística (`dna-detector.ts`, nunca chama LLM)
Extrai os **fatos** de convenção:

1. **Tooling** — detecta configs de lint/format e parseia os de alto sinal:
   - ESLint (`.eslintrc*`, `eslint.config.*`, `package.json#eslintConfig`)
   - Prettier (`.prettierrc*`, `package.json#prettier`) → parseia `semi`, `singleQuote`, `tabWidth`, `printWidth`
   - `.editorconfig` → `indent_style`, `indent_size`
   - Rubocop (`.rubocop.yml`), PHPStan (`phpstan.neon`), Ruff (`ruff.toml`/`pyproject[tool.ruff]`),
     Biome (`biome.json`), rustfmt (`.rustfmt.toml`) → presença + caminho
2. **Naming** — classifica o estilo do nome de arquivo por extensão (kebab / camel / snake / Pascal) e
   reporta o dominante + amostras.
3. **Architecture/Layering** — varre nomes de diretório e casa com camadas conhecidas
   (controllers, services, repositories, models, handlers, usecases, entities, dto…) → lista + palpite
   (MVC / layered / hexagonal).
4. **Testing** — framework por deps (jest/vitest/pytest/rspec/phpunit/go test), nº de arquivos de
   teste vs produção (via `isTestFile`), razão aproximada.
5. **Libraries** — ORM / HTTP / auth / validação detectados nos manifests (package.json, composer.json,
   Cargo.toml, requirements/pyproject, Gemfile, go.mod).
6. **Commits** — amostra `git log` (best-effort): % de Conventional Commits, contagem por prefixo.

Saída: `DARE/dna-facts.json` + esqueleto `DARE/PROJECT-DNA.md` (seções `<!-- AGENT -->`).

### Camada B — Skill `/dare-dna` (agente da IDE)
Lê `dna-facts.json` + amostra arquivos representativos → redige **regras acionáveis** ("ao criar um
controller, siga X"; "validação sempre via Y"; "erros tratados com Z"), nomeia a arquitetura com
confiança, e descreve padrões que o CLI não infere (tratamento de erro, validação, estilo de teste).

## Artefatos Gerados

```
DARE/
├── PROJECT-DNA.md     ← ruleset de convenções (o agente lê ao trabalhar no projeto)
└── dna-facts.json     ← fatos determinísticos (consumido pela skill)
```

### Estrutura do `PROJECT-DNA.md`
- **Stack & Tooling** (CLI) — linters/formatters detectados + regras-chave.
- **Convenções de Nomenclatura** (CLI: estilo por extensão).
- **Arquitetura & Camadas** (CLI: camadas detectadas; AGENT: nomeia o padrão e as regras).
- **Padrões de Teste** (CLI: framework/razão; AGENT: estilo de assertion, onde ficam, mocks).
- **Bibliotecas-chave** (CLI: ORM/auth/http/validação).
- **Convenção de Commits** (CLI: do git log).
- **Tratamento de Erros & Validação** (AGENT: inferido do código).
- **Regras de Ouro do Projeto** (AGENT: o que SEMPRE/NUNCA fazer neste codebase).
- **⚠️ Incertezas** (AGENT: convenções inconsistentes ou ambíguas).

## Superfície de CLI

```bash
dare dna                  # varre o cwd
dare dna -d ./caminho     # diretório alvo
dare dna --check          # só mostra as convenções detectadas, não escreve
```

## Análise de Impacto

### Novos Arquivos
- `packages/cli/src/utils/dna-detector.ts` — extração determinística
- `packages/cli/src/utils/dna-facts.ts` — buildDnaFacts + renderDnaSkeleton
- `packages/cli/src/commands/dna.ts` — comando (espelha `reverse.ts`)
- `implementations/{claude,cursor,antigravity}/.../dare-dna` — skills
- Testes: `dna-detector.test.ts`, `dna-facts.test.ts`

### Arquivos Modificados
- `packages/cli/src/bin/dare.ts` — registra `dnaCommand` (após `reverse`)
- `README.md` + `docs/skills/INDEX.md` — documentar (30 → 31 skills)

### NÃO alterar
- Read-only no projeto-alvo: `dna` nunca escreve fora de `DARE/`, nunca modifica código.
- Não toca nos artefatos do `reverse` (só lê `reverse-facts.json` se existir).

## Estratégia de Testes

- `dna-detector.test.ts` — fixtures: projeto com prettier+editorconfig (parse de regras), naming
  kebab vs camel, dirs de camadas (controllers/services), testes presentes (razão), deps de ORM/auth.
- `dna-facts.test.ts` — buildDnaFacts agrega; renderDnaSkeleton embute fatos + placeholders AGENT.
- Ralph Loop antes de DONE: `pnpm build && pnpm test`.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Convenção inconsistente no legado | Alta | Médio | Reportar dominante + amostras; seção "⚠️ Incertezas" para o humano |
| Parse frágil de muitos formatos de config | Média | Baixo | Parsear só os fáceis (JSON/ini); demais = só presença + caminho |
| `git log` indisponível (não-git) | Baixa | Baixo | Best-effort; seção de commits omitida se não houver git |

## Fora do Escopo (v1)

- Injeção automática em `CLAUDE.md`/`.cursorrules` (follow-up).
- AST real / análise semântica profunda de padrões de código.
- Aplicar/enforçar as convenções (o DNA é descritivo, não um linter).

## Próximas Etapas

1. Implementar: `dna-detector` → `dna-facts` → `dna.ts` + registro → skills → testes + docs.
2. Rodar Ralph Loop completo e commitar na branch `feat/dare-dna`.
