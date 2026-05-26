---
title: dare-quality-telemetry
description: Skill de qualidade de código e OpenTelemetry para projetos DARE
---

# dare-quality-telemetry

Skill que integra **quality gates** e **OpenTelemetry** ao seu projeto. Nenhuma task é marcada como DONE sem métricas, traces e cobertura dentro do threshold.

## Instalação

```bash
dare skill add dare-quality-telemetry
```

## Gates de qualidade

### Cobertura de testes

```json
{
  "skills": {
    "dare-quality-telemetry": {
      "coverage": {
        "threshold": 85,
        "fail_below": true,
        "exclude": ["app/admin/**", "db/migrate/**"]
      }
    }
  }
}
```

### Complexidade ciclomática

```bash
dare quality complexity --max 10
# ✓ PaymentService#process       — complexity 4
# ✓ UserAuthenticator#call       — complexity 6
# ⚠ DocumentParser#extract_data — complexity 14 (max: 10)
```

## OpenTelemetry

A skill configura automaticamente o SDK OpenTelemetry para Rails:

```ruby
# config/initializers/dare_telemetry.rb (gerado automaticamente)
Dare::Telemetry.configure do |config|
  config.service_name    = ENV.fetch("OTEL_SERVICE_NAME", Rails.application.class.module_parent_name)
  config.exporter        = :otlp
  config.endpoint        = ENV.fetch("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
  config.auto_instrument = [:rails, :active_record, :http, :sidekiq]
end
```

### Métricas customizadas

```ruby
# Em qualquer lugar do código
Dare::Telemetry.counter("documents.processed").add(1, attributes: { type: "pdf" })
Dare::Telemetry.histogram("llm.latency_ms").record(latency)
```

## Comandos

```bash
# Status geral de qualidade
dare quality status

# Relatório de cobertura
dare quality coverage --format html

# Verificar complexidade
dare quality complexity

# Auditoria completa
dare quality audit
```

## Output de exemplo

```
dare quality audit

dare-quality-telemetry v1.1.0
==============================
Cobertura          : 91.4% ✓  (threshold: 85%)
Complexidade média : 4.2   ✓  (max: 10)
Complexidade alta  : 1     ⚠   DocumentParser#extract_data (14)
OpenTelemetry      : ✓ configurado
Métricas expostas  : 24
Traces ativos      : sim

Overall: PASS com 1 warning
```
