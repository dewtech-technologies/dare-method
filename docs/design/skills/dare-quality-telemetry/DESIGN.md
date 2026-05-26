# DESIGN.md — Skill `dare-quality-telemetry` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-quality-telemetry` codifica **coleta de métricas de qualidade** como skill transversal, responsável por validar conformidade DARE em CI.

Define como aplicações DARE devem:
- Coletar métricas binárias (M-01 a M-04) de cada skill transversal
- Validar conformidade em CI (fail build se métrica < 100%)
- Reportar resultados em PR comments e dashboard (opcional)
- Identificar regressions (métrica caiu entre builds)
- Manter histórico de métricas (trends)
- Documentar causas de falhas (qual commit quebrou?)

Métricas não são vanity — são **gatekeepers** que garantem qualidade v3.0 do DARE é real e mensurada.

---

## 2. Problema que Resolve

### 2.1 O gap atual

Métricas de qualidade hoje:
- Colhidas manualmente ("somos 85% testados")
- Não são verificadas automaticamente
- Regressions descobertas em produção
- Não há histórico ou trend analysis
- Dashboard is "nice-to-have" (nunca feito)

### 2.2 Sintomas

1. Commit A: all tests pass. Commit B: tests still pass, but conformidade caiu (não detectado)
2. Feature X claimed 100% test coverage, mas realmente é 73% (não verificado)
3. Bundle size cresce toda semana; ninguém percebe até quebrar
4. Métrica viola, mas CI não falha (porque não há check)
5. Novo dev não sabe qual é o "standard" de qualidade

### 2.3 Raiz

**Falta automação:** métricas não são coletadas ou validadas em CI. Humanos são unreliable.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | Coleta automática M-01 a M-04 | Em cada build, coletam-se as 4 métricas de todas as skills |
| RF-02 | Validação em CI | Build falha se qualquer métrica < 100% (configurable) |
| RF-03 | PR comment com resultado | Resultado postado em PR (ou push a branch) |
| RF-04 | Regression detection | Se métrica caiu vs. main, CI alerta |
| RF-05 | Histórico de métricas | Salva resultados por commit (para trends) |
| RF-06 | Per-feature metrics | Consegue filtrar métricas por feature/domain |
| RF-07 | Dashboard (optional) | Página web mostra trends e conformidade |
| RF-08 | Cause tracking | Report identifica qual commit/PR introduziu regressão |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | < 2min overhead | Coleção de métricas não deve adicionar > 2min ao build |
| RNF-02 | Agnóstico a stack | Mesmas métricas coletadas em Rails, Rust, Node, Python, etc. |
| RNF-03 | Offline capable | Relatórios podem ser gerados sem internet (local only) |
| RNF-04 | Long-term storage | Histórico mantido por >= 1 ano (PostgreSQL, S3, etc.) |
| RNF-05 | Alerting integrable | Consegue enviar alertas via Slack, email, custom webhook |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | Nenhum dado sensível em métricas | Métricas são anônimas (IDs hash, nomes genéricos) |
| RS-02 | Dashboard autenticado | Se dashboard público, proteger com auth |
| RS-03 | Audit trail | Log quem viu/exportou métricas |
| RS-04 | Data retention policy | Métricas antigas deletadas por policy |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Developer** | Saber se seu código viola métrica (falha fast em CI) |
| **Tech Lead** | Dashboard mostrando health do projeto |
| **DevOps** | Alertas de regressão; trending |
| **Product Manager** | "Qual é a qualidade do código?" — resposta em número |
| **Agente de código** | Métricas guiam code gen (respeit standards) |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias):**

- **M-01**: 100% de builds incluem coleta de métricas (zero skipped)
- **M-02**: 0% de regressions desdetectadas (regression alerted < 5min)
- **M-03**: Histórico > 1 ano mantido (data retention policy)
- **M-04**: Dashboard carrega em < 2s (se implementado)

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Métricas apenas no main | Branches não checados; regressão descoberta em merge |
| AP-02 | Sem threshold definido | "85% is OK" vs. "100% required". Ambiguidade |
| AP-03 | Manual collection | Developer rodas script local. Não escalável, unreliable |
| AP-04 | No trending | Métricas por commit, mas nenhum histórico. Hard to debug when broke |
| AP-05 | Silent failures | Métrica falha collecting, CI ignores. Bad signal |
| AP-06 | All-or-nothing validation | Single métrica fails = build fails. No quarantine mode |
| AP-07 | Métricas não documentadas | Team não sabe o que M-01, M-02, etc. medem |
| AP-08 | Nenhum exemption mechanism | Métrica viola legitimamente (ex: vendor code). Sem way to mark exempt |
| AP-09 | Offline inaccessible | Dashboard down = ninguém vê metrics |
| AP-10 | Não é rastreável | Não consegue saber qual commit quebrou métrica |

---

## 9. Decisões Arquiteturais

### ADR-01: Centralized Metric Collector via CLI

**Decisão:** DARE CLI expõe command `dare metrics collect` que roda em CI:

```bash
# In CI (GitHub Actions, GitLab CI, etc.)
dare metrics collect \
  --output metrics.json \
  --skill dare-ax \
  --skill dare-layered-design \
  --skill dare-quality-telemetry
```

Output é JSON com toda métrica binária por skill:

```json
{
  "timestamp": "2026-05-26T10:00:00Z",
  "commit": "abc123",
  "metrics": {
    "dare-ax": {
      "M-01": { "pass": true, "description": "100% projects have valid llms.txt" }
    },
    "dare-layered-design": {
      "M-01": { "pass": true, "description": "0% components > 300 lines" }
    }
  }
}
```

**Racional:** Centralização; consistent; agnóstico a tech stack.

**Consequências:**
- DARE CLI grows (mas modular)
- Needs integration in every CI provider

---

### ADR-02: Metrics Storage in Time-Series DB

**Decisão:** Histórico de métricas armazenado em Time-Series DB (InfluxDB, TimescaleDB, ou simples JSON em S3):

```
metrics/
├── 2026-05-26/
│   ├── abc123.json          # Metrics for commit abc123
│   ├── def456.json
│   └── ...
└── 2026-05-25/
    └── ...
```

Cada arquivo JSON tem timestamp, commit hash, e todas métricas.

**Racional:** Eficiente para queries ("show me trend of M-01"); não precise SQL.

**Consequências:**
- Storage overhead (negligible: ~1KB per build)
- Query tooling needed (aggregation scripts)

---

### ADR-03: CI Fail on Metric < 100%

**Decisão:** Default behavior é fail build se qualquer métrica `< 100%`. Exemptions via config:

```yaml
# .dare/metrics.yml
thresholds:
  dare-ax:
    M-01:
      threshold: 100
      required: true
  dare-layered-design:
    M-01:
      threshold: 100
      required: true
      exemptions:
        - "src/vendor/**"  # Don't count vendor code
```

**Racional:** Strictness by default; opt-in leniency.

**Consequências:**
- Could block PRs (but that's the point)
- Must have good exemption story

---

### ADR-04: Regression Detection via Baseline Comparison

**Decisão:** Cada build compara metrics vs. main branch baseline:

```
Main baseline: M-01 = 100%
Current branch: M-01 = 95%
REGRESSION: M-01 dropped 5%
```

Se regressão, CI passa warning (not fail, unless configured strict):

```
⚠️  Regression detected:
  dare-ax/M-01: 100% → 95%
  dare-layered-design/M-02: 100% → 98%
```

**Racional:** Détection; visibility; не blocka, but alerts.

**Consequências:**
- Baseline calculation needed (fetch main, compare)
- Slight build overhead

---

### ADR-05: Dashboard as Optional Enhancement

**Decisão:** Dashboard (web UI mostrando trends) é **optional** mas recomendado:

```
https://metrics.example.com/dare/
├── Overview (pass/fail status per metric)
├── Trends (graph of M-01, M-02 over time)
├── Regressions (when each metric regressed)
└── Export (CSV, JSON)
```

Dashboard pode ser:
- Self-hosted (React app querying S3/DB)
- Third-party (Grafana, DataDog)
- Or skipped (metrics only in CI)

**Racional:** Nice-to-have, not critical. Evolve in v1.1.

**Consequências:**
- Optional complexity
- Non-blocking for v1.0

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Metric collection slow (overhead > 2min) | **Média** | Parallelize collectors; cache results |
| False positive regression (normal variation) | **Média** | Trend line (not single value); alert on > 5% drop |
| Exemption list abused (always exempt) | **Média** | Review exemptions in PR; clear policy |
| Dashboard never built (v1.0 feature creep) | **Baixa** | Don't include in v1.0; v1.1 feature |
| Metric collection fails silently | **Alta** | Log errors; CI should warn if collectors error |
| Storage grows unbounded | **Média** | Retention policy (keep 1 year); archive older |

---

## 11. Dependências

### Externas
- **Time-Series DB** (InfluxDB, TimescaleDB) ou S3 + Lambda
- **CI provider** (GitHub Actions, GitLab CI, etc.)
- **Grafana** (optional, for dashboard)

### Internas
- **dare-ax**: collects M-01, M-02, M-03, M-04 for AX
- **dare-layered-design**: collects M-01, M-02, M-03, M-04 for Layered Design
- **dare-llm-integration**: collects M-01, M-02, M-03, M-04 for LLM
- **dare-frontend-design**: collects M-01, M-02, M-03, M-04 for Frontend
- **dare-realtime**: collects M-01, M-02, M-03, M-04 for Real-time
- All other skills: collect respective metrics

---

## 12. Fora de Escopo

- Performance profiling (enters in `dare-performance` v1.0 future)
- Custom metrics beyond M-01 to M-04 (enters in v1.1+)
- Distributed tracing (enters in v1.1)
- Cost analysis (enters in v1.2)
- Real-time alerting dashboard (enters in v1.1+)

---

## 13. Roadmap Pós v1.0

### v1.1 — Dashboard + Custom Metrics

- Web UI with trends, regression tracking
- Custom metric definitions per project
- Slack/email integrations
- Data export (CSV, JSON)

**Entrega esperada:** semana 3-4 do plano 30 dias

---

### v1.2 — Distributed Tracing + Cost Attribution

- Request tracing (how long does each operation take?)
- Cost per feature (LLM calls attributed to feature)
- Performance regression detection

**Entrega esperada:** month 2

---

### v2.0+

- A/B testing metrics
- User behavior analytics
- Alerting rules engine
- Enterprise SAAS dashboard

---

## Apêndice A: Metric Collectors Implementation (Pseudo-code)

```typescript
// collectors/index.ts
export async function collectMetrics(skills: string[]): Promise<MetricResult> {
  const results = {};

  for (const skill of skills) {
    const collector = getCollector(skill);
    try {
      results[skill] = await collector.collect();
    } catch (err) {
      results[skill] = {
        error: err.message,
        timestamp: new Date(),
      };
    }
  }

  return {
    timestamp: new Date(),
    commit: getCurrentCommit(),
    metrics: results,
  };
}

// collectors/dare-ax.ts
export class DareAxCollector {
  async collect(): Promise<MetricGroup> {
    return {
      "M-01": {
        pass: await this.checkLlmsTxt(),
        description: "100% of projects have valid llms.txt",
      },
      "M-02": {
        pass: await this.checkOpenAPI(),
        description: "100% of HTTP endpoints have OpenAPI",
      },
      "M-03": {
        pass: await this.checkJsonFlag(),
        description: "100% of CLIs support --json",
      },
      "M-04": {
        pass: await this.checkRateLimit(),
        description: "100% of public endpoints have rate limit",
      },
    };
  }

  private async checkLlmsTxt(): Promise<boolean> {
    // Find llms.txt in root; validate structure
    const llmsPath = findFile("llms.txt");
    if (!llmsPath) return false;
    
    const content = readFile(llmsPath);
    return validateLlmsContent(content);
  }

  private async checkOpenAPI(): Promise<boolean> {
    // Find all HTTP handlers; check if documented in OpenAPI
    const handlers = findAllHandlers();
    const openapi = parseOpenAPI(readFile("openapi.json"));
    
    return handlers.every(h => openapi.paths[h.path]);
  }

  private async checkJsonFlag(): Promise<boolean> {
    // Run CLI --help; check if --json is mentioned
    const cliHelp = execSync("./cli --help");
    return cliHelp.includes("--json");
  }

  private async checkRateLimit(): Promise<boolean> {
    // Parse code for rate limit middleware; validate all public routes
    const code = findAllRoutesWithAuth();
    const rateLimited = code.filter(route => hasRateLimitDecorator(route));
    
    return rateLimited.length === code.length;
  }
}

// reporters/json.ts
export function reportJSON(result: MetricResult, file: string): void {
  writeFile(file, JSON.stringify(result, null, 2));
}

// reporters/pr-comment.ts
export async function reportPRComment(result: MetricResult): Promise<void> {
  const comment = formatComment(result);
  await octokit.issues.createComment({
    owner: owner,
    repo: repo,
    issue_number: prNumber,
    body: comment,
  });
}

function formatComment(result: MetricResult): string {
  const status = Object.entries(result.metrics)
    .map(([skill, metrics]) => {
      const passed = Object.values(metrics).every(m => m.pass !== false);
      return `${passed ? "✅" : "❌"} ${skill}`;
    })
    .join("\n");

  return `## DARE Quality Metrics\n\n${status}\n\nFull report: metrics.json`;
}
```

---

## Apêndice B: CI Integration (GitHub Actions)

```yaml
# .github/workflows/dare-metrics.yml
name: DARE Metrics

on: [push, pull_request]

jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: "20"

      - run: npm install -g @dewtech/dare-cli

      - name: Collect metrics
        run: |
          dare metrics collect \
            --output metrics.json \
            --skill dare-ax \
            --skill dare-layered-design \
            --skill dare-llm-integration \
            --skill dare-frontend-design \
            --skill dare-realtime \
            --skill dare-quality-telemetry

      - name: Check conformance
        run: dare metrics validate metrics.json

      - name: Detect regressions
        if: github.event_name == 'pull_request'
        run: |
          git fetch origin main
          dare metrics compare \
            --baseline origin/main \
            --current metrics.json

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const metrics = JSON.parse(fs.readFileSync('metrics.json'));
            const comment = require('./reporters/pr-comment').format(metrics);
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

      - name: Upload metrics
        uses: actions/upload-artifact@v3
        with:
          name: metrics-${{ github.sha }}
          path: metrics.json
          retention-days: 365
```

---

**Próximo passo:** Implementação via CI/CD pipeline. Integração com todas as outras skills para coleta efetiva de M-01 a M-04.
