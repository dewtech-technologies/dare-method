---
title: dare-llm-integration
description: Skill para integrar LLMs estruturadamente em projetos DARE
---

# dare-llm-integration

Skill com padrões estruturados para **embutir LLMs** no seu produto — não apenas usar IA para desenvolver, mas construir features que *usam* IA.

## Instalação

```bash
dare skill add dare-llm-integration
```

## Padrões incluídos

### Prompt Templates

Templates versionados com variáveis tipadas:

```ruby
# app/domain/prompts/summarize_document.rb
class SummarizeDocumentPrompt < Dare::Prompt::Base
  param :document_text, type: String
  param :max_words,     type: Integer, default: 150
  param :language,      type: String,  default: "pt"

  template <<~PROMPT
    Summarize the following document in {{language}},
    using at most {{max_words}} words:

    {{document_text}}
  PROMPT
end
```

### Retry Logic com Backoff Exponencial

```ruby
# Configurado automaticamente via dare-llm-integration
result = Dare::LLM.call(
  prompt: SummarizeDocumentPrompt.new(document_text: text),
  model: "claude-sonnet-4-6",
  max_retries: 3,
  timeout: 30
)
```

### Token Budgeting

```json
{
  "skills": {
    "dare-llm-integration": {
      "default_provider": "anthropic",
      "token_budget": {
        "per_request_max": 4096,
        "per_day_max": 100000,
        "alert_at_percent": 80
      },
      "cache_prompts": true
    }
  }
}
```

## Comandos

```bash
# Gerar novo prompt template
dare llm new-prompt SummarizeDocument

# Testar prompt com dados reais
dare llm test SummarizeDocument --input '{"document_text": "..."}'

# Ver uso de tokens hoje
dare llm usage

# Listar providers configurados
dare llm providers
```

## Validation gate

O gate verifica:

- Todos os prompts têm testes de regressão
- Nenhum prompt ultrapassa o token budget configurado
- Respostas têm schema de validação definido

```bash
dare llm audit
# ✓ 8 prompts com testes
# ✓ Token budget dentro do limite
# ⚠ DocumentClassifier — resposta sem schema de validação
```
