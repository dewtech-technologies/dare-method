# Fase 4 — Execute

> **IA implementa task por task, com Ralph Loop até gates passarem.**

| Atributo | Valor |
|---|---|
| **Quem dirige** | IA implementa |
| **Papel do humano** | Monitor (intervém em impasse) |
| **Entrada** | `DARE/BLUEPRINT.md` aprovado + `DARE/EXECUTION/task-NNN.md` |
| **Saída** | Código + testes verdes |
| **Tempo típico** | varia por task — entre 2 e 30 min |
| **Loop interno** | [Ralph Loop](../ralph-loop.md) |

## 🎯 Objetivo

Implementar o que foi planejado. Task por task. Com **Validation Gates rigorosos** garantindo que "concluído" significa **funciona de verdade**.

## 📋 Pré-requisitos

Antes de chamar Execute:

- ✅ DESIGN.md aprovado
- ✅ BLUEPRINT.md aprovado (Review feita)
- ✅ TASKS.md gerado com `/generate-tasks` (quebra do BLUEPRINT em itens atômicos)
- ✅ Cada task tem spec individual em `DARE/EXECUTION/task-NNN.md`

## 🧩 Anatomia de uma task

Cada `task-NNN.md` deve conter:

```markdown
# Task NNN — Título descritivo

## Contexto
Por que essa task existe (link de volta pro DESIGN/BLUEPRINT).

## Objetivo
Uma frase: o que essa task entrega.

## Arquivos afetados
- `src/auth/jwt.service.ts` (criar)
- `src/auth/auth.module.ts` (modificar)
- `tests/auth/jwt.service.spec.ts` (criar)

## Especificação
Detalhes da implementação. Não é pseudo-código — é descrição clara do
comportamento esperado, edge cases, integrações.

## Validation Gates
Comandos que devem passar pra task ser considerada concluída:

```bash
npm run lint
npm run typecheck
npm test -- src/auth/jwt.service.spec.ts
```

Resultado esperado: exit 0 em todos.

## Dependências
- task-001 (precisa estar concluída antes)

## Estimativa
~15-30 min de execução IA
```

## 🤖 Como a IA executa

### Fluxo passo-a-passo

1. **Lê task-NNN.md** completa
2. **Lê arquivos afetados existentes** pra contexto
3. **Implementa** as mudanças
4. **Roda Validation Gates** (comandos da task)
5. **Se algum gate falhar:** entra no [Ralph Loop](../ralph-loop.md)
   - Lê o erro
   - Identifica o problema
   - Corrige
   - Roda gates de novo
   - Repete (até 6 tentativas)
6. **Se todos os gates passarem:** ✓ task concluída
7. **Se Ralph Loop estourar:** aborta e sinaliza ao humano

### Como o humano monitora

- Acompanha logs no terminal / sidebar do IDE
- Se Ralph Loop ficar girando no mesmo erro, intervém
- Se task termina, valida visualmente o código gerado antes de chamar próxima

## 🚀 Como disparar (Cursor)

```
/execute-task task-001
```

A IA carrega `DARE/EXECUTION/task-001.md`, implementa, roda gates, e te avisa quando concluir.

Pra task seguinte:

```
/execute-task task-002
```

E assim por diante. **Não execute várias em paralelo** — quebra o checkpoint humano entre tasks.

## ✅ Critério de "task concluída"

Uma task **só** está concluída se:

- [ ] Todos os Validation Gates passaram (exit 0)
- [ ] Você revisou o diff do código gerado
- [ ] Não há TODOs ou FIXMEs deixados pra trás
- [ ] Testes que foram criados realmente cobrem o caso (não testes vazios)

## 🚫 Anti-padrões comuns

### "Aceitar task como concluída sem revisar diff"
Validation Gates passaram = código compila e passa testes. Não significa que está bom. Sempre revisa o diff.

### "Tasks gigantes"
Task que demora >30min de execução IA é candidata a quebra. Granularidade fina = Ralph Loop curto + revisão humana fácil.

### "Validation Gates fracos"
Task com gate só "npm run lint" é teatro. Coloca também typecheck + tests específicos do que mudou.

### "Pular task sem dependência"
Se task-005 depende de task-003 e task-004, **não execute task-005 antes** mesmo que pareça mais fácil.

### "Ralph Loop infinito"
Se a IA está em iteração 5+ no mesmo erro, **pare**. Provavelmente o problema é especificação, não código. Volta na task ou no Blueprint.

## 📊 Telemetria opcional

Se quiser rastrear custo / consumo:

- A IA registra cada chamada em `DARE/TELEMETRY.md`
- Roda `/telemetry-report` ao final pra ver totais
- Útil pra estimar próximas features e justificar custo de IA pra time/cliente

[Detalhes em GUIA-TELEMETRIA.md de cada implementação]

## 🎯 Princípio resumo

> **Tarefas atômicas + Validation Gates rigorosos + Ralph Loop = código que funciona de verdade.**

Sem qualquer um dos três, o método degrada.

## 🔗 Tópicos relacionados

- [Ralph Loop em profundidade](../ralph-loop.md)
- [Glossário (DESIGN, BLUEPRINT, TASKS, gate, attempt)](../glossary.md)
- [FAQ](../faq.md)
