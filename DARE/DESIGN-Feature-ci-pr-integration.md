# Feature Design: CI/PR Integration (`dare` gates como GitHub Action)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** item 8 do backlog + Fase 3 do RFC-001. Reusa os gates determinísticos já
> existentes (`dare review`, `dare guard`, `dare graph drift`, `dare bench`) e a cadeia OIDC/Actions da
> v3.4. É a **porta de adoção open-core** (o gate vira a entrada do produto). **Target: v3.11.0** (repo em v3.9.0).

## Contexto no Projeto Existente

O DARE já tem um arsenal de **gates determinísticos** rodáveis em CI: `dare review` (anti-stub),
`dare guard` (segurança da cadeia agêntica, v3.9.0), `dare graph drift` (em desenvolvimento) e
`dare bench` (Fix·Rate). Eles **rodam** no CI, mas o feedback fica no log do job — **não chega ao
desenvolvedor no PR**. Falta a camada que transforma o veredito de um gate em **comentário/anotação no
Pull Request**, e uma **GitHub Action reutilizável** que terceiros plugam em 3 linhas.

Isso é estratégico: alinhado à tese **open-core**, o gate comentando no PR é o ponto de entrada que
leva o time a adotar o resto do DARE. A infra de Actions/OIDC já existe desde a v3.4.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Veredito de gate vira feedback no PR | `dare <gate> --comment` posta no PR | comentário/anotação aparece no PR de teste |
| O-02 | Action reutilizável | Terceiro pluga em ≤ 5 linhas de YAML | `uses: dewtech-technologies/dare-action@v1` funciona |
| O-03 | Determinístico (LLM-free) | A Action chama LLM? | **0** — só roda os gates determinísticos |
| O-04 | Não-bloqueante configurável | Modo "comenta" vs "falha o check" | flag controla se o gate é bloqueante |
| O-05 | Sem vazar segredo | Token/credencial nos logs/comentários | **0** ocorrências |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Funil de adoção open-core; gate como porta de entrada |
| Usuário (dev) | Times usando o DARE no CI | Feedback dos gates direto no PR |
| Mantenedores CLI | Dewtech | Reuso dos gates; sem nova lógica de verificação |
| Security/Compliance | Dewtech | Action sem vazar segredo; permissões mínimas |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **`--comment` nos gates** — `review`/`guard`/`drift` postam achados no PR | MUST | Comentário/anotação criada via API do GitHub (GITHUB_TOKEN) |
| RF-02 | **Formato GitHub** — `--format github` emite annotations (`::error`/`::warning file=...`) | MUST | Anotações aparecem na aba "Files changed" |
| RF-03 | **Action reutilizável** — `dewtech-technologies/dare-action` (composite) | MUST | `uses:` instala o CLI, roda o gate escolhido, posta o resultado |
| RF-04 | **Modo bloqueante configurável** — `fail-on: none\|warn\|error` | MUST | Controla se o check do PR falha (exit) ou só comenta |
| RF-05 | **Idempotência de comentário** — atualiza o comentário existente em vez de duplicar | SHOULD | 1 comentário "DARE" por PR, atualizado a cada push |
| RF-06 | **Resumo consolidado** — um sumário com todos os gates rodados | SHOULD | Tabela: gate, veredito, contagem |
| RF-07 | **Workflow template** — `dare init` gera `.github/workflows/dare-pr.yml` opcional | COULD | Template plugável no scaffold |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Determinístico** | Action só roda gates determinísticos; sem LLM |
| RNF-02 | **Permissões mínimas** | `permissions: pull-requests: write, contents: read` |
| RNF-03 | **Reuso dos gates** | nenhuma lógica de verificação nova; só formato + post |
| RNF-04 | **Portabilidade** | roda em `ubuntu-latest`; Node 18+ |
| RNF-05 | **Actions pinadas por SHA** | mantém a política da v3.4 |

## Requisitos de Segurança

| ID | Requisito | Mapeamento |
|---|---|---|
| RS-01 | Token via `GITHUB_TOKEN`/OIDC, nunca em código | **A05** |
| RS-02 | Permissões mínimas declaradas | **A01** least-privilege |
| RS-03 | Sem segredo em comentário/log | **A09** |
| RS-04 | Sanitizar conteúdo de findings postado (sem dump sensível) | **A03/A09** |
| RS-05 | Actions de terceiros pinadas por SHA | **A08**; reusa `verify-actions-pinned` (v3.4) |

## Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Gates | `dare review`/`guard`/`graph drift`/`bench` | reuso — sem lógica nova |
| Formatador | emitter de GitHub annotations + comment | novo (no CLI) |
| API GitHub | REST/`gh` via `GITHUB_TOKEN` | comentário/anotação |
| Action | composite action (`action.yml`) no repo | publicável no Marketplace |
| CI base | GitHub Actions + OIDC (v3.4) | reuso |

## Integrações Externas

| Sistema | Tipo | Direção | Dados | Responsável |
|---|---|---|---|---|
| GitHub API (PR comments/checks) | REST | saída | veredito + findings sanitizados | Action |
| GitHub Actions runner | CI | bi | execução dos gates | workflow |

## Restrições

- **Reuso dos gates:** nenhuma verificação nova — só **formato** (annotations) + **post** (API).
- **Determinístico/LLM-free.**
- **Least-privilege:** permissões mínimas; segredo só via `GITHUB_TOKEN`/OIDC.
- **Open-core:** a Action é o produto de entrada; manter MIT e simples de plugar.

## Fora do Escopo (v1)

- **Suporte a GitLab/Bitbucket** — v1 só GitHub Actions (maior alcance); abstrair depois.
- **Auto-fix / sugestões aplicáveis no PR** — só reporta na v1 (`--fix` é outro fluxo, local).
- **Dashboard hospedado de histórico de PRs** — fora (relaciona ao item 5 local).
- **Bot de IA comentando** — quebraria o LLM-free; fora.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Comentários duplicados poluem o PR | Alta | Médio | Idempotência: atualizar comentário existente (RF-05) |
| Vazamento de segredo em finding postado | Média | Alto | Sanitizar payload (RS-04); reusa a sanitização do guard |
| Permissões excessivas na Action | Média | Alto | `permissions` mínimas declaradas (RNF-02/RS-02) |
| Gate bloqueante trava times de cara | Média | Médio | Default `fail-on: none` (só comenta); bloqueio é opt-in (RF-04) |
| Rate limit da API do GitHub | Baixa | Baixo | 1 comentário consolidado por push (RF-05/RF-06) |

## Checklist de Aprovação

- [ ] `--comment`/`--format github` nos gates existentes (sem verificação nova) é o recorte certo
- [ ] Composite Action `dewtech-technologies/dare-action` é o formato de distribuição desejado
- [ ] Default `fail-on: none` (comenta, não bloqueia) é a política inicial
- [ ] Só GitHub na v1 (GitLab/Bitbucket depois) é aceitável
- [ ] "Fora do escopo" (auto-fix no PR, multi-plataforma, bot IA) é aceitável

---

> **Próximo passo:** após aprovação, `/dare-blueprint` — o emitter de annotations/comment, o contrato da
> composite `action.yml`, a idempotência do comentário e o template de workflow. Target: **v3.11.0**.
