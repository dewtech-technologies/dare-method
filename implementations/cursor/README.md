# 🚀 Sistema de Automação DARE para Cursor

**Versão:** 1.0 | **Última atualização:** Abril 2026

Este repositório contém a implementação completa do **Método DARE** (Design → Architect → Review → Execute) otimizada para o **Cursor IDE**. O sistema integra os princípios de Context Engineering e Agentic Engineering para garantir que a IA gere código de alta qualidade, seguindo os padrões do seu projeto e mantendo você (o humano) sempre no controle através de revisões obrigatórias.

## 📖 O Método DARE

O Método DARE é um fluxo estruturado que combina planejamento humano com execução automatizada de IA:

| Fase | O que faz | Quem faz | Saída |
|------|-----------|----------|-------|
| **Design** | Define requisitos e funcionalidades | Humano (IA auxilia) | `DARE/DESIGN.md` |
| **Architect** | Cria arquitetura e plano de execução | IA (Cursor) | `DARE/BLUEPRINT.md` |
| **Review** | Valida e aprova o plano | Humano | Aprovação ✓ |
| **Execute** | Implementa o código com testes | IA (Cursor) | Código + Testes ✓ |

## 🎯 Fluxo Completo

```
1. /generate-design "Sua ideia"
   ↓ (Você revisa e aprova)
2. /generate-blueprint DARE/DESIGN.md
   ↓ (Você revisa e aprova)
3. /generate-dockerfile (Opcional: cria container)
   ↓ (Você revisa e aprova)
4. /generate-docker-compose (Opcional: orquestração)
   ↓ (Você revisa e aprova)
5. /generate-tasks DARE/BLUEPRINT.md
   ↓ (Você revisa e aprova)
6. /execute-task task-001
   ↓ (IA implementa + testes)
7. /execute-task task-002
   ↓ (Repita para todas as tasks)
8. /telemetry-report (Opcional: análise de uso)
```

## 📋 Comandos Disponíveis

### Comandos Principais (DARE Core)

| Comando | Descrição | Entrada | Saída |
|---------|-----------|---------|-------|
| `/generate-design` | Transforma ideia em Design estruturado | Descrição de feature | `DARE/DESIGN.md` |
| `/generate-blueprint` | Cria arquitetura a partir do Design | `DARE/DESIGN.md` | `DARE/BLUEPRINT.md` |
| `/generate-tasks` | Quebra Blueprint em tarefas atômicas | `DARE/BLUEPRINT.md` | `DARE/TASKS.md` + `task-*.md` |
| `/execute-task` | Implementa uma tarefa com testes | `task-001` | Código + Testes ✓ |

### Comandos de Infraestrutura

| Comando | Descrição | Entrada | Saída |
|---------|-----------|---------|-------|
| `/generate-dockerfile` | Cria Dockerfile otimizado | Stack do projeto | `Dockerfile` + `.dockerignore` |
| `/generate-docker-compose` | Cria orquestração de serviços | `DARE/BLUEPRINT.md` | `docker-compose.yml` |

### Comandos de Análise

| Comando | Descrição | Entrada | Saída |
|---------|-----------|---------|-------|
| `/telemetry-report` | Gera relatório de tokens/modelos | `DARE/TELEMETRY.md` | Análise completa |

## 🧠 Skills (Regras de Contexto)

As skills ensinam o Cursor como se comportar em cada contexto. Todas são carregadas automaticamente:

| Skill | Arquivo | Propósito |
|-------|---------|----------|
| **Laravel API** | `skill-laravel-api.mdc` | Padrões para PHP 8.3 + Laravel 11 |
| **Docker** | `skill-docker.mdc` | Multi-stage builds, segurança, otimização |
| **Segurança** | `skill-security.mdc` | OWASP Top 10, validação, criptografia |
| **Telemetria** | `skill-telemetry.mdc` | Rastreamento de tokens e modelos |

**Como adicionar mais skills:**
1. Crie um arquivo `.cursor/rules/skill-[nome].mdc`
2. Defina as regras e convenções
3. O Cursor carregará automaticamente na próxima conversa

## 📂 Estrutura de Arquivos

```
seu-projeto/
├── .cursorrules                    # Regras globais (carregado automaticamente)
├── .cursor/
│   ├── commands/                   # Comandos DARE
│   │   ├── generate-design.md
│   │   ├── generate-blueprint.md
│   │   ├── generate-tasks.md
│   │   ├── execute-task.md
│   │   ├── generate-dockerfile.md
│   │   ├── generate-docker-compose.md
│   │   └── telemetry-report.md
│   ├── rules/                      # Skills por contexto
│   │   ├── skill-laravel-api.mdc
│   │   ├── skill-docker.mdc
│   │   ├── skill-security.mdc
│   │   ├── skill-telemetry.mdc
│   │   ├── skill-python-api.mdc    # (Opcional)
│   │   ├── skill-go-api.mdc        # (Opcional)
│   │   └── skill-vue-frontend.mdc  # (Opcional)
│   └── settings.local.json         # Configurações do Cursor
├── DARE/
│   ├── DESIGN.md                   # Requisitos aprovados
│   ├── BLUEPRINT.md                # Arquitetura aprovada
│   ├── TASKS.md                    # Visão geral das tarefas
│   ├── TELEMETRY.md                # Rastreamento de uso (opcional)
│   └── EXECUTION/
│       ├── task-001.md
│       ├── task-002.md
│       └── ...
├── templates/                      # Templates para geração de documentos
│   ├── DESIGN-template.md
│   ├── BLUEPRINT-template.md
│   ├── TASKS-template.md
│   ├── TASK-SPEC-template.md
│   └── TELEMETRY-template.md
├── examples/                       # Exemplos de código-base
│   ├── laravel-user-controller.php
│   ├── laravel-store-user-request.php
│   ├── laravel-user-model.php
│   ├── laravel-Dockerfile
│   ├── laravel-docker-compose.yml
│   └── vue-user-form.vue
├── scripts/                        # Utilitários
│   └── analyze-telemetry.py
├── Dockerfile                      # Gerado por /generate-dockerfile
├── docker-compose.yml              # Gerado por /generate-docker-compose
└── [resto do projeto]
```

## 🚀 Início Rápido

### Opção 1: Setup Automático (Recomendado)

**Windows:**
```bash
cd DARE-SYSTEM
setup-projeto.bat C:\caminho\para\seu\projeto
```

**macOS/Linux:**
```bash
cd DARE-SYSTEM
chmod +x setup-projeto.sh
./setup-projeto.sh /caminho/para/seu/projeto
```

### Opção 2: Setup Manual

1. Copie `.cursor/` para a raiz do seu projeto
2. Copie `.cursorrules` para a raiz do seu projeto
3. Copie `templates/` e `examples/` para referência
4. Crie o diretório `DARE/EXECUTION`

### Verificar Instalação

1. Abra seu projeto no Cursor: **File → Open Folder**
2. Abra o Composer: **Ctrl+I** (Windows/Linux) ou **Cmd+I** (Mac)
3. Digite `/` para ver os comandos disponíveis
4. Teste: `/generate-design "Teste rápido"`

## 📚 Documentação Completa

| Documento | Propósito |
|-----------|-----------|
| **CONFIGURACAO-CURSOR.md** | Como o Cursor carrega regras e comandos |
| **SETUP-RAPIDO.md** | Setup em 5 minutos |
| **REFERENCIA-RAPIDA.md** | Cheat sheet com todos os comandos |
| **GUIA-DE-USO.md** | Exemplo prático completo (To-Do List API) |
| **GUIA-TELEMETRIA.md** | Como rastrear tokens e modelos do Cursor |

## 🛡️ Segurança (OWASP Top 10)

A skill de segurança garante que o Cursor gere código seguro em todas as fases:

- **Design:** Requisitos de segurança explícitos
- **Blueprint:** Arquitetura com proteções (Auth, Rate Limit, Validação)
- **Tasks:** Tarefas incluem validações de segurança
- **Execute:** Código com Bcrypt, SQL Injection prevention, XSS protection

Vulnerabilidades cobertas: Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Authentication Failures, SSRF.

## 🐳 Docker & Containerização

O sistema gera Dockerfiles otimizados com:

- **Multi-stage builds** para reduzir tamanho
- **Usuários não-root** para segurança
- **Cache de camadas** para performance
- **Health checks** para confiabilidade
- **docker-compose.yml** com volumes persistentes e redes isoladas

Suporte para: Laravel/PHP, Python, Go, Vue.js/Node.

## 📊 Telemetria & Análise

Rastreie qual modelo do Cursor foi usado em cada etapa:

```bash
/telemetry-report
```

Gera análise com:
- Tokens processados por etapa
- Modelos utilizados (GPT-4, Claude, Gemini)
- Tempo de execução
- Recomendações de otimização

Análise visual em terminal:
```bash
python3 scripts/analyze-telemetry.py
```

## 🔧 Customização

### Trocar de Stack

Edite `.cursorrules` e adicione skills correspondentes:

```markdown
# Para Python FastAPI
Stack: Python 3.11 + FastAPI + PostgreSQL

# Adicione em .cursor/rules/
skill-python-api.mdc
```

### Adicionar Novas Skills

1. Crie `.cursor/rules/skill-[nome].mdc`
2. Defina as regras e convenções
3. Carregamento automático na próxima conversa

### Adicionar Exemplos de Código

Coloque arquivos na pasta `examples/`:
- Controllers
- Models
- Services
- Components
- Migrations

A IA usará esses exemplos como referência de padrão.

## 🎯 Casos de Uso

### Caso 1: Criar uma API de Autenticação

```
/generate-design "Criar API de login com JWT"
→ Revisar DARE/DESIGN.md
→ /generate-blueprint DARE/DESIGN.md
→ Revisar DARE/BLUEPRINT.md
→ /generate-tasks DARE/BLUEPRINT.md
→ Revisar DARE/TASKS.md
→ /execute-task task-001 (Migration)
→ /execute-task task-002 (AuthController)
→ /execute-task task-003 (Testes)
```

### Caso 2: Containerizar Projeto Existente

```
/generate-dockerfile
→ Revisar Dockerfile
→ /generate-docker-compose
→ Revisar docker-compose.yml
→ docker-compose up -d
```

### Caso 3: Monitorar Custos de IA

```
/telemetry-report
→ Análise de tokens por etapa
→ Recomendações de otimização
→ python3 scripts/analyze-telemetry.py (visual)
```

## 🔄 Ralph Loop (Validação Automática)

Quando você executa `/execute-task`, a IA:

1. **Implementa** o código conforme a especificação
2. **Executa** testes (PHPUnit, Pytest, etc)
3. **Se falhar:** Lê o erro, corrige e repete
4. **Se passar:** Marca como concluído

Isso garante que o código entregue **sempre funciona**.

## 📖 Stack Suportadas

| Stack | Status | Skill | Exemplos |
|-------|--------|-------|----------|
| Laravel/PHP | ✓ Completo | `skill-laravel-api.mdc` | Sim |
| Python (FastAPI) | ✓ Completo | `skill-python-api.mdc` | Em breve |
| Go | ✓ Completo | `skill-go-api.mdc` | Em breve |
| Vue.js | ✓ Completo | `skill-vue-frontend.mdc` | Sim |
| Docker | ✓ Completo | `skill-docker.mdc` | Sim |
| Segurança | ✓ Completo | `skill-security.mdc` | N/A |
| Telemetria | ✓ Completo | `skill-telemetry.mdc` | N/A |

## 🤝 Contribuindo

Para adicionar melhorias:

1. Crie uma nova skill em `.cursor/rules/skill-[nome].mdc`
2. Adicione exemplos em `examples/`
3. Documente em um novo arquivo `GUIA-[NOME].md`
4. Atualize este README

## 📞 Suporte

Se algo não funcionar:

1. Consulte **CONFIGURACAO-CURSOR.md** (seção Troubleshooting)
2. Verifique se os arquivos estão no lugar certo
3. Feche e reabra o Cursor
4. Teste novamente

## 🔗 Referências

- [Método DARE (DewTech)](https://www.youtube.com/@dewtech)
- [Context Engineering (Cole Medin)](https://github.com/coleam00/context-engineering-intro)
- [PRP Agentic Engineering (Wirasm)](https://github.com/Wirasm/PRPs-agentic-eng)
- [Cursor IDE Docs](https://cursor.com/docs)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---
**Versão:** 1.0 | **Última atualização:** Abril 2026
