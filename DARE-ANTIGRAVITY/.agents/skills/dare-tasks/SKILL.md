---
name: dare-tasks
description: Gera Task Groups estruturados a partir do Blueprint aprovado. Use quando o usuário aprovar o BLUEPRINT.md. Cria um documento TASKS.md com tarefas atômicas e especificações isoladas para cada uma.
---

# DARE Tasks Skill

Você é um especialista em decomposição de projetos e planejamento de tarefas. Seu objetivo é quebrar o Blueprint em tarefas atômicas, executáveis e testáveis.

## Quando usar esta skill

- Blueprint.md foi aprovado pelo usuário
- Precisa-se quebrar a arquitetura em tarefas
- Necessário criar especificações isoladas
- Terceira fase do Método DARE

## Como usar

### Passo 1: Ler o Blueprint Aprovado
Leia o arquivo `DARE/BLUEPRINT.md` que foi aprovado. Extraia:
- Fases do plano de execução
- Endpoints a implementar
- Modelos de dados
- Estrutura de diretórios

### Passo 2: Quebrar em Tarefas Atômicas
Cada tarefa deve:
- Ser pequena o suficiente para uma conversa
- Ter dependências claras
- Ser testável isoladamente
- Incluir validações de segurança

### Passo 3: Integrar Segurança
Para cada tarefa, inclua:
- Validações de entrada
- Autenticação/Autorização
- Testes de segurança
- Proteção contra vulnerabilidades

### Passo 4: Gerar TASKS.md
Crie um documento `DARE/TASKS.md` com visão geral:

```markdown
# Tasks: [Nome do Projeto]

## Visão Geral
Total de Tasks: [N]
Fases: [Número]
Tempo Estimado: [Tempo]

## Dependências

```
Phase 1: Setup
  └─ Task 001: Migrations
  └─ Task 002: JWT Setup

Phase 2: Auth
  ├─ Task 003: RegisterController (depende de Task 001)
  ├─ Task 004: LoginController (depende de Task 001)
  └─ Task 005: RefreshController (depende de Task 001)

Phase 3: Protection
  ├─ Task 006: JWT Middleware (depende de Task 002)
  ├─ Task 007: Rate Limiting (depende de Task 006)
  └─ Task 008: Logout (depende de Task 006)

Phase 4: Testing
  ├─ Task 009: Unit Tests (depende de Task 003-008)
  ├─ Task 010: Integration Tests (depende de Task 009)
  └─ Task 011: Docker Setup (depende de Task 010)
```

## Tarefas por Fase

### Phase 1: Setup Inicial

#### Task 001: Criar Migrations de Users
- Arquivo: `DARE/EXECUTION/task-001.md`
- Tempo: 15 min
- Dependências: Nenhuma

#### Task 002: Configurar JWT
- Arquivo: `DARE/EXECUTION/task-002.md`
- Tempo: 20 min
- Dependências: Nenhuma

### Phase 2: Autenticação

#### Task 003: Implementar RegisterController
- Arquivo: `DARE/EXECUTION/task-003.md`
- Tempo: 30 min
- Dependências: Task 001

#### Task 004: Implementar LoginController
- Arquivo: `DARE/EXECUTION/task-004.md`
- Tempo: 30 min
- Dependências: Task 001, Task 002

#### Task 005: Implementar RefreshController
- Arquivo: `DARE/EXECUTION/task-005.md`
- Tempo: 25 min
- Dependências: Task 001, Task 002

### Phase 3: Proteção

#### Task 006: Implementar JWT Middleware
- Arquivo: `DARE/EXECUTION/task-006.md`
- Tempo: 20 min
- Dependências: Task 002

#### Task 007: Implementar Rate Limiting
- Arquivo: `DARE/EXECUTION/task-007.md`
- Tempo: 25 min
- Dependências: Task 006

#### Task 008: Implementar Logout
- Arquivo: `DARE/EXECUTION/task-008.md`
- Tempo: 20 min
- Dependências: Task 006

### Phase 4: Testing

#### Task 009: Testes Unitários
- Arquivo: `DARE/EXECUTION/task-009.md`
- Tempo: 40 min
- Dependências: Task 003-008

#### Task 010: Testes de Integração
- Arquivo: `DARE/EXECUTION/task-010.md`
- Tempo: 50 min
- Dependências: Task 009

#### Task 011: Docker Setup
- Arquivo: `DARE/EXECUTION/task-011.md`
- Tempo: 30 min
- Dependências: Task 010

## Próximas Etapas
1. Revisar e aprovar este TASKS.md
2. Executar `/execute-task task-001` para começar
3. Continuar com o Método DARE
```

### Passo 5: Gerar Especificações Isoladas
Para CADA tarefa, crie um arquivo `DARE/EXECUTION/task-[id].md`:

```markdown
# Task 001: Criar Migrations de Users

## Objetivo
Criar as migrations para tabelas de users e refresh_tokens.

## Descrição
Implementar duas migrations Laravel:
1. create_users_table.php
2. create_refresh_tokens_table.php

## Especificações

### Tabela: users
- id: UUID (PK)
- email: VARCHAR(255) UNIQUE NOT NULL
- password_hash: VARCHAR(255) NOT NULL
- name: VARCHAR(255) NOT NULL
- is_active: BOOLEAN DEFAULT true
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### Tabela: refresh_tokens
- id: UUID (PK)
- user_id: UUID (FK → users.id)
- token: VARCHAR(500) UNIQUE
- expires_at: TIMESTAMP NOT NULL
- revoked_at: TIMESTAMP NULL
- created_at: TIMESTAMP

## Arquivos a Criar
- `database/migrations/YYYY_MM_DD_HHMMSS_create_users_table.php`
- `database/migrations/YYYY_MM_DD_HHMMSS_create_refresh_tokens_table.php`

## Validações (Validation Gates)
- [ ] Migrations criadas sem erros
- [ ] Tabelas têm índices apropriados
- [ ] Foreign keys estão corretas
- [ ] Timestamps são automáticos
- [ ] `php artisan migrate` executa sem erros

## Testes
```bash
php artisan migrate
php artisan migrate:rollback
php artisan migrate
```

## Segurança
- Senhas nunca são armazenadas em texto plano
- Tokens têm expiração
- Soft deletes para dados históricos

## Próxima Task
Task 002: Configurar JWT

## Notas
- Use UUID em vez de auto-increment
- Considere índices em email e user_id
```

### Passo 6: Pedir Aprovação
Após gerar todas as tasks:
- Peça ao usuário revisar
- Confirme dependências
- Aprove antes de executar

## Boas Práticas

1. **Atômicas:** Cada task é independente
2. **Testáveis:** Inclua validation gates
3. **Documentadas:** Especificações claras
4. **Seguras:** Integre requisitos OWASP
5. **Sequenciadas:** Respeite dependências

## Dicas para Melhor Resultado

- **Tamanho:** Tasks devem levar 15-60 minutos
- **Testes:** Sempre inclua validation gates
- **Segurança:** Consulte `skill-security` para cada task
- **Exemplos:** Use `examples/` como referência
- **Templates:** Use `templates/TASK-SPEC-template.md`
