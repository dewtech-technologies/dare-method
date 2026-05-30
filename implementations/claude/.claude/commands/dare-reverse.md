# /dare-reverse

Camada semântica da engenharia reversa (Fase 0 / brownfield). Roda **depois** do comando
`dare reverse`, que já varreu o código e gerou os esqueletos. Sua função é **preencher as
inferências** que o CLI determinístico não faz: propósito, domínio, responsabilidades e os
**diagramas de fluxo** ("como a coisa funciona").

## Como usar

```
/dare-reverse                 # preenche os artefatos gerados por `dare reverse`
```

> Pré-requisito: rodar `dare reverse` antes (gera `DARE/IDEIA.md`, `DARE/REVERSE/module-*.md`
> e `DARE/REVERSE/reverse-facts.json`). Se não existirem, instrua o usuário a rodar `dare reverse` primeiro.

## Quando usar

- O usuário quer entender / documentar um projeto **legado** antes de adotar o DARE.
- Acabou de rodar `dare reverse` e os artefatos têm seções `<!-- AGENT: ... -->` em aberto.
- O objetivo é gerar uma **pré-arquitetura** (`IDEIA.md`) que depois vira `DESIGN.md`.

## O que fazer

### 1. Carregar os fatos (não re-varrer tudo)

- Leia `DARE/REVERSE/reverse-facts.json` — é a fonte de fatos determinística (stack, módulos,
  LOC, grafo de dependências). **Confie nela** para o inventário; não reconte arquivos.
- Para cada módulo, abra **2-5 arquivos representativos** (entrypoints, controllers, services,
  models) — o suficiente para inferir responsabilidade e fluxo. Não leia o módulo inteiro.

### 2. Preencher `DARE/IDEIA.md`

Substitua cada bloco `<!-- AGENT: ... -->` por conteúdo real:

- **Propósito Inferido** — 2-4 frases: o que o software faz e por quê.
- **Domínio & Conceitos** — entidades de negócio + glossário (inferidos de models/migrations/nomes).
- **Modelo de Dados (reconstruído)** — entidades, campos-chave, relacionamentos (de migrations/ORM).
- **Superfície de API** — endpoints inferidos de rotas/controllers (método, rota, propósito).
- **Fluxo do Sistema** — um `flowchart TD` Mermaid do caminho principal de request/dados
  atravessando os módulos. Ex.:
  ```mermaid
  flowchart TD
    Client[Cliente] --> API[API/Rotas]
    API --> Auth[auth: valida token]
    Auth --> Domain[users: regra de negócio]
    Domain --> DB[(Persistência)]
  ```
- **⚠️ Incertezas / Gaps** — seja honesto: o que NÃO deu pra inferir com segurança, e perguntas
  objetivas para o humano confirmar. Esta seção é o que protege o checkpoint human-in-the-loop.

**Não toque** no Mapa de Módulos nem na tabela (são determinísticos, gerados pelo CLI).

### 3. Preencher cada `DARE/REVERSE/module-*.md`

Para cada módulo, substitua os `<!-- AGENT -->`:

- **Responsabilidade** — 1-3 frases sobre o papel do módulo no sistema.
- **Superfície Pública** — o que ele expõe (funções/classes/endpoints/tipos exportados).
- **Como Funciona (fluxo)** — um `sequenceDiagram` Mermaid do fluxo de execução típico. Ex.:
  ```mermaid
  sequenceDiagram
    participant C as Caller
    participant S as Service
    participant R as Repository
    participant DB as Database
    C->>S: chamada(args)
    S->>R: busca/persiste
    R->>DB: query
    DB-->>R: linhas
    R-->>S: entidade
    S-->>C: resultado
  ```
- **Dependências & Acoplamento** — comente as dependências listadas em "Depende de" e riscos
  de acoplamento (ex.: dependência circular, módulo-hotspot HIGH com muitos dependentes).

### 4. Apresentar ao usuário

Mostre um resumo: propósito inferido, nº de módulos, principais incertezas. Reforce que o
`IDEIA.md` é um **rascunho a ser validado** — peça para o humano revisar antes de promover a DESIGN.

## Regras de ouro

1. **Não invente.** Se um fluxo não está claro no código, marque em "⚠️ Incertezas" em vez de chutar.
2. **Fidelidade ao código real** — descreva o que o código faz, não o que deveria fazer.
3. **Diagramas enxutos** — um fluxo legível vale mais que um diagrama exaustivo e ilegível.
4. **Não re-varra** — os fatos já estão em `reverse-facts.json`; foque na inferência semântica.
5. **Preserve o determinístico** — nunca edite o Mapa de Módulos/tabela/grafo gerados pelo CLI.

## Antipatterns

| AP | Antipattern | Por quê |
|---|---|---|
| AP-01 | Inventar endpoints/entidades não presentes no código | Polui a pré-arquitetura com ficção |
| AP-02 | Reescrever a tabela de módulos do CLI | Quebra a fonte determinística |
| AP-03 | `sequenceDiagram` gigante e ilegível | Anula o propósito do diagrama |
| AP-04 | Pular a seção de Incertezas | Remove o ponto de validação humana |
| AP-05 | Ler o projeto inteiro arquivo a arquivo | Desperdiça contexto; os fatos já estão no JSON |

$ARGUMENTS

---

Skill MIT — parte do DARE Method. Fase 0 (brownfield). Pareia com o comando `dare reverse`.
