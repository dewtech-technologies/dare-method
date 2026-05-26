---
title: Publicar uma Skill
description: Guia completo para criar e publicar uma skill no registry DARE
---

# Publicar uma Skill

Skills são a forma principal de estender o DARE Method. Qualquer desenvolvedor pode criar e publicar uma skill no registry da comunidade.

## 1. Criar a estrutura da skill

```bash
# Use o scaffolding do CLI
dare skill new dare-minha-skill
cd dare-minha-skill
```

Estrutura gerada:

```
dare-minha-skill/
├── dare-skill.json          ← manifesto obrigatório
├── prompts/
│   ├── design.md            ← prompt para fase DESIGN
│   └── architect.md         ← prompt para fase ARCHITECT
├── gates/
│   └── audit.sh             ← script do validation gate
├── templates/               ← templates de código gerados
│   └── example.rb.mustache
├── tests/
│   └── skill_test.js        ← testes da skill
└── README.md
```

## 2. Escrever o manifesto `dare-skill.json`

```json
{
  "name": "dare-minha-skill",
  "version": "1.0.0",
  "description": "Descrição clara do que a skill faz",
  "author": "Seu Nome <email@exemplo.com>",
  "license": "MIT",
  "dare_version": ">=3.0.0",
  "stacks": ["rails", "node", "any"],
  "tags": ["domínio", "tecnologia"],
  "homepage": "https://github.com/voce/dare-minha-skill",
  "gates": [
    {
      "name": "minha-skill-audit",
      "command": "dare minha-skill audit",
      "description": "Verifica conformidade com os padrões da skill",
      "fail_on_error": true
    }
  ],
  "prompts": {
    "design": "prompts/design.md",
    "architect": "prompts/architect.md"
  },
  "commands": {
    "audit": "gates/audit.sh"
  }
}
```

## 3. Escrever os prompts

Os prompts são injetados nas fases DESIGN e ARCHITECT para guiar a IA com o contexto da sua skill.

**`prompts/design.md`:**

```markdown
## Contexto: dare-minha-skill

Esta skill está ativa. Ao criar o DESIGN:

- Considere os padrões de [domínio da skill]
- Inclua nos requisitos: [requisitos específicos]
- Evite: [anti-patterns a evitar]
```

**`prompts/architect.md`:**

```markdown
## Arquitetura: dare-minha-skill

Ao gerar o BLUEPRINT:

- Use o padrão [padrão] para [contexto]
- Estrutura de pastas recomendada: [estrutura]
- Dependências necessárias: [gems/packages]
```

## 4. Escrever testes

```javascript
// tests/skill_test.js
import { test } from 'dare/testing';

test('gate detects violation', async (dare) => {
  const project = await dare.createTestProject({ stack: 'rails' });
  // introduz uma violação intencional
  await project.writeFile('app/domain/foo.rb', 'require "stripe"'); // viola layered design

  const result = await dare.runGate('minha-skill-audit', project);
  assert.equal(result.status, 'FAIL');
  assert.includes(result.output, 'violation');
});

test('gate passes clean project', async (dare) => {
  const project = await dare.createTestProject({ stack: 'rails' });
  const result = await dare.runGate('minha-skill-audit', project);
  assert.equal(result.status, 'PASS');
});
```

## 5. Publicar

```bash
# Login no registry
dare registry login

# Testar antes de publicar
dare skill test

# Publicar
dare skill publish
```

!!! tip "Versionamento semântico"
    Use [SemVer](https://semver.org/). Breaking changes devem incrementar o major.
    Skills no DARE seguem: `MAJOR.MINOR.PATCH`.

## Checklist antes de publicar

- [ ] `dare-skill.json` válido e completo
- [ ] `README.md` com instalação, configuração e exemplos
- [ ] Pelo menos 2 testes no `tests/`
- [ ] `dare skill test` passando
- [ ] `dare_version` configurado corretamente
- [ ] Licença MIT declarada
