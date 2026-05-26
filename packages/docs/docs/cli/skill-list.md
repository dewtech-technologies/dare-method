---
title: dare skill list
description: Lista as skills instaladas no projeto atual
---

# dare skill list

Lista todas as skills instaladas no projeto atual com versão e status.

## Sintaxe

```bash
dare skill list [options]
```

## Exemplos

```bash
# Listar todas as skills instaladas
dare skill list

# Saída em JSON
dare skill list --json

# Incluir skills desativadas
dare skill list --all

# Verificar atualizações disponíveis
dare skill list --check-updates
```

## Saída padrão

```
dare skill list

Skills instaladas em myapp/
============================
  dare-ax                  1.4.0  ✓ ativo
  dare-layered-design      2.1.0  ✓ ativo
  dare-llm-integration     1.2.0  ✓ ativo   → 1.3.0 disponível
  dare-frontend-design     1.0.3  ✓ ativo
  dare-realtime            0.9.1  ✓ ativo
  dare-quality-telemetry   1.1.0  ✓ ativo

6 skills · dare:metrics 100%
```

## Saída JSON

```json
{
  "skills": [
    {
      "name": "dare-ax",
      "version": "1.4.0",
      "status": "active",
      "gates": ["accessibility"],
      "latest": "1.4.0"
    }
  ],
  "total": 6,
  "metrics_coverage": 100
}
```
