# Política de Segurança

## 🛡️ Versões suportadas

DARE Method é uma **metodologia** distribuída como documentação + templates. Não há "versão" de software com vulnerabilidades clássicas (RCE, XSS, etc.). Mas **prompts, scripts e exemplos** podem conter problemas de segurança.

| Componente | Receptivo a relatórios? |
|---|---|
| Prompts em `.cursor/commands/` | ✅ sim — prompt injection, leakage |
| Skills em `.cursor/rules/` ou `.agents/skills/` | ✅ sim |
| Scripts em `scripts/` (Python) | ✅ sim |
| Examples em `examples/` | ✅ sim |
| Templates de markdown | ⚠️ baixa relevância — markdown estático |
| Documentação geral | ❌ não — abre issue regular se houver erro |

## 🚨 Reportando uma vulnerabilidade

**NÃO abra issue público** pra problemas de segurança. Reporte privadamente:

| Canal | Endereço |
|---|---|
| **E-mail** | `security@dewtech.tech` |
| **GitHub Security Advisory** | https://github.com/dewtech-technologies/dare-method/security/advisories/new |

## ⏱️ SLA de resposta

| Severidade | Primeira resposta | Patch |
|---|---|---|
| **Crítica** (RCE em script, secret leakage) | 24h úteis | 7 dias |
| **Alta** (prompt injection com impacto, dados sensíveis em logs) | 48h úteis | 14 dias |
| **Média** | 5 dias úteis | 30 dias |
| **Baixa** | 10 dias úteis | sem SLA fixo |

## 🤝 Disclosure coordenado

Padrão da indústria: **90 dias** entre o report inicial e a divulgação pública. Pode ser estendido se patch exigir mais tempo, ou reduzido pra issues triviais.

## 📋 O que esperar

1. Confirmação de recebimento dentro do SLA
2. Triagem inicial e classificação de severidade
3. Diálogo durante a investigação
4. Patch + reconhecimento público (se desejado)
5. CVE atribuído quando aplicável

## 🏆 Reconhecimento

Contribuidores que reportarem vulnerabilidades de boa-fé serão **mencionados publicamente** no advisory (se desejarem) e no CHANGELOG.

Não há programa de bug bounty pago — o projeto é open source mantido pela Dewtech sem orçamento dedicado pra isso ainda.

## 🌐 MCP HTTP Server (`dare mcp`)

O servidor MCP embutido no CLI expõe ferramentas DARE via HTTP. Superfície relevante:

| Controle | Comportamento |
|---|---|
| **Bind** | Default `127.0.0.1` — não aceita conexões da LAN. Para expor na rede local, defina `DARE_MCP_BIND=0.0.0.0` (use só em ambientes confiáveis). |
| **Porta** | `DARE_MCP_PORT` (default `3100`). |
| **Autenticação** | Bearer token gerado no boot; envie `Authorization: Bearer <token>`. Em loopback, `?token=` também é aceito para DX local. |
| **Erros** | Respostas JSON genéricas — **sem paths absolutos** nem stack traces em produção. |

Reporte bypass de auth, bind indevido em `0.0.0.0` sem opt-in, ou vazamento de paths/secrets em respostas de erro como **Alta**.

## 📦 Pacote npm `@dewtech/dare-cli`

O CLI publicado em [npmjs.com/package/@dewtech/dare-cli](https://www.npmjs.com/package/@dewtech/dare-cli) é software executável (Node ≥ 18). Vulnerabilidades em dependências, command injection, path traversal ou execução indevida de subprocessos devem ser reportadas pelos canais acima — **não** via issue público.

## 🔗 Supply-chain

- **Provenance npm**: releases via tag `v*` usam `npm publish --provenance` com OIDC (`id-token: write`). Configure trusted publishing no npm antes do primeiro release com provenance.
- **GitHub Actions**: todos os workflows em `.github/workflows/` pinam actions por **commit SHA** (não tags móveis `@vN`). Regressão é bloqueada por `scripts/verify-actions-pinned.mjs` no CI.

## 🧱 Práticas adotadas no projeto

Pra reduzir superfície de problemas:

- **Sem secrets** em qualquer arquivo do repo. Nem nos exemplos.
- **Sem URLs internas** ou de clientes em qualquer lugar
- **Scripts Python** com type hints e validação de input
- **Prompts** revisados pra evitar exposição inadvertida de instruções do sistema
- **Examples** com dados sintéticos apenas
- **Path safety** em comandos que escrevem no filesystem (`dare init`, etc.)
- **CI** com ESLint real, audit de dependências e gate de cobertura

Se você notar **qualquer violação** dessas práticas no código atual, reporte como vulnerabilidade.
