---
title: dare skill add
description: Instala uma skill DARE no projeto atual
---

# dare skill add

Instala uma skill no projeto atual, baixando do registry e configurando automaticamente.

## Sintaxe

```bash
dare skill add <skill-name> [options]
```

## Exemplos

```bash
# Instalar skill oficial
dare skill add dare-llm-integration

# Instalar versão específica
dare skill add dare-ax@1.3.0

# Instalar skill do registry da comunidade
dare skill add @minhacomunidade/dare-stripe-integration

# Instalar múltiplas skills de uma vez
dare skill add dare-ax dare-layered-design dare-realtime
```

## Options

| Flag | Descrição |
|------|-----------|
| `--no-configure` | Instala sem rodar setup interativo |
| `--force` | Reinstala mesmo se já estiver instalada |
| `--dry-run` | Mostra o que seria instalado sem instalar |

## O que acontece na instalação

1. Baixa o pacote do registry
2. Copia prompts especializados para `.dare/skills/<nome>/`
3. Registra validation gates em `.dare/config.json`
4. Executa `dare skill configure <nome>` interativo (se aplicável)
5. Atualiza `llms.txt` do projeto

## Saída esperada

```
dare skill add dare-llm-integration

Downloading dare-llm-integration@1.2.0...
✓ Prompts instalados em .dare/skills/dare-llm-integration/
✓ Gate 'llm-audit' registrado
✓ llms.txt atualizado

dare-llm-integration configurado com sucesso.
Execute 'dare skill list' para ver todas as skills ativas.
```
