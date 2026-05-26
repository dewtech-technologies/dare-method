---
title: dare skill publish
description: Publica uma skill no registry remoto DARE
---

# dare skill publish

Publica uma skill local no registry remoto para que a comunidade possa instalá-la.

## Sintaxe

```bash
dare skill publish [path] [options]
```

## Pré-requisitos

1. Autentique-se no registry: `dare registry login`
2. Sua skill deve ter um `dare-skill.json` válido
3. Testes passando: `dare skill test`

## Exemplos

```bash
# Publicar skill no diretório atual
dare skill publish

# Publicar com tag de pre-release
dare skill publish --tag beta

# Dry run (mostra o que seria publicado)
dare skill publish --dry-run
```

## dare-skill.json

Cada skill precisa de um arquivo de manifesto:

```json
{
  "name": "dare-stripe-integration",
  "version": "1.0.0",
  "description": "Padrões DARE para integração com Stripe Payments",
  "author": "Seu Nome <voce@email.com>",
  "license": "MIT",
  "dare_version": ">=3.0.0",
  "stacks": ["rails", "node"],
  "tags": ["payments", "stripe", "billing"],
  "gates": [
    {
      "name": "stripe-webhooks-verified",
      "command": "dare stripe audit-webhooks",
      "description": "Verifica que todos os webhooks têm verificação de assinatura"
    }
  ],
  "prompts": {
    "design": "prompts/design.md",
    "architect": "prompts/architect.md"
  }
}
```

## Fluxo de publicação

```
dare skill publish
  1. Valida dare-skill.json
  2. Roda dare skill test
  3. Empacota os arquivos
  4. Envia para registry.dare.dewtech.tech
  5. Gera URL pública de instalação
```

## Saída esperada

```
dare skill publish

Validando dare-stripe-integration...
✓ dare-skill.json válido
✓ Testes passando (8/8)
✓ Empacotando...

Publicando dare-stripe-integration@1.0.0...
✓ Publicado com sucesso!

Para instalar:
  dare skill add dare-stripe-integration

URL do registry:
  https://registry.dare.dewtech.tech/skills/dare-stripe-integration
```
