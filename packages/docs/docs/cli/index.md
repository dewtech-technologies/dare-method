---
title: CLI Reference
description: Referência completa dos comandos DARE CLI
---

# CLI Reference

O DARE CLI (`dare`) é o ponto de entrada central para todos os fluxos do método.

## Instalação rápida

```bash
npm install -g @dewtech/dare-cli
dare --version
```

## Comandos principais

| Comando | Descrição |
|---------|-----------|
| `dare new <nome>` | Cria novo projeto DARE |
| `dare init` | Inicializa DARE em projeto existente |
| `dare design <prompt>` | Inicia fase DESIGN |
| `dare blueprint` | Gera BLUEPRINT a partir do DESIGN |
| `dare review approve` | Aprova o blueprint (gate obrigatório) |
| `dare execute <task>` | Executa task com Ralph Loop |
| `dare status` | Status do projeto |
| `dare update` | Atualiza templates DARE no projeto |

## Comandos de skills

| Comando | Descrição |
|---------|-----------|
| [`dare skill add`](skill-add.md) | Instala uma skill |
| [`dare skill list`](skill-list.md) | Lista skills instaladas |
| [`dare skill publish`](skill-publish.md) | Publica skill no registry |
| [`dare skill registry`](skill-registry.md) | Gerencia o registry remoto |

## Flags globais

```
-v, --version    Versão do CLI
-h, --help       Ajuda
--verbose        Output detalhado
--no-color       Desabilita cores no output
--config <path>  Caminho alternativo para dare.config.json
```

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DARE_REGISTRY_URL` | URL do registry remoto (padrão: registry.dare.dewtech.tech) |
| `DARE_LLM_PROVIDER` | Provider LLM padrão (anthropic, openai) |
| `DARE_LLM_API_KEY` | API key do provider LLM |
| `DARE_LOG_LEVEL` | Nível de log (debug, info, warn, error) |
