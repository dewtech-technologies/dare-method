# FAQ — DARE Method

## ❓ Perguntas frequentes

### Geral

**Q: DARE é um framework de código?**
Não. É uma **metodologia** (markdown + comandos + templates). Não tem dependências, build, runtime. Você adota copiando arquivos pro seu projeto.

**Q: Posso usar com qualquer linguagem?**
Sim. O método é agnóstico de linguagem. Os Validation Gates é que mudam (pytest pra Python, vitest pra Node, phpunit pra PHP, etc.). Skills específicas existem pra algumas stacks, mas você pode escrever pra qualquer uma.

**Q: Posso usar com qualquer IDE / agente?**
Sim, em teoria. Hoje há implementações prontas pra **Cursor** e **Antigravity**. Pra outros (Claude Code, VS Code, JetBrains), você adapta os arquivos da implementação Cursor — o método em si é o mesmo.

**Q: É só pra projetos grandes?**
Não. DARE escala pra cima e pra baixo. Numa feature pequena, Design + Architect levam 15 min combinados. Em projeto de 6 meses, vira processo central.

**Q: Substitui Scrum / Kanban / metodologias ágeis?**
Não — é ortogonal. DARE opera no **nível de tarefa técnica**. Scrum/Kanban operam no **nível de organização do trabalho**. Eles convivem.

### Adoção

**Q: Como começo?**
1. Clone o repo
2. Copie a pasta da implementação que combina com seu IDE (`implementations/cursor/` ou `implementations/antigravity/`) pro seu projeto
3. Dispara `/generate-design "sua primeira ideia"` e segue o fluxo

**Q: Preciso adotar tudo de uma vez?**
Não. Caminho gradual: começa só com Design + Review (escreve `DESIGN.md` à mão antes de cada feature). Vai expandindo as fases conforme se acostuma.

**Q: Time inteiro precisa adotar?**
Idealmente sim, mas dá pra começar **solo**. Você gera DESIGN/BLUEPRINT e mostra pros colegas como artifact de PR. Conforme veem valor, adotam.

**Q: E se meu time não usa Cursor / Antigravity?**
Você pode aplicar **manualmente**: escrever DESIGN.md, BLUEPRINT.md, TASKS.md no editor que usa, e rodar Validation Gates manualmente. Você perde a automação dos comandos `/generate-*`, mas ganha a estrutura.

### Fases

**Q: Posso pular a fase Design pra protótipos rápidos?**
Pode, mas saiba o que está descartando. Sem Design, você está em Vibe Coding — que serve pra protótipo descartável. Se vai virar produção depois, vai pagar caro pra fazer Design retroativo.

**Q: Quanto tempo leva o Design + Architect?**
Feature média: 15-30 min de Design + 5-15 min de Architect (gerar) + 5-10 min Review. **Total: 25-55 min antes de uma linha de código ser escrita.**

Parece muito? Compara com tempo de retrabalho quando você descobre na metade da implementação que a abordagem está errada.

**Q: A IA pode pular o Review?**
Não. Review é **exclusivamente humano**. Se você "aprovar" sem ler, está se enganando — e vai pagar nas próximas fases.

### Ralph Loop

**Q: Ralph Loop não é igual a TDD?**
Tem similaridades. TDD: humano escreve teste, humano escreve código que faz passar. Ralph Loop: testes vêm da spec da task, IA escreve código que faz passar. Diferença chave: **autoria**. TDD é um trabalho do humano; Ralph Loop é um trabalho da IA com humano de monitor.

**Q: O Ralph Loop pode entrar em loop infinito?**
Não — implementações limitam (geralmente 6 attempts). Se estourar, aborta e sinaliza ao humano. Se você notar 4+ attempts no mesmo erro, **intervém manualmente**.

**Q: Por que "Ralph"?**
Referência ao Ralph Wiggum dos Simpsons. A piada é que a IA, igual ao Ralph, **persiste com confiança** mesmo errando, até eventualmente acertar. [Mais detalhes na seção dedicada.](ralph-loop.md)

### Custos / Tokens

**Q: DARE consome mais tokens que Vibe Coding?**
**Sim** se você compara linha por linha. **Não** se compara por feature entregue de qualidade. Vibe Coding gera retrabalho que multiplica o consumo.

**Q: Tem como medir?**
A fase Execute registra `DARE/TELEMETRY.md` com tokens, modelos e tempos. Roda `/telemetry-report` no fim da feature pra ver totais.

**Q: Vai funcionar com modelos baratos (Haiku, GPT-4o-mini)?**
A fase Architect e Execute pesa mais — Sonnet/Opus rendem melhor. Design pode usar modelo barato. Telemetry mostra o trade-off.

### Customização

**Q: Posso alterar os 4 estágios?**
Pode adaptar comandos / templates / skills. Se alterar a **estrutura** das 4 fases, deixou de ser DARE — vira outra metodologia. Tudo bem, mas não chama de DARE.

**Q: Posso adicionar mais fases?**
Não recomendado. Os 4 estágios foram pensados pra ser o **mínimo viável**. Adicionar mais aumenta atrito sem ganho proporcional. Se sentir necessidade, pergunte: a fase nova é generalizável pra outros projetos? Se sim, abre issue/PR pra discutir.

**Q: Posso ter skills customizadas?**
Sim — esse é o mecanismo principal de adaptação. Crie `skill-<sua-stack>.mdc` (Cursor) ou `<sua-stack>/SKILL.md` (Antigravity) com convenções do seu projeto/empresa. A IA vai aplicar.

### Time / colaboração

**Q: Como reviso PR de colega usando DARE?**
Olha 3 coisas em ordem: (1) o `DESIGN.md` faz sentido? (2) o `BLUEPRINT.md` atende ao Design? (3) o código entregue executa o BLUEPRINT? Se os 3 bater, PR está fundamentado. Discordâncias se resolvem nesses artefatos, não no código diretamente.

**Q: Onde DESIGN.md e BLUEPRINT.md ficam? Comitados?**
Sim. **Comitados no repo.** DARE/ fica versionada. É o "dossiê" da feature pra qualquer um que entrar no projeto entender o porquê de decisões.

**Q: E quando vira documentação obsoleta?**
Atualiza junto com mudanças significativas. Se virar uma feature drasticamente diferente, **cria DESIGN/BLUEPRINT novos** em pasta separada (ex: `DARE/v2/`) preservando histórico.

### Diferenças com outras práticas

**Q: DARE substitui code review?**
Não. Code review continua existindo no PR final. DARE só **antecipa** parte da revisão pro Blueprint (antes do código ser escrito).

**Q: DARE substitui RFC / ADR?**
Substitui parcialmente. O BLUEPRINT contém ADRs implícitos. Você pode externar pra `docs/adrs/` se preferir, mas não é obrigatório.

**Q: Posso usar com TDD?**
Sim. TDD opera **dentro da fase Execute**: você escreve testes na task spec, e o Ralph Loop garante que passem. Combinação muito boa.

**Q: Posso usar com BDD?**
Sim. Cenários BDD podem ser inputs do DESIGN.md. As "Given/When/Then" cabem no critério de sucesso.

## ❓ Não respondida?

Abre [discussion no GitHub](https://github.com/dewtech-technologies/dare-method/discussions). Vamos adicionar aqui se for útil pra outros.

## 🔗 Tópicos relacionados

- [Metodologia](methodology.md)
- [Ralph Loop](ralph-loop.md)
- [Comparações](comparisons.md)
- [Glossário](glossary.md)
