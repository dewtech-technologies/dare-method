# Comparações — DARE vs outras abordagens

> Comparativo honesto entre DARE e outras metodologias / práticas comuns. Cada uma tem cenário ideal — não há "vencedora absoluta".

## 🌪️ DARE vs Vibe Coding

**Vibe Coding** = "Me dá um código que faça X" + esperança.

| Dimensão | DARE | Vibe Coding |
|---|---|---|
| **Estrutura** | 4 fases obrigatórias | Nenhuma |
| **Velocidade pra protótipo** | Média | **Alta** |
| **Velocidade pra evolução** | **Alta** | Cai com complexidade |
| **Auditabilidade** | Total | Nenhuma |
| **Risco em produção** | Baixo | Alto |
| **Onboarding de novo dev** | Fácil (DESIGN/BLUEPRINT explicam) | Difícil (lê código pra entender intenção) |
| **Curva de aprendizado** | Média | Zero |

### Quando usar Vibe Coding em vez de DARE
- Protótipo descartável (será jogado fora em dias)
- POC pra validar conceito (não pra virar produto)
- Spike de aprendizado de tecnologia nova
- Hello world / scripts one-shot

### Quando NÃO usar Vibe Coding
- Qualquer feature que vá pra produção
- Projeto com múltiplos contributores
- Codebase que vai durar > 6 meses
- Domínio com requisitos de auditabilidade (financeiro, saúde, jurídico)

## 📋 DARE vs BDD (Behavior-Driven Development)

**BDD** = especificação de comportamento via cenários "Given / When / Then" antes da implementação.

| Dimensão | DARE | BDD |
|---|---|---|
| **Foco** | Estrutura geral do dev com IA | Especificação de comportamento |
| **Quem escreve specs** | Humano (DESIGN) + IA (BLUEPRINT) | Humano (com PO/QA) |
| **Granularidade** | Feature → arquitetura → tasks | Cenário comportamental |
| **Execução** | IA implementa com Ralph Loop | Humano implementa pra fazer cenários passarem |
| **Combinam?** | **Sim — totalmente** | — |

### Como combinar
Cenários BDD podem ser inputs do `DESIGN.md` na seção "Critérios de sucesso" ou "Casos de uso". O `BLUEPRINT.md` referencia esses cenários ao decidir testes. As `task-NNN.md` listam os cenários como Validation Gates.

## ✅ DARE vs TDD (Test-Driven Development)

**TDD** = ciclo Red → Green → Refactor. Escreve teste antes do código.

| Dimensão | DARE | TDD clássico |
|---|---|---|
| **Foco** | Estrutura geral do dev com IA | Cobertura de testes via design dirigido por testes |
| **Quem escreve testes** | IA (na task spec) | Humano |
| **Quem escreve código** | IA | Humano |
| **Equivalente do "Red"** | Validation Gates falhando | Test failing |
| **Equivalente do "Green"** | Ralph Loop até gates passarem | Code making test pass |
| **Combinam?** | **Sim** | — |

### Como combinar
A **fase Execute** do DARE incorpora TDD naturalmente quando as tasks são definidas com testes-primeiro:

```markdown
# task-005

## Validation Gates
- npm test -- src/auth/jwt.spec.ts  ← TESTES PRIMEIRO
- npm run typecheck
- npm run lint

## Especificação
Criar JwtService com métodos sign() e verify().
Os testes em src/auth/jwt.spec.ts já existem (criados na task-004).
Implementar pra fazer os testes passarem.
```

A IA executa o Ralph Loop tentando fazer o teste passar — exatamente o ciclo Red → Green do TDD, mas com a IA como agente.

## 🏗️ DARE vs Waterfall

**Waterfall** = fases sequenciais: Requisitos → Design → Implementação → Testes → Deploy. Sem iteração.

| Dimensão | DARE | Waterfall |
|---|---|---|
| **Sequencial** | Sim, mas iterativo entre fases | Sim, sem voltar |
| **Granularidade** | Feature/task | Projeto inteiro |
| **Tempo entre fases** | Minutos / horas | Semanas / meses |
| **Volta atrás permitida** | **Sim, e encorajada** | Não (por design) |
| **Adequado pra IA** | Sim | Não — IA exige iteração |

DARE pode parecer Waterfall por ter fases. Não é: o ciclo Design → Architect → Review → Execute roda **por feature** (minutos a horas), não por projeto (meses). E há feedback explícito entre fases.

## 🌀 DARE vs Agile / Scrum

**Agile/Scrum** = framework organizacional com sprints, backlog, retros, etc.

| Dimensão | DARE | Scrum |
|---|---|---|
| **Nível** | Tática (como se desenvolve) | Organizacional (como se planeja e entrega) |
| **Unidade** | Task técnica | User story |
| **Cadência** | Por feature | Por sprint |
| **Substituem-se?** | **Não** | — |

DARE opera **dentro** de Scrum. Cada user story do sprint vira uma feature DARE com seu próprio ciclo Design → Architect → Review → Execute. Funciona bem em ambos os mundos.

## 🚀 DARE vs Spec-Driven Development (SpecKit, similares)

**Spec-Driven** = ferramentas como SpecKit (Anthropic), Spec by Example, etc.

| Dimensão | DARE | Spec-Driven (geral) |
|---|---|---|
| **Estrutura** | 4 fases canônicas | Varia por ferramenta |
| **Implementação** | Markdown + comandos IDE | DSL específica + tooling |
| **Lock-in** | Zero (markdown puro) | Médio-Alto (depende da ferramenta) |
| **Mecânica de Validation** | Ralph Loop com gates de bash | Próprio da ferramenta |
| **Foco** | Generalista, IDE-agnóstico | Geralmente uma stack/cenário |

DARE é menos opinionated em ferramenta — você implementa em Cursor, Antigravity, ou onde quiser. Spec-Driven costuma vir com tooling proprietário.

## 🎯 Quando usar o quê — guia rápido

```
Pergunta: o código vai pra produção e vai durar?
  ├─ NÃO → Vibe Coding (rápido e descartável)
  └─ SIM → continua...

Pergunta: o domínio tem requisitos comportamentais bem definidos?
  ├─ SIM → DARE + BDD (cenários no DESIGN.md)
  └─ NÃO → continua...

Pergunta: você tem time grande / múltiplos PRs simultâneos?
  ├─ SIM → DARE + Scrum (Scrum organiza, DARE executa)
  └─ NÃO → DARE puro

Pergunta: quer máxima cobertura de testes?
  ├─ SIM → DARE + TDD (testes-primeiro nas task specs)
  └─ NÃO → DARE com gates mínimos
```

## 🔗 Tópicos relacionados

- [Metodologia DARE](methodology.md)
- [Glossário](glossary.md)
- [FAQ](faq.md)
