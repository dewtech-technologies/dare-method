# RFC-002: Provider-Agnostic Agent Mode (BYO-LLM)

> **Status:** Draft / Proposed
> **Date:** 2026-06-11
> **Author:** Wanderson Leandro (Dewtech Technologies)
> **Target:** v3.12.0 (MVP) — candidato a marco **4.0**
> **License:** MIT (D-001)
> **Builds on:** RFC-001 (`AgentDriver`, D-002) — generaliza o driver para qualquer provedor de LLM.

---

## 1. Resumo

Hoje o DARE opera em **meio-modo**: o CLI faz a parte **determinística** (ex.: `dare reverse` escaneia
o código sem LLM) e a **parte de IA** é delegada à **skill da IDE** (Claude Code / Cursor / Antigravity),
que usa o modelo da IDE para raciocinar sobre os fatos determinísticos. Isso acopla o valor de IA do
DARE a uma IDE agêntica.

Este RFC propõe um **segundo caminho, opt-in e provider-agnostic**: o dev instala o `dare-cli`, configura
acesso a um provedor de LLM (**Anthropic, OpenAI, Gemini ou Bedrock**) e executa os comandos com `--agent`
— o CLI passa a fazer **as duas metades** (determinística + IA), **sem depender da IDE**. É a
generalização do `AgentDriver` do `dare execute --agent` (RFC-001) para uma abstração **`LlmProvider`**
multi-fornecedor, aplicada aos comandos que hoje têm uma "metade de IA".

**Não é migração — é dual-mode.** A skill da IDE continua existindo (UX interativa, modelo da IDE); o CLI
ganha **independência de IDE** (headless, CI, qualquer editor).

## 2. Motivação

- **Independência de IDE = adoção.** Hoje a metade de IA depende de uma IDE agêntica. Um CLI
  provider-agnostic roda **headless, em CI, em qualquer editor, sem agente** — destravando um público
  grande e fechando o funil open-core (o `dare guard`/`review`/`drift` em CI já é headless; falta a
  metade de IA dos comandos de análise).
- **Neutralidade de fornecedor (anti-lock-in).** Empresas com contrato AWS (Bedrock) ou OpenAI/Gemini
  podem usar o DARE com o provedor que já pagam.
- **A fundação já existe.** RFC-001 estabeleceu `AgentDriver` + SDK como `optionalDependency` lazy
  (D-002). Este RFC só **generaliza** isso para N provedores e N comandos.
- **Grounding melhor.** A saída determinística (scan do `reverse`, grafo, patterns) vira o **contexto
  factual** enviado ao provedor — menos alucinação (design facts-first que o GraphRAG já favorece).

## 3. Conceito central — dual-mode

| Modo | Quando | Quem dirige o LLM | Custo |
|------|--------|-------------------|-------|
| **Skill da IDE** (atual) | interativo, humano no loop | modelo da IDE | assinatura da IDE |
| **CLI + provider** (este RFC) | headless, CI, autônomo | provedor configurado (BYO-LLM) | conta do dev no provedor |

Os dois **coexistem**. As skills `/dare-*` permanecem (e o contrato de paridade nas 3 IDEs continua válido).

## 4. Preservação do core determinístico (D-002 escala, não quebra)

> **Invariante:** o motor de decisão (DAG, gates, decay, guard) permanece **100% determinístico e
> LLM-free**. A parte determinística de cada comando (`reverse`/`dna`/`patterns` scan) **roda sempre**.
> O LLM entra **apenas** atrás da abstração `LlmProvider`, **opt-in via `--agent`**, e **só enriquece**
> a saída determinística — nunca substitui o motor.

O teste de arquitetura `no-llm-in-core` (RF da RFC-001) é **estendido**: nenhum provider SDK pode ser
importado fora de `src/providers/<vendor>.ts`.

## 5. Proposta

### 5.1 Abstração `LlmProvider` (D-004)

```ts
export interface LlmRequest {
  readonly system: string;
  readonly facts: string;           // saída determinística (grounding)
  readonly task: string;
  readonly maxTokens?: number;
  readonly signal: AbortSignal;
}
export interface LlmResponse { readonly text: string; readonly usage: TokenUsage; }

export interface LlmProvider {
  readonly id: 'anthropic' | 'openai' | 'gemini' | 'bedrock' | 'mock';
  complete(req: LlmRequest): Promise<LlmResponse>;
}
```

- **Adapters** em `src/providers/{anthropic,openai,gemini,bedrock}.ts` — cada um o **único** arquivo
  autorizado a `import()` o SDK do respectivo vendor, **lazy** e como **`optionalDependency`** (D-002).
- `mock` provider determinístico no core (para `--dry-run` e testes — espelha o `mockDriver`).
- `resolveProvider(config)` carrega o adapter lazy; `ProviderMissingError` acionável se o SDK não estiver
  instalado.
- `TokenUsage` reusa o tipo da RFC-001 (telemetria de custo no GraphRAG já existe).

### 5.2 Config — bloco `ai` em `dare.config.json`

```jsonc
"ai": {
  "enabled": false,
  "provider": "anthropic",          // anthropic | openai | gemini | bedrock
  "model": "claude-sonnet-4-5",
  "apiKeyEnv": "ANTHROPIC_API_KEY",  // nome da env var (a key NUNCA no arquivo)
  "baseUrl": null,                   // opcional (proxies)
  "bedrock": { "region": "us-east-1" } // Bedrock usa IAM/região, não apiKey
}
```

### 5.3 `--agent` nos comandos com "metade de IA"

```bash
dare reverse  --agent [--provider <p>] [--model <m>]   # scan determinístico + enriquecimento IA
dare dna      --agent ...
dare design   --agent ...
dare patterns --agent ...
dare review   --agent ...   # veredito semântico (hoje opt-in via agent externo)
dare migrate  --agent ...
```

- **Sem `--agent`:** comportamento atual (só determinístico). **Compat total.**
- **Com `--agent` e `ai.enabled`:** roda o determinístico, monta `facts`, chama `provider.complete`,
  funde o resultado. Sem provider instalado/configurado → `ProviderMissingError` (ou degrada para
  só-determinístico com aviso, conforme `ai.onMissing`).
- Custo gravado no GraphRAG (telemetria v3.9.0 reusada).

### 5.4 Como as duas metades se compõem (facts-first)

```
comando --agent
  → parte determinística (scan/grafo/patterns)  ── SEMPRE
  → monta `facts` (saída determinística como contexto grounded)
  → provider.complete({ system, facts, task })  ── opt-in
  → funde: determinístico = âncora; IA = enriquecimento marcado como inferido
```

A saída marca claramente o que é **fato determinístico** vs **inferência do LLM** (herda o padrão de
confiança 🟢/🟡/🔴 do `dare patterns`).

## 6. Segurança

| ID | Requisito | Mapeamento |
|----|-----------|------------|
| RS-01 | API key **só via env** (`apiKeyEnv`); nunca no `dare.config.json` nem em log | A05/A02 |
| RS-02 | Bedrock via **IAM/SigV4** (cadeia de credenciais AWS), não key estática | A05 |
| RS-03 | Key/credencial **nunca logada** (redação no logger) | A09 |
| RS-04 | `facts` enviados ao provedor **sanitizados** (sem `.env`/segredo do repo) | A03/A09 |
| RS-05 | Provider SDK só em `src/providers/<vendor>.ts` (gate `no-llm-in-core` estendido) | A03; D-002 |
| RS-06 | Aviso explícito de **custo** (tokens vão para a conta do dev) | transparência |

## 7. Alternativas consideradas

- **Manter só a skill da IDE.** Rejeitado: trava adoção a IDEs agênticas; impede headless/CI da metade de IA.
- **Acoplar a um único provedor (só Anthropic).** Rejeitado: lock-in; empresas com Bedrock/OpenAI ficam de fora.
  A abstração `LlmProvider` custa pouco a mais e abre o mercado.
- **Provider SDKs como `dependencies` duras.** Rejeitado: forçaria todo usuário do CLI determinístico a
  baixar 4 SDKs. `optionalDependency` lazy por adapter (D-002/D-004).
- **Substituir as skills da IDE.** Rejeitado: dual-mode — as skills são a UX interativa e o contrato de paridade.

## 8. Riscos e trade-offs

- **Abstração de provider vaza.** Tool-use, streaming, contagem de tokens e **auth** diferem por vendor
  (Bedrock = IAM/SigV4, o mais distinto). Mitigação: contrato `LlmProvider` mínimo (completion + usage)
  na v1; tool-use avançado fica fora do MVP.
- **Custo migra para o dev.** Tokens na conta dele. Mitigação: RS-06 (aviso) + reuso do `--budget-tokens`.
- **Paridade de qualidade entre provedores.** O mesmo prompt rende diferente por modelo. Mitigação:
  `facts`-first reduz variância; testes por adapter com fixtures.
- **Superfície de manutenção** (4 adapters). Mitigação: contrato fino; adapters são casca sobre o SDK.

## 9. Plano de implementação (faseado)

**Fase 1 — Abstração + 1 provedor (v3.12.0)**
- `LlmProvider` + `mock` + adapter **anthropic** (lazy/optionalDep); bloco `ai`; `no-llm-in-core` estendido.
- `dare reverse --agent` como primeiro comando (prova o padrão end-to-end).

**Fase 2 — Multi-provedor**
- Adapters **openai**, **gemini**, **bedrock** (este com IAM/região).
- `--provider`/`--model` override; telemetria de custo por provedor.

**Fase 3 — Cobertura de comandos**
- `--agent` em `dna`, `design`, `patterns`, `review` (semântico), `migrate`.
- Marca fato-vs-inferência consistente (🟢/🟡/🔴).

**Fase N-1 — Auditoria**
- Gate de arquitetura (SDK confinado por vendor); key nunca logada; degradação graciosa sem provider;
  paridade de contrato entre adapters.

## 10. Questões em aberto

- [ ] Nome da flag: `--agent` (consistente com `execute`) vs `--ai` (mais explícito p/ comandos de análise)?
- [ ] `ai.onMissing`: `error` (falha) vs `degrade` (cai para determinístico com aviso) — qual default?
- [ ] Tool-use/function-calling no MVP ou só completion? (proposta: só completion na v1).
- [ ] Streaming de saída no CLI (UX) — v1 ou depois?
- [ ] Bedrock: suportar só Anthropic-via-Bedrock ou também Titan/Llama? (proposta: Claude-via-Bedrock primeiro).
- [ ] Isso é o marco **4.0** (mudança de posicionamento: "DARE roda sozinho, BYO-LLM") ou uma 3.12 incremental?

## 11. Referências

- `docs/rfcs/RFC-001-secure-autonomous-executor.md` — `AgentDriver` e D-002 (fundação).
- `claude-api` skill — referência de modelos/SDK Anthropic.
- DESIGN-Feature-secure-autonomous-executor.md — padrão de driver lazy + telemetria de custo.
