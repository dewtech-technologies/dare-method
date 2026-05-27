# DARE Design Tokens — Excalidraw Visualization

> **Propósito:** Padrões visuais consistentes para diagramas DAG (task graphs) no DARE  
> **Licença:** MIT (parte do DARE CLI — D-001)  
> **Referência:** Análise original em [DARE-Excalidraw-Skill-Analysis.md](../Projetos/fermio-plataform/DARE-Excalidraw-Skill-Analysis.md)  
> **Créditos:** Inspiração na [Excalidraw Diagram Skill](https://github.com/coleam00/excalidraw-diagram-skill) por Cole Medin

---

## Filosofia

Excalidraw em DARE não é "apenas desenho bonito". Cada cor, forma e posicionamento comunica **significado estrutural**:

- **Cor** = Complexidade da task (LOW/MED/HIGH)
- **Posição (Swim Lane)** = Rank (número de ordem lógica no DAG)
- **Forma** = Tipo de elemento (task, subtask, grupo)
- **Linha** = Dependência e direção de execução
- **Status** = Progresso visual (PENDING/RUNNING/DONE/FAILED)

Isso vem de anos de DARE em produção — observando o que ajuda devs a **entender rapidamente** um projeto complexo.

---

## 1. Core Colors

### Complexidade (Complexity Level)

Cada task recebe uma cor baseada em `complexity: LOW | MEDIUM | HIGH` no `dare-dag.yaml`.

```
Complexidade LOW
├─ Cor: #e3f2fd (Azul claro — sereno, simples)
├─ Stroke: #1976d2 (Azul escuro)
├─ Exemplos: "Setup boilerplate", "Add linter config", "Write unit test"
└─ Contexto: Task toma <30 min, padrão bem definido

Complexidade MEDIUM
├─ Cor: #fff3e0 (Laranja claro — atenção, moderado)
├─ Stroke: #e65100 (Laranja escuro)
├─ Exemplos: "Implement JWT auth", "Setup Docker", "Migrate database"
└─ Contexto: Task toma 2-8 horas, múltiplas decisões

Complexidade HIGH
├─ Cor: #fce4ec (Rosa/Magenta claro — cuidado, complexo)
├─ Stroke: #c2185b (Rosa escuro)
├─ Exemplos: "Distributed caching", "Multi-tenant architecture", "Security hardening"
└─ Contexto: Task toma 1+ dias, design crítico, risco alto
```

### Status (Execution State)

Task pode estar em diferentes estados durante execução. Visual reflete o progresso.

```
Status PENDING
├─ Cor: #f5f5f5 (Cinza claro — aguardando)
├─ Stroke: #999999 (Cinza médio)
├─ Ícone: ⏳ (relógio)
└─ Significado: Task não iniciada, aguardando dependências

Status RUNNING
├─ Cor: #e3f2fd (Azul claro — em andamento)
├─ Stroke: #1976d2 (Azul) + strokeDasharray: "5,5" (pontilhado)
├─ Ícone: ⚙️ (engrenagem)
└─ Significado: Task em execução neste momento

Status DONE
├─ Cor: #e8f5e9 (Verde claro — sucesso)
├─ Stroke: #388e3c (Verde escuro)
├─ Ícone: ✅ (checkmark)
└─ Significado: Task completada com sucesso

Status FAILED
├─ Cor: #ffebee (Vermelho claro — falha)
├─ Stroke: #d32f2f (Vermelho escuro)
├─ Ícone: ❌ (X)
└─ Significado: Task falhou, requer intervenção
```

---

## 2. Typography

Excalidraw tem fontes limitadas. DARE usa **Virgil** (padrão) e **Cascadia Code** (monospace para código).

```
Elemento          | Font      | Size | Weight | Cor
------------------|-----------|------|--------|--------
Task name         | Virgil    | 12px | bold  | #333
Task ID           | Virgil    | 10px | normal| #666
Rank label        | Virgil    | 11px | bold  | #1976d2
Depends-on arrow  | —         | —    | —     | #999
Error/status text | Cascadia  | 10px | normal| Vermelho se FAILED
```

---

## 3. Shapes & Sizing

### Task Element (Retângulo)

Representa uma task individual no DAG.

```
Dimensões:
  Width: 120px
  Height: 60px
  Padding: 8px (interno)

Arredondamento:
  borderRadius: 6px (sutilmente arredondado — amigável, não robótico)

Exemplo:
┌──────────────────┐
│  task-001        │
│  Setup Auth      │
│  [LOW] ⏳         │
└──────────────────┘
```

### Swim Lane (Rank Group)

Agrupa tasks do mesmo rank (paralelismo).

```
Dimensões:
  Width: 100% da canvas
  Height: 120px per task (+ 40px gap entre ranks)

Estilo:
  backgroundColor: transparent
  stroke: #e0e0e0 (cinza leve)
  strokeWidth: 1
  label: "Rank 1", "Rank 2", etc

Posicionamento:
  X: 0
  Y: 100 + (rank-1) * 160  (160 = 120 task + 40 gap)

Exemplo:
╔════════════════════════════════════════╗
║ Rank 1                                 ║
║ ┌──────────┐  ┌──────────┐            ║
║ │ task-001 │  │ task-002 │            ║
║ └──────────┘  └──────────┘            ║
╚════════════════════════════════════════╝
```

### Arrow (Dependency Link)

Conecta uma task à sua dependência.

```
Estilo:
  strokeColor: #999
  strokeWidth: 2
  arrowhead: "arrow" (ponta de seta normal)
  endBinding: true

Exceções:
  - Se source.status == FAILED: stroke = #d32f2f (vermelho)
  - Se source.status == RUNNING: strokeDasharray: "4,2" (tracejado)

Exemplo:
┌────────┐      ┌────────┐
│task-001│ ──→  │task-002│
└────────┘      └────────┘
    (DONE)           (PENDING)
```

---

## 4. Layout Algorithm

Como posicionar tasks automaticamente (para gerador TypeScript).

### Passo 1: Calcular Ranks

```typescript
// Rank = camada no DAG (depth-first)
// Task sem dependências = rank 1
// Task que depende de rank N = rank N+1

ranks: Map<taskId, number> = {
  'task-001': 1,  // sem deps
  'task-002': 1,  // sem deps
  'task-003': 2,  // depende de task-001
  'task-004': 2,  // depende de task-001
  'task-005': 3,  // depende de task-003 e task-004
}
```

### Passo 2: Agrupar por Rank

```typescript
byRank: Map<number, taskId[]> = {
  1: ['task-001', 'task-002'],
  2: ['task-003', 'task-004'],
  3: ['task-005'],
}
```

### Passo 3: Posicionar em Grid

```
Cada rank = coluna vertical (swim lane)
Tasks no mesmo rank = lado a lado, X espaçado por 140px

pseudocódigo:
for each rank in order:
  for each task in rank:
    x = 20 + (taskIndex * 140)
    y = 20 + (rank - 1) * 160
    createElement(task, x, y, 120px, 60px)
```

### Passo 4: Desenhar Setas

```typescript
for each task:
  for each dependency in task.depends_on:
    drawArrow(source: dependency, target: task)
```

---

## 5. Excalidraw JSON Structure

Estrutura mínima de um elemento task no `.excalidraw`:

```json
{
  "elements": [
    {
      "id": "task-001",
      "type": "rectangle",
      "x": 20,
      "y": 20,
      "width": 120,
      "height": 60,
      "angle": 0,
      "strokeColor": "#1976d2",
      "backgroundColor": "#e3f2fd",
      "fillStyle": "hachure",
      "strokeWidth": 2,
      "strokeStyle": "solid",
      "roughness": 0,
      "opacity": 100,
      "roundness": {
        "type": 2,
        "value": 6
      },
      "text": "task-001\nSetup Auth\n[LOW]",
      "fontSize": 12,
      "fontFamily": 1,
      "textAlign": "center",
      "verticalAlign": "middle",
      "boundElements": [],
      "updated": 1715708400000,
      "link": null,
      "locked": false
    }
  ],
  "appState": {
    "gridMode": "grid",
    "gridSize": 20,
    "gridModeEnabled": false
  }
}
```

---

## 6. Referências & Créditos

### Inspirações Externas

- **Excalidraw** — ferramenta open source para diagramas: https://excalidraw.com
- **Cole Medin's Excalidraw Diagram Skill** — skill original de agente para gerar `.excalidraw`: https://github.com/coleam00/excalidraw-diagram-skill
- **Ralph Loop** — termo cunhado por americano para ciclo de validação em IA; DARE adaptou para `dare execute --ralph-loop`

### Trabalho Original DARE

- **DAG Visualization** — mapeamento de tasks → elementos visuais (Wanderson Leandro, 2026)
- **Rank Calculation** — algoritmo de profundidade para swim lanes (adaptado de DAG theory padrão)
- **Design Tokens** — paleta semântica alinhada com identidade DARE (cor = significado)

---

## 7. Como Usar Esta Paleta

### Para Geradores (Skill de Agente)

```markdown
Use estas cores quando gerar `.excalidraw`:

- Leia `dare-dag.yaml`
- Para cada task com `complexity: LOW` → use backgroundColor: "#e3f2fd"
- Para cada task com `complexity: MEDIUM` → use backgroundColor: "#fff3e0"
- Para cada task com `complexity: HIGH` → use backgroundColor: "#fce4ec"
- Para cada task com `status: DONE` → use backgroundColor: "#e8f5e9"
- Posicione usando algoritmo de ranks (seção 4)
```

### Para Renderer TypeScript

```typescript
const complexityColors = {
  'LOW': { bg: '#e3f2fd', stroke: '#1976d2' },
  'MEDIUM': { bg: '#fff3e0', stroke: '#e65100' },
  'HIGH': { bg: '#fce4ec', stroke: '#c2185b' },
};

const statusColors = {
  'PENDING': { bg: '#f5f5f5', stroke: '#999999' },
  'RUNNING': { bg: '#e3f2fd', stroke: '#1976d2', dashed: true },
  'DONE': { bg: '#e8f5e9', stroke: '#388e3c' },
  'FAILED': { bg: '#ffebee', stroke: '#d32f2f' },
};
```

### Para Customização

Se quiser alterar cores:
1. Mantenha a **semântica** (LOW = simples, HIGH = complexo)
2. Documente a mudança em `CHANGELOG.md`
3. Use ferramenta como https://coolors.co para validar contraste (acessibilidade)

---

## 8. Exemplos de Output

### Projeto Simples (3 tasks, 2 ranks)

```
┌──────────────────────────────────────────────────┐
│ Rank 1                                           │
│ ┌─────────────────────┐                          │
│ │  task-001          │                          │
│ │  Setup Boilerplate │                          │
│ │  [LOW] ✅          │                          │
│ └─────────────────────┘                          │
└──────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┐
         │              │              │
┌────────▼────────┐  ┌─▼────────────┐  ┌─▼────────────┐
│  task-002      │  │  task-003   │  │  task-004   │
│  Add Auth      │  │  Setup DB   │  │  Linting    │
│  [HIGH] ⏳     │  │  [MED] ⏳    │  │  [LOW] ⏳    │
└────────────────┘  └─────────────┘  └─────────────┘
```

### Projeto Complexo (10+ tasks)

Veja exemplo renderizado em: `DARE/dag-graph.excalidraw` (gerado por `dare dag viz`)

---

## 9. Changelog

| Data | Versão | Mudança |
|------|--------|---------|
| 2026-05-14 | 1.0 | Token inicial — complexidade LOW/MED/HIGH, status PENDING/RUNNING/DONE/FAILED |

---

## Licença

Este documento e as convenções aqui definidas são parte do **DARE CLI** e licenciadas sob **MIT** (D-001 — MIT permanente).

Você é livre para:
- ✅ Usar essas cores em seus projetos DARE
- ✅ Customizar para sua organização
- ✅ Contribuir com melhorias via PR
- ✅ Distribuir e relicenciar derivados conforme MIT permite

