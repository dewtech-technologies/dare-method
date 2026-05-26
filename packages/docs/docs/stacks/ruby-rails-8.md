---
title: Ruby on Rails 8
description: Stack oficial do DARE Method com Rails 8
---

# Stack: Ruby on Rails 8

A stack oficial do DARE v3.0. `dare new --stack rails` provisiona um projeto Rails 8 com todas as configurações de produção já feitas.

## Criar um projeto Rails

```bash
dare new meuapp --stack rails
cd meuapp
```

## O que está incluído

### Infraestrutura base

| Componente | Escolha | Versão |
|-----------|---------|--------|
| Framework | Rails | 8.0+ |
| Ruby | 3.3+ | |
| Banco de dados | PostgreSQL | 16+ |
| Background jobs | Solid Queue | built-in Rails 8 |
| Cache | Solid Cache | built-in Rails 8 |
| WebSocket | Action Cable | built-in Rails |
| Deploy | Kamal 2 | |
| Container | Docker + Alpine | |

### Estrutura gerada

```
meuapp/
├── DARE/
│   ├── DESIGN.md
│   ├── BLUEPRINT.md
│   └── TASKS.md
├── .dare/
│   └── config.json
├── app/
│   ├── components/      ← ViewComponent
│   ├── domain/          ← lógica de negócio (bare-layered-design)
│   ├── infrastructure/
│   └── interfaces/
├── config/
│   ├── initializers/
│   │   └── dare_telemetry.rb
│   └── ...
├── spec/
│   ├── unit/
│   ├── integration/
│   └── system/
├── Gemfile
├── Dockerfile
├── docker-compose.yml
└── kamal/
    └── deploy.yml
```

### Gemfile principal

```ruby
# Core
gem "rails",        "~> 8.0"
gem "pg",           "~> 1.5"
gem "puma",         "~> 6.0"
gem "bootsnap",     require: false

# DARE integrations (instaladas pelo CLI)
gem "dare-rails",   "~> 3.0"   # DARE helpers para Rails

# Frontend
gem "propshaft"
gem "importmap-rails"
gem "turbo-rails"
gem "stimulus-rails"
gem "view_component", "~> 3.0"

# Background & Cache (Rails 8 built-in)
# Solid Queue, Solid Cache — sem gems extras

# Observability
gem "opentelemetry-sdk"
gem "opentelemetry-exporter-otlp"
gem "opentelemetry-instrumentation-rails"
gem "opentelemetry-instrumentation-active_record"

# Testing
group :test do
  gem "rspec-rails"
  gem "factory_bot_rails"
  gem "faker"
  gem "simplecov"
  gem "capybara"
  gem "playwright-ruby-client"
end
```

## Deploy com Kamal 2

```bash
# Configurar deploy
dare deploy setup --target production

# Fazer deploy
dare deploy push
```

O `kamal/deploy.yml` gerado já inclui:

- Healthcheck endpoint `/up`
- Rolling updates (zero downtime)
- Variáveis de ambiente via secrets
- HTTPS via Let's Encrypt (Caddy built-in do Kamal 2)

## Comandos Rails via DARE

```bash
# Rodar migrations
dare rails db:migrate

# Console de produção (via Kamal)
dare rails console --env production

# Status do deploy
dare deploy status
```
