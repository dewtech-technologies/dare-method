---
title: Home
description: DARE Method v3.0 — Metodologia + CLI + Skills para desenvolvimento assistido por IA
---

# DARE Method

**Design. Architect. Review. Execute.**

Uma metodologia estruturada para desenvolvimento de software assistido por IA, com checkpoints humanos obrigatórios, 7 skills integradas e uma stack Rails 8 pronta para produção.

<div class="grid cards" markdown>

- :material-rocket-launch: **[Quickstart em 5 minutos](getting-started/installation.md)**
  Instale o CLI e crie seu primeiro projeto DARE

- :material-puzzle: **[Skills](skills/index.md)**
  Módulos que estendem o DARE com expertise de domínio

- :material-console: **[CLI Reference](cli/index.md)**
  Todos os comandos `dare` com exemplos

- :material-train: **[Stack Rails 8](stacks/ruby-rails-8.md)**
  `dare new --stack rails` — setup completo em minutos

</div>

---

## O que é o DARE?

O DARE resolve o maior problema do desenvolvimento com IA: **ou você é rápido demais (sem estrutura) ou lento demais (sem aproveitar a IA)**.

```
┌──────────────────────────────────────────────────────────────┐
│   1. DESIGN   →  2. ARCHITECT  →  3. REVIEW  →  4. EXECUTE  │
│   ─────────      ────────────     ────────      ────────     │
│   Humano         IA propõe        Humano        IA + Ralph   │
│   define         arquitetura      valida        Loop         │
│                                                              │
│   DESIGN.md      BLUEPRINT.md     ✓ approval    Código       │
└──────────────────────────────────────────────────────────────┘
```

!!! tip "Princípio central"
    Humanos pensam **estratégia** (fases 1 e 3). IA executa **tática** (fases 2 e 4).
    Cada transição entre fases exige um checkpoint explícito.

---

## Ralph Loop

O **Ralph Loop** é o mecanismo de auto-correção pós-execução. Inspirado no Ralph Wiggum dos Simpsons — que persiste confiante mesmo errando — o loop faz a IA iterar até que todos os validation gates passem:

```
IA implementa → Roda gates → FAIL → Lê erro → Corrige → ⟲
                           → PASS → Task done ✓
```

Gates de validação incluem: testes unitários, testes de integração, linter, type checker e gates customizados por skill.

---

## Quickstart rápido

```bash
# 1. Instale o CLI
npm install -g @dewtech/dare-cli

# 2. Novo projeto com Rails 8
dare new meuapp --stack rails

# 3. Adicione skills
dare skill add dare-llm-integration

# 4. Comece o design
cd meuapp
dare design "API de autenticação JWT com multi-tenant"
```

---

## Licença

DARE Method é software livre distribuído sob a [licença MIT](https://github.com/dewtech-technologies/dare-method/blob/main/LICENSE).
