# Glossário — DARE Method

> Termos canônicos do método. Ordem alfabética.

## Agentic Engineering
Disciplina de engenharia de software focada em **trabalhar bem com agentes de IA** — incluindo prompts, contexto, validação, segurança e iteração. DARE é uma metodologia de Agentic Engineering.

## Architect (fase 2)
Fase em que a IA propõe **arquitetura, stack, estrutura, contratos**. Saída: `BLUEPRINT.md`. Sucede [Design](#design-fase-1), precede [Review](#review-fase-3). [Detalhes →](phases/2-architect.md)

## Attempt
Cada tentativa individual da IA dentro do [Ralph Loop](#ralph-loop). Cada attempt = 1 ciclo de "implementa → roda gates → analisa resultado". Algumas implementações registram em `DARE/EXECUTION/<task>/attempts/`.

## BLUEPRINT.md
Documento técnico produzido pela fase [Architect](#architect-fase-2). Contém arquitetura, stack escolhida, estrutura de pastas, modelos de dados, contratos de API, decisões com trade-offs, lista preliminar de tasks. **Imutável após [Review](#review-fase-3)** sem ciclo formal.

## Checkpoint
Ponto explícito de validação humana entre fases. DARE tem 3 checkpoints obrigatórios: aprovação do DESIGN, aprovação do BLUEPRINT, e revisão de cada task após execução.

## Context Engineering
Disciplina de **fornecer contexto certo, na hora certa, na quantidade certa** pra agentes de IA. Inclui prompts, exemplos, estrutura de pasta, naming conventions. DARE materializa isso em `.cursorrules`, skills, e templates.

## DARE/
Pasta criada na raiz do projeto-alvo (não do repo dare-method). Contém todos os artefatos do método: `DESIGN.md`, `BLUEPRINT.md`, `TASKS.md`, `EXECUTION/task-*.md`, `TELEMETRY.md`. É o "dossiê" do que está sendo construído.

## Design (fase 1)
Fase em que o **humano define** o problema, requisitos, critérios de sucesso, restrições e não-objetivos. IA assiste com perguntas. Saída: `DESIGN.md`. Precede [Architect](#architect-fase-2). [Detalhes →](phases/1-design.md)

## DESIGN.md
Documento de requisitos produzido pela fase [Design](#design-fase-1). Foco em **o quê** e **por quê**, nunca em **como**. É o "norte" do projeto — referência permanente durante toda a execução.

## EXECUTION/
Subpasta de `DARE/` que contém specs individuais por task: `task-001.md`, `task-002.md`, etc. Cada arquivo é a entrada da fase [Execute](#execute-fase-4) pra aquela task específica.

## Execute (fase 4)
Fase em que a **IA implementa** as tasks com [Ralph Loop](#ralph-loop) ativo. Cada task termina quando todos os [Validation Gates](#validation-gates) passam. [Detalhes →](phases/4-execute.md)

## Implementação
Variante do método pra um IDE/agente específico. Atualmente: `implementations/cursor/` e `implementations/antigravity/`. Cada implementação é **autocontida** — copia e usa.

## Ralph Loop
Ciclo de **auto-correção** dentro da fase Execute. A IA implementa → roda Validation Gates → se falha, corrige → tenta de novo → repete até passar (ou parar em 6 attempts). Inspirado no Ralph Wiggum dos Simpsons. [Detalhes →](ralph-loop.md)

## Review (fase 3)
Fase em que o **humano valida** o BLUEPRINT antes de gastar tokens em execução. Ou aprova, ou volta pra Architect com feedback. **A IA não participa desta fase.** [Detalhes →](phases/3-review.md)

## Skill
Arquivo de regras / contexto específico de stack que a IA carrega antes de gerar código. Ex: `skill-laravel-api.mdc` ensina convenções do Laravel; `skill-docker.mdc` ensina multi-stage builds; `skill-security.mdc` ensina OWASP Top 10. Skills são por-implementação:
- Cursor: `.cursor/rules/skill-*.mdc`
- Antigravity: `.agents/skills/<name>/SKILL.md`

## Task
Unidade atômica de execução. Cada task tem: contexto, objetivo, arquivos afetados, spec, [Validation Gates](#validation-gates), dependências, estimativa. Vive em `DARE/EXECUTION/task-NNN.md`.

## TASKS.md
Visão geral de todas as tasks do BLUEPRINT, com status (pendente / em execução / concluída) e ordem de execução baseada em dependências.

## TELEMETRY.md
Registro automático (gerado pela IA durante Execute) de tokens consumidos, modelos usados, tempo gasto, custo estimado. Insumo pro `/telemetry-report`.

## Validation Gates
Comandos objetivos (testes, lint, type check) que precisam passar pra uma task ser considerada concluída. Definidos na spec da task. Ralph Loop opera em torno deles.

## Vibe Coding
Padrão informal de desenvolvimento com IA: "me dá código que faça X" + esperança. Sem estrutura, sem checkpoints. DARE existe como **alternativa estruturada** ao Vibe Coding pra casos onde qualidade e auditabilidade importam. Ver [comparações](comparisons.md).

## 🔗 Tópicos relacionados

- [Metodologia](methodology.md)
- [Ralph Loop](ralph-loop.md)
- [FAQ](faq.md)
- [Comparações](comparisons.md)
