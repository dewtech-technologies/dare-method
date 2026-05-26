---
title: Skill Registry
description: Registry remoto de skills DARE — pesquisa, autenticação e gerenciamento
---

# Skill Registry

O registry remoto do DARE é hospedado em **registry.dare.dewtech.tech** e serve como hub central para skills oficiais e da comunidade. O backend é uma Vercel Edge Function com cache global.

## Endpoints públicos

| Endpoint | Descrição |
|----------|-----------|
| `registry.dare.dewtech.tech` | Registry principal |
| `registry.dare.dewtech.tech/skills` | Lista todas as skills |
| `registry.dare.dewtech.tech/skills/<nome>` | Detalhes de uma skill |

## Comandos de registry

```bash
# Autenticar (necessário para publicar)
dare registry login

# Buscar skills
dare registry search payments

# Ver detalhes de uma skill
dare registry info dare-ax

# Listar skills mais populares
dare registry top

# Sair
dare registry logout
```

## Busca de skills

```bash
dare registry search "stripe payments"

# Resultados:
# dare-stripe-integration  1.2.0  ★ 4.8   Padrões para Stripe Payments
# dare-billing-saas        0.9.0  ★ 4.1   SaaS billing com Stripe + metered usage
```

## Configurar registry customizado

Para times que queiram um registry privado (on-premise ou Vercel):

```json
// .dare/config.json
{
  "registry": {
    "url": "https://registry.minhaempresa.com",
    "auth": {
      "token": "${DARE_REGISTRY_TOKEN}"
    }
  }
}
```

Ou via variável de ambiente:

```bash
export DARE_REGISTRY_URL=https://registry.minhaempresa.com
export DARE_REGISTRY_TOKEN=seu-token-aqui
```

## Hospedar seu próprio registry

O registry DARE é open source. Para hospedar na Vercel:

```bash
# Clone o registry template
git clone https://github.com/dewtech-technologies/dare-registry-template

# Deploy na Vercel
cd dare-registry-template
vercel deploy
```
