# Fase 1 — Design

> **O que vamos construir e por quê.**

| Atributo | Valor |
|---|---|
| **Quem dirige** | Humano |
| **Papel da IA** | Assistente — faz perguntas, sugere clarificações |
| **Saída** | `DARE/DESIGN.md` |
| **Tempo típico** | 15-30 min (feature média) |
| **Pré-requisito** | nenhum |
| **Próxima fase** | [Architect](2-architect.md) |

## 🎯 Objetivo

Capturar **o problema** sendo resolvido, **o que** será construído pra resolvê-lo, e **por quê** isso importa — antes de discutir como.

A intenção é deixar essas decisões registradas e auditáveis depois. Em 6 meses, quando alguém perguntar "por que essa feature existe?", a resposta está no DESIGN.md.

## 📋 O que entra no `DESIGN.md`

### 1. Contexto / Problema
*Por que essa feature precisa existir? Que dor estamos resolvendo?*

Não confunda com solução. Se você já sabe a solução, pergunte: "Que problema essa solução resolve?". Vá subindo até chegar no problema raiz.

### 2. Critérios de sucesso
*Como vamos saber que funcionou? Em métricas testáveis.*

Ruim: "feature deve ser rápida"
Bom: "endpoint POST /auth/login responde em < 200ms p95 com 100 req/s simultâneos"

### 3. Restrições
*O que precisamos respeitar?*

- Técnicas: stack obrigatória, integrações existentes, performance
- Negócio: prazo, regulamentação, custo
- Time: deadline duro, dependências de outras squads

### 4. Não-objetivos
*O que explicitamente está fora do escopo?*

A coisa mais subestimada do Design. Listar não-objetivos elimina ambiguidade depois.

Ex: "Login social (Google, Apple) NÃO está nessa fase. Será feature separada."

### 5. Personas e cenários (se aplicável)
*Quem usa? Em que contexto?*

User stories no formato "Como X, quero Y, pra Z" funcionam bem.

### 6. Premissas
*O que estamos assumindo?*

Listar premissas explicita risco. Se uma premissa for falsa, o projeto pode pivotar.

## 🤖 Como a IA assiste nessa fase

A IA é **maiêutica** — ajuda você a explicitar o que já sabe mas não articulou. Boa IA na fase Design:

- ✅ Faz perguntas pra eliminar ambiguidades
- ✅ Sugere casos de borda que você não pensou
- ✅ Pede critérios mais específicos quando você foi vago
- ✅ Lista premissas que você está fazendo implicitamente

**O que IA NÃO deve fazer aqui:**
- ❌ Propor solução / arquitetura
- ❌ Escrever código de exemplo
- ❌ Sugerir libraries / frameworks específicos
- ❌ Discutir trade-offs técnicos

Tudo isso é Architect. Se o IA insistir em ir pra lá, você redireciona.

## 🚀 Como disparar (Cursor)

```
/generate-design "Quero adicionar autenticação JWT na API. Usuários logam com email/senha, recebem token de 1h, refresh token de 7 dias. Preciso disso pra desbloquear feature de favoritos que está esperando."
```

A IA vai gerar `DARE/DESIGN.md` com seções estruturadas + perguntas em comentários (`<!-- ... -->`) onde precisa de mais info.

Você responde inline, refina, e quando estiver satisfeito, **você aprova explicitamente** removendo as perguntas e marcando o doc como pronto.

## ✅ Critério de "Design pronto"

Antes de avançar pra Architect, valida:

- [ ] Problema descrito sem mencionar solução
- [ ] Critérios de sucesso são testáveis (com números)
- [ ] Restrições listadas
- [ ] Não-objetivos explícitos
- [ ] Premissas registradas
- [ ] Outra pessoa (ou você no dia seguinte) entenderia o documento sem contexto adicional

## 🚫 Anti-padrões comuns

### "DESIGN.md com pseudocódigo"
Você já está em Architect. Volta. Apaga implementação. Foca no quê/porquê.

### "DESIGN.md de 1 linha"
*"Adicionar login JWT"* não é design — é título. Se levou menos de 10 min pra escrever, provavelmente está raso.

### "DESIGN.md de 30 páginas"
Se ficou muito longo, escopo está grande demais. Quebra em 3-5 designs menores.

### "Aprovar e nunca olhar de novo"
DESIGN.md é vivo durante o projeto. Se descobrir requisito novo na fase Architect ou Execute, **volta no DESIGN.md** e atualiza. Não enfia hack na implementação.

## 📂 Templates

- [`templates/DESIGN-template.md`](../../templates/DESIGN-template.md) (na raiz dos templates universais — mas cada implementação tem cópia)

## 🔗 Próximo

[Fase 2: Architect →](2-architect.md)
