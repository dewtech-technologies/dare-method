---
title: dare-layered-design
description: Skill de arquitetura hexagonal e layered design para o DARE Method
---

# dare-layered-design

Skill de **arquitetura em camadas** que aplica princípios hexagonais ao seu projeto, garantindo que a lógica de domínio permaneça pura e a infraestrutura seja intercambiável.

## Instalação

```bash
dare skill add dare-layered-design
```

## Arquitetura aplicada

A skill impõe a seguinte estrutura de camadas:

```
app/
├── domain/           ← lógica de negócio pura (sem dependências externas)
│   ├── entities/
│   ├── use_cases/
│   └── repositories/ ← interfaces (ports)
├── infrastructure/   ← implementações concretas (adapters)
│   ├── persistence/
│   ├── external_apis/
│   └── messaging/
└── interfaces/       ← entrypoints (HTTP, CLI, jobs)
    ├── http/
    ├── workers/
    └── graphql/
```

## Validation gate

```bash
# Verifica que domain/ não importa de infrastructure/
dare layered check

# Output:
# ✓ domain/ — 0 infraestrutura leaks
# ✓ use_cases/ — dependency direction correct
# ⚠ PaymentService imports StripeClient directly — move to adapter
```

## Comandos

```bash
# Verificar violações de camada
dare layered check

# Gerar adapter para serviço externo
dare layered new-adapter --service stripe --port PaymentGateway

# Visualizar dependências
dare layered graph
```

## Configuração

```json
{
  "skills": {
    "dare-layered-design": {
      "layers": ["domain", "infrastructure", "interfaces"],
      "strict_mode": true,
      "allow_internal_framework": ["ActiveRecord"],
      "fail_on_layer_violation": true
    }
  }
}
```
