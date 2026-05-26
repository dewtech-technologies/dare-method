---
title: Primeiro Projeto
description: Crie e execute seu primeiro projeto DARE em minutos
---

# Primeiro Projeto

Vamos criar um projeto Rails 8 com DARE do zero. Você vai passar pelas 4 fases do método e ver o Ralph Loop em ação.

## 1. Criar o projeto

```bash
dare new meuapp --stack rails
```

Isso gera a estrutura:

```
meuapp/
├── DARE/
│   ├── DESIGN.md       ← você preenche aqui
│   ├── BLUEPRINT.md    ← IA gera a partir do DESIGN
│   └── TASKS.md        ← gerado após aprovação
├── .dare/
│   └── config.json
├── app/                ← Rails 8 app gerado
├── Gemfile
└── ...
```

## 2. Fase DESIGN — defina o que construir

Edite `DARE/DESIGN.md` com os requisitos do seu projeto. O arquivo já tem uma estrutura sugerida:

```markdown
# Design: meuapp

## Objetivo
API REST para autenticação JWT com suporte a multi-tenant.

## Contexto
...

## Requisitos funcionais
- [ ] POST /auth/login → retorna JWT
- [ ] POST /auth/refresh → renova token
- [ ] Middleware de autenticação para rotas protegidas

## Requisitos não-funcionais
- Latência < 100ms no p99
- Compatível com Rails 8 + PostgreSQL
```

Quando estiver satisfeito, inicie a fase ARCHITECT:

```bash
dare blueprint DARE/DESIGN.md
```

## 3. Fase ARCHITECT — IA propõe a arquitetura

O CLI usa seu DESIGN.md para gerar o `DARE/BLUEPRINT.md` com:

- Diagrama de componentes
- Decisões de arquitetura
- Lista de tasks com estimativas de complexidade

Revise o blueprint. Se precisar de ajustes:

```bash
dare blueprint --refine "adicionar suporte a OAuth2"
```

## 4. Fase REVIEW — checkpoint humano

Após revisar o blueprint, aprove explicitamente:

```bash
dare review approve
```

!!! note "Por que a aprovação explícita?"
    Isso gera um registro auditável no `DARE/TASKS.md` com timestamp e hash do blueprint aprovado.
    Sem aprovação, o `dare execute` não roda.

## 5. Fase EXECUTE — Ralph Loop

Execute as tasks uma a uma:

```bash
dare execute task-001
```

O Ralph Loop vai:

1. Implementar a task
2. Rodar os validation gates (testes, linter, type check)
3. Se falhar, ler o erro, corrigir e tentar novamente
4. Marcar como `DONE` quando todos os gates passarem

Acompanhe o progresso:

```bash
dare status
# TASKS.md progress: 3/12 done (25%)
# Active: task-004 — JWT middleware
# Last gate: rspec → PASS
```

---

## Próximos passos

- [Entenda os conceitos](concepts.md) — aprofunde nas 4 fases
- [Adicione skills](../skills/index.md) — estenda com `dare-llm-integration`, `dare-ax`, etc.
- [Stack Rails 8](../stacks/ruby-rails-8.md) — detalhes da stack oficial
