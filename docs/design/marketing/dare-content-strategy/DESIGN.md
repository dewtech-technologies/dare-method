# DESIGN.md — Marketing `dare-content-strategy` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-content-strategy` coordena o **lançamento público de DARE v3.0** via conteúdo técnico, landing page, consultoria, e engajamento comunitário.

Entregáveis:
- **DARE Cloud landing page** (waitlist apenas, sem código backend)
- **Consultoria page** (formulário, pricing indicativo)
- **4-5 technical posts** (PT-BR + EN): Evil Martians, Layered Design, LLM-First, Real-time
- **Case study sintético** (exemplo: projeto fictício rodar em produção via DARE)
- **Video script** (2-3 min YouTube) explicando v3.0 diferencial
- **Social media plan** (HN, Reddit, Twitter, LinkedIn, comunidades BR)

Objetivo: **tração pública** + **credibilidade técnica** para atrair early adopters e primeiras conversas de consultoria.

---

## 2. Problema que Resolve

### 2.1 O gap atual

DARE v3.0 é excelente (7 skills, 10 DESIGN.md) mas:
- Ninguém sabe que existe
- Nenhuma demonstração pública
- Nenhuma way to try (sem SaaS, sem open beta)
- Comunidade Rust PT-BR existe, mas frontend/full-stack não

### 2.2 Sintomas

1. "DARE? Never heard of it" — zero brand recognition
2. LLMs no código é hype; DARE é structural (hard to market)
3. "Como começo?" — no easy entry point (só CLI)
4. Wanderson é conhecido em Rust, não em Rails/full-stack

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | Landing DARE Cloud | Live at dare.cloud com waitlist form |
| RF-02 | Consultoria page | dare.cloud/consulting com pricing table |
| RF-03 | Blog posts | 4-5 technical posts (Medium, Dev.to, blog own) |
| RF-04 | Case study | Exemplo projeto completo rodando |
| RF-05 | Video | 2-3 min YouTube script + recording |
| RF-06 | Social promotion | Posts coordenados em 5 plataformas |
| RF-07 | Email list | Newsletter signup no landing |
| RF-08 | Metrics tracking | UTM params, conversion funnel |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Landing < 2s load | Core Web Vitals green |
| RNF-02 | Mobile responsive | Works on phone |
| RNF-03 | SEO basics | Open Graph, meta tags, sitemap |
| RNF-04 | Analytics | GA + Plausible tracking |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | No PII in landing | Forms are minimal (email only) |
| RS-02 | GDPR compliant | Privacy policy, no tracking unless opted |
| RS-03 | CORS on API | Landing can safely call backend |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Wanderson** | Credibilidad and reach for consultoria |
| **Early adopters** | Easy way to understand DARE + try |
| **Community** | Clear docs and narrative |
| **Investors** (future) | Traction metrics |

---

## 7. Métricas de Sucesso

**Apenas Tipo A:**

- **M-01**: Landing page live by week 3 (waitlist functional)
- **M-02**: 4 blog posts published (PT-BR + EN pairs)
- **M-03**: Case study example repo public (runnable)
- **M-04**: 100+ newsletter subscribers by week 4

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Vague value prop | "Awesome methodology!" — specific features instead |
| AP-02 | No CTA | Landing doesn't tell visitor what to do next |
| AP-03 | Long-form only | Video, not just blog posts |
| AP-04 | English only | PT-BR content reaches wider audience |
| AP-05 | No social proof | Zero testimonials or logos |
| AP-06 | Dead landing | Launch, then ignore |

---

## 9. Decisões Arquiteturais

### ADR-01: Waitlist-Only Launch (No Code Backend)

**Decisão:** Landing DARE Cloud is purely static + email capture:

```html
<form action="https://api.example.com/waitlist" method="POST">
  <input type="email" name="email" required />
  <button>Join Waitlist</button>
</form>
```

Email sent to Wanderson; he replies manually. DARE Cloud proper (SaaS with dashboard) is v1.1 deliverable.

**Racional:** MVP launch focus; code can wait; traction first.

**Consequências:**
- Manual email handling (not scalable)
- But fast to launch (day 1)

---

### ADR-02: Case Study Using Real DARE v3.0

**Decisão:** Case study is working GitHub repo using all 7 skills + ruby-rails-8:

Example: **TaskFlow** (project management app)

```
github.com/dewtech/dare-taskflow
├── README explaining each skill usage
├── rails new via dare scaffold
├── Examples of dare-ax (llms.txt, OpenAPI)
├── Examples of dare-layered-design (structure)
├── Examples of dare-llm-integration (summarize tasks)
└── Live demo at tasksflow.example.com
```

**Racional:** Credibility; runnable example > theory.

**Consequencies:**
- Must maintain example app
- Build cost (deploy + hosting)

---

### ADR-03: Content in Multiple Languages

**Decisão:** Primary posts in Portuguese (BR) + English translations:

1. "LLMs como cidadãos de primeira classe" (PT-BR + EN)
2. "Layered Design no Rails 8" (PT-BR + EN)
3. "Real-time features sem magia" (PT-BR + EN)
4. "DARE vs. alternatives" (EN)

**Racional:** Reach Rust PT-BR community + global.

**Consequences:**
- 2x writing effort
- SEO benefit from dual content

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigación |
|-------|-----------|-----------|
| Content doesn't resonate | **Média** | A/B test titles on HN; measure engagement |
| Email list never grows | **Baixa** | Promote in all posts; Twitter, etc. |
| Case study breaks (deps change) | **Média** | Pin versions; CI checks builds |
| Video never gets made | **Baixa** | Time-box to 4 hours; rough is OK |

---

## 11. Dependências

### Internal

- ruby-rails-8 DESIGN.md (used in case study)
- All 7 skills (explained in posts)
- dare-quality-telemetry (metrics in posts)

### External

- Medium / Dev.to accounts
- YouTube channel (Wanderson)
- Twitter / LinkedIn / HN accounts
- Email service (Mailchimp, Substack, or manual)
- Hosting (case study demo)

---

## 12. Fora de Escopo

- Ads (paid promotion) — optional, not v1.0
- Podcast guest appearances — month 2+
- Webinars — v1.1+
- Community Discord — month 2

---

## 13. Roadmap Pós v1.0

### v1.1 — Dashboard + Community

- DARE Cloud dashboard design / mock
- Community Slack / Discord
- Guest blog posts from users
- Webinar series

**Entrega esperada:** month 2

---

### v2.0+

- Paid DARE Cloud SaaS
- Official sponsorships
- Conference talks
- YouTube channel growth

---

## Apêndice A: Content Calendar (Weeks 1-4)

```
Week 1-2 (Design phase):
- Landing page design (HTML)
- Post 1 outlines (PT-BR + EN)
- Video script (draft)

Week 2-3 (Production):
- Landing live (waitlist working)
- 2-3 posts published
- Case study repo created
- Video recorded

Week 3-4 (Promotion):
- Remaining posts live
- All social media posts scheduled
- Case study demo live
- Newsletter signup funnel optimized

Week 4 (Launch):
- HN / Reddit launch
- Twitter storm (3-5 coordinated posts)
- LinkedIn posts
- Email to newsletter
```

---

## Apêndice B: Blog Post Templates

```markdown
# "LLMs como cidadãos de primeira classe em DARE v3.0"

## Hook
Most Rails apps treat LLMs as an afterthought: "Oh, we can add ChatGPT here."
DARE v3.0 treats LLMs as **first-class citizens** — patterned, cached, monitored.

## Problem
- LLM calls everywhere (service, model, job)
- No caching — same question asked 10x/day
- Rate limits discovered in production
- Prompts in code (uncheckable, unmaintainable)

## Solution (dare-llm-integration)
- Centralized LLMProvider (swap OpenAI ↔ local llama)
- Automatic caching (redis)
- Rate limiter (token bucket)
- Prompts as templates (versioned)

## Example Code
[Working Rails example]

## Result
- 50% fewer API calls (via cache)
- 100% deterministic responses
- Easy to test (dummy provider)

## Call to Action
"Interested? Try dare new --stack rails"
```

---

## Apêndice C: Landing Page Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>DARE Cloud — AI-Assisted Development</title>
  <meta name="description" content="...">
  <meta property="og:image" content="...">
</head>
<body>
  <nav>DARE Cloud | Consulting | Docs</nav>
  
  <hero>
    <h1>Build with LLMs, Structured</h1>
    <p>DARE v3.0: Methodology + CLI + Skills for AI-assisted development</p>
    <button>Join Beta Waitlist</button>
  </hero>
  
  <section>
    <h2>What is DARE?</h2>
    <p>4-phase methodology: DESIGN → BLUEPRINT → TASKS → EXECUTE</p>
    <p>7 integrated skills (AX, Layered Design, LLM, Frontend, Real-time, Telemetry)</p>
  </section>
  
  <section>
    <h2>Why DARE v3.0?</h2>
    <ul>
      <li>Rails 8 stack ready (demo: TaskFlow)</li>
      <li>LLM patterns (not hackish integration)</li>
      <li>Quality metrics (100% conformance enforced)</li>
      <li>Community skills (publish your own)</li>
    </ul>
  </section>
  
  <section>
    <h2>Consulting Services</h2>
    <p>Wanderson helps teams adopt DARE</p>
    <p><a href="/consulting">Learn More</a></p>
  </section>
  
  <section>
    <form>
      <h3>Early Access</h3>
      <input type="email" />
      <button>Join Waitlist</button>
    </form>
  </section>
  
  <footer>GitHub | Twitter | Docs</footer>
</body>
</html>
```

---

**Próximo passo:** Implementation via Agent 4 (week 2-3). Landing live by week 3.
