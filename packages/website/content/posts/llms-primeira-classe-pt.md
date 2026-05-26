---
title: "LLMs como cidadãos de primeira classe em DARE v3.0"
date: "2026-05-26"
author: "Wanderson Oliveira"
tags: ["dare", "llm", "metodologia", "ia", "arquitetura"]
excerpt: "Como o DARE v3.0 trata os Grandes Modelos de Linguagem não apenas como ferramentas de desenvolvimento, mas como componentes arquiteturais de primeira classe — com contratos, orçamentos de tokens e observabilidade."
lang: "pt-BR"
---

# LLMs como cidadãos de primeira classe em DARE v3.0

Quando a maioria dos times fala em "desenvolvimento assistido por IA", eles estão descrevendo uma prática simples: abrem o Claude ou o GPT, colam um problema, copiam a resposta. O LLM é uma ferramenta externa — útil, poderosa, mas completamente fora do modelo mental de como o software é construído.

O DARE v3.0 muda isso. Em vez de tratar LLMs como ferramentas de suporte ao desenvolvimento, o método os eleva ao status de **cidadãos de primeira classe** — tanto no processo de construção quanto na arquitetura do produto resultante.

## O problema com a abordagem atual

Imagine que você está construindo um produto que usa IA para classificar documentos legais. O fluxo típico hoje:

1. Você abre o Claude
2. Digita "classifique este documento como X, Y ou Z"
3. Recebe uma resposta
4. Cola em algum lugar no código

O que vai acontecer quando você precisar:
- Entender por que um documento específico foi classificado errado?
- Trocar o Claude pelo GPT-4 sem reescrever metade do sistema?
- Limitar gastos quando o volume escalar de 100 para 100.000 documentos/dia?
- Auditar todas as decisões de classificação para um processo judicial?

A resposta honesta é: você não consegue, ou consegue com muito sofrimento, porque o LLM foi tratado como uma caixa preta colada ad-hoc no sistema.

## O que "cidadão de primeira classe" significa no DARE

No DARE v3.0, um LLM integrado ao produto segue o mesmo rigor de qualquer outro componente arquitetural — um banco de dados, uma fila de mensagens, uma API externa. Isso se manifesta em três dimensões:

### 1. Contratos tipados (Prompt Templates)

Prompts não são strings mágicas. São contratos com entradas tipadas, saídas validadas e versionamento semântico.

```ruby
class ClassifyLegalDocumentPrompt < Dare::Prompt::Base
  param :document_text, type: String
  param :document_type,  type: String, enum: %w[contract petition ruling]
  param :jurisdiction,   type: String, default: "BR"

  output_schema do
    field :category,    type: String, enum: %w[civil criminal administrative]
    field :confidence,  type: Float,  min: 0.0, max: 1.0
    field :reasoning,   type: String
  end

  template <<~PROMPT
    You are a legal document classifier for Brazilian law.

    Document type: {{document_type}}
    Jurisdiction: {{jurisdiction}}

    Classify the following document as civil, criminal, or administrative.
    Respond in JSON following the schema exactly.

    Document:
    {{document_text}}
  PROMPT
end
```

O schema de output é validado automaticamente. Se a resposta não respeitar o contrato, o `dare-llm-integration` gate reprovará a task antes de ela ser marcada como DONE.

### 2. Orçamento de tokens

Tokens custam dinheiro. O DARE trata o orçamento de tokens como uma restrição arquitetural de primeira classe, configurada em `.dare/config.json`:

```json
{
  "skills": {
    "dare-llm-integration": {
      "token_budget": {
        "per_request_max": 4096,
        "per_day_max": 500000,
        "alert_at_percent": 80,
        "hard_limit": true
      }
    }
  }
}
```

Com `hard_limit: true`, o sistema recusa chamadas que ultrapassariam o orçamento diário — em vez de deixar estourar a fatura no final do mês.

### 3. Observabilidade end-to-end

Cada chamada a um LLM no DARE é automaticamente rastreada com OpenTelemetry:

```ruby
# Trace automático via dare-llm-integration + dare-quality-telemetry
result = Dare::LLM.call(
  prompt: ClassifyLegalDocumentPrompt.new(
    document_text: doc.text,
    document_type: doc.type
  ),
  model: "claude-sonnet-4-6"
)

# No seu dashboard de traces:
# span: llm.call
#   model: claude-sonnet-4-6
#   prompt_tokens: 842
#   completion_tokens: 156
#   latency_ms: 1240
#   cache_hit: false
#   document_type: contract
#   jurisdiction: BR
```

## Como o DARE v3.0 usa LLMs no próprio método

A habilidade mais poderosa do DARE v3.0 é usar esses mesmos padrões para o processo de desenvolvimento em si.

Nas fases DESIGN e ARCHITECT, o CLI injeta prompts contextuais que incluem:
- O `llms.txt` do projeto (gerado pelo `dare-ax`)
- As skills ativas e seus padrões
- O histórico de decisões arquiteturais (BLUEPRINT.md anterior)

Isso significa que a IA que gera seu próximo BLUEPRINT não parte do zero — ela conhece o contexto acumulado do projeto, os padrões que você já adotou, e as restrições que você estabeleceu.

```bash
dare blueprint DARE/DESIGN.md
# Contexto carregado:
#   llms.txt — 3.2k tokens
#   skills: dare-layered-design, dare-llm-integration, dare-ax
#   BLUEPRINT anterior: 8 decisions indexadas
#   Gerando BLUEPRINT.md...
```

## O Ralph Loop e a autocorreção de prompts

Um aspecto pouco discutido do Ralph Loop é que ele também corrige prompts.

Se um teste de regressão falha porque o output de um LLM mudou de formato, o Ralph Loop:

1. Detecta a falha no gate de schema validation
2. Analisa a diferença entre o output esperado e o recebido
3. Propõe um ajuste no template de prompt
4. Re-executa até o gate passar

Isso transforma prompts de artefatos frágeis em componentes resilientes que evoluem junto com o sistema.

## Conclusão

Tratar LLMs como cidadãos de segunda classe — ferramentas de suporte jogadas fora do modelo arquitetural — cria dívida técnica silenciosa que vai cobrar seu preço quando o sistema escalar.

O DARE v3.0 resolve isso trazendo os mesmos princípios de engenharia que aplicamos a bancos de dados, filas e APIs para a integração com LLMs: contratos tipados, orçamentos explícitos, observabilidade total.

O resultado é um sistema onde você sabe exatamente quanto cada feature custou em tokens, pode auditar cada decisão da IA, e pode trocar o modelo subjacente sem reescrever o código.

---

*Wanderson Oliveira é o criador do DARE Method e fundador da Dewtech Technologies. Para adotar o DARE no seu time, veja [dare.dewtech.tech](https://dare.dewtech.tech).*
