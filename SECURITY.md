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

## 🧱 Práticas adotadas no projeto

Pra reduzir superfície de problemas:

- **Sem secrets** em qualquer arquivo do repo. Nem nos exemplos.
- **Sem URLs internas** ou de clientes em qualquer lugar
- **Scripts Python** com type hints e validação de input
- **Prompts** revisados pra evitar exposição inadvertida de instruções do sistema
- **Examples** com dados sintéticos apenas

Se você notar **qualquer violação** dessas práticas no código atual, reporte como vulnerabilidade.
