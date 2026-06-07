# Feature Design: Endurecimento de Segurança e Supply-Chain

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **Base de evidências:** esta DESIGN é **audit-driven** (sem papers). Cada decisão fecha um
> achado do relatório de auditoria de segurança do `@dewtech/dare-cli`. IDs do audit referenciados:
> **C1**, **C2** (MCP server), **H1** (`dare init --non-interactive`) e os achados de supply-chain/CI.
> Cada decisão é ancorada em `arquivo:linha` do código real. **Target release: v3.3.0** (repo em v3.2.0).
> A refatoração do Ralph Loop sem `shell:true` (**RS-06**) já está coberta na
> `DESIGN-Feature-verification-core.md` — aqui apenas **referenciada**, não reespecificada.

## Contexto no Projeto Existente

O `@dewtech/dare-cli` publicado na npm tem três superfícies inseguras hoje. Nenhuma é teórica — todas
são alcançáveis por um payload de rede ou por um nome de projeto malicioso.

**1) MCP server: path traversal + sem authn + CORS aberto + bind global (C1/C2).**
O servidor é um Express puro, criado em `packages/cli/src/mcp-server/server.ts:30`, com:

- **CORS totalmente aberto** — `app.use(cors())` sem opções (`server.ts:32`), aceitando qualquer origin.
- **Sem autenticação** — nenhum middleware de token/loopback antes das rotas.
- **`projectPath` controlado pelo cliente** — `POST /context/query` lê `projectPath` do **body**
  (`server.ts:56`) e usa `basePath = reqPath || projectPath` (`server.ts:57`) direto em
  `path.join(basePath, 'DARE', 'BLUEPRINT.md')` (`server.ts:63`). Um body com
  `{"projectPath":"/etc"}` (ou `"../../.."`) faz o servidor ler arquivos **fora** do projeto.
  A escrita também é alcançável: `PUT /tasks/:taskId` (`server.ts:195`) reescreve `TASKS.md`.
- **Erro vaza estado interno** — `res.status(500).json({ error: String(err) })` (`server.ts:144`)
  devolve a mensagem crua da exceção (caminhos absolutos, stack parcial) ao cliente.
- **Bind em todas as interfaces** — `app.listen(PORT, ...)` sem host (`mcp-server/bin/server.ts:11`),
  o que em Node faz bind em `0.0.0.0`. Combinado com CORS aberto e sem authn, o servidor "local"
  fica exposto na LAN.

**2) `dare init --non-interactive` sem validação de nome (H1).**
No caminho **interativo** o nome é validado por `/^[a-z0-9-_]+$/` (`commands/init.ts:40`). Mas o
caminho **não-interativo** (`runNonInteractive`, `commands/init.ts:312`) faz `const name = projectName ?? 'my-dare-project'`
(`init.ts:316`) **sem nenhuma validação** e passa direto para `outputDir: path.resolve(process.cwd(), name)`
(`init.ts:356` e `init.ts:367`). Um `dare init "../../etc/cron.d/x" --stack go-gin` resolve para fora do
cwd e escreve artefatos lá. O gerador também não defende: `generateProjectStructure` faz
`await fs.ensureDir(outputDir)` (`utils/project-generator.ts:68`) sem guardar contra traversal.
A função `assertOutputDirIsEmpty` (`project-generator.ts:920`) só checa **vazio**, não **localização**.
Existe um helper de path-safety reusável — `assertRelativeSafe` em
`packages/cli/src/stacks/dna-emitter.ts:86` — hoje não aplicado ao nome do projeto.

**3) Supply-chain / CI: publish sem provenance, lint falso, sem gate de cobertura.**

- **O pipeline nunca publica.** `publish.yml` roda em tags `v*`, builda, testa e cria o GitHub
  Release (`publish.yml:54`), mas **não tem passo `npm publish`**. Em seguida, `publish-smoke.yml`
  faz `npm install -g @dewtech/dare-cli@${VERSION}` (`publish-smoke.yml:39`) — ou seja, depende de
  uma publicação que o CI não executa (publicação manual hoje, sem `--provenance`).
- **Lint é falso.** O job `lint` em `ci.yml:46` só roda `pnpm -r build` ("Type check"), `ci.yml:69`.
  O script real `eslint src --ext .ts` existe em `packages/cli/package.json:27` mas **nunca** é
  invocado no CI.
- **Sem gate de cobertura.** `ci.yml` roda `pnpm -r test` (`ci.yml:44`) sem limiar de cobertura.
- **Actions não-pinadas.** Todos os `uses:` referenciam tags móveis (`actions/checkout@v4`,
  `softprops/action-gh-release@v2`, `pnpm/action-setup@v3` etc.), sem pin por SHA.
- Há base parcial a reusar: `pnpm audit --prod --audit-level=high` (`ci.yml:97`) e o scan
  `gitleaks` (`ci.yml:115`, config em `.gitleaks.toml`). A `SECURITY.md` ainda descreve o projeto
  como "metodologia/documentação", desatualizada frente ao CLI publicado.

Esta feature fecha esses três vetores e transforma o MCP server num componente **local-first
endurecido**, o `init` em **path-safe** nos dois caminhos, e o release num pipeline **com proveniência
verificável**.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | MCP server confina I/O ao root permitido | Requests com `projectPath`/path fora do root permitido rejeitados | **100%** rejeitados (403/400) |
| O-02 | MCP server não responde a origens/hosts não-locais | Bind em `127.0.0.1`; request sem token válido ou de origin não-allowlistada | **100%** recusados (401/403) |
| O-03 | Erros do MCP não vazam estado interno | Body de resposta de erro não contém path absoluto nem stack | **0** ocorrências em fixtures de erro |
| O-04 | `dare init` valida nome nos dois caminhos | Nomes com `..`/absolutos/inválidos rejeitados também em `--non-interactive` | **100%** rejeitados antes de qualquer escrita |
| O-05 | Publicação só via CI com proveniência | Publicação acontece **apenas** no job CI com `npm publish --provenance` via OIDC | publish manual = **0**; toda release com provenance |
| O-06 | Lint real e cobertura no gate | CI roda `eslint` de verdade e falha abaixo do limiar de cobertura | eslint **bloqueante**; cobertura ≥ limiar configurado |
| O-07 | Cadeia de dependências sem vulnerabilidade alta | `pnpm audit --prod` no CI | **0** HIGH/CRITICAL em deps de produção |
| O-08 | Actions reproduzíveis | % de `uses:` pinados por SHA de commit | **100%** das actions pinadas |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | CLI publicado seguro; reputação do pacote npm |
| Usuário (dev) | Adotantes do DARE CLI/IDE | MCP local seguro; `dare init` não escreve fora do cwd |
| Integração IDE | Claude Code / Cursor / Antigravity | MCP continua acessível ao agente local sem fricção |
| Mantenedores CLI | Dewtech | Pipeline de release confiável; sem dívida nova |
| Security / Compliance | Dewtech | Provenance/SLSA, 0 HIGH/CRITICAL, disclosure coordenado |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Bind em loopback** — MCP server escuta em `127.0.0.1` por padrão; host configurável por env só com opt-in explícito | MUST | `app.listen(PORT, '127.0.0.1', ...)` em `mcp-server/bin/server.ts`; conexão de outra interface recusada; `0.0.0.0` exige `DARE_MCP_BIND` explícito + aviso (corrige C2) |
| RF-02 | **Autenticação loopback + token** — middleware exige token (env `DARE_MCP_TOKEN`) ou só aceita requisições de loopback | MUST | Sem token válido → `401`; gerado/impresso no boot; aplicado **antes** de todas as rotas em `server.ts` (corrige C1) |
| RF-03 | **CORS allowlist** — substituir `cors()` aberto por allowlist (default: nada de cross-origin; IDE local liberada por origin conhecida/ausência de origin) | MUST | `server.ts:32` deixa de usar `cors()` sem opções; origin não-allowlistada → bloqueada (corrige C1) |
| RF-04 | **Remover `projectPath` do body / confinar ao root** — o root do projeto vem só do processo (`PROJECT_PATH`); qualquer caminho derivado é validado contra o root | MUST | `server.ts:56-57` deixa de aceitar `projectPath` do cliente; todo `path.join(...)` passa por validação reusando `assertRelativeSafe` (`dna-emitter.ts:86`) + checagem de prefixo do root resolvido (corrige C1/path traversal) |
| RF-05 | **helmet + limite de body** — headers de segurança e limite de payload JSON | MUST | `app.use(helmet())` e `express.json({ limit })` em `server.ts:33`; payload acima do limite → `413` |
| RF-06 | **Sanitização de erros** — respostas de erro não expõem `String(err)` cru | MUST | `server.ts:144` passa a logar detalhe internamente (pino) e devolver mensagem genérica + id de correlação; sem path absoluto/stack no body (corrige O-03) |
| RF-07 | **Validação de nome no init não-interativo** — `runNonInteractive` valida o nome como o interativo e rejeita `..`, caminhos absolutos e diretório-alvo fora do cwd | MUST | `init.ts:316` valida com a mesma regra de `init.ts:40` + `assertRelativeSafe`; nome inválido → erro e `exit(1)` **antes** de `generateProjectStructure` (corrige H1) |
| RF-08 | **Guarda no gerador** — `generateProjectStructure` confina `outputDir` ao cwd antes de `ensureDir` | MUST | `project-generator.ts:68` rejeita `outputDir` que escape do `process.cwd()` resolvido (defesa em profundidade do H1) |
| RF-09 | **Publish no CI com provenance via OIDC** — job de publicação roda `npm publish --provenance` usando OIDC trusted publishing (sem `NPM_TOKEN` de longa duração) | MUST | `publish.yml` ganha passo `npm publish --provenance --access public` com `permissions: id-token: write`; `publish-smoke.yml` passa a validar uma publicação real (corrige supply-chain) |
| RF-10 | **eslint real no CI** — job `lint` roda `pnpm -r lint` (eslint), não só build | MUST | `ci.yml:46-69` invoca o script `lint` de `package.json:27`; erro de lint **falha** o job |
| RF-11 | **Gate de cobertura** — CI roda testes com cobertura e falha abaixo do limiar | MUST | `pnpm -r test` com `--coverage` e limiar (`vitest`); cobertura < limiar → CI falha (`ci.yml:44`) |
| RF-12 | **Pin de actions por SHA** — todos os `uses:` referenciam SHA imutável | SHOULD | Cada `uses:` em `ci.yml`/`publish.yml`/`release.yml`/`publish-smoke.yml` fixado por SHA + comentário com a tag legível (corrige O-08) |
| RF-13 | **SECURITY.md atualizada** — refletir que há um pacote npm com superfície de runtime (MCP) e o modelo loopback-only | SHOULD | `SECURITY.md` ganha seção do CLI/MCP e do processo de provenance; supersede a redação "só metodologia" |
| RF-14 | **Token nunca logado** — segredos do MCP e do publish não aparecem em logs | MUST | Logs do servidor e do CI mascaram `DARE_MCP_TOKEN`/credenciais; teste verifica ausência em saída |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Não quebrar uso local legítimo** — IDE/agente na mesma máquina continua falando com o MCP | Fluxo loopback (mesmo host) funciona out-of-the-box; token autoinjetado no ambiente local |
| RNF-02 | **Compatibilidade retroativa** — clientes que mandavam `projectPath` no body | `projectPath` ignorado com aviso (não falha duro); contrato das rotas restantes mantido |
| RNF-03 | **Observabilidade sem vazar segredo** — logs estruturados (pino, já em `server.ts:7`) com id de correlação por erro | Cada 4xx/5xx logado com motivo + id; sem token, sem `.env`, sem stack no body |
| RNF-04 | **Performance** — middlewares (helmet/auth/cors) não degradam o caso local | Overhead desprezível (< 5 ms por request local) |
| RNF-05 | **Portabilidade** — validação de path funciona em Windows (CRLF/`\`) e POSIX | `assertRelativeSafe` já normaliza `\`→`/` (`dna-emitter.ts:91`); cobrir nos testes os dois |
| RNF-06 | **Reprodutibilidade do build** — `pnpm install --frozen-lockfile` mantido em todos os jobs | lockfile íntegro; build determinístico (regra de ouro CLI) |

## Requisitos de Segurança

| ID | Requisito | Mapeamento OWASP / Audit |
|---|---|---|
| RS-01 | **Controle de acesso ao MCP** — loopback-only + token; nenhuma rota acessível sem autorização | **A01** Broken Access Control; corrige **C1** |
| RS-02 | **Confinamento de path** — todo I/O do MCP e do `init` validado contra root/cwd; sem `..`/absolutos | **A01/A03**; corrige **C1** (traversal) e **H1** |
| RS-03 | **CORS restrito** — sem `Access-Control-Allow-Origin: *`; allowlist explícita | **A05** Security Misconfiguration; corrige **C1** |
| RS-04 | **Hardening de transporte** — helmet (headers), limite de body, bind loopback | **A05**; corrige **C2** |
| RS-05 | **Sanitização de saída de erro** — sem vazar caminhos/stack/segredo no body | **A05/A01**; corrige `server.ts:144` |
| RS-06 | **Sem `shell:true` no runner** — execução por `spawn` argv | **A03 Injection**; **já especificado** na `DESIGN-Feature-verification-core.md` (RS-06) — aqui só referenciado |
| RS-07 | **Segredos via env, nunca em código** — `DARE_MCP_TOKEN` e credenciais de publish em env/OIDC; nunca commitados | **A05**; reforça `.gitleaks.toml` |
| RS-08 | **Provenance/SLSA na publicação** — `npm publish --provenance` via OIDC; sem token npm de longa duração no repo | **A08 Software/Data Integrity**; supply-chain |
| RS-09 | **Dependências sem CVE alto** — `pnpm audit --prod --audit-level=high` mantido e bloqueante | **A06** Vulnerable Components; reusa `ci.yml:97` |
| RS-10 | **Pin de actions por SHA** — evitar substituição maliciosa de tag móvel | **A08**; corrige **O-08** |
| RS-11 | **Segredos fora dos logs** — token/credenciais nunca em stdout do servidor ou do CI | **A09** Logging Failures; ver RF-14 |

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| HTTP server (MCP) | Express | já em `package.json:34` (`express ^4.18`) |
| Hardening de headers | **helmet** | nova dependência de produção (a fixar no blueprint) |
| CORS | `cors` com allowlist | já em `package.json:33`; trocar uso aberto por opções |
| Logging | pino / pino-pretty | já em `server.ts:7` / `package.json:44` |
| Validação de path | `assertRelativeSafe` interno | reuso de `stacks/dna-emitter.ts:86` |
| Lint | ESLint + @typescript-eslint | já em devDeps (`package.json:62-64`); só **ativar no CI** |
| Cobertura | Vitest coverage | `vitest ^1` já em devDeps |
| Provenance/publish | npm CLI `--provenance` + GitHub Actions **OIDC** | trusted publishing (id-token) |
| Secret scan | gitleaks (Docker MIT) | já em `ci.yml:115` / `.gitleaks.toml` |

## Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados | Responsável |
|---|---|---|---|---|---|
| npm registry (OIDC trusted publishing) | registry | HTTPS + OIDC id-token | saída | tarball + provenance | `publish.yml` |
| GitHub Actions OIDC | identidade | OIDC | bi | token efêmero p/ publish | CI |
| IDEs (Claude/Cursor/Antigravity) | cliente MCP | HTTP loopback + token | bi | queries de contexto | MCP server local |
| gitleaks (Docker) | scanner | processo/Docker | leitura | templates/stacks | `ci.yml` |
| pnpm audit | scanner | HTTPS (advisory DB) | leitura | árvore de deps prod | `ci.yml:97` |

## Restrições

- **Regra de ouro da casa:** o **CLI/MCP é 100% determinístico** — nenhum LLM no caminho; o
  endurecimento é puramente código e config, sem inferência.
- **MCP é local-first:** o servidor **não pode** virar serviço exposto. Loopback-only é o default
  inegociável; `0.0.0.0` só com opt-in explícito e aviso. Isto **corrige** o comportamento de
  `mcp-server/bin/server.ts:11`, não cria um modo "produção remoto".
- **Compat com IDEs que falam com o MCP:** o esquema de auth/CORS deve permitir o agente local sem
  configuração manual friccionada (token autoinjetado no ambiente local — RNF-01).
- **Compat retroativa de contrato:** rotas e formatos de resposta preservados; `projectPath` do body
  é ignorado, não causa erro duro (RNF-02).
- **Windows-first dev:** validação de path lida com `\` e drive letters (RNF-05).
- **Pré-requisito cruzado:** RS-06 (runner sem `shell:true`) é entregue na verification-core; esta
  feature **não** o reimplementa.

## Fora do Escopo (v1)

- **Implementar o "runtime security spec" inteiro** — os docs `dare_ai_runtime_security_spec.md` e
  `dare_runtime_security_implementation.md` são **roadmap não implementado**; esta feature fecha só
  C1/C2/H1 e supply-chain, não o spec completo.
- **MCP multi-tenant / autenticação de usuários** — fora; o servidor é mono-projeto local.
- **TLS / mTLS no MCP** — desnecessário em loopback; não nesta v1.
- **Rate limiting avançado / WAF** — só limite de body (RF-05) na v1.
- **Assinatura GPG de tags / SLSA L3+** — v1 entrega provenance npm (SLSA via OIDC); níveis acima ficam para depois.
- **Reescrita do MCP para o protocolo MCP oficial (stdio/JSON-RPC)** — esta feature endurece o HTTP
  atual; a migração de transporte é DESIGN própria.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Auth/CORS quebra o uso local da IDE | Média | Alto | Loopback liberado por padrão + token autoinjetado no ambiente local; testes de fluxo IDE (RNF-01) |
| Clientes legados quebram ao remover `projectPath` | Média | Médio | Ignorar com aviso em vez de erro duro (RNF-02); changelog destacado |
| OIDC trusted publishing mal configurado bloqueia release | Média | Alto | Validar em dry-run antes da v3.3.0; `publish-smoke` confirma publicação real (RF-09) |
| Ativar eslint expõe muitos erros e trava o CI de uma vez | Alta | Médio | Baseline inicial + correção incremental; limiar de cobertura introduzido gradualmente (RF-10/RF-11) |
| Pin por SHA dificulta updates de actions | Baixa | Baixo | Dependabot/renovate para bump dos SHAs com revisão (RF-12) |
| Confinamento de path com falso-positivo no Windows | Média | Médio | Reusar `assertRelativeSafe` já testado; cobrir drive letters/UNC (RNF-05) |
| Token impresso em log acidentalmente | Baixa | Alto | RF-14 + RS-11: mascarar em pino e no CI; teste de ausência |

## Checklist de Aprovação

- [ ] Os três vetores (MCP C1/C2, init H1, supply-chain) estão corretamente capturados com `arquivo:linha`
- [ ] O default loopback-only do MCP é aceitável e não regride o uso local pela IDE
- [ ] A remoção de `projectPath` do body com compat retroativa (ignorar+avisar) é a política certa
- [ ] OIDC trusted publishing + `--provenance` é o caminho aprovado (vs. NPM_TOKEN)
- [ ] Ativar eslint e gate de cobertura agora é aceitável mesmo que exponha dívida existente
- [ ] As metas numéricas (O-01…O-08) são realistas e mensuráveis
- [ ] O recorte "Fora do Escopo" (runtime spec completo, TLS, multi-tenant) é aceitável para v3.3.0
- [ ] RS-06 fica de fato na verification-core e não é reespecificado aqui

---

> **Próximo passo:** após aprovação deste DESIGN, rodar `/dare-blueprint` para a Fase Architect
> (middleware de auth/cors, helper de confinamento de path compartilhado entre MCP e init, contratos
> das rotas, e a configuração de OIDC/provenance no `publish.yml`). Target release: **v3.3.0**.
