---
title: dare-ax
description: Skill de acessibilidade para o DARE Method — llms.txt, ARIA audits, milestones M-01 a M-04
---

# dare-ax

Skill de **acessibilidade** para o DARE Method. Garante que cada feature implementada pelo Ralph Loop atenda aos critérios WCAG 2.1 AA por padrão.

## Instalação

```bash
dare skill add dare-ax
```

## O que esta skill faz

### `llms.txt` automático

Gera e mantém o arquivo `llms.txt` do projeto com o contexto de acessibilidade atualizado. O `llms.txt` informa à IA sobre:

- Componentes com ARIA implementados
- Padrões de navegação por teclado
- Requisitos de contraste de cor
- Restrições de acessibilidade do domínio

### Milestones de acessibilidade (M-01 a M-04)

| Milestone | Critério | Gate automático |
|-----------|----------|----------------|
| M-01 | Estrutura semântica HTML | `axe-core` scan |
| M-02 | Navegação por teclado | playwright keyboard test |
| M-03 | Contraste de cores WCAG AA | `color-contrast` check |
| M-04 | Screen reader compatibility | NVDA/VoiceOver test suite |

### Validation gate

O dare-ax registra um gate automático no Ralph Loop:

```json
{
  "name": "accessibility",
  "command": "dare ax audit --format json",
  "threshold": { "violations": 0, "incomplete": "warn" }
}
```

## Comandos

```bash
# Auditoria completa de acessibilidade
dare ax audit

# Auditoria de um componente específico
dare ax audit --component Button

# Gerar relatório WCAG
dare ax report --format html

# Status dos milestones
dare ax milestones

# Atualizar llms.txt
dare ax update-context
```

## Configuração

Em `.dare/config.json`:

```json
{
  "skills": {
    "dare-ax": {
      "wcag_level": "AA",
      "auto_llms_txt": true,
      "milestones": ["M-01", "M-02", "M-03", "M-04"],
      "fail_on_violation": true
    }
  }
}
```

## Exemplo de output

```
dare ax audit

dare-ax v1.4.0 — WCAG 2.1 AA Audit
====================================
M-01 Estrutura semântica      ✓ PASS  (0 violations)
M-02 Navegação por teclado    ✓ PASS  (0 violations)
M-03 Contraste de cores       ⚠ WARN  (2 incomplete)
M-04 Screen reader            ✓ PASS  (0 violations)

Score: 96/100 — 2 items need manual review
```
