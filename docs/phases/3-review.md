# Fase 3 — Review

> **Aprovação humana explícita antes de gastar tokens em execução.**

| Atributo | Valor |
|---|---|
| **Quem dirige** | Humano — exclusivamente |
| **Papel da IA** | Nenhum (não participa) |
| **Entrada** | `DARE/BLUEPRINT.md` |
| **Saída** | ✓ aprovação ou rejeição com feedback |
| **Tempo típico** | 5-10 min |
| **Próxima fase** | [Execute](4-execute.md) (se aprovado) ou volta pra [Architect](2-architect.md) |

## 🎯 Objetivo

Validar que o BLUEPRINT atende ao DESIGN, **antes** de acionar a fase Execute (onde tokens são gastos efetivamente). Cada bug arquitetural não pego aqui custa **10x mais** depois.

Esta é a fase **mais importante** do método pra qualidade do output final, e ironicamente a mais subestimada.

## 📋 O que fazer

### 1. Lê o BLUEPRINT.md inteiro
Sim, **inteiro**. Sem "skim". Se você passou o olho rápido, não fez Review — fez auditoria de fachada.

### 2. Confronta com o DESIGN.md
Pergunta a cada parte do Blueprint: *"Isso atende qual critério de sucesso do Design?"*. Se algum não-objetivo do Design aparece sendo implementado, marca como bug.

### 3. Checa premissas
Cada premissa explícita do Blueprint precisa ser **verdadeira** ou **aceitável como risco**. Se está falsa, retorna pra Architect.

### 4. Analisa trade-offs
Pra cada decisão importante: a IA propôs alternativas? A justificativa faz sentido pro **seu** contexto (não pro contexto genérico)?

### 5. Identifica gaps
O que está faltando? Validação? Tratamento de erro? Logs? Auth? Considere stack-específicos:

- **Auth:** flow de auth está claro? Tokens, refresh, logout?
- **Validação:** schemas pra inputs? Sanitização?
- **Erros:** estratégia de logging? Telemetria? Rate limiting?
- **Migrations / dados:** rollback plan?
- **Tests:** que tipos de teste? Coverage mínimo?

### 6. Decide

**Aprovar:** marca o BLUEPRINT.md como pronto (ex: adicionar `<!-- ✓ APROVADO em YYYY-MM-DD por <nome> -->` no topo).

**Rejeitar:** comenta inline o que precisa mudar. Volta pra Architect com feedback claro.

## 🧪 Checklist concreto

Use isto como guia:

```markdown
- [ ] Todos os critérios de sucesso do DESIGN têm contraparte no BLUEPRINT
- [ ] Não-objetivos do DESIGN não estão implementados
- [ ] Stack escolhida tem justificativa válida pro contexto atual
- [ ] Estrutura de pastas é navegável (não tem 5 pastas vazias / artificiais)
- [ ] Modelos de dados cobrem todos os campos necessários
- [ ] Contratos de API têm: input, output, erros possíveis, status codes
- [ ] Auth e autorização explicitamente modelados (se aplicável)
- [ ] Validação de inputs prevista
- [ ] Estratégia de tratamento de erros definida
- [ ] Logs / observabilidade prevista
- [ ] Tests planejados (tipo + coverage mínimo)
- [ ] Migrations / setup inicial documentados
- [ ] Riscos têm mitigação concreta (não apenas listados)
- [ ] Lista de tarefas é granular o suficiente (cada task < 1h de execute)
```

## 🚫 Anti-padrões comuns

### "Approval theater"
Você lê 30s, fala "tá bom", e aprova. **Garantido** que vai pegar bug arquitetural na fase Execute. Se não tem 5-10 min pra revisar de verdade, **não inicie a feature ainda**.

### "Quero refinar na execução"
Pensamento: "deixa eu aprovar agora, conserto detalhes depois".
Realidade: detalhes não corrigidos viram código que precisa ser refeito. **Mais barato corrigir o markdown agora**.

### "Não sou eu que valido"
Você é o **único** dono do projeto. Mesmo que peça pra alguém revisar, **você** continua sendo o validador final.

### "Vou aprovar e ir tomar café"
Após aprovar, fica disponível durante a fase Execute pelos primeiros 10-15 min. É quando bugs do Blueprint se manifestam mais cedo. Se algo der errado, você intervém rápido.

## 🔁 O que acontece se rejeitar

```
Review (rejeita) → Architect (refina) → Review (rejeita) → ...
```

Não há limite formal de iterações entre Architect ↔ Review. Mas se você está no terceiro round e ainda discordando da arquitetura, provavelmente o **DESIGN está com furo**. Volta pro Design.

## 🎯 Princípio resumo

> **Tokens gastos em Execute pós-aprovação ruim são desperdício.**
> **Minutos gastos em Review são investimento.**

Em valor monetário direto: 1h da sua atenção em Review pode evitar 50h de IA produzindo código errado.

## 🔗 Próximo

[Fase 4: Execute →](4-execute.md)
