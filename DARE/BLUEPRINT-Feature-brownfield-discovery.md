# Feature Blueprint: Inteligência Brownfield (Auto-Discovery de Padrões + Planejadores Leves)

> Derivado de [DESIGN-Feature-brownfield-discovery.md](DESIGN-Feature-brownfield-discovery.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs de execução virão em `/dare-tasks`.
> Branch proposta: `feat/brownfield-discovery` · Target release: **v3.7.0** · License: MIT.
>
> **Base de evidências:** **idea-7** (minerar tribal knowledge / convenções implícitas de legado →
> conhecimento reusável injetável, estilo Reversa arXiv:2605.18684 + Agent OS) e **idea-8**
> (planejadores especializados leves — Analyst/PM/Architect, **só no planejamento**, sem enxame
> em runtime). Cautela de custo ancorada em `papers-dare/cards/2308.00352_MetaGPT.md` (MetaGPT
> gasta **31.255 vs 19.292 tokens/tarefa** vs ChatDev, Tabela 1) e
> `2508.00083_MultiAgent-CodeGen-Survey.md` ("High Operational Costs of Agent Systems").
>
> **Ancoragem verificada no código real** (a feature **estende**, não reescreve):
> - `utils/dna-detector.ts` (`KNOWN_LAYERS:197`, `guess:218`, `computeArchitecture:204`, `loadFileInventory:371`).
> - `utils/static-analyzer.ts` (`isTestFile:69`, `SUPPORTED_EXTENSIONS:88`, `inString:117`).
> - `utils/module-detector.ts` (`ModuleInfo:24`, `ModuleGraph:43`, `IGNORE_DIRS:52`, `detectModules:79`).
> - `utils/confidence.ts` (`Marker:16`, `parseSpecConfidence:56`, `computeIndex:50`) — 🟢/🟡/🔴.
> - `commands/dna.ts` (`--check:20`), `commands/reverse.ts` (`--report:49`), `commands/design.ts:9`, `commands/blueprint.ts:43` (`sampleTasks`).
> - `graphrag/requirement-ingest.ts` (`ingestRequirements:125`, `parseRequirementsFromMarkdown:31`) e
>   `dag-runner/graph-ingest.ts` (`ingestTask:29`, `extractSymbolsFromPaths` reuso:19) — v3.5.0 dual-graph.
> - `steering/loader.ts` (`loadSteeringFiles:60`, base = `DARE/PROJECT-DNA.md:63`) — v3.6.0 steering.
> - `utils/path-safety.ts` (`assertRelativeSafe:23`, `resolveSafePath:79`).
>
> **Pré-requisitos cruzados já entregues (não reimplementar):**
> - **v3.5.0 dual-graph:** nós `code_symbol`/`requirement`, arestas `affects`/`derives_from`
>   (`graphrag/types.ts:1-23`), `ingestRequirements`, `traverse`/`locate`, comandos
>   `dare graph owners|impact|trace|locate|ingest` (`commands/graph.ts:141,174,202,237,287`).
> - **v3.6.0 agent-hooks-steering:** `loadSteeringFiles` lê `DARE/PROJECT-DNA.md` como base
>   canônica e `.dare/steering/*.md` (`steering/loader.ts:63,76`); rota MCP `GET /steering`.

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor

**O `dare patterns` é 100% determinístico** — minera padrões por frequência/co-ocorrência sobre o
inventário já existente (`reverse-facts.json` ou `module-detector`), com evidência `arquivo:linha`,
reusando `isTestFile`/`SUPPORTED_EXTENSIONS`/`inString` (`static-analyzer.ts:69,88,117`). **Nenhum LLM
no CLI**: o detector emite **fatos** (`patterns-facts.json`) + um esqueleto `PATTERNS.md` com
`<!-- AGENT -->` (exatamente como `dna-facts.ts` / `reverse-facts.ts`). A inferência semântica —
**nomear** o padrão, **explicar** a decisão implícita — e as **personas de planejamento** (Analyst/PM
/Architect) vivem nas **skills das IDEs** (`/dare-dna`, `/dare-design`, `/dare-blueprint`).

A idea-8 é **leve por design**: cada persona é **um prompt estruturado, uma passagem, sequencial, só
no planejamento**. O CLI nunca instancia agentes; ele só monta um **questionário determinístico a
partir dos fatos** (`design-questionnaire.ts`). Zero message pool, zero runtime multi-agente — é
exatamente o custo que MetaGPT (31k vs 19k tokens) e o survey ("High Operational Costs") documentam.

| Camada | Responsabilidade | Onde vive | LLM? |
|---|---|---|---|
| **Extração de padrões** | regras plugáveis (camadas por co-ocorrência, idioms, decisões implícitas) → fatos com evidência | `utils/pattern-detector.ts` (CLI) | **não** |
| **Materialização** | `patterns-facts.json` + `PATTERNS.md` (skeleton `<!-- AGENT -->`) | `utils/pattern-facts.ts` (CLI) | **não** |
| **Injeção no grafo** | padrão → nó `pattern`; `pattern --evidenced_by--> file`; `module --exhibits--> pattern` | `graphrag/pattern-ingest.ts` (CLI) | **não** |
| **Injeção no steering** | `PATTERNS.md` vira fonte elegível ao lado de `PROJECT-DNA.md` | `steering/loader.ts` (estende) | **não** |
| **Questionário** | montar perguntas a partir de fatos+gaps (sem inferência) | `utils/design-questionnaire.ts` (CLI) | **não** |
| **Personas** | conduzir Analyst/PM/Architect, nomear padrões, decidir trade-offs | skills `/dare-design`, `/dare-blueprint` | sim (na IDE) |

### 1.2 Diagrama

```mermaid
flowchart TB
    subgraph cli["CLI determinístico (extrai FATOS — sem LLM)"]
        inv["loadFileInventory<br/>(dna-detector.ts:371)"]
        dnaf["dna-facts.json<br/>(dna existente)"]
        det["pattern-detector.ts<br/>regras plugáveis"]
        facts["patterns-facts.json"]
        skel["PATTERNS.md<br/>(skeleton AGENT)"]
        quest["design-questionnaire.ts<br/>perguntas a partir de fatos"]
        inv --> det
        dnaf --> det
        det --> facts
        facts --> skel
        facts --> quest
        dnaf --> quest
    end

    subgraph sinks["Consumidores existentes (estendidos)"]
        graph["graphrag/pattern-ingest.ts<br/>nós/arestas pattern"]
        steer["steering/loader.ts<br/>PATTERNS.md elegível"]
    end

    facts --> graph
    skel --> steer

    subgraph skills["Personas leves (LLM na IDE — 1 passagem, sequencial)"]
        analyst["Analyst → escopo/ambiguidade"]
        pm["PM → requisitos/aceite"]
        arch["Architect → trade-offs ancorados em padrões"]
        analyst --> pm --> arch
    end

    quest -.->|questionário| analyst
    skel -.->|padrões nomeáveis| arch
    arch -.->|orienta| bp["BLUEPRINT.md (scaffold)"]
```

### 1.3 Decisões Arquiteturais

| # | Decisão | Alternativas | Justificativa |
|---|---|---|---|
| A-1 | **Novo comando `dare patterns`** que reusa `loadFileInventory`/`dna-facts.json` — **estende** `dna`, não o reescreve | Adicionar à saída do `dna` | RNF-06: `dna`/`reverse` ficam byte-a-byte inalterados (DESIGN §Restrições); `patterns` é a camada que o `dna` não alcança (idioms, decisões implícitas, camadas por co-ocorrência) |
| A-2 | **`pattern-detector.ts` com regras plugáveis** — uma `PatternRule` por categoria | God-file com `if`s | RNF-04: sem god-file; cada categoria testável isolada; cobertura ≥80% |
| A-3 | **Camadas por co-ocorrência**, não só `KNOWN_LAYERS` (`dna-detector.ts:197`) | Manter lista fixa | RF-01: legado real usa nomes fora da lista; agrupar diretórios irmãos por frequência de segmento + import |
| A-4 | **Limiar de frequência + evidência obrigatória** | Reportar tudo | Risco "auto-discovery gera ruído" (DESIGN); só padrão acima de `minFrequency` e com ≥1 `arquivo:linha` é emitido (O-01: ≥90% rastreável) |
| A-5 | **`patterns-facts.json` herda 🟢/🟡/🔴** via `confidence.ts` (`Marker:16`) | Confiança nova | RF-07: reusa o pipeline Reversa; CLI marca fato como 🟢, skill rebaixa para 🟡 inferência / 🔴 gap |
| A-6 | **Reusar nó `pattern` no grafo** com arestas `evidenced_by`/`exhibits` (novas no union fechado `types.ts`) | Reusar `related_to` genérico | RF-03/O-03: aresta tipada permite `dare graph` listar padrões; espelha o rigor do dual-graph (A-4 do BLUEPRINT-dual-graph) |
| A-7 | **`PATTERNS.md` vira fonte elegível no `steering/loader.ts`** ao lado de `PROJECT-DNA.md` (`loader.ts:63`) | Novo loader | RF-09 COULD vira barato: o steering v3.6.0 já concatena por precedência; só adicionar o segundo arquivo-base |
| A-8 | **Personas = templates de skill, não código CLI** — CLI só monta `design-questionnaire.ts` (fatos→perguntas determinísticas) | Orquestrador de agentes no CLI | RF-06/RNF-01/RNF-02 + regra de ouro: LLM fora do CLI; **mata o custo MetaGPT por design** |
| A-9 | **Personas sequenciais, 1 passagem, só no planejamento** (Analyst→PM no Design; Architect no Blueprint) | Loop de troca / message pool | RNF-01: ≤1 passagem por persona; **zero** agentes persistentes (O-06) — aprendizado central de 2308.00352/2508.00083 |
| A-10 | **`dare design --interactive` emite só o questionário** (a skill conduz) | CLI faz perguntas interativas | RS-05: CLI não executa raciocínio; o questionário é determinístico (fatos+gaps), a inferência é da skill |
| A-11 | **`dare patterns --check` read-only** espelhando `dna.ts:20`/`reverse.ts:46` | Sempre escrever | RF-08/RS-01: detecção sem efeitos colaterais |

---

## 2. Stack Técnica (CLI)

| Camada | Tecnologia | Nota |
|---|---|---|
| CLI / detector | TypeScript + Node ≥18 | já existente |
| Inventário de arquivos | `loadFileInventory` (`dna-detector.ts:371`) → `reverse-facts.json` ou `detectModules` | reuso direto |
| Classificação test/prod | `isTestFile` (`static-analyzer.ts:69`) | reuso |
| Extensões suportadas | `SUPPORTED_EXTENSIONS` (`static-analyzer.ts:88`) | reuso |
| Supressão de string | `inString` (`static-analyzer.ts:117`) | reuso ao casar idioms |
| Fatos de convenção (base) | `dna-facts.json` / `DnaFacts` (`dna-detector.ts:36`) | `patterns` lê como entrada |
| Confiança / gaps | `confidence.ts` (`Marker`, `parseSpecConfidence`, `computeIndex`) | reuso 🟢/🟡/🔴 |
| Grafo | `KnowledgeGraph` (`graphrag/knowledge-graph.ts`), 3 backends | estendido com nó `pattern` |
| Steering | `steering/loader.ts` | estendido (A-7) |
| Path safety | `utils/path-safety.ts` (`assertRelativeSafe`, `resolveSafePath`) | em `--dir`/`--modules` |
| Personas (camada semântica) | skills `/dare-design`, `/dare-blueprint` | **LLM fora do CLI** |
| Testes | Vitest + fixtures em `utils/__tests__/fixtures/patterns/` | snapshot + unit |

---

## 3. Estrutura de Pastas (pós-feature)

```
packages/cli/src/
├── utils/
│   ├── pattern-detector.ts          # NEW — regras plugáveis (PatternRule[]) → DiscoveredPattern[]
│   ├── pattern-facts.ts             # NEW — patterns-facts.json + PATTERNS.md skeleton (<!-- AGENT -->)
│   ├── design-questionnaire.ts      # NEW — fatos+gaps → PlanningQuestion[] (determinístico, sem LLM)
│   ├── dna-detector.ts              # (intocado — só lido como entrada)
│   ├── static-analyzer.ts           # (intocado — helpers já exportados em v3.5.0)
│   └── __tests__/
│       ├── pattern-detector.test.ts # NEW — snapshot por categoria
│       ├── pattern-facts.test.ts    # NEW — skeleton determinístico
│       ├── design-questionnaire.test.ts  # NEW
│       └── fixtures/patterns/       # NEW — codebases sintéticos (layered, hexagonal, barrel, ...)
├── graphrag/
│   ├── types.ts                     # MODIFY — NodeType += 'pattern'; EdgeType += 'evidenced_by','exhibits'
│   └── pattern-ingest.ts            # NEW — ingestPatterns(graph, facts, projectRoot)
├── steering/
│   └── loader.ts                    # MODIFY — PATTERNS.md como 2ª fonte-base (A-7)
├── commands/
│   ├── patterns.ts                  # NEW — `dare patterns` (--check/--dir/--modules/--inject)
│   ├── design.ts                    # MODIFY — flag --interactive (emite questionário)
│   └── graph.ts                     # MODIFY — KNOWN_NODE_TYPES += 'pattern'
└── bin/                             # MODIFY — registrar patternsCommand

skills/ (templates instalados via ensureDareSkills):
├── dare-design/                     # MODIFY — personas Analyst+PM consomem o questionário
└── dare-blueprint/                  # MODIFY — persona Architect cita padrões reais
```

---

## 4. Modelo de Dados — Contratos TypeScript

### 4.1 `utils/pattern-detector.ts` (novo)

```ts
import type { Marker } from './confidence.js';      // 'confirmed' | 'inferred' | 'gap'  (confidence.ts:16)
import type { DnaFacts } from './dna-detector.js';   // dna-detector.ts:36
import type { ModuleInfo } from './module-detector.js'; // module-detector.ts:24

/** Categorias mineráveis além do `dna` (RF-01). União fechada — sem categoria livre. */
export type PatternKind =
  | 'inferred-layer'      // agrupamento por co-ocorrência (vai além de KNOWN_LAYERS, dna-detector.ts:197)
  | 'naming-idiom'        // sufixo recorrente: *.service.ts, *.controller.ts
  | 'structural-idiom'    // barrel files (index.ts re-export), co-localização test+src
  | 'call-idiom'          // "todo controller chama um service", "rota valida com Zod"
  | 'implicit-decision';  // decisão implícita: ORM único, validação centralizada

/** Uma evidência rastreável `arquivo:linha` (formato idêntico ao confidence.ts EVIDENCE_RE). */
export interface PatternEvidence {
  readonly file: string;   // posix, relativo ao root
  readonly line?: number;  // 1-based; ausente para evidência de path-level
}

/**
 * Padrão descoberto. FATO determinístico — `description` é factual, NÃO uma
 * interpretação semântica (essa é da skill, no PATTERNS.md).
 *
 * Pré-condição: `evidence.length >= 1` e `frequency >= rule.minFrequency`.
 * Pós-condição: serializável estável (ordenado por (kind, id)); `marker = 'confirmed'`
 * na saída do CLI — a skill pode rebaixar para 'inferred'/'gap'.
 */
export interface DiscoveredPattern {
  readonly id: string;                 // kebab estável: `${kind}:${slug}` ex. 'naming-idiom:service-suffix'
  readonly kind: PatternKind;
  readonly description: string;        // fato: "23 arquivos usam sufixo .service.ts"
  readonly frequency: number;          // contagem de ocorrências
  readonly coverage: number;           // 0..1 — fração dos arquivos relevantes que exibem o padrão
  readonly evidence: readonly PatternEvidence[];  // >=1 (A-4)
  readonly modules: readonly string[]; // ids de ModuleInfo que exibem o padrão (exhibits)
  readonly marker: Marker;             // 'confirmed' no CLI (A-5)
}

export interface PatternsFacts {
  readonly generatedAt: string;
  readonly fileInventorySource: DnaFacts['fileInventorySource']; // 'reverse-facts' | 'module-detector'
  readonly patterns: readonly DiscoveredPattern[];
}

/** Contrato de uma regra plugável (A-2). Pura e determinística. */
export interface PatternRule {
  readonly kind: PatternKind;
  readonly minFrequency: number;       // limiar (A-4)
  /** Pré: `files` já filtrado por isTestFile onde aplicável. Pós: padrões ordenados, evidência >=1. */
  detect(input: PatternRuleInput): DiscoveredPattern[];
}

export interface PatternRuleInput {
  readonly files: readonly string[];   // inventário (posix, relativo)
  readonly modules: readonly ModuleInfo[];
  readonly dna: DnaFacts | null;        // reusa camadas/libs já detectadas
  readonly readFile: (rel: string) => string | null; // só leitura (RS-01); usa inString p/ idioms
}

/**
 * Orquestra todas as regras. Determinístico: mesma entrada ⇒ mesma saída byte-a-byte (RNF-02).
 * Pré: `root` validado; inventário carregado via loadFileInventory.
 * Pós: `patterns` ordenado por (kind, id); cada item com evidence>=1 e frequency>=minFrequency.
 */
export function detectPatterns(root: string, dna: DnaFacts | null): Promise<PatternsFacts>;

/** Lista canônica de regras — adicionar categoria = adicionar entrada aqui (A-2). */
export const PATTERN_RULES: readonly PatternRule[];
```

### 4.2 `utils/design-questionnaire.ts` (novo)

```ts
import type { PatternsFacts } from './pattern-detector.js';
import type { DnaFacts } from './dna-detector.js';

/** Persona que origina a pergunta. NÃO executa nada — rótulo para a skill conduzir (A-8/A-9). */
export type PlannerPersona = 'analyst' | 'pm' | 'architect';

/**
 * Pergunta gerada DETERMINISTICAMENTE a partir de fatos/gaps. O CLI não responde
 * nem infere — só monta o questionário (RS-05). A skill da IDE conduz uma passagem.
 */
export interface PlanningQuestion {
  readonly id: string;                 // 'analyst-scope-01'
  readonly persona: PlannerPersona;
  readonly phase: 'design' | 'blueprint';
  readonly prompt: string;             // texto factual + lacuna; ex. "Camada inferida 'jobs' não está no DNA. Confirmar?"
  readonly anchoredOn: readonly string[]; // ids de DiscoveredPattern ou DnaFacts citados (RF-05)
  readonly kind: 'gap' | 'ambiguity' | 'tradeoff' | 'scope';
}

export interface PlanningArtifact {
  readonly generatedAt: string;
  readonly phase: 'design' | 'blueprint';
  readonly questions: readonly PlanningQuestion[]; // sequenciais; sem loop (A-9)
}

/**
 * Monta o questionário de Design (Analyst + PM). Determinístico.
 * Pré: lê dna-facts.json/patterns-facts.json se existirem (RF-04).
 * Pós: 1 bloco de perguntas; gaps (🔴) viram kind:'gap'; nunca silenciados (RF-07/O-07).
 */
export function buildDesignQuestionnaire(
  dna: DnaFacts | null,
  patterns: PatternsFacts | null,
): PlanningArtifact;

/** Idem para Blueprint (Architect): perguntas de trade-off ancoradas em padrões reais (RF-05). */
export function buildBlueprintQuestionnaire(
  patterns: PatternsFacts | null,
): PlanningArtifact;
```

### 4.3 `graphrag/types.ts` — estender união fechada

```ts
export type NodeType =
  | 'task' | 'file' | 'schema' | 'endpoint' | 'component'
  | 'entity' | 'concept' | 'gate' | 'code_symbol' | 'requirement'
  | 'pattern';                          // NOVO (RF-03)

export type EdgeType =
  | 'depends_on' | 'implements' | 'uses' | 'references' | 'related_to'
  | 'contains' | 'extends' | 'verified_by' | 'affects' | 'derives_from'
  | 'evidenced_by'   // NOVO: pattern → file (arquivo:linha que comprova) (RF-03)
  | 'exhibits';      // NOVO: module → pattern (módulo exibe o padrão) (RF-03)
```

> Atualizar também `ALL_NODE_TYPES`/`ALL_EDGE_TYPES` (`types.ts:26,40`) para que `getStatistics`
> inicialize `pattern`/`evidenced_by`/`exhibits` em `0`, nunca `NaN` (espelha RNF-05 do dual-graph).

### 4.4 Regras de ID canônico

| Tipo | Formato `id` | Exemplo |
|---|---|---|
| `pattern` | `pattern:{DiscoveredPattern.id}` | `pattern:naming-idiom:service-suffix` |
| `evidenced_by` (edge) | `evidenced_by:{patternId}->{file}` | `evidenced_by:naming-idiom:service-suffix->src/user.service.ts` |
| `exhibits` (edge) | `exhibits:{moduleId}->{patternId}` | `exhibits:auth->naming-idiom:service-suffix` |

---

## 5. Contratos de API

### 5.1 `dare patterns` (novo comando)

| Aspecto | Valor |
|---|---|
| Descrição | `Mine implicit patterns/conventions of a legacy codebase into DARE/patterns-facts.json + PATTERNS.md` |
| Flags | `-d, --dir <path>` (default cwd); `--check` (read-only, RF-08); `--modules <list>` (csv, igual `reverse.ts:47`); `--inject` (RF-09 COULD, opt-in, A-7) |
| Exit 0 | escreve `DARE/patterns-facts.json` + `DARE/PATTERNS.md`; relatório no stdout |
| Exit 1 | `--dir`/`--modules` inválido (path traversal): string exata `Error: --dir must stay within the project (no '..' or absolute escape)` |
| Read-only | `--check` não escreve nada e não chama `ensureDareSkills` (igual `dna.ts:28`); stdout: `--check: detection only, no files written.` |

**Fluxo determinístico (sem LLM):**
1. `targetDir = path.resolve(opts.dir ?? cwd)`; validar com `assertRelativeSafe`/`resolveSafePath`.
2. Carregar `DARE/dna-facts.json` se existir (entrada opcional; senão `null`).
3. `const facts = await detectPatterns(targetDir, dna)`.
4. Se `--check` → imprimir resumo (categoria × frequência) e sair.
5. Escrever `patterns-facts.json` (`fs.writeJSON ... { spaces: 2 }`, igual `dna.ts:47`) + `PATTERNS.md` (`renderPatternsSkeleton(facts)`).
6. `ingestPatterns(graph, facts, targetDir)` no grafo (best-effort; não falha o comando se grafo ausente).
7. Se `--inject` → adicionar `DARE/PATTERNS.md` como fonte de steering (preservar conteúdo do usuário — RS-04).

### 5.2 `utils/pattern-facts.ts` — `renderPatternsSkeleton`

```ts
/**
 * Esqueleto Markdown determinístico (espelha dna-facts.ts renderDnaSkeleton).
 * Pré-preenche FATOS (categoria, frequência, evidência); deixa `<!-- AGENT -->`
 * para a skill /dare-dna nomear/explicar o padrão e rebaixar a confiança se preciso.
 * Pós: mesma entrada ⇒ mesma string (snapshot test); seção "## ⚠️ Incertezas" lista gaps.
 */
export function renderPatternsSkeleton(facts: PatternsFacts): string;
```

### 5.3 `graphrag/pattern-ingest.ts`

```ts
/**
 * Injeta padrões no grafo (RF-03). Determinístico, idempotente (upsert por id).
 * Pré: `facts.patterns` com evidência >=1. Pós: para cada padrão:
 *   - nó  `pattern:{id}` (label = description)
 *   - aresta `evidenced_by` pattern→file por evidência
 *   - aresta `exhibits` module→pattern por módulo em `pattern.modules`
 * NUNCA chama LLM/rede. Erros de grafo não derrubam `dare patterns` (best-effort).
 */
export function ingestPatterns(
  graph: KnowledgeGraph,
  facts: PatternsFacts,
  projectRoot: string,
): { nodes: number; edges: number };
```

### 5.4 `dare design --interactive` (estende `commands/design.ts:9`)

| Aspecto | Valor |
|---|---|
| Flag nova | `--interactive` (default false) |
| Comportamento `--interactive` | em vez do esqueleto estático (`design.ts:15`), emite **bloco de questionário** via `buildDesignQuestionnaire(dna, patterns)` no `DESIGN.md` (seção `## Perguntas de Planejamento (Analyst/PM)`) e no stdout |
| Sem flag | comportamento atual intocado (RNF-06) |
| LLM | nenhum no CLI; a skill `/dare-design` lê o bloco e conduz **uma passagem** (A-9) |

### 5.5 `steering/loader.ts` — `PATTERNS.md` como 2ª fonte-base (A-7)

Após o bloco de `DARE/PROJECT-DNA.md` (`loader.ts:63-74`), adicionar de forma análoga:

```ts
const patternsRel = path.posix.join('DARE', 'PATTERNS.md');
assertRelativeSafe(patternsRel);
const patternsAbs = path.join(projectRoot, patternsRel);
if (fs.pathExistsSync(patternsAbs)) {
  files.push({ path: patternsRel, frontMatter: { scope: 'project', priority: 0 }, body: fs.readFileSync(patternsAbs, 'utf-8'), isBase: true });
}
```

> Ausência de `PATTERNS.md` ⇒ comportamento de steering idêntico a v3.6.0 (RNF-06).

---

## 6. Plano de Execução (Fases)

### Fase 1 — Foundation: detector + fatos

**DONE quando:**
- `pattern-detector.ts` com ≥5 `PatternKind` e `PATTERN_RULES` plugáveis (RF-01/O-01); reusa `loadFileInventory`, `isTestFile`, `inString`.
- `detectPatterns` determinístico (snapshot estável); ≥90% dos itens com `evidence>=1` (O-01).
- `pattern-facts.ts` + `renderPatternsSkeleton` com seção "⚠️ Incertezas" (RF-07).
- Cobertura ≥80% no detector (RNF-04).

### Fase 2 — Comando `dare patterns`

**DONE quando:**
- `commands/patterns.ts` registrado no `bin/`; `--check`/`--dir`/`--modules` espelham `dna`/`reverse`.
- Escreve `patterns-facts.json` + `PATTERNS.md`; `--check` não escreve (RF-08/RS-01).
- `--dir`/`--modules` validados (string de erro exata §5.1).

### Fase 3 — Grafo + steering

**DONE quando:**
- `types.ts` estende `pattern`/`evidenced_by`/`exhibits` + `ALL_*` (stats sem NaN).
- `pattern-ingest.ts` cria nós/arestas; `dare graph query --type pattern` os lista (O-03); `KNOWN_NODE_TYPES` atualizado (`graph.ts:60`).
- `steering/loader.ts` carrega `PATTERNS.md` (A-7); teste de precedência verde.

### Fase 4 — Questionário + personas (idea-8 leve)

**DONE quando:**
- `design-questionnaire.ts` monta perguntas determinísticas (gaps→`kind:'gap'`); `buildBlueprintQuestionnaire` ancora em padrões reais (RF-05).
- `dare design --interactive` emite o bloco (RF-04); sem flag = comportamento atual (RNF-06).
- Templates de skill `/dare-design` (Analyst+PM) e `/dare-blueprint` (Architect) atualizados: **1 passagem, sequencial, só no planejamento** (RF-06); revisão confirma **zero** orquestração multi-agente no CLI (O-06).

### Fase 5 (N-1) — Auditoria de segurança/deps

**DONE quando:**
- Teste de path-confinement em `dare patterns` (RS-03); `pnpm audit --prod` limpo (RS-02).
- Suíte integrada `patterns.test.ts` cobre O-01…O-07; `dare review` sem achados HIGH.
- Grep confirma: zero chamada LLM/rede em `pattern-detector.ts`/`design-questionnaire.ts` (RNF-02/RS-02).

---

## 7. Validation Gates por Stack

| Gate | Comando | Critério |
|---|---|---|
| Build | `pnpm --recursive build` | sem erro TS (union fechado em `types.ts`) |
| Test | `pnpm --filter @dewtech/dare-cli exec vitest run` | verde; cobertura detector ≥80% (RNF-04) |
| Lint | `pnpm --filter @dewtech/dare-cli lint` | sem warning |
| Determinismo | rodar detector 2× sobre fixture | saída byte-a-byte idêntica (RNF-02) |
| Portabilidade | fixtures CRLF + LF | verdes nos dois (RNF-05) |
| Sem-LLM | `grep -rE "anthropic|openai|fetch\(|https?://" src/utils/pattern-*.ts src/utils/design-questionnaire.ts` | **zero** match (RNF-02/RS-02) |

---

## 8. Controles de Segurança — Rastreabilidade RS-*

| RS | Implementação | Teste |
|---|---|---|
| RS-01 | `dare patterns` só escreve em `DARE/`; nunca modifica código; `readFile` da `PatternRuleInput` é read-only | revisão estática + `--check` não escreve |
| RS-02 | análise 100% local; sem rede/LLM; `patterns-facts.json`/questionário não capturam `.env`/tokens (ignorar `.env*` como `steering/loader.ts:48-51`) | grep sem-LLM; teste de exclusão `.env` |
| RS-03 | `--dir`/`--modules` via `assertRelativeSafe`/`resolveSafePath`; ignorar `IGNORE_DIRS` (`module-detector.ts:52`) | `patterns-path-confinement.test.ts` |
| RS-04 | `--inject` opt-in; preserva conteúdo do usuário; não sobrescreve sem confirmação (manifesto, estilo Reversa) | teste de injeção idempotente |
| RS-05 | personas vivem na skill; CLI só monta questionário determinístico — **nenhuma execução de código arbitrário** | revisão: `design-questionnaire.ts` não tem `exec`/`spawn`/`eval` |

---

## 9. Estratégia de Testes

| Alvo | Tipo | Fixtures |
|---|---|---|
| `pattern-detector.ts` | snapshot por categoria | `fixtures/patterns/{layered,hexagonal,barrel,zod-routes,service-suffix}/` |
| `renderPatternsSkeleton` | snapshot determinístico | reuso fixtures acima |
| `design-questionnaire.ts` | unit (gaps→perguntas; ancoragem) | `dna-facts.json` + `patterns-facts.json` sintéticos |
| `pattern-ingest.ts` | contract nos 3 backends (sqlite/json/neo4j-skip) | grafo em memória |
| `steering/loader.ts` | precedência com `PATTERNS.md` presente/ausente | tmp dir |
| path-confinement | `assertRelativeSafe` em `--dir`/`--modules` | inputs com `..`/absolutos |
| determinismo | rodar 2× → igual | CRLF + LF |

---

## 10. Estratégia de Deploy

- Versão: bump `package.json` raiz e `packages/cli` para **3.7.0** (hoje ambos `3.6.0`).
- CHANGELOG `[3.7.0]` — release **Brownfield Discovery**: `dare patterns`, `PATTERNS.md`, nós `pattern`/`evidenced_by`/`exhibits` no grafo, `PATTERNS.md` no steering, `dare design --interactive`, personas leves Analyst/PM/Architect (planejamento, sem runtime multi-agente).
- Publish por tag `v3.7.0` (mesmo fluxo das releases 3.5.0/3.6.0); `npm publish --provenance` no CI.
- Opt-in puro: ausência de `patterns-facts.json`/`PATTERNS.md` ⇒ comportamento idêntico a v3.6.0 (RNF-06).

---

## 11. Anti-Stub Contract

**Checklist:**
- [ ] `detectPatterns` retorna padrões reais derivados do inventário — nunca lista hardcoded.
- [ ] Toda `PatternRule.detect` produz `evidence.length >= 1` por padrão (A-4).
- [ ] `getStatistics` inicializa `pattern`/`evidenced_by`/`exhibits` em `0` (não NaN).
- [ ] `design-questionnaire` deriva perguntas de fatos/gaps reais — não perguntas genéricas estáticas.
- [ ] Gaps (🔴) aparecem em "⚠️ Incertezas" — nunca silenciados (RF-07/O-07).

**Padrões PROIBIDOS:**
- Qualquer import/chamada de LLM ou rede em `pattern-detector.ts` / `pattern-facts.ts` / `design-questionnaire.ts` / `pattern-ingest.ts` (regra de ouro; RNF-02/RS-02).
- **Planejador/persona instanciado em runtime** ou orquestrador multi-agente no CLI (RF-06/A-9 — o custo MetaGPT 31k vs 19k).
- **Loop de troca de mensagens** entre personas / message pool (2308.00352, 2508.00083).
- Padrão "descoberto" hardcoded ou `DiscoveredPattern` sem evidência (A-4).
- Camada inferida que apenas recopia `KNOWN_LAYERS` (`dna-detector.ts:197`) sem co-ocorrência (A-3).
- `detectPatterns` que altera a saída de `dna`/`reverse` (quebra RNF-06).
- `--inject` que sobrescreve steering do usuário sem preservar/confirmar (RS-04).
- Pergunta de persona apresentada como fato (skill marca inferência 🟡 / gap 🔴; CLI marca fato 🟢 — risco Macke & Doyle citado pela Reversa).

---

## 12. Checklist de Aprovação

- [ ] `dare patterns` minera ≥5 categorias com evidência `arquivo:linha` (RF-01/O-01).
- [ ] `PATTERNS.md` é reusável/injetável; `design`/`blueprint` o carregam sem recopiar (RF-02/O-02).
- [ ] Padrões alimentam o grafo (`evidenced_by`/`exhibits`) e o steering (RF-03/RF-09/O-03).
- [ ] Personas Analyst/PM/Architect interrogam o humano no planejamento (RF-04/RF-05/O-04/O-05).
- [ ] **Custo controlado:** ≤1 passagem por persona, sequencial, só no planejamento; **zero** runtime multi-agente (RF-06/RNF-01/O-06).
- [ ] Confiança/gaps 🟢/🟡/🔴 propagada via `confidence.ts` (RF-07/O-07).
- [ ] Regra de ouro respeitada: CLI determinístico extrai fatos; inferência/personas nas skills (RNF-02).
- [ ] `patterns` **estende** e não duplica `dna`/`reverse` (saídas intactas — RNF-06).
- [ ] Segurança read-only no projeto-alvo (RS-01…RS-05).

---

## Próximas Etapas

1. **Revisar e aprovar** este Blueprint (checklist §12 + checklist do DESIGN).
2. Rodar `/dare-tasks` para gerar `TASKS-brownfield-discovery.md`, `dare-dag-brownfield-discovery.yaml` e `EXECUTION/task-*.md`.
3. Branch `feat/brownfield-discovery` → implementação via `/dare-dag-run`.

> **Débito do DESIGN corrigido aqui:** o DESIGN declara **Target v3.3.0 (repo em v3.2.0)** — stale.
> O repo está em **v3.6.0** (dual-graph v3.5.0 + agent-hooks-steering v3.6.0 já entregues);
> este Blueprint mira **v3.7.0**. Os pré-requisitos que o DESIGN tratava como futuros
> (grafo dual, steering loader) **já existem** e são reusados, não reimplementados.
