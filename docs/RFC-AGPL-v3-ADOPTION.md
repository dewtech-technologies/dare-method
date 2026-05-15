# RFC: Adoção de AGPL v3 no DARE CLI

> **Status:** Open for Discussion  
> **Date Created:** 2026-05-14  
> **Target Decision:** 2026-05-28  
> **Target Release:** v3.0.0 (early June 2026)

---

## TL;DR

**Proposta:** Migrar `@dewtech/dare-cli` de **MIT** para **AGPL v3** na v3.0.0.

**Quando:** Junho 2026 (após 3 features em MIT: Excalidraw, Ruby on Rails, Flutter)

**Impacto:**
- ✅ Seu projeto gerado: Permanece MIT (seus)
- ✅ Usando internamente: Zero impacto
- ⚠️ Vendendo "DARE Cloud SaaS": Precisa ser AGPL ou licença comercial

**Modelo de Negócio:** Open Core
- CLI (AGPL) → Gratuito, comunidade controla
- Desktop/Agents (Proprietário) → Pago, monetizado

---

## 1. Contexto

### O que é DARE?

[DARE Framework](https://github.com/dewtech-technologies/dare-method) é uma metodologia de desenvolvimento com IA (Design → Architect → Review → Execute) com:

- **Metodologia** (MIT) — documentada, aberta, reutilizável
- **CLI** (atualmente MIT) — ferramenta executável
- **Implementações** (MIT) — skills para Cursor, Claude Code, Antigravity
- **Produtos futuros** (Proprietário) — Desktop, Orquestração, Serviços

### Por que MIT hoje?

Lançado como MIT porque:
1. Metodologia é o diferencial, não a ferramenta
2. Foco em adoção rápida e comunidade
3. Produtos comerciais não estavam planejados ainda

### Por que AGPL v3 agora?

**Fatos:**
- CLI cresceu muito (v0 → v2.15.0 em ~6 meses)
- Roadmap inclui produtos complementares (Desktop, Agents)
- Risco: competitor copia CLI como "DARE SaaS" sem contribuir

**Objetivo:** Proteger investimento + garantir contribuições voltam à comunidade.

---

## 2. Proposta

### Mudar para AGPL v3

**Arquivo de licença:**
```
LICENSE → conteúdo AGPL v3
```

**Package.json:**
```json
{
  "license": "MIT" → "license": "AGPL-3.0-only",
  "name": "@dewtech/dare-cli"
}
```

**Versão:** v3.0.0 (breaking change semântico)

### O que NÃO muda

- ✅ Metodologia DARE → Permanece MIT
- ✅ Documentação → Permanece MIT
- ✅ Código GERADO pelo CLI → MIT (seus)
- ✅ Templates → MIT (seus)
- ✅ Exemplos → MIT
- ❌ CLI executável → AGPL v3

---

## 3. Impacto Técnico

### Cenário A: Usuário Individual

```
Você: "Quero usar DARE"
     ↓
dare init meu-projeto
     ↓
Seu projeto é MIT ✅ (100% seus)
CLI que usou é AGPL (gratuito)
```

**Impacto:** ✅ **Zero impacto**

---

### Cenário B: Empresa Usando Internamente

```
Empresa: "Rodamos DARE internamente"
     ↓
dare execute --ralph-loop (seu servidor)
     ↓
Código gerado é seus ✅
CLI rodando é AGPL (sem vender)
```

**Impacto:** ✅ **Zero impacto**

---

### Cenário C: Empresa Vendendo "DARE Cloud"

```
Empresa A: "Vamos copiar DARE e vender como SaaS"
     ↓
Fork dare-cli (AGPL)
     ↓
Modificam + deployam em dare-cloud.com
     ↓
AGPL força divulgação do código
```

**Opções:**
1. ✅ Contribuem mudanças de volta (AGPL)
2. ✅ Pagam licença comercial ($X/mês)
3. ❌ Tentam esconder (viola AGPL, legal risk)

**Impacto:** ⚠️ **Aplicável a 1% dos users, proteção forte**

---

## 4. Modelo de Negócio

### Open Core Strategy

```
DARE CLI (AGPL v3)
├─ Gratuito ✅
├─ Open source ✅
├─ Comunidade contribui ✅
└─ Protege contra SaaS competitors ✅

DARE Desktop (Proprietário)
├─ Orquestração visual
├─ Agents distribuídos
├─ Pipeline CI/CD gerenciado
└─ Suporte prioritário

DARE Licença Comercial (Proprietário)
├─ Para quem não quer AGPL
├─ Unlimited deployments
└─ Custom terms
```

Pricing details will be announced after v3.0.0 based on community feedback and market validation.

---

## 5. Cronograma

### Fase 1: Anúncio & Discussão
**Quando:** Agora (19-25 mai)
- [ ] Publicar RFC no GitHub Discussions
- [ ] Mencionar no README
- [ ] Responder a dúvidas e feedback

### Fase 2: Entrega de Features
**Quando:** 26 mai - 15 jun (3 semanas, 3 features)
- [ ] v2.16.0: Excalidraw DAG Visualization
- [ ] v2.17.0: Ruby on Rails Stack Support
- [ ] v2.18.0: Flutter Stack Support

**Motivo:** Demonstrar comprometimento. Comunidade vê features sendo entregues = confia na mudança.

### Fase 3: Migração
**Quando:** 16 jun
- [ ] Merge RFC com feedback incorporado
- [ ] Atualizar LICENSE e package.json
- [ ] Tag v3.0.0
- [ ] Publicar `@dewtech/dare-cli@3.0.0`

---

## 6. FAQ

### P: Meu código gerado fica AGPL?

**R:** Não. `dare init` gera **MIT**:
```
dare init meu-projeto
├── apps/api/     ← MIT (seus)
├── apps/web/     ← MIT (seus)
└── DARE/         ← AGPL (referência)
```

Você é dono do seu código. Pode vender, fechar, fazer o que quiser.

---

### P: Preciso contribuir ao DARE?

**R:** Depende de como você usa:

| Uso | Precisa Contribuir? |
|-----|-----|
| Usar CLI localmente | ❌ Não |
| Usar CLI internamente (EC2/K8s seu) | ❌ Não |
| Modificar CLI e ficar privado | ❌ Não |
| **Vender "DARE como serviço"** | ✅ **Sim** (AGPL ou licença) |

---

### P: Quando sai a licença comercial?

**R:** Após v3.0.0. Termos e preços serão definidos em junho baseado em feedback.

---

### P: Posso usar v2.15.0 (MIT) para sempre?

**R:** Sim. v2.15.0 e anteriores permanecem MIT. Mas:
- Sem atualizações de segurança
- Sem novos features
- Sem suporte

Recomendamos upgrade para v3.0.0+ AGPL.

---

### P: Vocês vão abandonar o projeto?

**R:** Não. AGPL significa exatamente o oposto:
- ✅ Código público
- ✅ Comunidade controla
- ✅ Melhorias voltam
- ✅ Desenvolvimento contínuo

Se abandonarmos, qualquer um pode forkar.

---

### P: Qual é o verdadeiro motivo?

**R:** Honesto:
1. CLI cresceu além do esperado
2. Queremos monetizar produtos complementares (Desktop)
3. Queremos garantir que melhorias voltam (não forks sem licença)
4. Queremos proteção legal contra SaaS competitors

**Isso é legítimo.** Open source + modelo de negócio sustentável = melhor do que MIT que morre.

---

## 7. Alternativas Consideradas

| Alternativa | Descartada por quê |
|---|---|
| **Ficar em MIT** | Sem proteção contra "DARE Cloud" competitors; difícil monetizar Desktop |
| **Apache 2.0** | Proteção de patente mas não resolve SaaS loophole |
| **GPL v3** | Não cobre uso via rede; SaaS ainda consegue contornar |
| **Dual MIT + Comercial** | Complexo demais para agora; AGPL depois escalamos |
| **Proprietário** | Contra a filosofia DARE; comunidade não confiaria |
| **FSL (Fair Source)** | Bom mas menos reconhecido; AGPL é melhor conhecido |

---

## 8. Referências & Créditos

### Inspirações
- **Ralph Loop** — termo original (desenvolvedor americano)
- **Excalidraw** — ferramenta open source (MIT)
- **Cole Medin** — Excalidraw Diagram Skill
- **Metodologias de licença** — exemplos: GitLab (SSPL), Metabase (AGPL), Sentry (AGPL)

### Trabalho Original DARE
- **Metodologia** — Wanderson Leandro (Dewtech Technologies)
- **CLI** — Wanderson Leandro + comunidade
- **Adaptações** — baseadas em experiência prática, dores do dia a dia

---

## 9. Como Responder/Votar

### Se Você APROVA ✅
```
Deixe um comentário:
"Aprovado! Faz sentido proteger o trabalho."
```

### Se Você TEM DÚVIDAS ❓
```
Comente a pergunta específica:
"P: E se [cenário]?"
```

### Se Você DISCORDA ❌
```
Deixe seu feedback:
"Discordo porque [razão]"
```

---

## 10. Próximos Passos

**Semana de 19 mai:**
- [ ] Publicar RFC (este documento)
- [ ] Responder a dúvidas em tempo real
- [ ] Incorporar feedback

**Semana de 26 mai:**
- [ ] Analisar feedback
- [ ] Decidir: Prosseguir ou ajustar?
- [ ] v2.16.0 release (primeira feature antes de AGPL)

**Semana de 2 jun:**
- [ ] v2.17.0, v2.18.0 releases

**Semana de 16 jun:**
- [ ] Merge RFC com feedback incorporado
- [ ] v3.0.0 AGPL v3 release
- [ ] Anúncio final

---

## 11. Contato & Discussão

**GitHub Discussions:** [Link aqui após publicar]

**Email:** suporte@dewtech.tech

**Timeline:** Respondo dentro de 24h

---

## Resumo: Por que AGPL v3 é certo para DARE

| Aspecto | Benefício |
|---|---|
| **Transparência** | Comunidade sabe que não há "trapaça" |
| **Sustentabilidade** | Monetizar Desktop + Agents de forma justa |
| **Proteção** | Bloqueia "DARE Cloud" competitors sem contribuir |
| **Comunidade** | Contribuições voltam (não forks privativos) |
| **Ética** | Honesto: não é MIT falso, é modelo de negócio real |

---

**Você tem voz nessa decisão. Comente abaixo.** 🙏

---

**Versão:** 1.0  
**Última atualização:** 2026-05-14  
**Licença:** CC BY-SA 4.0 (até publicação; depois AGPL v3)
