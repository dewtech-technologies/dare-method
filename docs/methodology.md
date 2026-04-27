# DARE — Metodologia detalhada

> Documento canônico da metodologia. Implementações específicas (Cursor, Antigravity) seguem este documento como contrato. Mudanças aqui são **breaking changes** do método.

## 🧭 Princípios fundadores

DARE não foi inventado em vazio — é uma resposta a 3 problemas observados no desenvolvimento com IA em 2024-2025:

### Problema 1: Vibe Coding escala mal
Quando você pede "me dá um código que faça X" pra IA e aceita o que vier, funciona pra protótipo. Mas em codebase real:
- Decisões arquiteturais ficam implícitas no código (não documentadas)
- Cada nova feature compete com inconsistências acumuladas
- Onboarding de novo dev ou nova IA volta à estaca zero

### Problema 2: Especificação tradicional desperdiça IA
Se você escreve specs detalhadas como antes (com humano fazendo todo o pensamento), a IA vira só auto-complete sofisticado. Não aproveita capacidade real de geração.

### Problema 3: Falta de checkpoints custa caro
IA + autonomia total + tarefa complexa = 30 minutos de tokens queimados produzindo código que vai contra o que você queria. Sem checkpoints, descobre tarde.

DARE resolve os 3 separando **estratégia (humano)** de **tática (IA)** com checkpoints obrigatórios.

## 📐 Os 4 estágios em profundidade

### 1. Design — *o que* e *por quê*

**Quem:** humano dirige, IA assiste com perguntas

**Saída:** `DARE/DESIGN.md`

**Conteúdo esperado:**
- Problema sendo resolvido (não solução — problema)
- Critérios de sucesso (testáveis)
- Restrições (técnicas, de negócio, de tempo)
- Não-objetivos explícitos (o que NÃO está no escopo)
- Personas e cenários de uso (se aplicável)

**Anti-padrão:** Design já contendo arquitetura ou implementação. Se você está escrevendo nomes de classe ou estrutura de pasta, isso é Architect, não Design.

[Detalhes da fase 1 →](phases/1-design.md)

### 2. Architect — *como*

**Quem:** IA propõe, humano valida

**Saída:** `DARE/BLUEPRINT.md`

**Conteúdo esperado:**
- Decisões arquiteturais com trade-offs explícitos
- Stack escolhida (com justificativa)
- Estrutura de pastas / módulos
- Modelos de dados / contratos de API
- Pontos de extensão futuros
- Lista preliminar de tarefas (refinada na fase Review)

**Anti-padrão:** Blueprint sem trade-offs explícitos. Toda escolha exclui alternativas — quais foram e por quê?

[Detalhes da fase 2 →](phases/2-architect.md)

### 3. Review — *aprovação humana explícita*

**Quem:** humano (decisão), IA não participa

**Saída:** ✓ aprovação ou rejeição com feedback

**O que fazer:**
- Ler o BLUEPRINT.md inteiro (sim, inteiro)
- Confrontar com o DESIGN.md original
- Identificar premissas erradas, gaps, sobre-engenharia
- Aprovar OU pedir revisão (volta ao Architect)

**Anti-padrão:** "Skim review" — passar o olho rápido e aprovar. Cada bug arquitetural não pego aqui custa 10x mais nas próximas fases.

[Detalhes da fase 3 →](phases/3-review.md)

### 4. Execute — *implementação com Ralph Loop*

**Quem:** IA implementa, humano monitora

**Saída:** Código + testes verdes

**Como funciona:**
1. IA lê uma `task-NNN.md` (extraída do BLUEPRINT.md)
2. Implementa o código
3. Roda os Validation Gates (testes + linter + type checker)
4. Se falhar: lê o erro, corrige, tenta de novo (**Ralph Loop**)
5. Quando todos os gates passarem: ✓ task concluída
6. Próxima task

**Anti-padrão:** Tarefas sem Validation Gates. Sem gates, "concluído" vira opinião, não fato.

[Detalhes da fase 4 →](phases/4-execute.md)
[Ralph Loop em profundidade →](ralph-loop.md)

## 🔁 Quando voltar atrás

| Situação | Para qual fase voltar |
|---|---|
| Ralph Loop entra em loop infinito (mesmo erro 3+ vezes) | Architect — provavelmente o BLUEPRINT está errado |
| BLUEPRINT.md fica enorme e confuso | Design — escopo está mal definido |
| Aprovou Review mas a primeira task já mostra problema | Architect — Review foi superficial |
| Stakeholder mudou requisito | Design — não tente "patchear" — refaça |

**Não é fracasso voltar atrás.** É o método funcionando — você descobriu cedo, não tarde.

## 🚫 O que DARE NÃO é

- **Não é Waterfall.** Você pode iterar entre fases. Só não pode pular.
- **Não é processo burocrático.** Design + Architect somam 30-60 min pra feature média.
- **Não é só pra equipe grande.** Funciona pra dev solo (na verdade, é onde brilha — porque você é o único validador).
- **Não é amarrado a uma stack.** Funciona em qualquer linguagem, qualquer IDE, qualquer paradigma.
- **Não é um framework de código.** É um framework mental + templates de markdown + comandos opcionais.

## 📊 Quando usar

| Cenário | DARE faz sentido? |
|---|---|
| Feature nova em produto sério | ✅ sempre |
| Bug fix complexo (>1h estimado) | ✅ use `/generate-bugfix-design` |
| Refactor arquitetural | ✅ Design + Architect explícitos |
| POC descartável | ⚠️ overkill — Vibe Coding serve |
| Hello world / spike de aprendizado | ❌ não use |
| Script one-shot (<50 linhas) | ❌ não use |

## 🎯 Princípio resumo

> **Humanos pensam. IAs executam. Checkpoints validam.**
>
> Toda tentativa de violar isso degrada a qualidade do output.

## 🔗 Próxima leitura

- [Ralph Loop em profundidade](ralph-loop.md)
- [Glossário de termos](glossary.md)
- [Comparação com outras metodologias](comparisons.md)
- [FAQ](faq.md)
