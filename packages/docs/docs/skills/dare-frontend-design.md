---
title: dare-frontend-design
description: Skill de design system para projetos DARE
---

# dare-frontend-design

Skill que impõe **design-system-first** no frontend — tokens de design, composição de componentes e acessibilidade desde o primeiro commit.

## Instalação

```bash
dare skill add dare-frontend-design
```

## O que inclui

### Design Tokens

Gera e mantém `app/assets/stylesheets/tokens.css`:

```css
:root {
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-4: 16px;
  --space-8: 32px;

  /* Typography */
  --font-size-sm:  0.875rem;
  --font-size-md:  1rem;
  --font-size-lg:  1.25rem;

  /* Colors (geradas a partir do dare.config.json) */
  --color-primary:   #2d7dd2;
  --color-accent:    #00d084;
  --color-bg:        #ffffff;
  --color-surface:   #f8f9fa;
}
```

### Component Template

```bash
dare frontend new-component Button
```

Gera:
```
app/components/
└── button_component.rb    ← ViewComponent
└── button_component.html.erb
└── button_component_test.rb
app/assets/stylesheets/components/
└── button.css
```

## Validation gate

```bash
dare frontend audit
# ✓ Tokens — todos os valores de cor usam CSS vars
# ✓ Componentes — 12/12 têm testes de acessibilidade
# ⚠ LoginForm — hard-coded color: #333 em linha 42
```

## Configuração

```json
{
  "skills": {
    "dare-frontend-design": {
      "token_file": "app/assets/stylesheets/tokens.css",
      "component_framework": "view_component",
      "enforce_tokens": true
    }
  }
}
```
