# DESIGN.md — Skill `dare-layered-design` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  
**Inspiração:** Vladimir Dementyev, Evil Martians  

---

## 1. Visão

`dare-layered-design` codifica o **padrão arquitetural em camadas** como skill transversal, agnóstica a linguagem e framework.

Inspirado em *Layered Design for Ruby on Rails Applications* (Dementyev, Packt 2023) e metodologia Evil Martians, o padrão define **4 camadas obrigatórias** que todo projeto DARE deve respeitar:

1. **Handlers** (Controllers, Routers) — HTTP/gRPC entry points
2. **Services** (Business Logic) — orchestração e regras de negócio
3. **Repositories** (Data Access) — queries, aggregations
4. **Models** (Domain Objects) — entidades e value objects

Cada camada tem responsabilidade clara, facilitando:
- **Testabilidade** (testes unitários por camada)
- **Manutenibilidade** (código previsível, não "magic")
- **Escalabilidade** (fácil paralelizar desenvolvimento)
- **Integração com agentes** (agentes entendem estrutura e não a refactorizam)

---

## 2. Problema que Resolve

### 2.1 O gap atual

Arquitetura em camadas é conceito clássico, mas **implementação é ad-hoc**:
- Rails: fat models, thin controllers, ou vice-versa
- Node: controllers com queries SQL inline
- Rust: handlers que carregam toda a lógica
- Python: blueprints/routes com regra de negócio misturada

### 2.2 Sintomas

1. Código duplicado entre rotas (mesmo endpoint em múltiplos formatos)
2. Testes unitários impossíveis (lógica acoplada a HTTP/DB)
3. Agentes refactorizam para "um padrão melhor" (diverge em 2-3 features)
4. Onboarding lento (novo dev gasta dias entendendo where-is-what)
5. Validação de negócio espalhada (validators, middleware, model callbacks, service)

### 2.3 Raiz

Falta **contrato explícito** de como organizar código. Cada framework oferece opinião (Rails conventions), mas DARE precisa de **contrato supraframework**.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | 4 camadas obrigatórias | Todo projeto deve ter Handlers, Services, Repositories, Models separados |
| RF-02 | Validação de encapsulamento | CI valida que Handlers não chamam Repositories diretamente (Services no meio) |
| RF-03 | Nomes previsíveis | Handlers: `user_handler.rs`, Services: `user_service.py`, Repositories: `user_repo.go`, Models: `user.ts` |
| RF-04 | Dependency injection | Services recebem repositórios injetados, não instanciados dentro (facilita testes) |
| RF-05 | Single Responsibility | Uma Service = uma operação de negócio (CreateUser ≠ UpdateUser em classes separadas) |
| RF-06 | Documentação de contrato | Cada camada tem `llms.txt` local descrevendo interface esperada (integração com dare-ax) |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Zero runtime overhead | Padrão é estrutural, não afeta performance |
| RNF-02 | Compatibilidade forward | Uma classe Service em v1.0 continua funcionando em v2.0 sem mudança |
| RNF-03 | Agnóstico a frameworks | Padrão funciona em Rails, Axum, NestJS, FastAPI, Laravel, Gin, etc. |
| RNF-04 | Agnóstico a DB | Repositories abstraem Postgres, MongoDB, Redis igualmente |
| RNF-05 | Agnóstico a HTTP/gRPC | Handlers funcionam com HTTP routes, gRPC methods, GraphQL resolvers |
| RNF-06 | Testabilidade 100% | 100% do código de regra de negócio deve ser testável em testes unitários (sem mocks de DB/HTTP) |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | Validação em camada certa | Validação de entrada em Handlers; validação de regra de negócio em Services |
| RS-02 | Nenhuma query SQL em Handler | SQL sempre em Repository, nunca em Handler ou Service |
| RS-03 | Nenhuma HTTP concern em Service | Service não sabe de status codes, headers, cookies (Services reutilizáveis) |
| RS-04 | Autorização centralizada | Middleware em Handler valida auth; Services presume autenticação já validada |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Desenvolvedor** | Estrutura clara: sabe onde colocar cada linha de código |
| **Agente de código** | Não refactoriza; consegue adicionar feature respeitando camadas |
| **Revisor de PR** | Mais fácil validar separação de responsabilidades |
| **QA** | Services testáveis significam menos bugs em produção |
| **DevOps** | Padrão previsível facilitam monitoramento por camada |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias):**

- **M-01**: 100% de Services testadas com testes unitários (sem banco de dados real)
- **M-02**: 0% de chamadas diretas Handler → Repository em codebase (validação estática em CI)
- **M-03**: 100% de Handlers usam injeção de dependência (não instanciam Services)
- **M-04**: 100% de Repositories são agnósticos a camada acima (não retornam DTOs de HTTP)

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Fat Models | Model com validação, callbacks, query scopes, serialização — tudo junto. Resultado: untestable |
| AP-02 | Anemic Models | Model só com getters; toda lógica em Service. Resultado: Models sem identidade |
| AP-03 | Logic in Handlers | PUT /users/:id com senha hash inline, validação inline, DB query inline. Untestable |
| AP-04 | Repository retorna HTTP status | Repo throws `404 Not Found` em vez de `null` ou exception genérica. Couples layers |
| AP-05 | Service instancia Repository | `new UserRepository()` em Service. Impede testes e múltiplas implementações de Repository |
| AP-06 | Global state em Service | `UserService.current_user` global. Impede paralelização e testes |
| AP-07 | Ciclo de validação multifase | Validação parcial em Handler, parcial em Service, parcial em Model. Impede reuso de Service via CLI |
| AP-08 | DTO não documentado | Service retorna mapa/dict genérico. Agentes não sabem o que esperar |
| AP-09 | Nenhuma documentação de contrato | Handler não docum enta input/output. Service não documento seu contrato. |
| AP-10 | Mistura de paradigmas | Uma Service mistura sync + async, blocking + non-blocking. Inconsistente |

---

## 9. Decisões Arquiteturais

### ADR-01: 4 Camadas em Ordem Linear

**Decisão:** A dependência flui sempre de cima para baixo:
```
Handler → Service → Repository → Model
```

Handler nunca chama Repository ou Model direto. Service nunca chama Handler. Isto é **validado em CI** via static analysis (grep, AST, ou plugin de linter).

**Racional:** Hierarquia clara; difícil pra violador, fácil pra CI detectar.

**Consequências:**
- Múltiplas Services podem usar mesma Repository sem replicar lógica
- Services são reutilizáveis via CLI, batch jobs, webhooks (não só HTTP)

---

### ADR-02: Dependency Injection, Nunca Service Instantiation

**Decisão:** Handler recebe Service via constructor/parameter, não cria `UserService()`. Service recebe Repository via injetor, não cria `UserRepository()`.

```rust
// ✅ Correto (Axum)
async fn create_user(
    Extension(service): Extension<Arc<UserService>>,
    Json(req): Json<CreateUserReq>
) -> Result<Json<User>> {
    service.create(req).await
}

// ❌ Errado
async fn create_user(Json(req): Json<CreateUserReq>) -> Result<Json<User>> {
    let service = UserService::new(); // ❌ Tight coupling
    service.create(req).await
}
```

**Racional:** Testes conseguem injetar mocks. Múltiplas implementações (real vs. stub) coexistem.

**Consequências:**
- Necessário DI container (Framework provides: Rails, NestJS, Spring; custom: Node, Python, Rust)
- Setup inicial + complexidade, mas payoff em testabilidade

---

### ADR-03: Single Responsibility por Service

**Decisão:** Uma classe Service = uma operação de negócio: `CreateUserService`, `UpdateUserService`, `DeactivateUserService`. Não: `UserService` monolítica com 20 métodos.

Exceção: Services reutilizáveis de integração (`SendEmailService`, `GenerateTokenService`) podem ser genéricos.

**Racional:** Cada Service tem uma razão para mudar; fácil de testar; fácil de ler.

**Consequências:**
- Mais arquivos, mais classes (`src/services/` fica maior)
- Mas cada arquivo é pequeno (~50-150 linhas)

---

### ADR-04: Repository Abstração, Implementação Múltipla

**Decisão:** Repository é interface/trait, não classe concreta. Toda implementação de Repository valida contrato:

```python
# Interface/Protocol
class UserRepository(Protocol):
    def find_by_id(self, id: UUID) -> Optional[User]: ...
    def save(self, user: User) -> User: ...

# Implementações múltiplas
class PostgresUserRepository:
    def find_by_id(self, id: UUID) -> Optional[User]:
        # SQL Postgres
        pass

class InMemoryUserRepository:  # Para testes
    def find_by_id(self, id: UUID) -> Optional[User]:
        # Dict lookup
        pass
```

**Racional:** Testes usam `InMemoryUserRepository`; produção usa `PostgresUserRepository`. Mesma interface, zero mocking.

**Consequências:**
- Necessário abstração de Repository em CI (validar que implementações respeitam interface)

---

### ADR-05: Model = Domain Object + Serializer Separado

**Decisão:** Model é entidade de domínio (User, Post, Comment). Serialização é separada (DTOs, Presenters):

```go
// Model (domain)
type User struct {
    ID        UUID
    Email     string
    Name      string
    CreatedAt time.Time
}

// Serializer (presentation)
type UserPresenter struct {
    ID        string `json:"id"`
    Email     string `json:"email"`
    Name      string `json:"name"`
    CreatedAt string `json:"created_at"`
}

// Converter
func (u *User) ToPresenter() *UserPresenter {
    return &UserPresenter{...}
}
```

**Racional:** Model não conhece de JSON, XML, ou formato de saída. Service retorna Model; Handler serializa.

**Consequências:**
- Cada Model pode ter múltiplos Serializers (UserJSON, UserCSV, UserGRPC)
- Evita "JSON-ification" do Model

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Camadas vão virar overhead (devs pulam para prototipagem rápida) | **Média** | Templates DARE já respeitam camadas; CI força conformidade |
| DI container muito complexo para iniciantes | **Baixa** | Framework provides (Rails, NestJS); docs claras |
| Performance: N camadas = N function calls | **Baixa** | Compiladores/JITs optimizam tail calls; negligível em prática |
| Agentes geram código que viola ADR-01 (Handler → Repository) | **Alta** | Validação em CI blocka merge; agentes aprendem a respeitar |
| Testes rodam sem banco real, mas produção tem bug | **Média** | Testes de integração em suite separada; não em unit tests |

---

## 11. Dependências

### Externas
- **Domain-Driven Design (Evans, 2003)**: conceito de Domain Objects
- **Clean Architecture (Uncle Bob, 2017)**: layers e dependency rule
- **Layered Design (Dementyev, 2023)**: aplicação ao Rails (mas extensível)
- **SOLID principles**: especialmente S (Single Responsibility) e D (Dependency Inversion)

### Internas
- **dare-ax**: documentação de contrato via `llms.txt` (cada camada descreve interface)
- **dare-quality-telemetry**: validação estática de encapsulamento (M-02: 0% violações)
- Stacks filhas: `dare-rails-layered-design` v1.1, `dare-rust-axum-layered-design` v1.2, etc.

---

## 12. Fora de Escopo

- Implementação de "Clean Architecture" completa (entity-use case-gateway) — Layered Design é simplificado
- Event sourcing ou CQRS (entra em features avançadas)
- Microservices decomposition (Layered Design é para monolito; microservices é outra skill)
- GraphQL specific patterns (genérico a HTTP/gRPC/GraphQL)
- Transaction management details (cada stack implementa)

---

## 13. Roadmap Pós v1.0

### v1.1 — `dare-rails-layered-design` (Rails 8, integrado com v3.0)

Rails specifics:
- `app/handlers/` para Controllers
- `app/services/` para Services (um serviço = um job)
- `app/repositories/` para Repository pattern
- `app/models/` para Models (sem callbacks de negócio, só dados)
- Validação em CI: `app/handlers` não require `app/repositories`
- Exemplo: novo projeto Rails cria estrutura automaticamente

**Entrega esperada:** fim semana 1-2 do plano 30 dias

---

### v1.2 — `dare-rust-axum-layered-design` (Rust/Axum)

Rust specifics:
- `src/handlers/` para Axum handlers
- `src/services/` para Services (trait objects para abstração)
- `src/repositories/` para Repositories (trait-based)
- `src/models/` para domain structs
- CI: clippy rule para detectar Handler chamando Repository direto
- Exemplo: scaffold Axum projeto respeita camadas

**Entrega esperada:** fim semana 2-3

---

### v1.3 — `dare-nestjs-layered-design` (Node/NestJS)

NestJS specifics:
- `src/handlers/` para Controllers
- `src/services/` para Services
- `src/repositories/` para Repositories (abstratos com injeção)
- CI: ESLint rule customizado
- Integração com NestJS DI nativa

**Entrega esperada:** fim semana 3-4

---

### Future (v2.0+)

- Python/FastAPI (pydantic-based Repository abstraction)
- PHP/Laravel (Eloquent Repository pattern)
- Go (naked `struct` patterns, interface-based)
- Hexagonal Architecture variant (ports-and-adapters)
- Domain-Driven Design deepdive (aggregates, value objects)

---

## Apêndice A: Estrutura de Pastas Padrão DARE

```
src/ (ou app/, lib/, etc. por framework)
├── handlers/              # HTTP/gRPC entry points
│   ├── user_handler.rs    # POST /users, GET /users/:id, etc.
│   ├── post_handler.rs
│   └── ...
├── services/              # Business logic (one per operation)
│   ├── create_user_service.rs
│   ├── update_user_service.rs
│   ├── deactivate_user_service.rs
│   ├── post_service.rs
│   └── ...
├── repositories/          # Data access (abstractions + implementations)
│   ├── user_repository.rs       # Trait/Interface
│   ├── postgres_user_repo.rs    # Implementation
│   ├── inmemory_user_repo.rs    # For tests
│   ├── post_repository.rs
│   └── ...
├── models/                # Domain objects (no HTTP, no DB concerns)
│   ├── user.rs
│   ├── post.rs
│   ├── comment.rs
│   └── ...
├── presenters/            # Serializers (Model → JSON/XML/etc.)
│   ├── user_presenter.rs
│   ├── post_presenter.rs
│   └── ...
├── config/                # Configuration
│   └── db.rs
├── middleware/            # Auth, logging, error handling
│   └── auth_middleware.rs
└── main.rs (or index.js, etc.)
```

Cada arquivo é ~50-200 linhas. Cada folder tem README descrevendo contrato (integração dare-ax).

---

## Apêndice B: Validação em CI

### Static Analysis Rule: Handler não chama Repository

```python
# Pseudo-code ESLint/clippy rule
if node.type == 'CallExpression':
    caller = node.caller  # e.g., "UserRepository.find_by_id"
    callee = node.scope   # e.g., "UserHandler"
    
    if "Repository" in caller and "Handler" in callee:
        ERROR: "Handlers must call Services, not Repositories directly"
```

### Compliance Check in CI

```bash
# Example: count violations
violations=$(grep -r "repository\." src/handlers/ | wc -l)
if [ $violations -gt 0 ]; then
  echo "FAIL: Found $violations Handler→Repository calls"
  exit 1
fi
```

---

## Apêndice C: Service Contract Example

```typescript
// Service contract (llms.txt local)
/**
 * CreateUserService
 * 
 * Responsibility: Create a new user with validation and email confirmation
 * 
 * Input (DTO):
 *   - email: string (required, valid email)
 *   - name: string (required, 1-100 chars)
 *   - password: string (required, min 8 chars, hashed in service)
 * 
 * Output (Model):
 *   - User { id, email, name, created_at }
 * 
 * Side effects:
 *   - Saves User to UserRepository
 *   - Sends confirmation email (via EmailService)
 * 
 * Exceptions:
 *   - UserAlreadyExists: if email exists
 *   - InvalidInput: if validation fails
 * 
 * Usage (Handler):
 *   const user = await createUserService.execute(req.body);
 *   res.status(201).json(user.toPresenter());
 * 
 * Usage (CLI):
 *   const user = await createUserService.execute({
 *     email: "test@example.com",
 *     name: "Test User",
 *     password: "securepassword"
 *   });
 */
class CreateUserService {
  constructor(userRepository: UserRepository, emailService: EmailService) {
    this.userRepository = userRepository;
    this.emailService = emailService;
  }
  
  async execute(input: CreateUserInput): Promise<User> {
    // Validation
    if (!input.email.includes("@")) throw new InvalidInput("Invalid email");
    
    // Check uniqueness
    if (await this.userRepository.findByEmail(input.email)) {
      throw new UserAlreadyExists();
    }
    
    // Create and save
    const user = new User(UUID.generate(), input.email, input.name);
    const saved = await this.userRepository.save(user);
    
    // Send confirmation
    await this.emailService.sendConfirmation(saved.id, saved.email);
    
    return saved;
  }
}
```

---

**Próximo passo:** Implementação via `dare-rails-layered-design` v1.1 (Agent 2, semana 1-2). Skills filhas por stack seguem.
