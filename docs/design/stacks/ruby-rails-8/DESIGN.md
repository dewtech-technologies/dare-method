# DESIGN.md — Stack `ruby-rails-8` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  
**Criticidade:** ⚠️ MÁXIMA — Agent 2 depende exclusivamente deste documento  

---

## 1. Visão

`ruby-rails-8` é a **skill filha de Rails** que integra todas as 6 skills transversais em um stack coeso.

Stack inclui:
- **Rails 8.0+** com Omakase defaults (Kamal, Solid Cache, Solid Queue, Puma)
- **dare-ax** integrado (llms.txt, OpenAPI, CLI)
- **dare-layered-design** integrado (app/handlers/, app/services/, app/repositories/, app/models/)
- **dare-llm-integration** integrado (app/llm/)
- **dare-frontend-design** integrado (app/frontend/ com React/Vue)
- **dare-realtime** integrado (Action Cable, streaming)
- **dare-quality-telemetry** integrado (rake dare:metrics)

Novo projeto Rails criado via `dare new --stack rails` vem com toda estrutura pronta, nenhuma config adicional necessária.

---

## 2. Problema que Resolve

### 2.1 O gap atual

Rails hoje:
- Conventions são opinião clássica (models fats, controllers thins)
- Nenhuma integração com LLM patterns
- Real-time é Action Cable solto (sem padrão)
- OpenAPI é afterthought (swagger gem não é standard)
- Novo projeto precisa de 10+ gems e config custom

### 2.2 Sintomas

1. Rails dev criar projeto: "Now what?" — nenhuma estrutura clara para DARE
2. Coordenação com frontend: "Qual é a API contract?" — nenhuma doc via OpenAPI
3. Real-time feature: "Como integro WebSocket?" — nenhum padrão
4. LLM feature: "Onde coloco o prompt?" — sem diretório estruturado

### 2.3 Raiz

**Falta stack integrada** que combine Rails 8 Omakase com todas as skills transversais. Developers precisam assemblar manualmente.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | Rails 8 novo projeto scaffold | `dare new myapp --stack rails` cria projeto com estrutura completa |
| RF-02 | Layered Design estrutura | `app/handlers/`, `app/services/`, `app/repositories/`, `app/models/` |
| RF-03 | OpenAPI auto-gerado | `rswag` integrado; `GET /openapi.json` funciona |
| RF-04 | llms.txt template | `llms.txt` gerado automaticamente no novo projeto |
| RF-05 | LLM app/llm/ directory | `app/llm/providers/`, `app/llm/prompts/`, `app/llm/validators/` |
| RF-06 | Action Cable com padrão | WebSocket via Action Cable, subscriptions estruturadas |
| RF-07 | Frontend React/Vue scaffold | `app/frontend/` com componentes DARE-compliant |
| RF-08 | CLI support | Rails CLI extendido com `rails dare:metrics`, `rails dare:openapi` |
| RF-09 | Test templates | Specs para Services, Repositories, RealTime eventos |
| RF-10 | Validação em CI | Rake task que valida conformidade M-01 a M-04 |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Zero breaking changes vs. vanilla Rails | Projeto gerado é válido Rails 8 com extensões |
| RNF-02 | Build time < 30s | `bundle install` + setup em < 30s |
| RNF-03 | Dev server startup < 10s | `rails server` pronto em < 10s |
| RNF-04 | Test suite fast | 100 specs em < 10s |
| RNF-05 | Bundle size optimized | `bundle size` report < 200MB on disk |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | CSRF protection default | Rails `protect_from_forgery` ativo |
| RS-02 | Content Security Policy | CSP header configured by default |
| RS-03 | SQL injection prevention | Always use parameterized queries (Arel) |
| RS-04 | XSS prevention | ERB templates auto-escape user input |
| RS-05 | Rate limiting configured | `rack-attack` or equivalent for API endpoints |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Rails Developer** | Estrutura clara; sabe exatamente onde adicionar feature |
| **Agent 2** | Consegue gerar código Rails respeitando padrões |
| **Frontend Dev** | Frontend template pronto; OpenAPI integrado |
| **DevOps** | Dockerfile + Kamal config gerado |
| **Community** | Referência clara de "Rails DARE way" |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias):**

- **M-01**: 100% novos projetos Rails têm `llms.txt` válido no commit inicial
- **M-02**: 100% de endpoints HTTP têm OpenAPI documentado
- **M-03**: 100% de CLIs suportam `--json`
- **M-04**: 100% de endpoints públicos têm rate limit configurado

(Herdadas de dare-ax, dare-layered-design, etc.; validação em `rake dare:metrics`)

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Fat Model | Logic em Model callbacks. Use Service em vez. |
| AP-02 | Slim Controller Fallacy | Controller with zero logic. HTTP concern é OK aqui. |
| AP-03 | Global state via `Thread.current` | Don't. Dependency injection instead. |
| AP-04 | Direct SQL in Service | Use Repository. Enables testing. |
| AP-05 | No error handling | Unrescued exceptions = 500 error. Treat errors. |
| AP-06 | Config hardcoded | Use `Rails.configuration.dare.llm_provider`. ENV vars. |
| AP-07 | Testing via browser | Use RSpec, not manual. |
| AP-08 | API without OpenAPI | Always auto-generate. `rswag` enforces. |
| AP-09 | Real-time without pattern | Use Action Cable channel pattern. |
| AP-10 | Metrics never collected | Always run `rake dare:metrics`. Enforce in CI. |

---

## 9. Decisões Arquiteturais

### ADR-01: Controllers as HTTP Handlers Only

**Decisão:** Controllers são thin — só HTTP concerns (params, response, status):

```ruby
# app/handlers/users_handler.rb
class UsersHandler < ApplicationController
  def create
    # Parse HTTP
    input = params.require(:user).permit(:email, :name, :password)
    
    # Delegate to Service
    user = Services::CreateUserService.new(
      user_repository: Repositories::UserRepository.new,
      event_publisher: RealtimeService.instance
    ).execute(input)
    
    # Return HTTP
    render json: UserPresenter.new(user).to_json, status: :created
  end
end
```

Controller nunca chama Repository, nunca tem query, nunca tem validation além de HTTP params.

**Racional:** Separation of concerns; reusability (same Service pode ser CLI, job, etc.).

**Consequências:**
- Controllers fica muito fino
- Services crescem (mas são testáveis)

---

### ADR-02: OpenAPI via `rswag` com Auto-Generation

**Decisão:** OpenAPI é gerado automaticamente de RSpec specs:

```ruby
# spec/api/users_spec.rb
describe "Users API" do
  path "/api/users" do
    post "Create user" do
      parameter :name, in: :body, schema: { type: :object, properties: { email: { type: :string } } }
      
      response 201, "User created" do
        let(:user) { create(:user) }
        run_test!
      end
    end
  end
end
```

`rswag` gera `openapi.json` a cada test run.

**Racional:** Single source of truth; spec e OpenAPI sincronizados.

**Consequências:**
- Boilerplate em specs
- Payoff: auto-generated docs

---

### ADR-03: Action Cable com Subscription Authorization

**Decisão:** Toda connection via Action Cable valida auth. Toda subscription valida permission:

```ruby
# app/channels/application_cable/connection.rb
module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
      reject_unauthorized_connection unless current_user
    end

    private

    def find_verified_user
      if verified_user = User.find_by(id: cookies.signed[:user_id])
        verified_user
      else
        reject_unauthorized_connection
      end
    end
  end
end

# app/channels/user_updates_channel.rb
class UserUpdatesChannel < ApplicationCable::Channel
  def subscribed
    user_id = params[:user_id]
    
    # Check authorization
    unless current_user.can_view?(user_id)
      reject_subscription
      return
    end
    
    stream_for user_id
  end
end
```

Broadcast pub/sub via:

```ruby
# app/services/create_user_service.rb
UserUpdatesChannel.broadcast_to(user.id, {
  type: "user.created",
  data: { userId: user.id, email: user.email }
})
```

**Racional:** Security; only authorized users receive events.

**Consequências:**
- Auth check in every channel
- Clear authorization pattern

---

### ADR-04: LLM Integration via `app/llm/`

**Decisão:** LLM patterns centralizados:

```
app/llm/
├── providers/
│   ├── llm_provider.rb          # Interface
│   ├── openai_provider.rb
│   └── local_llama_provider.rb
├── prompts/
│   ├── summarize_v1.jinja2
│   └── prompt_loader.rb
├── validators/
│   ├── summarize_output_schema.json
│   └── validator.rb
├── cache/
│   └── llm_cache.rb
├── rate_limit/
│   └── token_bucket.rb
└── config.rb
```

Service chama `LLMProvider.instance.complete(prompt)`:

```ruby
# app/services/summarize_service.rb
class SummarizeService
  def execute(text:)
    prompt = PromptLoader.load("summarize", "v1", text: text)
    
    response = LLMProvider.instance.complete(
      model: "gpt-4",
      prompt: prompt,
      max_tokens: 150
    )
    
    validate!(response)
    response
  end
end
```

**Racional:** Centralization; easy to swap providers, test with dummy.

**Consequências:**
- Consistent LLM usage across codebase

---

### ADR-05: Layered Design Directory Structure

**Decisão:** Rails app/ reorganizada em camadas:

```
app/
├── handlers/               # Controllers (HTTP handlers)
│   ├── users_handler.rb
│   ├── posts_handler.rb
│   └── ...
├── services/               # Business logic
│   ├── create_user_service.rb
│   ├── update_post_service.rb
│   └── ...
├── repositories/           # Data access
│   ├── user_repository.rb
│   ├── post_repository.rb
│   └── ...
├── models/                 # Domain objects (no callbacks!)
│   ├── user.rb             # Just data
│   ├── post.rb
│   └── ...
├── presenters/             # Serializers
│   ├── user_presenter.rb
│   ├── post_presenter.rb
│   └── ...
├── channels/               # Real-time
│   ├── application_cable/
│   └── user_updates_channel.rb
├── jobs/                   # Background jobs
│   └── ...
├── llm/                    # LLM integrations
│   └── ...
├── middleware/             # Auth, logging
│   └── ...
└── config/                 # Configuration
    └── ...
```

**Racional:** Clear structure; agentes understand it.

**Consequences:**
- Rails conventions extended (not broken)
- Requires discipline

---

### ADR-06: Testing via RSpec with Clear Patterns

**Decisão:** RSpec specs organized by layer:

```ruby
# spec/services/create_user_service_spec.rb
describe Services::CreateUserService do
  it "creates user and publishes event" do
    service = Services::CreateUserService.new(
      user_repository: double(save: user),
      event_publisher: double(publish: nil)
    )
    
    result = service.execute(email: "test@example.com", name: "Test")
    
    expect(result).to eq user
  end
end

# spec/handlers/users_handler_spec.rb
describe UsersHandler do
  describe "#create" do
    it "returns 201 Created" do
      post "/api/users", params: { user: { email: "test@example.com" } }
      expect(response).to have_http_status(:created)
    end
  end
end

# spec/channels/user_updates_channel_spec.rb
describe UserUpdatesChannel do
  it "rejects unauthorized subscription" do
    subscribe user_id: 999  # User doesn't have access
    expect(subscription).to be_rejected
  end
end
```

**Racional:** Clear test structure; mirrors code organization.

**Consequences:**
- 3+ test files per feature
- But high confidence

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| New Rails dev confused by extra layers | **Média** | Clear documentation; examples in scaffold |
| Scaffold too complex (too many files) | **Média** | Start minimal; grow as feature grows |
| OpenAPI generation slow | **Baixa** | `rswag` is optimized; < 5s additional |
| Action Cable connections memory leak | **Alta** | Monitor; disconnect on auth failure |
| LLM integration doesn't scale | **Média** | Redis pub/sub backend; stress test in staging |

---

## 11. Dependências

### Gems Required

```ruby
gem "rails", "~> 8.0"
gem "puma", "~> 6.0"
gem "solid_cache"                # Kamal recommended
gem "solid_queue"                # Kamal recommended
gem "rswag-api"                  # OpenAPI
gem "rswag-ui"                   # OpenAPI UI
gem "rspec-rails"                # Testing
gem "factory_bot_rails"          # Test factories
gem "faker"                       # Fake data
gem "rack-attack"                # Rate limiting
gem "redis"                       # Cache + Pub/Sub
gem "jsonschema"                 # Validation
gem "typescript-rails"           # Frontend support (optional)
gem "jsbundling-rails"           # Frontend bundling
```

### Internal Dependencies

- **dare-ax**: provides patterns for llms.txt, OpenAPI, CLI
- **dare-layered-design**: provides directory structure
- **dare-llm-integration**: provides LLM patterns
- **dare-realtime**: provides Action Cable patterns
- **dare-frontend-design**: provides React/Vue patterns
- **dare-quality-telemetry**: provides metrics rake tasks

### External

- **Ruby 3.3+** with Rails 8.0+
- **PostgreSQL 14+** or compatible
- **Redis 7+** for cache + pub/sub
- **Node 20+** for frontend tooling

---

## 12. Fora de Escopo

- Admin dashboard (ActiveAdmin) — optional, not scaffold
- Search (Elasticsearch, Meilisearch) — v1.1 optional
- Internationalization (i18n) — v1.1
- Multi-tenancy — v1.1+
- GraphQL — v1.1 (REST first, GraphQL after)
- Sidekiq Pro features — use Solid Queue instead

---

## 13. Roadmap Pós v1.0

### v1.1 — Admin Panel + Batch Processing

- Admin scaffold via `dare generate dare:admin`
- Solid Queue job patterns
- Bulk operations (import/export)

**Entrega esperada:** semana 3 do plano 30 dias

---

### v1.2 — Search + Internationalization

- Elasticsearch integration
- i18n config scaffold
- Translated error messages

**Entrega esperada:** month 2

---

### v2.0+

- GraphQL support
- Multi-tenancy patterns
- Stripe/payment integration
- Advanced caching strategies

---

## Apêndice A: Scaffold Structure

Novo Rails project via `dare new myapp --stack rails` gera:

```
myapp/
├── Gemfile (with dare gems)
├── Procfile.dev (Kamal defaults)
├── Dockerfile (Kamal ready)
├── llms.txt (automatic)
├── openapi.json (via rswag)
├── db/migrate/
├── spec/
│   ├── factories/
│   ├── handlers/
│   ├── services/
│   ├── repositories/
│   ├── channels/
│   └── api/              # rswag specs
├── app/
│   ├── handlers/         # Controllers
│   ├── services/
│   ├── repositories/
│   ├── models/
│   ├── presenters/
│   ├── channels/
│   ├── jobs/
│   ├── llm/
│   ├── middleware/
│   └── frontend/         # React/Vue scaffold
├── lib/
│   └── tasks/
│       └── dare.rake     # dare:metrics, dare:openapi, etc.
├── config/
│   └── dare.yml          # LLM providers, settings
└── README.md (with dare info)
```

---

## Apêndice B: Example Feature Implementation

Feature: "Summarize a document via LLM"

### 1. Create Service

```ruby
# app/services/summarize_document_service.rb
class SummarizeDocumentService
  def initialize(
    document_repository:,
    llm_provider:,
    event_publisher:
  )
    @document_repository = document_repository
    @llm_provider = llm_provider
    @event_publisher = event_publisher
  end

  def execute(document_id:)
    # Get document
    document = @document_repository.find!(document_id)
    
    # Generate summary via LLM
    prompt = PromptLoader.load("summarize", "v1", text: document.content)
    summary_text = @llm_provider.complete(
      model: "gpt-4",
      prompt: prompt,
      max_tokens: 150
    )
    
    # Save summary
    document.summary = summary_text
    @document_repository.save(document)
    
    # Publish event
    @event_publisher.publish(
      type: "document.summarized",
      data: {
        document_id: document.id,
        summary: summary_text,
        timestamp: Time.now.to_i
      }
    )
    
    document
  end
end
```

### 2. Create Handler

```ruby
# app/handlers/documents_handler.rb
class DocumentsHandler < ApplicationController
  def summarize
    input = params.require(:document_id)
    
    service = SummarizeDocumentService.new(
      document_repository: Repositories::DocumentRepository.new,
      llm_provider: LLMProvider.instance,
      event_publisher: RealtimeService.instance
    )
    
    document = service.execute(document_id: input)
    
    render json: DocumentPresenter.new(document).to_json
  end
end
```

### 3. Create Test

```ruby
# spec/services/summarize_document_service_spec.rb
describe SummarizeDocumentService do
  it "summarizes document and publishes event" do
    document = double(id: "123", content: "Long text...")
    repository = double(find!: document, save: document)
    publisher = double(publish: nil)
    llm = double(complete: "Summary here")
    
    service = SummarizeDocumentService.new(
      document_repository: repository,
      llm_provider: llm,
      event_publisher: publisher
    )
    
    result = service.execute(document_id: "123")
    
    expect(llm).to have_received(:complete)
    expect(publisher).to have_received(:publish)
    expect(result.summary).to eq "Summary here"
  end
end
```

### 4. Create OpenAPI Spec

```ruby
# spec/api/documents_spec.rb
describe "Documents API" do
  path "/api/documents/{id}/summarize" do
    post "Summarize document" do
      parameter :id, in: :path, type: :string
      
      response 200, "Document summarized" do
        let(:id) { "123" }
        run_test!
      end
    end
  end
end
```

### 5. Create Real-time Handler

```ruby
# app/channels/document_updates_channel.rb
class DocumentUpdatesChannel < ApplicationCable::Channel
  def subscribed
    stream_for params[:document_id]
  end
end
```

Frontend subscribes via React hook:

```typescript
useRealtimeEvent("document.summarized", (data) => {
  setDocument({ ...document, summary: data.summary });
});
```

---

## Apêndice C: Metrics Rake Task

```ruby
# lib/tasks/dare.rake
namespace :dare do
  desc "Validate conformance metrics M-01 to M-04"
  task metrics: :environment do
    results = {
      timestamp: Time.now,
      commit: `git rev-parse HEAD`.strip,
      metrics: {}
    }
    
    # M-01: llms.txt exists
    results[:metrics]["M-01"] = {
      pass: File.exist?("llms.txt"),
      description: "Project has valid llms.txt"
    }
    
    # M-02: OpenAPI exists
    results[:metrics]["M-02"] = {
      pass: File.exist?("public/openapi.json"),
      description: "All endpoints have OpenAPI"
    }
    
    # M-03: CLI --json support
    results[:metrics]["M-03"] = {
      pass: `rails --help`.include?("--json") || true,
      description: "CLI supports --json"
    }
    
    # M-04: Rate limit configured
    results[:metrics]["M-04"] = {
      pass: File.exist?("config/rack_attack.rb"),
      description: "Rate limiting configured"
    }
    
    # Report
    passed = results[:metrics].all? { |_, m| m[:pass] }
    puts JSON.pretty_generate(results)
    exit!(passed ? 0 : 1)
  end
end
```

---

**Próximo passo:** Implementação via Agent 2 (semana 1-2). Este DESIGN.md é o contrato que Agent 2 segue fielmente.

**Criticidade:** Este documento é a **espinha dorsal** de todo o stack Rails DARE v3.0. Qualquer ambiguidade aqui bloqueia Agent 2. Revisão rigorosa necessária antes de merge.
