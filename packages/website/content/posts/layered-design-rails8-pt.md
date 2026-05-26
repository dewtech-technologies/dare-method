---
title: "Layered Design no Rails 8 com DARE"
date: "2026-05-26"
author: "Wanderson Oliveira"
tags: ["dare", "rails", "arquitetura", "layered-design", "hexagonal"]
excerpt: "Como a skill dare-layered-design aplica princípios hexagonais no Rails 8, mantendo a lógica de domínio pura e a infraestrutura intercambiável — sem abrir mão das convenções do framework."
lang: "pt-BR"
---

# Layered Design no Rails 8 com DARE

Rails tem uma tensão histórica com arquitetura limpa. O framework é opinionado por natureza, e suas convenções — `ActiveRecord`, concerns, callbacks — tornam muito fácil violar os princípios de separação de responsabilidades. Mas isso não significa que você precisa escolher entre "Rails puro e bagunçado" ou "arquitetura limpa sem Rails".

A skill `dare-layered-design` resolve essa tensão. Ela aplica princípios hexagonais dentro das convenções do Rails 8, sem que você precise abandonar tudo que torna o framework produtivo.

## O problema: a atração gravitacional do ActiveRecord

Todo desenvolvedor Rails conhece o padrão que começa assim:

```ruby
class Order < ApplicationRecord
  belongs_to :customer
  has_many :items

  def total
    items.sum(:price)
  end

  def process!
    # chama Stripe diretamente
    charge = Stripe::Charge.create(amount: total, currency: "brl")
    update!(stripe_charge_id: charge.id, status: "paid")
    OrderMailer.confirmation(self).deliver_later
    inventory.decrement!(items)
    # ... mais 50 linhas aqui
  end
end
```

Este model está fazendo cinco coisas: persistência, lógica de domínio, integração de pagamento, envio de e-mail e gestão de inventário. Quando o Stripe mudar de API, quando você precisar testar `process!` sem criar registros reais, ou quando a regra de negócio mudar, você vai pagar o preço dessa mistura.

## A solução: três camadas com papéis claros

A `dare-layered-design` impõe três camadas com responsabilidades bem definidas:

```
app/
├── domain/           ← lógica de negócio pura, sem dependências externas
│   ├── entities/
│   ├── use_cases/
│   └── repositories/ ← interfaces (ports)
├── infrastructure/   ← implementações concretas (adapters)
│   ├── persistence/  ← ActiveRecord models
│   ├── payment/      ← Stripe adapter
│   └── messaging/    ← ActionMailer adapter
└── interfaces/       ← entrypoints
    ├── http/         ← controllers
    └── workers/      ← Sidekiq jobs
```

### A camada `domain/` — sem ActiveRecord, sem Rails

```ruby
# app/domain/entities/order.rb
module Domain
  class Order
    attr_reader :id, :customer_id, :items, :status

    def initialize(id:, customer_id:, items:, status: :pending)
      @id          = id
      @customer_id = customer_id
      @items       = items
      @status      = status
    end

    def total
      items.sum(&:price)
    end

    def can_be_processed?
      status == :pending && items.any? && total > 0
    end
  end
end
```

Esta entidade é pura Ruby. Zero dependências de framework. Testável em microssegundos.

### O use case — orquestra, não implementa

```ruby
# app/domain/use_cases/process_order.rb
module Domain
  module UseCases
    class ProcessOrder
      def initialize(orders:, payments:, notifications:, inventory:)
        @orders        = orders        # port: Domain::Repositories::Orders
        @payments      = payments      # port: Domain::Repositories::Payments
        @notifications = notifications # port: Domain::Repositories::Notifications
        @inventory     = inventory     # port: Domain::Repositories::Inventory
      end

      def call(order_id:)
        order = @orders.find(order_id)
        raise OrderNotFound         unless order
        raise OrderCannotBeProcessed unless order.can_be_processed?

        charge = @payments.charge(amount: order.total, currency: "BRL")
        @inventory.decrement(order.items)
        @notifications.send_confirmation(order)
        @orders.mark_as_paid(order, charge_id: charge.id)

        order
      end
    end
  end
end
```

O use case não sabe que o Stripe existe. Não sabe que há um banco de dados. Ele só conhece as interfaces (ports).

### Os adapters — implementam os ports com Rails

```ruby
# app/infrastructure/persistence/active_record_orders.rb
module Infrastructure
  module Persistence
    class ActiveRecordOrders
      def find(id)
        record = OrderRecord.find_by(id: id)
        return nil unless record
        Domain::Order.new(
          id: record.id,
          customer_id: record.customer_id,
          items: record.items.map { |i| Domain::Item.new(id: i.id, price: i.price) },
          status: record.status.to_sym
        )
      end

      def mark_as_paid(order, charge_id:)
        OrderRecord.find(order.id).update!(status: "paid", stripe_charge_id: charge_id)
      end
    end
  end
end

# app/infrastructure/payment/stripe_payments.rb
module Infrastructure
  module Payment
    class StripePayments
      def charge(amount:, currency:)
        Stripe::Charge.create(
          amount: (amount * 100).to_i,
          currency: currency.downcase
        )
      end
    end
  end
end
```

## Wiring — como Rails conecta as peças

No Rails 8, o wiring acontece no controller ou, melhor ainda, via dependency injection no initializer:

```ruby
# app/interfaces/http/orders_controller.rb
class OrdersController < ApplicationController
  def create
    order = process_order.call(order_id: params[:id])
    render json: OrderSerializer.new(order), status: :ok
  rescue Domain::UseCases::OrderNotFound
    render json: { error: "Order not found" }, status: :not_found
  rescue Domain::UseCases::OrderCannotBeProcessed
    render json: { error: "Order cannot be processed" }, status: :unprocessable_entity
  end

  private

  def process_order
    Domain::UseCases::ProcessOrder.new(
      orders:        Infrastructure::Persistence::ActiveRecordOrders.new,
      payments:      Infrastructure::Payment::StripePayments.new,
      notifications: Infrastructure::Messaging::ActionMailerNotifications.new,
      inventory:     Infrastructure::Persistence::ActiveRecordInventory.new
    )
  end
end
```

## Como o dare-layered-design gate protege essa arquitetura

A skill registra um validation gate que roda no Ralph Loop:

```bash
dare layered check

# Verificando violações de camada...
# ✓ domain/entities/   — 0 infraestrutura leaks
# ✓ domain/use_cases/  — dependency direction correta
# ⚠ domain/use_cases/send_invoice.rb line 14:
#     require "sendgrid" — mova para infrastructure/messaging/
```

O gate analisa estaticamente os `require`/`include`/`inherit` de cada arquivo e garante que a camada `domain/` nunca referencie `infrastructure/`. Se a IA gerar código que viola essa regra no Ralph Loop, o gate vai falhar e forçar a correção antes de marcar a task como DONE.

## Testabilidade — o benefício real

Com essa arquitetura, o teste do use case não precisa de banco de dados, Stripe ou ActionMailer:

```ruby
# spec/unit/domain/use_cases/process_order_spec.rb
RSpec.describe Domain::UseCases::ProcessOrder do
  subject(:use_case) do
    described_class.new(
      orders:        FakeOrders.new,
      payments:      FakePayments.new,
      notifications: FakeNotifications.new,
      inventory:     FakeInventory.new
    )
  end

  it "processes a valid order" do
    order = FakeOrders.create_pending_order(total: 150.0)
    result = use_case.call(order_id: order.id)

    expect(result.status).to eq(:paid)
    expect(FakePayments.charges).to include(amount: 150.0)
    expect(FakeNotifications.sent).to include(order.id)
  end

  it "raises when order cannot be processed" do
    order = FakeOrders.create_paid_order
    expect { use_case.call(order_id: order.id) }
      .to raise_error(Domain::UseCases::OrderCannotBeProcessed)
  end
end
```

Esses testes rodam em **menos de 5ms** — sem banco, sem rede, sem mocks de framework.

## Conclusão

Layered Design no Rails não significa abandonar o framework. Significa usá-lo no lugar certo: a camada `infrastructure/` é onde o Rails brilha — persistência, HTTP, jobs. A camada `domain/` é onde a sua lógica de negócio vive, pura e testável.

A `dare-layered-design` automatiza a vigilância dessa separação, garantindo que a IA no Ralph Loop não vaze infraestrutura para o domínio — mesmo quando seria mais fácil (e mais rápido) fazer isso.

O resultado é um codebase que você pode evoluir, testar e refatorar com confiança — mesmo cinco anos depois, mesmo com uma equipe diferente, mesmo trocando o Stripe pelo Pagarme.

---

*Para instalar a skill: `dare skill add dare-layered-design`*
*Documentação completa: [docs.dare.dewtech.tech/skills/dare-layered-design](https://docs.dare.dewtech.tech/skills/dare-layered-design)*
