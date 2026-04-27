# Fase 2 — Architect

> **Como vamos construir o que foi acordado no Design.**

| Atributo | Valor |
|---|---|
| **Quem dirige** | IA propõe |
| **Papel do humano** | Validador (na próxima fase, Review) |
| **Entrada** | `DARE/DESIGN.md` |
| **Saída** | `DARE/BLUEPRINT.md` |
| **Tempo típico** | 5-15 min (gerar) + 5-10 min (revisar) |
| **Próxima fase** | [Review](3-review.md) |

## 🎯 Objetivo

Transformar o **o quê** (Design) em **um plano técnico viável**: arquitetura, estrutura de pastas, modelos de dados, contratos de API, dependências, e — crucialmente — **trade-offs explícitos**.

## 📋 O que entra no `BLUEPRINT.md`

### 1. Visão arquitetural
*Diagrama (ASCII ou Mermaid) mostrando os componentes e como se conectam.*

### 2. Stack escolhida (com justificativa)
*Qual linguagem, framework, banco, infra. POR QUE essa e não outras?*

```markdown
**Backend:** Node.js 20 + NestJS 11
- ✓ Time já domina
- ✓ Tipagem forte
- ✓ Decorators facilitam validação e auth

Considerado mas rejeitado:
- Go: performance ótima, mas equipe inteira precisaria aprender
- Express puro: faltaria estrutura, time perderia produtividade
```

### 3. Estrutura de diretórios
*Layout exato de pastas/arquivos que serão criados ou modificados.*

### 4. Modelos de dados
*Schemas, entidades, migrations. Em formato concreto da stack escolhida.*

### 5. Contratos de API / interfaces
*Endpoints, payloads, retornos. Em OpenAPI, GraphQL schema, ou tabelas markdown.*

### 6. Decisões arquiteturais (ADR-style)
*Cada decisão importante com: contexto, opções consideradas, decisão, consequências.*

### 7. Lista preliminar de tarefas
*Quebra do trabalho em itens. Refinada depois com `/generate-tasks`.*

### 8. Riscos e mitigações
*O que pode dar errado? Como vamos responder?*

## 🤖 Como a IA gera o Blueprint

A IA pega o `DESIGN.md` e propõe uma arquitetura **completa**. Ela deve:

- ✅ Listar pelo menos 2-3 alternativas pras decisões importantes
- ✅ Explicitar trade-offs (não pintar uma escolha como "óbvia")
- ✅ Considerar restrições do Design (stack obrigatória, prazo, etc.)
- ✅ Aproveitar **skills carregadas** (ex: skill Laravel API ensina padrões da stack)
- ✅ Sinalizar premissas que está fazendo

**O que a IA NÃO deve fazer:**
- ❌ Implementar código real (isso é Execute)
- ❌ Sugerir libraries que não existem (verificar antes!)
- ❌ Apresentar 1 opção como "a melhor" sem trade-off explícito

## 🚀 Como disparar (Cursor)

```
/generate-blueprint DARE/DESIGN.md
```

Ou, se quer que a IA refine algo específico:

```
/generate-blueprint DARE/DESIGN.md

Foco especial em decidir entre PostgreSQL e MongoDB pro storage.
```

Saída: `DARE/BLUEPRINT.md` no formato canônico.

## ✅ Critério de "Blueprint pronto pra Review"

Antes de seguir pra fase Review, a IA deve garantir:

- [ ] Cobre todos os critérios de sucesso do DESIGN.md
- [ ] Não-objetivos do DESIGN.md respeitados (não bolar coisa fora do escopo)
- [ ] Trade-offs explícitos em pelo menos 3 decisões importantes
- [ ] Estrutura de pastas concreta (não "uma pasta pra controllers")
- [ ] Premissas listadas separadamente
- [ ] Riscos enumerados com mitigação preliminar

## 🚫 Anti-padrões comuns

### "Blueprint sem alternativas"
Se cada decisão aparece como "vamos usar X" sem mencionar Y e Z que foram consideradas, o Blueprint é raso. Pede pra IA expandir os trade-offs.

### "Stack hyped sem justificativa"
"Vamos usar Bun + Hono + Drizzle porque é moderno". **Por quê** sua equipe / projeto se beneficia disso vs. as alternativas? Sem justificativa, é cargo culting.

### "Estrutura genérica de tutorial"
`controllers/`, `services/`, `repositories/` sem pensar se faz sentido pro problema. Pra app de 5 endpoints, isso é over-engineering.

### "Riscos vazios"
Lista de "performance pode ser problema" sem mitigação. Risco listado sem plano de resposta = teatro.

## 🔄 Iteração

Se ao gerar o Blueprint você notar que o **DESIGN.md tem furo** (informação faltando, contradição, escopo mal definido), **volta pro Design** e refaz. Não tente compensar no Blueprint.

## 📂 Templates

- [`templates/BLUEPRINT-template.md`](../../templates/BLUEPRINT-template.md) (cada implementação tem cópia)

## 🔗 Próximo

[Fase 3: Review →](3-review.md)
