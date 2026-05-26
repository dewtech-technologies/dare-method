# DESIGN.md — Skill `dare-realtime` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-realtime` codifica **padrões de real-time communication** como skill transversal, agnóstica a tecnologia (WebSocket, SSE, gRPC streaming).

Define como aplicações DARE devem:
- Estabelecer conexões bidirecionais (WebSocket, SSE)
- Gerenciar subscriptions (quem recebe qual mensagem)
- Publicar eventos (mutation, deletion, status change)
- Tratar desconexões e reconexões
- Escalar para múltiplos servidores (pub/sub backend)
- Documentar eventos (OpenAPI extensions para real-time)
- Testar comportamento real-time (sem manual testing)

Real-time features vão de "luxury" para "necessity"; padrões garantem que aplicações DARE suportam isso desde v1.0.

---

## 2. Problema que Resolve

### 2.1 O gap atual

Real-time é implementado ad-hoc por projeto:
- Rails: Action Cable com defaults
- Node: Socket.io com guesswork de eventos
- Rust: Tokio + tungstenite com zero pattern

Resulta em:
- Inconsistência entre projetos
- Difícil escalar (conexões não sincronizam entre servidores)
- Sem documentação de eventos
- Testing é manual (abrir 2 browsers)
- Desconexões causam "ghost listeners" (memory leak)
- Agentes não conseguem gerar código real-time

### 2.2 Sintomas

1. WebSocket conecta mas não recebe atualizações
2. Reconexão perds listeners
3. Broadcast de evento chega em alguns users mas não em outros
4. Memory leak em servidor após dias (connections não limpas)
5. Escalando para 2 servidores = eventos duplicam ou desaparecem

### 2.3 Raiz

**Falta contrato explícito** de como publicar, subscrever, e gerenciar real-time. Cada dev improvisa.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | WebSocket ou SSE obrigatório | Aplicação suporta pelo menos um (WebSocket preferred) |
| RF-02 | Event schema documentado | Cada evento tem JSON Schema definido e validado |
| RF-03 | Subscriptions gerenciadas | Users recebem só eventos que subscrevem (não broadcast global) |
| RF-04 | Automatic reconnect | Cliente reconecta automaticamente com exponential backoff |
| RF-05 | Pub/Sub para múltiplos servidores | Redis ou similar para sync entre instâncias |
| RF-06 | Graceful degradation | App funciona sem real-time (poll fallback) |
| RF-07 | Connection limit respeitado | Servidor limita conexões por user/IP (não DOS) |
| RF-08 | Memory cleanup | Conexões desconectadas limpam listeners (no ghost listeners) |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Latência < 500ms | Real-time event chega no cliente < 500ms (p99) |
| RNF-02 | Throughput > 10k events/sec | Pode processar >= 10k eventos por segundo |
| RNF-03 | Memory stable | Server memory não cresce com tempo (connections cleaned) |
| RNF-04 | Reconnect < 5s | Reconexão e resubscribe em < 5s |
| RNF-05 | Agnóstico a transporte | Code funciona com WebSocket ou SSE (abstração) |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | Authorization por subscription | User só pode subscrever eventos que tem permission para ver |
| RS-02 | Message validation | Toda mensagem validada contra schema (LLM não injecta bad events) |
| RS-03 | Rate limit por user | User não consegue flood com muitos events |
| RS-04 | No event data leakage | Confidential fields nunca no event JSON (use ID refs) |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Frontend dev** | Simples API para subscrever e ouvir (não gerenciar socket) |
| **Backend dev** | Simples API para publicar (um método, múltiplos subscribers) |
| **DevOps** | Escalabilidade transparente (pub/sub backend abstrato) |
| **User** | Atualizações aparecem na tela sem F5 |
| **Agente de código** | Consegue gerar listeners e publishers seguindo padrão |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias):**

- **M-01**: 100% de eventos têm JSON Schema definido (validação em CI)
- **M-02**: 100% de subscriptions estão autorizadas (user só vê o que pode ver)
- **M-03**: 0% ghost listeners (no memory leaks em desconexão)
- **M-04**: Latência p99 < 500ms (monitored em staging)

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Global broadcast | `socket.broadcast.emit("update")` para todo mundo. Data leak + performance |
| AP-02 | Event sem schema | Event JSON é arbitrary; não sabe estrutura |
| AP-03 | No unsubscribe | Client conecta mas nunca desconecta. Memory leak |
| AP-04 | Blocking send | `await socket.send()` blocks thread. Deve ser non-blocking |
| AP-05 | No authentication | Real-time endpoint aceita qualquer cliente |
| AP-06 | Client manages subscriptions | Client decides o que subscrever. Server deveria validar |
| AP-07 | No fallback | Real-time breaks = feature quebra. Deveria degradar para poll |
| AP-08 | Duplicate events on reconnect | Mesmo evento chega 2x após reconexão |
| AP-09 | No error handling | Network error = silent fail. Client não sabe |
| AP-10 | Tightly coupled to tech | Code assume WebSocket. Mudar pra SSE = refactor tudo |

---

## 9. Decisões Arquiteturais

### ADR-01: Event-Driven Architecture com Pub/Sub Backend

**Decisão:** Toda operação que precisa real-time publica evento via `EventPublisher`:

```typescript
interface EventPublisher {
  publish(event: Event): Promise<void>;
}

// Backend
class CreateUserService {
  constructor(private eventPublisher: EventPublisher) {}
  
  async create(input: CreateUserInput): Promise<User> {
    const user = await userRepository.save(...);
    
    // Publish event
    await this.eventPublisher.publish({
      type: "user.created",
      data: { userId: user.id, email: user.email },
      timestamp: new Date(),
    });
    
    return user;
  }
}
```

Pub/Sub backend (Redis, Kafka, etc.) garante sync entre servidores.

**Racional:** Desacoplamento; escalabilidade.

**Consequências:**
- Infraestrutura de pub/sub necessária (Redis, etc.)
- Eventual consistency (não atomic)

---

### ADR-02: Subscriptions Baseadas em Autorização

**Decisão:** Server valida que client tem permissão antes de subscrever:

```typescript
socket.on("subscribe", async (channel: string) => {
  const authorized = await checkAuth(socket.user, channel);
  if (!authorized) {
    socket.emit("error", "Not authorized");
    return;
  }
  socket.join(channel);  // Subscribe
});
```

Exemplo: User pode subscrever em "user:123:updates" só se tem permission em User 123.

**Racional:** Security; não confiar em cliente.

**Consequências:**
- Server-side check necessário (não offline)

---

### ADR-03: Graceful Reconnection com Exponential Backoff

**Decisão:** Client reconnecta automaticamente com backoff:

```typescript
class RealtimeClient {
  private reconnectDelay = 1000;  // 1s
  private maxDelay = 30000;       // 30s
  
  connect() {
    this.socket = new WebSocket(...);
    this.socket.onerror = () => {
      this.disconnect();
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,  // Double
        this.maxDelay
      );
    };
  }
}
```

Reconnect é automático; app não precisa saber.

**Racional:** Robustness; network é unreliable.

**Consequências:**
- Client complexity (mas abstracted em library)

---

### ADR-04: Event Schema com JSON Schema

**Decisão:** Todo event type tem JSON Schema:

```json
{
  "type": "user.created",
  "schema": {
    "type": "object",
    "properties": {
      "userId": { "type": "string" },
      "email": { "type": "string", "format": "email" },
      "createdAt": { "type": "string", "format": "date-time" }
    },
    "required": ["userId", "email", "createdAt"]
  }
}
```

Server valida antes publicar. Client pode deserializar com type safety.

**Racional:** Completeness; impossible values impossible.

**Consequências:**
- Schema management overhead (pero worth for safety)

---

### ADR-05: Fallback para HTTP Long-Polling

**Decisão:** Se WebSocket não disponível, fallback para HTTP long-polling:

```typescript
class RealtimeClient {
  async connect() {
    try {
      return this.connectWebSocket();
    } catch {
      return this.connectLongPolling();
    }
  }
}
```

Long-polling é mais lento, mas funciona em qualquer rede.

**Racional:** Robustness; não tudo WebSocket em China, corpo.

**Consequências:**
- Implementação de 2 strats; overhead no server

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Memory leak em server (ghost listeners) | **Alta** | Cleanup em disconnect event; memory profiling |
| Duplicate events após reconnect | **Média** | Event ID + deduplication window (ex: 10s) |
| Latência > 500ms (perceived as slow) | **Média** | Caching, CDN, measurement in staging |
| Real-time breaks = feature breaks | **Alta** | Graceful degradation (fallback poll) |
| Agentes não conseguem gerar event handlers | **Média** | Templates claros; doc via OpenAPI extension |
| Pub/Sub backend falha | **Alta** | Health checks; failover |

---

## 11. Dependências

### Externas
- **WebSocket Protocol (RFC 6455)**: ou HTTP/2 Server Push
- **JSON Schema 2020-12**: event validation
- **Redis / Kafka / NATS**: pub/sub backend (one of)

### Internas
- **dare-ax**: OpenAPI extension para documentar events
- **dare-quality-telemetry**: monitora M-01 a M-04
- **dare-layered-design**: EventPublisher é injetado em Services
- Stacks filhas: `dare-rails-realtime` v1.1 (Action Cable), `dare-node-realtime` v1.2 (Socket.io), etc.

---

## 12. Fora de Escopo

- Collaborative editing (Yjs, CRDTs) — entra em v2.0
- Presence (who's online) — entra em v1.1 mas simples
- Message ordering guarantees — entra em v2.0
- Disaster recovery (event sourcing) — entra em v2.0+
- Custom protocols (gRPC streaming) — entra em v2.0

---

## 13. Roadmap Pós v1.0

### v1.1 — `dare-rails-realtime` (Rails 8 + Action Cable)

Rails-specific:
- `app/channels/` for subscriptions
- `app/events/` for event schemas
- ActionCable defaults
- Example: new Rails project with real-time scaffold

**Entrega esperada:** semana 2-3

---

### v1.2 — `dare-node-realtime` (Node + Socket.io)

Node-specific:
- Socket.io with namespace organization
- Event validation with Zod
- Pub/sub with Redis
- Example: new Express/NestJS project with real-time scaffold

**Entrega esperada:** semana 3-4

---

### v1.3 — `dare-rust-realtime` (Rust + Tokio + Axum)

Rust-specific:
- Tokio tasks for connections
- Broadcast channels for pub/sub
- Message validation
- Example: new Axum project with WebSocket

**Entrega esperada:** month 2

---

### Future (v2.0+)

- Presence (who's online, typing indicators)
- Collaborative editing (Yjs, Automerge)
- Offline-first sync
- gRPC streaming support
- Edge deployment (Cloudflare Workers)

---

## Apêndice A: Event Schema Definitions

```typescript
// events/user_events.ts
import { JSONSchema } from "json-schema";

export const UserCreatedEvent = {
  type: "user.created",
  schema: {
    type: "object",
    properties: {
      userId: { type: "string", description: "UUID of created user" },
      email: { type: "string", format: "email" },
      name: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
    },
    required: ["userId", "email", "name", "createdAt"],
  } satisfies JSONSchema,
} as const;

export const UserDeletedEvent = {
  type: "user.deleted",
  schema: {
    type: "object",
    properties: {
      userId: { type: "string" },
      deletedAt: { type: "string", format: "date-time" },
    },
    required: ["userId", "deletedAt"],
  } satisfies JSONSchema,
} as const;

export type UserCreatedPayload = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
};
```

---

## Apêndice B: Server-Side Publisher (Node/NestJS)

```typescript
// services/realtime.service.ts
import { Injectable } from "@nestjs/common";
import { Server } from "socket.io";
import { EventPublisher } from "./event_publisher.interface";
import { validateSchema } from "./validator";

@Injectable()
export class RealtimeService implements EventPublisher {
  constructor(private io: Server) {}

  async publish(event: { type: string; data: any }): Promise<void> {
    // Validate event
    const schema = eventSchemas[event.type];
    if (!schema) {
      throw new Error(`Unknown event type: ${event.type}`);
    }
    validateSchema(event.data, schema);

    // Publish to all subscribed clients
    this.io.emit(event.type, {
      type: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
    });
  }
}

// gateway/realtime.gateway.ts
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection {
  constructor(
    private authService: AuthService,
    private realtimeService: RealtimeService
  ) {}

  @SubscribeMessage("subscribe")
  async subscribe(
    @MessageBody() channel: string,
    @ConnectedSocket() client: Socket
  ) {
    // Authorize subscription
    const user = await this.authService.authenticate(client);
    const authorized = await this.authService.canView(user, channel);
    
    if (!authorized) {
      client.emit("error", "Not authorized");
      return;
    }

    client.join(channel);
    client.emit("subscribed", { channel });
  }

  @SubscribeMessage("unsubscribe")
  unsubscribe(
    @MessageBody() channel: string,
    @ConnectedSocket() client: Socket
  ) {
    client.leave(channel);
    client.emit("unsubscribed", { channel });
  }

  handleConnection(client: Socket) {
    console.log(`Client ${client.id} connected`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client ${client.id} disconnected`);
    // Socket.io auto-cleanup
  }
}
```

---

## Apêndice C: Client-Side Listener (React)

```typescript
// hooks/useRealtimeEvent.ts
import { useEffect, useCallback } from "react";
import { useRealtimeClient } from "./useRealtimeClient";

export function useRealtimeEvent<T>(
  eventType: string,
  onEvent: (data: T) => void,
  channel?: string
) {
  const client = useRealtimeClient();

  useEffect(() => {
    if (channel) {
      client.subscribe(channel);
    }

    const handler = (payload: any) => {
      if (payload.type === eventType) {
        onEvent(payload.data as T);
      }
    };

    client.on(eventType, handler);

    return () => {
      client.off(eventType, handler);
      if (channel) {
        client.unsubscribe(channel);
      }
    };
  }, [eventType, channel, client, onEvent]);
}

// Component usage
function UserList() {
  const [users, setUsers] = useState<User[]>([]);

  useRealtimeEvent<UserCreatedPayload>("user.created", (data) => {
    setUsers((prev) => [...prev, { id: data.userId, ...data }]);
  });

  useRealtimeEvent<{ userId: string }>("user.deleted", (data) => {
    setUsers((prev) => prev.filter((u) => u.id !== data.userId));
  });

  return (
    <div>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

---

**Próximo passo:** Implementação via stacks filhas. Integração com Action Cable (Rails), Socket.io (Node).
