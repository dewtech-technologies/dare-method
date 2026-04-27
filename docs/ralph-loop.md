# Ralph Loop — em profundidade

<div align="center">

<img src="assets/ralph-loop.webp" alt="Ralph Wiggum — I'm in danger" width="280"/>

*"I'm in danger 😄"* — Ralph Wiggum

</div>

> O Ralph Loop é o **ciclo de auto-correção** que opera dentro da fase **Execute** do DARE. Garante que tasks só sejam consideradas concluídas quando passam por todos os Validation Gates definidos.

## 🎬 A metáfora

Ralph Wiggum, dos Simpsons, tem aquela cena icônica: a casa pegando fogo, ele segurando uma flor, sorrindo, dizendo *"I'm in danger 😄"*. Persistente, inocente, **e curiosamente eficaz** — no fim das contas, a história sempre se resolve.

A IA quando executa código pela primeira vez tem exatamente essa vibe:
- Não entende totalmente o porquê
- Tenta com confiança
- Falha
- Tenta de novo
- E eventualmente acerta

A piada (e o nome) reconhece esse padrão. **Ralph Loop é abraçar a iteração persistente como feature, não bug.**

## 🔁 O algoritmo

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  1. IA lê task-NNN.md                                │
│             ↓                                        │
│  2. IA implementa o código                           │
│             ↓                                        │
│  3. IA executa Validation Gates                      │
│       ├─ Testes unitários                            │
│       ├─ Testes de integração                        │
│       ├─ Linter / formatter                          │
│       ├─ Type checker                                │
│       └─ Outros (definidos na task)                  │
│             ↓                                        │
│  4. Resultado?                                       │
│       ├─ ✓ PASSOU TUDO → Task concluída             │
│       └─ ✗ ALGO FALHOU → Continua                   │
│             ↓                                        │
│  5. IA lê a mensagem de erro                         │
│             ↓                                        │
│  6. IA identifica o que corrigir                     │
│             ↓                                        │
│  7. IA aplica a correção                             │
│             ↓                                        │
│  8. Volta pro passo 3                                │
│                                                      │
└──────────────────────────────────────────────────────┘
                       ⟲ Ralph Loop
```

## ⏱️ Quantas iterações são "normais"?

Em prática observada na Dewtech:

| Iterações | Frequência | Sinal |
|---|---|---|
| 1 (passou primeira) | ~30% | task simples ou bem especificada |
| 2-3 | ~50% | normal — IA pegou erro de tipagem, import, edge case |
| 4-6 | ~15% | task estava ambígua ou Validation Gates incompletos |
| 7+ | ~5% | **STOP** — provavelmente tem problema arquitetural, volte ao Blueprint |

A regra empírica: **se o Ralph Loop passa de 6 iterações no mesmo erro, abortar.** A IA está tentando "fazer passar o teste" de jeito errado, e provavelmente o problema é a especificação ou o BLUEPRINT.

## 🎯 Validation Gates — o que torna tudo possível

Ralph Loop só funciona porque a task carrega **gates objetivos**. A IA não precisa "achar" se está bom — ela tem comandos pra rodar. Exemplos por stack:

### Node.js / TypeScript
```bash
npm test                # vitest / jest
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm run format:check    # prettier
```

### Python
```bash
pytest -xvs             # testes
ruff check .            # lint
ruff format --check .   # format check
mypy .                  # type checker
```

### PHP / Laravel
```bash
php artisan test        # phpunit
./vendor/bin/pint --test  # format check
./vendor/bin/phpstan analyse  # static analysis
```

### Go
```bash
go test ./...           # testes
go vet ./...            # static analysis
golangci-lint run       # lint completo
```

### Rust
```bash
cargo test              # testes
cargo clippy -- -D warnings  # lint estrito
cargo fmt --check       # format check
```

A task-NNN.md sempre lista **comando exato** + **resultado esperado** ("exit 0", "0 errors").

## 🚦 Quando o Ralph Loop deve parar

### Situações de auto-parada

| Critério | Razão |
|---|---|
| Todos os gates passaram | ✓ task concluída |
| Mesmo erro repete 3+ vezes seguidas | impasse semântico — humano precisa intervir |
| Tentativa #7 sem passar | provavelmente problema no BLUEPRINT |
| IA detecta ambiguidade no spec | melhor pausar do que adivinhar |

### O que fazer ao parar sem sucesso

1. Ler os logs das tentativas (algumas implementações registram em `DARE/EXECUTION/<task>/attempts/`)
2. Confrontar com o BLUEPRINT.md
3. Decidir: corrigir spec da task, refinar Validation Gate, ou voltar ao Architect

## 🧠 Por que funciona

Pesquisas e prática mostram que **agentes de IA são bem melhores em iteração tática que em planejamento estratégico**. O Ralph Loop reconhece isso:

- ❌ **Não força** a IA a "pensar bem antes" — ela não vai ser melhor nisso
- ✅ **Permite** que a IA tente, falhe e corrija — onde ela é boa
- ✅ **Limita** o espaço de erro com gates explícitos
- ✅ **Aborta** quando está claramente travada

É design alinhado com a natureza atual dos modelos.

## 📚 Origem do conceito

O termo "Ralph Loop" não é invenção da Dewtech — é uso comunitário emergente em 2025-2026 pra descrever esse padrão. A Dewtech adota e formaliza dentro do DARE.

### Referências externas

- [Ralph Loops: automação iterativa e o novo papel do engenheiro](https://medium.com/@itaifos/ralph-loops-automa%C3%A7%C3%A3o-iterativa-e-o-novo-papel-do-engenheiro-93df8b4e37e5) — Itai Fos (Medium)
- [The greatest AI fix for your bug](https://www.crazystack.com.br/2025-3/the-greatest-ai-fix-for-your-b) — CrazyStack

## 🔗 Tópicos relacionados

- [Metodologia DARE completa](methodology.md)
- [Fase 4: Execute](phases/4-execute.md)
- [Glossário](glossary.md)
- [FAQ](faq.md)
