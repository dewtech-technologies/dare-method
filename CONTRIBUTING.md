# Contribuindo com o DARE Method

Obrigado por considerar contribuir! Este projeto cresce com a comunidade — tanto na metodologia quanto nas implementações por IDE.

## 🎯 Tipos de contribuição bem-vindos

| Tipo | Onde entra |
|---|---|
| **Bug na metodologia** | abrir issue descrevendo o cenário onde DARE quebrou |
| **Sugestão de melhoria** | discussion ou issue com proposta clara |
| **Nova implementação** (Claude Code, VS Code, JetBrains, etc.) | nova pasta em `implementations/<nome>/` |
| **Nova skill** (Python/FastAPI, Node/NestJS, Go, Rust, mobile, etc.) | adicionar em `implementations/<nome>/.cursor/rules/` ou equivalente |
| **Case study** real de uso | adicionar em `examples/` (sem dados sensíveis) |
| **Tradução** de docs | nova pasta `docs/<lang>/` espelhando estrutura do `docs/` |
| **Correção de typos / clareza** | PR direto |

## 📋 Antes de abrir um PR

### 1. Issue primeiro (pra mudanças não-triviais)
Pra mudanças na metodologia ou em arquivos centrais, abre **issue antes do PR**. Evita perder tempo se a direção não bater com o roadmap.

PRs de typo / clareza / fix pequeno: pode mandar direto.

### 2. Dois princípios não-negociáveis

1. **Human-in-the-loop é obrigatório** entre fases. Qualquer proposta que pule checkpoint humano vai ser rejeitada.
2. **Cada implementação é autocontida.** Não criar dependências cruzadas entre `implementations/cursor/` e `implementations/antigravity/`. Se uma feature serve às duas, duplica nos dois.

### 3. Estilo

- Markdown: linhas longas (sem hard wrap), uso parcimonioso de emojis (1-2 por seção máximo)
- Português ou inglês — ambos aceitos no mesmo PR (mas seja consistente dentro de um arquivo)
- Diagramas: ASCII art ou Mermaid (renderizam direto no GitHub)

## 🔁 Workflow

```bash
# 1. Fork + clone
git clone https://github.com/<seu-user>/dare-method.git
cd dare-method

# 2. Branch descritiva
git checkout -b feat/skill-python-fastapi
# ou
git checkout -b fix/typo-ralph-loop

# 3. Mudanças + commit (mensagens em inglês ou português)
git commit -m "feat(skills): add Python/FastAPI skill for Cursor implementation"

# 4. Push + Pull Request
git push origin feat/skill-python-fastapi
```

## 🧩 Adicionando uma nova implementação

Estrutura mínima esperada em `implementations/<nome>/`:

```
implementations/<nome>/
├── README.md                   # como instalar e usar essa implementação
├── <config-file>               # arquivo de config principal do IDE/agente
├── <commands-dir>/             # comandos do método (4 core: design, blueprint, tasks, execute)
├── templates/                  # cópia dos templates universais
├── examples/                   # cópia dos examples
└── scripts/                    # cópia dos scripts utilitários
```

O **README.md** dessa implementação deve cobrir:
1. Pré-requisitos (versão do IDE, etc.)
2. Como copiar / instalar a implementação no projeto-alvo
3. Como disparar cada um dos 4 comandos DARE
4. Diferenças vs outras implementações (se houver)

## 🐞 Reportando bugs

Use o template de issue [bug report](.github/ISSUE_TEMPLATE/bug_report.md). Inclua:

- Implementação usada (Cursor / Antigravity)
- Versão do IDE/agente
- Comando que disparou o problema
- Output esperado vs output recebido
- DESIGN.md / BLUEPRINT.md / TASK que estava sendo processado (se possível)

## 💡 Sugerindo features

Use o template de issue [feature request](.github/ISSUE_TEMPLATE/feature_request.md). Antes:

1. Procura em [discussions](https://github.com/dewtech-technologies/dare-method/discussions) se alguém já levantou
2. Lê o [roadmap no README](../README.md#%EF%B8%8F-roadmap) — pode já estar planejado

## 📜 Code of Conduct

Seguimos o [Contributor Covenant](https://www.contributor-covenant.org/). Tolerância zero pra assédio, discriminação ou comportamento tóxico. Reports privados pra `wanderson@dewtech.tech`.

## 🏷️ Licença

Ao contribuir, você concorda que sua contribuição será licenciada sob a [MIT License](LICENSE) do projeto.

## 🙏 Reconhecimento

Contribuidores ativos ganham menção no README e — quando aplicável — convite pra co-autoria de posts e talks sobre o método.
