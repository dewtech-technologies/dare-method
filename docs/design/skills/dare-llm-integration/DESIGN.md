# DESIGN.md — Skill `dare-llm-integration` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-llm-integration` codifica **padrões de integração com LLMs** (Large Language Models) como skill transversal.

Define como aplicações DARE devem:
- Chamar APIs de LLM (OpenAI, Anthropic, etc.)
- Gerenciar custos e rate limits
- Implementar caching e batch processing
- Tratar erros e fallbacks
- Monitorar latência e token usage
- Documentar prompts e schema de entrada/saída

LLMs deixam de ser "efeito especial" e viram **cidadão de primeira classe** da arquitetura, com padrões previsíveis e testáveis.

---

## 2. Problema que Resolve

### 2.1 O gap atual

Integrações com LLM hoje são ad-hoc:
- Chamadas de API inline no Handler ou Service
- Prompt engineering por "trial and error"
- Nenhum caching — mesma pergunta chamada 10x por dia
- Rate limit "descoberto" em produção (surpresa)
- Nenhum fallback se LLM falhar
- Custo descontrolado (ninguém sabe quanto gastou)

### 2.2 Sintomas

1. Latência de feature cresce cada semana (LLM chama ficam lentas)
2. Bill de API cresce sem motivo aparente
3. Falhas cascata quando LLM API cai
4. Prompt muda a cada deploy (inconsistência)
5. Testing é impossível (mock de LLM é manual)

### 2.3 Raiz

**Falta abstração:** LLM é tratado como black box chamada diretamente de Service. Não existe contrato, não existe cache, não existe monitoramento.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | LLM como injeção de dependência | Services não chamam `openai.ChatCompletion()` direto; recebem interface LLMProvider injetada |
| RF-02 | Suporte a múltiplos provedores | Mesma interface funciona com OpenAI, Anthropic, local llama-cpp, fallback dummy |
| RF-03 | Caching obrigatório | Responses de LLM cacheadas por (model, prompt_hash) durante TTL configurável |
| RF-04 | Rate limit respeitado | Requests para LLM respeitam limite de requisições por segundo; excesso é queued |
| RF-05 | Monitoramento de token usage | Registra tokens consumidos por request para billing |
| RF-06 | Streaming suportado | LLMs com streaming (token-by-token) são suportados via iterador ou callback |
| RF-07 | Fallback configurável | Se LLM falha, aplicação define comportamento: retry, return cached, ou error |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Zero lock-in vendor | Trocar de OpenAI para Anthropic é mudança de config, não código |
| RNF-02 | Latência previsível | Tempo de response não varia >50% entre requests (cache hit vs. miss é esperado) |
| RNF-03 | Custo controlável | Cada request LLM é registrado; dashboard mostra custo por feature |
| RNF-04 | Offline capability | Aplicação funciona em modo degradado se LLM indisponível (com fallback documentado) |
| RNF-05 | Batch processing | Múltiplos requests LLM podem ser batched para economia de API calls |
| RNF-06 | Testabilidade 100% | Testes conseguem usar LLM fake sem rede |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | Nenhum secret em prompt | API keys, senhas, PII nunca em prompt text — sempre como parâmetro |
| RS-02 | Prompt injection defense | User input sanitizado antes passar para LLM; prompt templates escapados |
| RS-03 | Output validation | Resposta de LLM sempre validada contra schema antes usar (LLM mente) |
| RS-04 | Rate limit por user | Se aplicação é multi-tenant, cada user tem quota separada de LLM requests |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Desenvolvedor** | Chamada simples: `llm.complete(prompt).await` |
| **DevOps** | Monitoramento de custo e usage por feature |
| **CFO** | Bill de API previsível; controle de gasto |
| **Agente de código** | Consegue gerar prompts seguindo padrão |
| **Produto** | Feature com LLM não degrada performance quando API falha |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias):**

- **M-01**: 100% de chamadas LLM vêm via LLMProvider injetado (nenhuma chamada direta de SDK)
- **M-02**: 100% de responses LLM são cacheadas (cache hit rate > 40% na semana 1)
- **M-03**: 100% de requests LLM têm rate limit respeitado (zero 429s em 7 dias)
- **M-04**: 100% de respostas LLM são validadas contra schema antes usar

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | LLM SDK direto em Handler | `const response = await openai.createChatCompletion(...)` no handler. Untestable |
| AP-02 | Sem cache | Mesma pergunta chamada N vezes por dia. Custo explode |
| AP-03 | Prompt em código | Prompt hardcoded em string. Muda a cada refactor; versionamento impossível |
| AP-04 | User input direto em prompt | `"Summarize: " + user_text`. Prompt injection vector |
| AP-05 | Trusting LLM output sem validação | LLM retorna JSON — assumir que é válido. Pode ser garbage |
| AP-06 | Nenhum retry logic | LLM timeout? Aplicação falha. Deveria retry com backoff |
| AP-07 | Síncrono sem timeout | `await llm.complete()` sem timeout. Hung forever se API lenta |
| AP-08 | Nenhum fallback | LLM falha? Feature quebra. Deveria ter fallback (cached response, default, etc.) |
| AP-09 | Custo invisível | Ninguém sabe quanto se gastou. Surprise na bill |
| AP-10 | Mixing prompt concerns | Prompt de user + context de app + instructions juntas. Difícil manter |

---

## 9. Decisões Arquiteturais

### ADR-01: LLMProvider como Abstração Central

**Decisão:** Toda chamada LLM passa por interface `LLMProvider`:

```typescript
interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(request: EmbedRequest): Promise<EmbeddingResponse>;
  // ... outros métodos
}

class OpenAIProvider implements LLMProvider { ... }
class AnthropicProvider implements LLMProvider { ... }
class LocalLlamaProvider implements LLMProvider { ... }
class DummyProvider implements LLMProvider { ... } // para testes
```

Services recebem `LLMProvider` injetado; nunca instantiam direto.

**Racional:** Trocar provider é mudança de config. Testes usam DummyProvider. Múltiplos provedores em paralelo (fallback).

**Consequências:**
- Cada provider implementa interface comum (não é 1:1 com SDK)
- Deve-se normalizar quirks de cada API

---

### ADR-02: Caching via (model, prompt_hash, version)

**Decisão:** Toda resposta LLM é cacheada com chave `hash(model + prompt + schema_version)`. TTL por feature (ex: 24h para summarization, 1h para real-time).

```python
cache_key = hash(f"{model}:{prompt_hash}:{output_schema_version}")
cached = await cache.get(cache_key)
if cached:
    return cached
response = await llm_provider.complete(prompt)
await cache.set(cache_key, response, ttl=config.ttl)
return response
```

**Racional:** Reduz custo drasticamente; resposta é determinística (mesmo prompt = mesmo output).

**Consequências:**
- Cache invalidation strategy necessária (versioning)
- Cache storage (Redis, memcached, DynamoDB)
- Cache hit rate é métrica importante

---

### ADR-03: Prompt Templates com Versioning

**Decisão:** Prompts nunca hardcoded em código. Sempre em templates versionados:

```
src/
├── llm/
│   ├── prompts/
│   │   ├── summarize_v1.jinja2    # "Summarize the following text: {text}"
│   │   ├── summarize_v2.jinja2    # "Write a concise summary (max 50 words):\n{text}"
│   │   └── ...
│   └── prompt_loader.py           # Versioning + template rendering
```

Ao mudar prompt (melhorar qualidade), versiona como v2. Cache de v1 fica intacto.

**Racional:** Rastreabilidade; A/B testing possível; rollback fácil.

**Consequências:**
- Infra de template management
- Versionamento de prompts com SemVer

---

### ADR-04: Rate Limit via Token Bucket

**Decisão:** Implementar token bucket com limite por segundo (ex: 10 req/sec para model X):

```python
class RateLimiter:
    def __init__(self, rps: int):  # req per second
        self.bucket = TokenBucket(capacity=rps, refill_rate=rps/1000)
    
    async def acquire(self):
        while not self.bucket.take(1):
            await asyncio.sleep(0.01)  # backoff
```

Services não precisam saber de rate limit; `LLMProvider` trata transparente.

**Racional:** Evita 429s da API; backoff automático.

**Consequências:**
- Adição de latência sob alta concorrência (esperado)
- Necessário tuning por modelo

---

### ADR-05: Output Validation com Schema

**Decisão:** Se LLM deveria retornar JSON, validar com JSON Schema:

```typescript
const schema = {
  type: "object",
  properties: {
    summary: { type: "string", maxLength: 200 },
    keywords: { type: "array", items: { type: "string" } }
  },
  required: ["summary", "keywords"]
};

const response = await llmProvider.complete(prompt);
const validated = validateSchema(response, schema);
if (!validated.ok) throw new OutputValidationError(validated.errors);
return validated.data;
```

LLM mente? Vai falhar validação; aplica fallback.

**Racional:** Não assume LLM sempre correto. Robusto para edge cases.

**Consequências:**
- Overhead de validação (~1-5ms)
- Fallback necessário (retry com temperature maior, cached response, etc.)

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Cache fica stale (prompt muda, cache não invalida) | **Alta** | Versioning de prompts; cache key inclui version |
| LLM API rate limit nos pega | **Média** | Token bucket implementado; monitoramento de 429s |
| Output validation falha em ~5% dos casos | **Média** | Fallback strategy (retry, return cached, return default) |
| Custo explode em produção | **Alta** | Limite por user/feature; dashboard de custo real-time |
| Prompt injection attack via user input | **Alta** | Template escaping; input validation antes passar ao LLM |
| Multiple providers em paralelo = overhead | **Baixa** | Usar só fallback provider se primary falha (não paralelo) |

---

## 11. Dependências

### Externas
- **OpenAI API**: ChatCompletion, Embeddings endpoints
- **Anthropic API**: Claude messages, batch processing
- **JSON Schema spec (2020-12)**: validação de output
- **OpenTelemetry**: observability (optional but recommended)

### Internas
- **dare-ax**: OpenAPI documenta endpoints LLM da aplicação
- **dare-quality-telemetry**: monitora M-01 a M-04
- **dare-layered-design**: LLMProvider é dependency injected em Services
- Stacks filhas: `dare-rails-llm-integration` v1.1, etc.

---

## 12. Fora de Escopo

- Fine-tuning de modelos (entra em v2.0+)
- Retrieval-Augmented Generation (RAG) complexo (entra em skill `dare-rag` v1.0 futuro)
- Agents com loop de reasoning (entra em skill `dare-agents` v1.0 futuro)
- Image generation/vision (entra em `dare-vision` v1.0)
- Audio processing (entra em `dare-audio` v1.0)

---

## 13. Roadmap Pós v1.0

### v1.1 — `dare-rails-llm-integration` (Rails 8, integrado)

Rails-specific:
- `app/llm/` com `providers/`, `prompts/`, `validators/`
- Integração com Rails cache (Redis, Memcached)
- Rate limiter usando `rack-attack` ou custom
- Generators: `rails generate dare:llm:provider openai`
- Exemplo: novo projeto Rails com LLM feature scaffold

**Entrega esperada:** semana 2-3 do plano 30 dias

---

### v1.2 — `dare-python-llm-integration` (FastAPI/Django)

Python specifics:
- `llm/providers/`, `prompts/`, `validators/`
- Integração com `cachetools`, `async` patterns
- Pydantic para validação de output
- Rate limiter com `ratelimit` library

**Entrega esperada:** semana 3-4

---

### v1.3 — `dare-node-llm-integration` (NestJS/Express)

Node specifics:
- TypeScript-first
- Integração com `node-cache`, Redis via `ioredis`
- Rate limiter com `express-rate-limit`
- Zod para validação de output

**Entrega esperada:** semana 4 ou month 2

---

### Future (v2.0+)

- Batch processing (OpenAI Batch API)
- Vision support (image generation, analysis)
- RAG framework (vector DB integration)
- Custom model fine-tuning orchestration
- Cost attribution (per user, per feature)

---

## Apêndice A: Estrutura de Pastas Padrão DARE

```
src/
├── llm/
│   ├── providers/
│   │   ├── llm_provider.ts         # Interface
│   │   ├── openai_provider.ts
│   │   ├── anthropic_provider.ts
│   │   ├── local_llama_provider.ts
│   │   └── dummy_provider.ts       # For tests
│   ├── prompts/
│   │   ├── summarize_v1.jinja2
│   │   ├── summarize_v2.jinja2
│   │   ├── prompt_loader.ts
│   │   └── llms.txt (descrição do prompt schema)
│   ├── validators/
│   │   ├── summarize_output_schema.json
│   │   └── validator.ts
│   ├── cache/
│   │   └── llm_cache.ts            # Wrapper ao redor de Cache
│   ├── rate_limit/
│   │   └── token_bucket.ts
│   ├── config.ts                   # Provider selection, rate limits, TTLs
│   └── llms.txt                    # Documentation of all LLM features
├── services/
│   ├── summarize_service.ts        # Uses LLMProvider
│   └── ...
└── ...
```

---

## Apêndice B: Complete Example (TypeScript/NestJS)

```typescript
// llm/providers/llm_provider.ts
export interface CompletionRequest {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  text: string;
  tokensUsed: { input: number; output: number };
  cached: boolean;
}

export interface LLMProvider {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

// llm/providers/openai_provider.ts
export class OpenAIProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private cache: Cache,
    private rateLimiter: RateLimiter,
    private logger: Logger
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    // Check cache
    const cacheKey = this.getCacheKey(req);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.info(`Cache hit for ${cacheKey}`);
      return { ...cached, cached: true };
    }

    // Rate limit
    await this.rateLimiter.acquire();

    // Call API
    this.logger.info(`Calling OpenAI: model=${req.model}, tokens_est=${req.maxTokens}`);
    const response = await this.callOpenAI(req);

    // Cache result
    await this.cache.set(cacheKey, response, this.getTTL(req.model));

    // Log usage
    this.logger.info(`OpenAI usage: input=${response.tokensUsed.input}, output=${response.tokensUsed.output}`);

    return { ...response, cached: false };
  }

  private getCacheKey(req: CompletionRequest): string {
    const promptHash = crypto
      .createHash("sha256")
      .update(req.prompt)
      .digest("hex")
      .substring(0, 16);
    return `llm:${req.model}:${promptHash}`;
  }

  private getTTL(model: string): number {
    return 24 * 60 * 60; // 24 hours default
  }

  private async callOpenAI(req: CompletionRequest): Promise<CompletionResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: req.model,
        messages: [{ role: "user", content: req.prompt }],
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens,
      }),
    });

    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      tokensUsed: {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
      },
    };
  }
}

// services/summarize_service.ts
@Injectable()
export class SummarizeService {
  private schema = summaryOutputSchema; // JSON Schema

  constructor(
    @Inject("LLM_PROVIDER") private llmProvider: LLMProvider,
    private promptLoader: PromptLoader,
    private validator: Validator,
    private logger: Logger
  ) {}

  async summarize(text: string): Promise<Summary> {
    // Load prompt template
    const prompt = this.promptLoader.load("summarize", "v1", { text });

    // Call LLM (via provider, not directly)
    const response = await this.llmProvider.complete({
      model: "gpt-4",
      prompt,
      maxTokens: 150,
    });

    // Validate output
    const validated = this.validator.validate(
      JSON.parse(response.text),
      this.schema
    );
    if (!validated.ok) {
      this.logger.error(`Validation failed: ${validated.errors}`);
      throw new OutputValidationError(validated.errors);
    }

    return validated.data as Summary;
  }
}

// handlers/summarize_handler.ts
@Controller("api/v1/summarize")
export class SummarizeHandler {
  constructor(private summarizeService: SummarizeService) {}

  @Post()
  async create(@Body() req: SummarizeRequest): Promise<Summary> {
    return this.summarizeService.summarize(req.text);
  }
}
```

---

**Próximo passo:** Implementação via stacks filhas (Rails, Node, Python). Integração com platform TubeMind.
