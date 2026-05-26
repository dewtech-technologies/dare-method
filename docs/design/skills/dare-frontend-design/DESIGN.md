# DESIGN.md — Skill `dare-frontend-design` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-frontend-design` codifica **padrões de arquitetura frontend** como skill transversal, agnóstica a UI framework (React, Vue, Svelte, etc.).

Define como aplicações DARE devem estruturar:
- **Components** — composição, props, estado local
- **State Management** — quando centralizar, quando distribuir
- **Routing** — estrutura de rotas, deep linking, 404 handling
- **API Integration** — como conectar com backend (observar OpenAPI)
- **Error Handling** — estados de erro previsíveis, user feedback
- **Loading States** — estados de carregamento, skeleton UI
- **Testing** — padrões de testes unitários e E2E
- **Performance** — code splitting, lazy loading, memoization
- **Accessibility** — WCAG 2.1 AA basics, semantic HTML

Frontend é camada crítica; agentes precisam entender padrões para não refactorizar a cada feature.

---

## 2. Problema que Resolve

### 2.1 O gap atual

Frontend é "arte" sem padrões claros:
- Componentes monolíticos (1000+ linhas)
- Estado misturado entre local/global/URL
- API calls dispersas (em handlers, effects, mount callbacks)
- Sem tratamento de erros (ou inconsistente)
- Loading states são "nice-to-have"
- Testes são raros ou impossíveis (tight coupling com deps)
- Accessibility é forgotten afterthought
- Performance cai com cada feature (zero tree-shaking)

### 2.2 Sintomas

1. Componente fica mais lento a cada feature
2. Bug em uma rota quebra outra (estado compartilhado mal)
3. Offline não funciona (tudo depende de rede)
4. Agentes refactorizam toda semana (nenhum padrão claro)
5. Novo dev não sabe onde adicionar feature (estrutura é mystery)
6. Tests passam mas UI quebra (testes não testam UI)
7. Users veem loading spinner, depois erro, nada acontece

### 2.3 Raiz

**Falta contrato explícito** de como organizar frontend. Cada projeto segue opinião do primeiro dev (pode ser boa, pode ser caótica).

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | Componentes granulares | Nenhum componente > 300 linhas; 1 responsabilidade por componente |
| RF-02 | Props bem tipadas | 100% de componentes têm tipos explícitos (TypeScript, Prop Types, etc.) |
| RF-03 | Estado separado por escopo | Estado local em component; estado global em store; estado em URL quando necessário |
| RF-04 | API via hooks/composables | Nenhum fetch() direto em JSX/template; isolado em custom hooks/composables |
| RF-05 | Error boundaries obrigatórias | 100% de páginas têm error boundary que trata falhas gracefully |
| RF-06 | Loading states explícitos | Estados distintos: idle, loading, success, error sempre representados |
| RF-07 | Rotas estruturadas | Rotas organizadas por feature/domain (não por página) |
| RF-08 | Acessibilidade básica | WCAG 2.1 AA: labels, ARIA, semantic HTML, keyboard navigation |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Bundle size < 500KB | Gzipped JS + CSS for initial page < 500KB |
| RNF-02 | First Paint < 2s | Inicial render em <= 2s em 3G network |
| RNF-03 | Component reusability > 70% | Components reutilizáveis em múltiplas páginas |
| RNF-04 | Testability 100% | Todo componente e hook testável sem DOM mocking |
| RNF-05 | Type safety | 100% do código coberto por types (TypeScript strict mode) |
| RNF-06 | Zero console errors | Build pass sem warnings ou deprecations |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | XSS prevention | User input nunca diretamente em innerHTML; sempre escaped ou via dangerouslySetInnerHTML com cuidado |
| RS-02 | CSRF token handling | POST/PUT/DELETE requer CSRF token via header ou form |
| RS-03 | Auth token seguro | Auth token em HttpOnly cookie ou SessionStorage (não LocalStorage) |
| RS-04 | Content Security Policy | Header CSP define fontes de script, style, etc. |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Frontend dev** | Estrutura clara; sabe exatamente onde colocar novo componente/hook |
| **Agente de código** | Consegue adicionar feature sem refactorizar existente |
| **QA** | Testing patterns são claros; consegue escrever E2E assertions |
| **User** | UI responsivo, acessível, rápido |
| **DevOps** | Build previsível, bundle size monitorado |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias):**

- **M-01**: 100% de componentes estão < 300 linhas (validação em CI)
- **M-02**: 100% de API calls via custom hooks/composables (nenhum fetch inline em JSX)
- **M-03**: 100% de rotas têm error boundary (trata crashes)
- **M-04**: Bundle size <= 500KB gzipped (monitorado a cada build)

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Fat components (1000+ linhas) | Untestable, unmaintainable, hard to reuse |
| AP-02 | Props drilling (10 níveis de props) | Inflexível; mover componente é breaking |
| AP-03 | Global state for everything | Perda de modularity; hard to reason about mutations |
| AP-04 | Fetch in JSX/template | Coupling de UI a API; impossible de testar sem network |
| AP-05 | No error boundary | Component crashes = página inteira quebra |
| AP-06 | State never loads | Component retorna data sem loading state; spinner always missing |
| AP-07 | Untyped props | Props são `any`; descobres tipo em runtime |
| AP-08 | No keyboard support | UI só funciona com mouse; ignora accessibility |
| AP-09 | CSS in className strings | `className="w-4 h-4 text-red-500"` hardcoded. Não é tree-shakeable |
| AP-10 | Testing only happy path | Tests pass; produção falha em erro. Tests mentindo |

---

## 9. Decisões Arquiteturais

### ADR-01: Component Composition > Inheritance

**Decisão:** Nenhuma component inheritance. Sempre composition via props:

```tsx
// ✅ Correto
function Button({ icon, label, onClick }) {
  return (
    <button onClick={onClick}>
      {icon && <Icon>{icon}</Icon>}
      {label}
    </button>
  );
}

// ❌ Errado
class BaseButton extends Component { ... }
class PrimaryButton extends BaseButton { ... }
```

**Racional:** Composition é flexível; herança é frágil.

**Consequências:**
- Mais parâmetros em componentes genéricos
- Mas payoff em reusabilidade

---

### ADR-02: Custom Hooks/Composables para API Calls

**Decisão:** Todo fetch é isolado em custom hook:

```typescript
// hooks/useUser.ts
function useUser(userId: string) {
  const [state, setState] = useState({ idle: true });

  useEffect(() => {
    setState({ loading: true });
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(user => setState({ success: true, data: user }))
      .catch(err => setState({ error: true, message: err.message }));
  }, [userId]);

  return state;
}

// Component
function UserProfile({ userId }) {
  const state = useUser(userId);
  if (state.loading) return <Skeleton />;
  if (state.error) return <Error message={state.message} />;
  return <User data={state.data} />;
}
```

Hook é testável sem renderizar component.

**Racional:** Separação de concerns; reusable; testable.

**Consequências:**
- Mais files (`hooks/` diretório cresce)
- Mas cada hook é pequeno (~30-50 linhas)

---

### ADR-03: State Levels (Local → Store → URL)

**Decisão:** Estado em 3 níveis:

1. **Local State** (useState): UI state (menu open/closed, form input)
2. **Global Store** (Redux/Pinia/Zustand): User info, auth, cross-page state
3. **URL State**: Navigation, filters, search queries (shareable links)

```typescript
// Local: component remembers menu open/closed
const [menuOpen, setMenuOpen] = useState(false);

// Global: user info shared across app
const user = useSelector(state => state.auth.user);

// URL: filters are in query string
const [search] = useSearchParams();
const filter = search.get("filter") ?? "all";
```

**Racional:** Cada nível tem propósito claro.

**Consequências:**
- 3 places to look for state (but predictable)

---

### ADR-04: Error Boundaries em Cada Página

**Decisão:** Cada página/route tem Error Boundary wrapper:

```tsx
export default function UserListPage() {
  return (
    <ErrorBoundary fallback={<ErrorPage />}>
      <UserList />
    </ErrorBoundary>
  );
}

function ErrorBoundary({ children, fallback }) {
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    window.addEventListener("error", () => setHasError(true));
  }, []);

  if (hasError) return fallback;
  return children;
}
```

Se UserList component crashes, page shows ErrorPage (não branca).

**Racional:** Resiliência; users não veem "white screen of death".

**Consequências:**
- Boilerplate repetido (resolver com HOC)

---

### ADR-05: Loading State Machine (Idle → Loading → Success/Error)

**Decisão:** Estados explícitos representados como discriminated union:

```typescript
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; message: string };

// Component
function UserProfile({ state }: { state: State }) {
  if (state.status === "idle" || state.status === "loading") {
    return <Skeleton />;
  }
  if (state.status === "error") {
    return <Error message={state.message} />;
  }
  // state.status === "success"
  return <User data={state.data} />;
}
```

Compiler força você trata todos estados.

**Racional:** Completude; impossible states are impossible.

**Consequências:**
- Verbosity (mas type safety é worth it)

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Component > 300 linhas não flagged | **Média** | CI check com AST (count lines) |
| API calls still hidden in Effects | **Média** | Linter rule detecta fetch() fora de hooks |
| Error boundaries não estão em rotas | **Alta** | Checklist em PR template |
| Tests pass but UI broken | **Alta** | E2E tests com Cypress/Playwright |
| Bundle size explodes undetected | **Média** | Bundle analyzer in build; warn on +10KB |
| Accessibility forgotten | **Baixa** | axe-core em CI; accessibility tests |

---

## 11. Dependências

### Externas
- **React / Vue / Svelte**: UI framework (agnóstico)
- **TypeScript**: type safety
- **OpenAPI spec**: frontend calls backend endpoints definidos em OpenAPI

### Internas
- **dare-ax**: frontend expõe rotas/endpoints que devem estar documentadas
- **dare-quality-telemetry**: monitora M-01 a M-04 (bundle size, component size)
- **dare-layered-design**: frontend Services chamam backend Services (via OpenAPI)
- Stacks filhas: `dare-react-design` v1.1, `dare-vue-design` v1.2, etc.

---

## 12. Fora de Escopo

- SSR (Server-Side Rendering) — entra em v1.1 com stack-specific
- PWA patterns — entra em `dare-pwa` skill v1.0 futuro
- i18n (internacionalization) — entra em v1.2
- Design System component library (usar existing como Shadcn, Headless UI)
- Animation library (usar Framer Motion, etc.)

---

## 13. Roadmap Pós v1.0

### v1.1 — `dare-react-design` (React + Next.js)

React-specific:
- `src/components/`, `src/hooks/`, `src/pages/` structure
- Server Components vs Client Components (Next.js)
- Suspense para loading states
- Example: new Next.js project with DARE patterns scaffold

**Entrega esperada:** semana 2-3

---

### v1.2 — `dare-vue-design` (Vue 3 + Nuxt 3)

Vue-specific:
- `components/`, `composables/`, `pages/` structure
- Composition API (não Options API)
- Defineprops com types (Vue 3.3+)
- Example: new Nuxt project with DARE patterns

**Entrega esperada:** semana 3-4

---

### Future (v2.0+)

- Svelte variant
- Animation patterns
- i18n patterns
- Design System integration
- State management best practices (Redux vs Zustand vs Pinia)

---

## Apêndice A: Estrutura de Pastas Padrão DARE (React)

```
src/
├── components/             # Reusable UI components
│   ├── Button.tsx          # < 100 lines
│   ├── Card.tsx
│   ├── Form/
│   │   ├── TextInput.tsx
│   │   ├── Select.tsx
│   │   └── Form.tsx        # Manages form state
│   ├── ErrorBoundary.tsx
│   └── LoadingSpinner.tsx
├── hooks/                  # Custom hooks (logic extracted)
│   ├── useUser.ts          # Fetches user from API
│   ├── useForm.ts          # Form state management
│   ├── useFetch.ts         # Generic fetch hook
│   └── useLocalStorage.ts
├── pages/                  # Page components (1 per route)
│   ├── UserListPage.tsx
│   ├── UserDetailPage.tsx
│   └── NotFoundPage.tsx
├── store/                  # Global state (Redux, Zustand, etc.)
│   ├── userSlice.ts        # Redux slice for user
│   ├── authSlice.ts
│   └── store.ts            # Store config
├── api/                    # API client
│   ├── client.ts           # Fetch wrapper, auth header injection
│   ├── types.ts            # Types from OpenAPI spec
│   └── endpoints.ts        # Endpoints from OpenAPI
├── styles/                 # Global styles (CSS, Tailwind)
│   └── globals.css
├── types/                  # TypeScript types
│   └── index.ts
└── App.tsx                 # Router setup, providers
```

---

## Apêndice B: Component Template (React)

```typescript
// components/UserCard.tsx
import { ReactNode } from "react";
import ErrorBoundary from "./ErrorBoundary";

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserCardProps {
  user: User;
  onDelete?: (id: string) => void;
  actions?: ReactNode;
}

export function UserCard({ user, onDelete, actions }: UserCardProps) {
  return (
    <ErrorBoundary fallback={<div>Error loading card</div>}>
      <div className="border p-4 rounded">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
        {onDelete && (
          <button onClick={() => onDelete(user.id)}>
            Delete
          </button>
        )}
        {actions}
      </div>
    </ErrorBoundary>
  );
}

export default UserCard;
```

---

## Apêndice C: Testing Pattern

```typescript
// components/UserCard.test.tsx
import { render, screen } from "@testing-library/react";
import { UserCard } from "./UserCard";

describe("UserCard", () => {
  const user = { id: "1", name: "John", email: "john@example.com" };

  it("renders user info", () => {
    render(<UserCard user={user} />);
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("calls onDelete when button clicked", () => {
    const onDelete = vi.fn();
    render(<UserCard user={user} onDelete={onDelete} />);
    screen.getByText("Delete").click();
    expect(onDelete).toHaveBeenCalledWith("1");
  });
});

// hooks/useUser.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { useUser } from "./useUser";

describe("useUser", () => {
  it("fetches user on mount", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ id: "1", name: "John" }),
      })
    );

    const { result } = renderHook(() => useUser("1"));
    
    expect(result.current.status).toBe("loading");
    
    await waitFor(() => {
      expect(result.current.status).toBe("success");
      expect(result.current.data.name).toBe("John");
    });
  });
});
```

---

**Próximo passo:** Implementação via stacks filhas (React, Vue). Integração com design systems.
