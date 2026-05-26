---
title: dare-realtime
description: Skill WebSocket e SSE para projetos DARE com Rails 8
---

# dare-realtime

Skill com padrões **WebSocket e SSE** para Rails 8. Inclui Action Cable conventions, observability hooks e fallback graceful para SSE.

## Instalação

```bash
dare skill add dare-realtime
```

## Padrões incluídos

### Action Cable Channel Template

```bash
dare realtime new-channel Notifications
```

Gera `app/channels/notifications_channel.rb` com:

- Autenticação via `current_user`
- Telemetria automática (integra com `dare-quality-telemetry`)
- Serialização tipada de mensagens

```ruby
class NotificationsChannel < ApplicationCable::Channel
  include Dare::Realtime::Telemetry

  def subscribed
    stream_for current_user
    dare_trace(:subscribed, user_id: current_user.id)
  end

  def unsubscribed
    dare_trace(:unsubscribed, user_id: current_user.id)
  end
end
```

### SSE Endpoint Pattern

Para streams HTTP server-sent events sem WebSocket:

```ruby
# app/controllers/events_controller.rb
class EventsController < ApplicationController
  include Dare::Realtime::SSE

  def stream
    sse_stream(channel: "user:#{current_user.id}") do |event|
      render json: event
    end
  end
end
```

## Validation gate

```bash
dare realtime audit
# ✓ Channels — 3 channels com autenticação
# ✓ Telemetria — métricas registradas em todos os eventos
# ⚠ ChatChannel — sem timeout de idle connection
```

## Configuração

```json
{
  "skills": {
    "dare-realtime": {
      "transport": ["action_cable", "sse"],
      "idle_timeout_seconds": 300,
      "telemetry": true
    }
  }
}
```
