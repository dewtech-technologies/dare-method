# Guia de Telemetria - Rastreamento de Tokens e Modelos do Cursor

Este guia explica como rastrear e analisar o consumo de tokens e modelos do Cursor em cada etapa do seu projeto DARE.

## 📊 Por que Rastrear Telemetria?

Ao trabalhar com o Cursor (sua única IA por compliance), você está utilizando diferentes modelos que processam tokens. Rastrear esse consumo permite que você:

- **Escolha o Modelo Certo:** Identifique qual modelo é mais eficiente para cada tipo de tarefa.
- **Análise de Performance:** Veja qual modelo é mais rápido e preciso para cada etapa.
- **Auditoria:** Mantenha um registro histórico de todos os modelos utilizados.
- **Otimização:** Tome decisões informadas sobre qual modelo usar em cada etapa.

## 🔍 Onde Encontrar Informações do Cursor

### Na Interface do Cursor

Após executar cada comando, o Cursor exibe informações sobre o modelo utilizado:

**Na barra de status (canto inferior direito):**
```
GPT-4 Turbo | 2.3s | ~12,345 tokens
```

**No painel de histórico:**
- Clique no ícone de informações (ℹ️) da resposta
- Veja detalhes do modelo, tempo e tokens

**Exemplo de informação exibida:**
```
Model: GPT-4 Turbo
Provider: OpenAI
Time: 2.3 seconds
Tokens: ~12,345 (estimated)
```

### Capturando a Informação

1. Após executar um comando (ex: `/generate-design`), procure pela informação de modelo.
2. Anote os seguintes dados:
   - **Modelo:** GPT-4 Turbo (ou Claude, Gemini)
   - **Tempo de Execução:** [Tempo em segundos/minutos]
   - **Tokens Estimados:** [Número]
   - **Timestamp:** [Data e Hora]

## 📝 Como Registrar Telemetria Manualmente

### Passo 1: Criar o Arquivo de Telemetria

Se ainda não existe, crie o arquivo `DARE/TELEMETRY.md`:

```bash
touch DARE/TELEMETRY.md
```

### Passo 2: Usar o Template

Copie o conteúdo de `templates/TELEMETRY-template.md` para `DARE/TELEMETRY.md` e preencha com seus dados.

### Passo 3: Registrar Cada Etapa

#### Após `/generate-design`:
```markdown
### 1. Design (`/generate-design`)

| Campo | Valor |
|-------|-------|
| Data/Hora | 2026-04-13 14:30:00 |
| Modelo do Cursor | GPT-4 Turbo |
| Tokens Estimados | 7,390 |
| Tempo de Execução | 45 segundos |
| Comando Executado | `/generate-design "Criar API de autenticação"` |
| Observações | Resposta clara e bem estruturada |
| Status | ✓ Sucesso |
```

#### Após `/generate-blueprint`:
```markdown
### 2. Blueprint (`/generate-blueprint`)

| Campo | Valor |
|-------|-------|
| Data/Hora | 2026-04-13 14:45:00 |
| Modelo do Cursor | Claude 3.5 Sonnet |
| Tokens Estimados | 21,373 |
| Tempo de Execução | 2 minutos |
| Arquivo Processado | DARE/DESIGN.md |
| Observações | Arquitetura bem pensada, endpoints claros |
| Status | ✓ Sucesso |
```

#### Após `/generate-tasks`:
```markdown
### 3. Tasks (`/generate-tasks`)

| Campo | Valor |
|-------|-------|
| Data/Hora | 2026-04-13 15:00:00 |
| Modelo do Cursor | GPT-4 Turbo |
| Tokens Estimados | 33,912 |
| Tempo de Execução | 3 minutos 20 segundos |
| Arquivo Processado | DARE/BLUEPRINT.md |
| Tasks Geradas | 12 |
| Observações | Tasks bem granulares e atômicas |
| Status | ✓ Sucesso |
```

#### Após cada `/execute-task`:
```markdown
#### Task 001: Migration de Users

| Campo | Valor |
|-------|-------|
| Data/Hora | 2026-04-13 15:15:00 |
| Modelo do Cursor | GPT-4 Turbo |
| Tokens Estimados | 7,801 |
| Tempo de Execução | 1 minuto 30 segundos |
| Tentativas (Ralph Loop) | 1 |
| Observações | Código limpo, testes passaram na primeira |
| Status | ✓ Sucesso |
```

## 🎯 Otimizações Comuns

### 1. Escolher o Modelo Certo para Cada Tarefa

**GPT-4 Turbo:**
- Melhor para: Tarefas complexas, geração de código, análise
- Tempo: Médio
- Quando usar: Design, Blueprint, Tasks complexas

**Claude 3.5 Sonnet:**
- Melhor para: Análise profunda, segurança, documentação
- Tempo: Rápido
- Quando usar: Revisão de segurança, análise de código

**Gemini 2.0 Flash:**
- Melhor para: Tarefas simples, processamento rápido
- Tempo: Muito rápido
- Quando usar: Pequenas correções, formatação

### 2. Reutilizar Contexto na Mesma Sessão

Se você rodar múltiplas tasks na mesma conversa do Composer, o contexto é reutilizado, economizando processamento:

**Antes (3 conversas separadas):**
```
Task 1: 7,801 tokens
Task 2: 11,357 tokens
Task 3: 9,234 tokens
Total: 28,392 tokens
```

**Depois (1 conversa com 3 tasks):**
```
Task 1: 7,801 tokens
Task 2: 5,234 tokens (contexto reutilizado)
Task 3: 4,567 tokens (contexto reutilizado)
Total: 17,602 tokens (~38% economia)
```

### 3. Revisar Antes de Executar

Se você revisar o Blueprint e encontrar erros antes de rodar `/generate-tasks`, você economiza tokens:

**Sem revisão:**
```
Tasks geradas: 15
Tasks com erro: 3
Retrabalho: 3 tasks × 8,000 tokens = 24,000 tokens
```

**Com revisão:**
```
Tasks geradas: 12 (corretas)
Retrabalho: 0
Economia: 24,000 tokens
```

### 4. Prompts Mais Concisos

Quanto mais conciso seu prompt, menos tokens processados:

**Ruim (1,234 tokens):**
```
Por favor, crie um modelo de usuário para um sistema de autenticação. 
O modelo deve ter campos para nome, email, senha, data de criação, 
data de atualização, e um campo booleano para indicar se o usuário 
está ativo ou não. O modelo deve estar em Laravel...
```

**Bom (567 tokens):**
```
Crie um Model Laravel para usuários com campos: name, email, password, 
is_active, timestamps. Use Bcrypt para senha.
```

**Economia:** 667 tokens processados

## 📊 Exemplo de Relatório Completo

Após completar um projeto pequeno, seu `DARE/TELEMETRY.md` pode parecer assim:

```markdown
# Telemetria do Projeto: To-Do List API

## Resumo Executivo

| Métrica | Valor |
|---------|-------|
| **Projeto** | To-Do List API |
| **Data de Início** | 2026-04-13 |
| **Tokens Totais Processados** | 147,909 |
| **IA Utilizada** | Cursor (por compliance) |
| **Tempo Total de Execução** | 1 hora 45 minutos |
| **Modelos Utilizados** | GPT-4 Turbo, Claude 3.5 Sonnet |
| **Número de Tasks Executadas** | 12 |

## Análise de Tokens Processados

| Etapa | Tokens | % do Total | Tempo |
|-------|--------|-----------|-------|
| Design | 7,390 | 5% | 45 seg |
| Blueprint | 21,373 | 15% | 2 min |
| Tasks | 33,912 | 24% | 3 min 20 seg |
| Execute (12 tasks) | 85,234 | 56% | 25 min |
| **TOTAL** | **147,909** | **100%** | **~31 min** |

## Modelos Utilizados

| Modelo | Tokens | % do Total | Melhor Para |
|--------|--------|-----------|------------|
| GPT-4 Turbo | 98,234 | 66% | Design, Blueprint, Execute |
| Claude 3.5 Sonnet | 49,675 | 34% | Análise de segurança |
| Gemini 2.0 Flash | 0 | 0% | - |
```

## 🔗 Referências

- [Documentação do Cursor](https://cursor.com/docs)
- [Modelos Disponíveis no Cursor](https://cursor.com/docs/models)
- [DARE Telemetry Skill](.cursor/rules/skill-telemetry.mdc)
- [Comando /telemetry-report](.cursor/commands/telemetry-report.md)
