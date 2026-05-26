---
title: Skills
description: Visão geral das skills do DARE Method
---

# Skills

Skills são módulos composíveis que estendem o DARE com expertise de domínio. Cada skill adiciona:

- **Prompts especializados** para as fases DESIGN e ARCHITECT
- **Validation gates** adicionais para o Ralph Loop
- **Templates** de código pré-configurados
- **Comandos CLI** extras

## Skills oficiais

| Skill | Domínio | Versão |
|-------|---------|--------|
| [dare-ax](dare-ax.md) | Acessibilidade | 1.4.0 |
| [dare-layered-design](dare-layered-design.md) | Arquitetura | 2.1.0 |
| [dare-llm-integration](dare-llm-integration.md) | Integração LLM | 1.2.0 |
| [dare-frontend-design](dare-frontend-design.md) | Design System | 1.0.3 |
| [dare-realtime](dare-realtime.md) | WebSocket / SSE | 0.9.1 |
| [dare-quality-telemetry](dare-quality-telemetry.md) | Observabilidade | 1.1.0 |

## Gerenciando skills

```bash
# Instalar
dare skill add dare-llm-integration

# Listar instaladas
dare skill list

# Remover
dare skill remove dare-realtime

# Atualizar todas
dare skill update
```

## Publicar sua própria skill

Qualquer pessoa pode publicar skills no registry da comunidade. Veja o guia em [Publicar uma Skill](../contributing/publish-a-skill.md).
