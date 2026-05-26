# DECISIONS.md — Registro Central de Decisões DARE v3.0

**Repositório:** dare-method  
**Criado:** 2026-05-26  
**Manutenção:** Wanderson consulta este arquivo antes de qualquer decisão de feature  

---

## Como usar

Antes de qualquer decisão de implementação ou arquitetura que não esteja clara nos DESIGN.md individuais, registre aqui com:
- **Contexto**: o que motivou
- **Decisão**: o que foi decidido
- **Consequências**: impacto nos agents

Agents 1-5 consultam este arquivo quando há dúvida.

---

## D-001 — Licença permanece MIT

**Data:** 2026-05-26  
**Status:** FECHADO  

**Contexto:** Evil Martians usa MIT; análise de monetização concluiu que trademarks + velocidade + consultoria são proteção suficiente.

**Decisão:** DARE Method é MIT permanentemente. Nenhum fork/branch/versão com AGPLv3, GPLv3, BSL ou SSPL.

**Consequências:** Agentes nunca adicionam licença restritiva a nenhum arquivo, gem, ou dependência gerada.

---

## D-002 — Protocol de Release dos 5 Artefatos

**Data:** 2026-05-26  
**Status:** FECHADO (regra operacional)

**Contexto:** Releases precisam ser coordenados para não divergir.

**Decisão:** Antes de qualquer tag SemVer, atualizar juntos:
1. `ROADMAP.md`
2. `README.md` (raiz)
3. README do CLI
4. `CHANGELOG.md`
5. Tag git em SemVer

**Consequências:** Agents NÃO criam tags. Wanderson faz review + merge + tag manualmente.

---

## D-003 — Rails é Stack Piloto (Prioridade Máxima)

**Data:** 2026-05-26  
**Status:** FECHADO  

**Contexto:** Evil Martians é fortemente Rails; Vladimir Dementyev (Tropical on Rails 2026) é referência.

**Decisão:** Stack Rails completo (dare-rails-ax, dare-rails-layered-design, etc.) entra em v3.0. Rust segundo. NestJS terceiro.

**Consequências:** Agent 2 tem prioridade sobre todos os outros em qualquer conflito de bandwidth ou dependência cruzada.

---

## D-004 — Métricas Apenas Tipo A

**Data:** 2026-05-26  
**Status:** FECHADO  

**Contexto:** Métricas de adoção (downloads, stars, etc.) são fora do controle de Wanderson.

**Decisão:** Somente métricas binárias e técnicas: M-01 a M-04 por skill. Zero métricas de adoção ou impacto externo.

**Consequências:** Agents nunca adicionam tracking de usuário, analytics de adoção, ou métricas de "satisfação" nos DESIGNs.

---

## D-005 — Escape `ax: not-applicable` para Projetos Edge-Case

**Data:** 2026-05-26  
**Status:** FECHADO  

**Contexto:** Alguns projetos (embedded, firmware, CLI puro) não se encaixam em todos os padrões AX.

**Decisão:** Seção AX em DESIGN.md é obrigatória, mas projeto pode setar `ax: not-applicable` na config para escapar validação CI.

**Consequências:** Generator DARE aceita flag `--no-ax`; CI valida apenas se `ax != not-applicable`.

---

## D-006 — RFC 7807 como Padrão de Erro HTTP

**Data:** 2026-05-26  
**Status:** FECHADO  

**Contexto:** Consistência de resposta de erro entre stacks.

**Decisão:** Todos endpoints HTTP respondem com RFC 7807 Problem Details como default. Override explícito via config.

**Consequências:** Agent 2 (Rails) adiciona concern `ProblemDetails` a ApplicationController. Agents de outras stacks seguem o mesmo padrão.

---

## D-007 — DARE Cloud é Waitlist-Only nos 30 Dias

**Data:** 2026-05-26  
**Status:** FECHADO  

**Contexto:** DARE Cloud real (SaaS com dashboard) é grande; não cabe nos 30 dias.

**Decisão:** Agent 4 entrega apenas landing page + waitlist form. Zero código backend para DARE Cloud v1.0.

**Consequências:** Agent 4 não cria APIs ou banco de dados. Landing é HTML/CSS + form que envia email.

---

## D-008 — Agentes NÃO Criam Tags nem Pushes Diretos

**Data:** 2026-05-26  
**Status:** FECHADO (operacional)

**Contexto:** Releases são responsabilidade de Wanderson após revisão.

**Decisão:** Agents fazem commits em suas branches. Wanderson revisa, merga, e cria tag. Agents NUNCA fazem `git push --force`, `git tag`, ou `git push origin main`.

**Consequências:** CI do agent é sempre em branch separada. PR para main é processo de Wanderson.

---

## Aberto (para discussão futura)

*Adicione aqui questões não resolvidas que precisam de decisão antes de avançar.*

- ~~INPI ou USPTO primeiro?~~ (Paralelo — D-009 a criar)

---

## Template para nova decisão

```
## D-XXX — [Título curto]

**Data:** YYYY-MM-DD  
**Status:** ABERTO / FECHADO  

**Contexto:** O que motivou esta decisão.

**Decisão:** O que foi decidido.

**Consequências:** Como afeta agents e implementação.
```
