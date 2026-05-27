# dare-dag-viz — Skill para Visualizar DAG com Excalidraw

Skill para Antigravity que gera diagrama visual interativo do grafo de tasks (DAG) no formato Excalidraw.

## Descrição

Lê `DARE/dare-dag.yaml` e gera um arquivo `.excalidraw` com:
- Tasks representadas como retângulos coloridos por complexidade
- Status visual de cada task (PENDING/RUNNING/DONE/FAILED)
- Agrupamento por rank em colunas verticais (swim lanes)
- Setas conectando dependências entre tasks
- Design semântico onde cor = significado

Output é um arquivo `.excalidraw` editável e interativo que abre em https://excalidraw.com.

## Invocação

```
dare dag viz --format excalidraw

ou

/dare-dag-viz
```

## Fluxo de Execução

1. **Leia** `DARE/dare-dag.yaml`
   - Valide sintaxe YAML
   - Extraia tasks, complexidade, dependências, status

2. **Calcule ranks**
   - Rank = 1 + max(rank das dependências)
   - Tasks sem deps = rank 1
   - Agrupe por rank para swim lanes

3. **Gere elementos Excalidraw**
   - Para cada task:
     - Retângulo 120×60px
     - Cor baseada em `complexity`: LOW=azul, MED=laranja, HIGH=rosa
     - Stroke baseado em `status`: PENDING=cinza, RUNNING=azul pontilhado, DONE=verde, FAILED=vermelho
     - Texto: `task-id\ntask-name\n[COMPLEXITY]`
   
   - Para cada dependência em `depends_on`:
     - Arrow de source → target
     - Stroke cinza (#999) normal

4. **Posicione elementos**
   - X = 20 + (taskIndex * 140)
   - Y = 20 + (rank - 1) * 160
   - Crie frames para cada rank (swim lanes)

5. **Salve JSON**
   - Output: `DARE/dag-graph.excalidraw`
   - Formato: Excalidraw JSON schema
   - Adicione `appState` com `gridMode: "grid"`

## Esquema JSON Mínimo

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "dare-dag-viz",
  "elements": [
    {
      "id": "task-001",
      "type": "rectangle",
      "x": 20, "y": 20,
      "width": 120, "height": 60,
      "angle": 0,
      "strokeColor": "#1976d2",
      "backgroundColor": "#e3f2fd",
      "fillStyle": "hachure",
      "strokeWidth": 2,
      "strokeStyle": "solid",
      "roughness": 0,
      "opacity": 100,
      "roundness": { "type": 2, "value": 6 },
      "text": "task-001\nSetup Auth\n[LOW]",
      "fontSize": 12,
      "fontFamily": 1,
      "textAlign": "center",
      "verticalAlign": "middle"
    },
    {
      "type": "arrow",
      "startBinding": { "elementId": "task-001" },
      "endBinding": { "elementId": "task-002" },
      "startArrowType": "dot",
      "endArrowType": "arrow",
      "strokeColor": "#999",
      "strokeWidth": 2
    }
  ],
  "appState": {
    "gridMode": "grid",
    "gridSize": 20
  }
}
```

## Cores Semânticas

### Por Complexidade

| Complexidade | Cor Background | Cor Stroke | Uso |
|---|---|---|---|
| LOW | #e3f2fd (azul claro) | #1976d2 (azul escuro) | Tasks simples, <30 min |
| MEDIUM | #fff3e0 (laranja claro) | #e65100 (laranja escuro) | Tasks moderadas, 2-8h |
| HIGH | #fce4ec (rosa claro) | #c2185b (rosa escuro) | Tasks complexas, 1+ dias |

### Por Status

| Status | Background | Stroke | Style |
|---|---|---|---|
| PENDING | #f5f5f5 (cinza) | #999 (cinza) | Normal |
| RUNNING | #e3f2fd (azul) | #1976d2 (azul) | Pontilhado `"5,5"` |
| DONE | #e8f5e9 (verde) | #388e3c (verde) | Normal |
| FAILED | #ffebee (vermelho) | #d32f2f (vermelho) | Normal |

## Campos Esperados em dare-dag.yaml

```yaml
name: "Project Name"
version: "1.0"

tasks:
  task-001:
    name: "Task Name"                 # Obrigatório
    complexity: "LOW"                 # Obrigatório: LOW | MEDIUM | HIGH
    rank: 1                           # Opcional (será calculado)
    depends_on: []                    # Opcional: ["task-002", ...]
    status: "PENDING"                 # Opcional: PENDING | RUNNING | DONE | FAILED
    subtask_prompt: "Description..."  # Opcional
```

## Exemplo de Output

```
DARE/dag-graph.excalidraw

Estrutura visual:
┌────────────────────────────────────────────────────┐
│ Rank 1                                             │
│ ┌──────────────┐  ┌──────────────┐               │
│ │ task-001     │  │ task-002     │               │
│ │ [LOW] ✅     │  │ [HIGH] ⏳     │               │
│ └──────────────┘  └──────────────┘               │
└────────────────────────────────────────────────────┘
        │                     │
        ├─────────┬───────────┘
        │         │
┌───────▼─────────▼──────────────────────────────────┐
│ Rank 2                                             │
│ ┌──────────────┐  ┌──────────────┐               │
│ │ task-003     │  │ task-004     │               │
│ │ [MEDIUM] ⚙️  │  │ [LOW] ⏳      │               │
│ └──────────────┘  └──────────────┘               │
└────────────────────────────────────────────────────┘
        │                     │
        └─────────┬───────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│ Rank 3                                             │
│ ┌──────────────┐                                  │
│ │ task-005     │                                  │
│ │ [HIGH] ⏳    │                                  │
│ └──────────────┘                                  │
└────────────────────────────────────────────────────┘
```

Arquivo gerado é editável em https://excalidraw.com.

## Validação

Antes de gerar, valide o YAML:
```
dare dag validate
```

Verificações:
- ✅ Sintaxe YAML válida
- ✅ Tasks referenciadas em `depends_on` existem
- ✅ Sem ciclos (A→B→A)
- ✅ Ranks consistentes

## Resultado Final

Arquivo `DARE/dag-graph.excalidraw` que:
- ✅ Abre direto em https://excalidraw.com
- ✅ É editável interativamente
- ✅ Exportável para PNG/SVG
- ✅ Compartilhável (colaborativo)
- ✅ Versionável em Git (JSON)

## Design & Documentação

Detalhes completos de design:
→ Ver `/docs/DESIGN-TOKENS-EXCALIDRAW.md`

Inclui:
- Paleta de cores com justificativa semântica
- Algoritmo de posicionamento
- Tipografia Excalidraw
- Referências e créditos

## Referências

- **Excalidraw** — ferramenta open source: https://excalidraw.com
- **Cole Medin's Excalidraw Diagram Skill** — inspiração: https://github.com/coleam00/excalidraw-diagram-skill
- **DARE CLI** — graphrag integration: `packages/cli/src/utils/dag-converter.ts`

## Licença & Atribuição

Esta skill é parte do **DARE CLI** — licença MIT (D-001).

Você pode:
- ✅ Usar em seus projetos DARE
- ✅ Modificar para suas necessidades
- ✅ Compartilhar, distribuir e relicenciar derivados (MIT)

Você não pode:
- ❌ Vender como produto fechado
- ❌ Remover atribuição de DARE

Créditos: Wanderson Leandro (Dewtech Technologies) — adaptado com inspiração em Cole Medin's Excalidraw Diagram Skill.

---

**Status:** Ativo v1.0 (2026-05-14)
