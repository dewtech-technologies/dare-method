# Guia de Uso: Sistema de Automação DARE para Cursor

Este guia passo a passo mostra como usar o sistema DARE (Design, Architect, Review, Execute) para automatizar o desenvolvimento de features com o Cursor IDE.

## 🚀 Início Rápido

### Passo 1: Configurar o Projeto
1. Copie a pasta `.cursor` para a raiz do seu projeto.
2. Copie o arquivo `.cursorrules` para a raiz do seu projeto.
3. Edite o `.cursorrules` para refletir a stack do seu projeto (Laravel, Python, Go, Vue, etc).
4. Adicione exemplos de código-base na pasta `examples/` para que a IA aprenda seus padrões.

### Passo 2: Criar o Diretório DARE
```bash
mkdir -p DARE/EXECUTION
```

### Passo 3: Usar os 4 Comandos

#### **Comando 1: Gerar Design**
Abra o Cursor Composer (Ctrl/Cmd + I) e execute:
```
/generate-design "Criar uma API de autenticação com JWT para um app de tarefas"
```

**O que acontece:**
- A IA lê sua ideia.
- Gera um arquivo `DARE/DESIGN.md` estruturado com funcionalidades, stack técnica, requisitos e restrições.
- Você revisa e aprova o documento.

**Checklist de Revisão:**
- [ ] As funcionalidades descrevem exatamente o que você quer?
- [ ] A stack técnica está correta?
- [ ] O escopo está bem definido (o que entra e o que não entra)?

---

#### **Comando 2: Gerar Blueprint**
Após aprovar o Design, execute:
```
/generate-blueprint DARE/DESIGN.md
```

**O que acontece:**
- A IA lê o Design aprovado.
- Gera um arquivo `DARE/BLUEPRINT.md` com:
  - Visão geral da arquitetura
  - Modelo de dados completo
  - Endpoints da API com Request/Response
  - Estrutura de pastas
  - Plano de execução em fases
  - Comandos de setup

**Checklist de Revisão (OBRIGATÓRIO):**
- [ ] A arquitetura faz sentido para o tamanho do projeto?
- [ ] O modelo de dados está normalizado e completo?
- [ ] Todos os endpoints cobrem os casos de uso?
- [ ] A ordem de implementação respeita as dependências?
- [ ] O Blueprint está claro o suficiente para outra IA executar?

---

#### **Comando 3: Gerar Tasks**
Após aprovar o Blueprint, execute:
```
/generate-tasks DARE/BLUEPRINT.md
```

**O que acontece:**
- A IA lê o Blueprint aprovado.
- Quebra em tarefas atômicas e isoladas.
- Gera `DARE/TASKS.md` (visão geral).
- Cria arquivos isolados em `DARE/EXECUTION/task-001.md`, `task-002.md`, etc.
- Cada arquivo de task contém instruções detalhadas e Validation Gates (testes).

**Checklist de Revisão:**
- [ ] Cada task é pequena e atômica?
- [ ] Os critérios de sucesso são mensuráveis?
- [ ] As dependências entre tasks estão claras?
- [ ] Há exemplos de código para cada padrão?

---

#### **Comando 4: Executar uma Task**
Para começar a implementação, execute:
```
/execute-task task-001
```

**O que acontece:**
- A IA lê a especificação detalhada de `DARE/EXECUTION/task-001.md`.
- Implementa o código seguindo os padrões do projeto.
- Executa os Validation Gates (testes, linting, etc).
- Se algum teste falhar, corrige e tenta novamente (Ralph Loop).
- Marca a task como concluída em `DARE/TASKS.md`.

**Após a execução:**
- Revise o código gerado.
- Se tudo estiver OK, passe para a próxima task: `/execute-task task-002`

---

## 📋 Exemplo Prático Completo

Vamos criar uma API simples de Tarefas (To-Do List) com autenticação.

### Passo 1: Design
```
/generate-design "Criar uma API de To-Do List com autenticação JWT. Usuários podem criar, listar, atualizar e deletar suas tarefas. Stack: Laravel 11, PostgreSQL, Vue 3."
```

**Resultado esperado em `DARE/DESIGN.md`:**
```markdown
# PROJETO: To-Do List API

## DESCRIÇÃO
API RESTful para gerenciar tarefas com autenticação JWT.

## FUNCIONALIDADES
- Criar conta de usuário
- Login com JWT
- CRUD de tarefas
- Listar tarefas com filtros

## STACK TÉCNICA
- Laravel 11
- PostgreSQL
- Vue 3

## FORA DO ESCOPO
- Compartilhamento de tarefas entre usuários
- Notificações por email
```

### Passo 2: Revisar e Aprovar Design
Leia o `DARE/DESIGN.md`. Se estiver OK, passe para o próximo passo.

### Passo 3: Blueprint
```
/generate-blueprint DARE/DESIGN.md
```

**Resultado esperado em `DARE/BLUEPRINT.md`:**
```markdown
# BLUEPRINT DE IMPLEMENTAÇÃO: To-Do List API

## 1. VISÃO GERAL DA ARQUITETURA
Monolito modular Laravel com camadas de Controller, Service, Model.

## 3. MODELO DE DADOS
- Tabela `users` (id, name, email, password)
- Tabela `tasks` (id, user_id, title, description, completed, created_at)

## 5. ENDPOINTS DA API
| POST | /api/auth/register | AuthController@register | Criar usuário |
| POST | /api/auth/login | AuthController@login | Login |
| GET | /api/tasks | TaskController@index | Listar tarefas |
| POST | /api/tasks | TaskController@store | Criar tarefa |
...

## 7. PLANO DE EXECUÇÃO
- Fase 1: Setup do projeto e Banco de Dados
- Fase 2: Autenticação (Register/Login)
- Fase 3: CRUD de Tarefas
- Fase 4: Testes e Documentação
```

### Passo 4: Revisar e Aprovar Blueprint
Leia o `DARE/BLUEPRINT.md`. Verifique a arquitetura, endpoints e modelo de dados. Se estiver OK, passe para o próximo passo.

### Passo 5: Gerar Tasks
```
/generate-tasks DARE/BLUEPRINT.md
```

**Resultado esperado:**
- `DARE/TASKS.md` (visão geral)
- `DARE/EXECUTION/task-001.md` (Migration de Users)
- `DARE/EXECUTION/task-002.md` (Model User)
- `DARE/EXECUTION/task-003.md` (AuthController Register)
- `DARE/EXECUTION/task-004.md` (AuthController Login)
- `DARE/EXECUTION/task-005.md` (Migration de Tasks)
- `DARE/EXECUTION/task-006.md` (Model Task)
- `DARE/EXECUTION/task-007.md` (TaskController CRUD)
- `DARE/EXECUTION/task-008.md` (Testes)

### Passo 6: Executar as Tasks em Sequência
```
/execute-task task-001
```

A IA implementa a migration de usuários, roda os testes e marca como concluída.

```
/execute-task task-002
```

E assim por diante até completar todas as tasks.

---

## 🔄 O Ralph Loop (Validação Automática)

Quando você executa `/execute-task`, a IA:

1. **Implementa** o código conforme a especificação.
2. **Executa** os Validation Gates (testes, linting).
3. **Se falhar:** Lê o erro, corrige o código e repete o passo 2.
4. **Se passar:** Marca como concluído e retorna a mensagem de sucesso.

Isso garante que o código entregue sempre está funcionando.

---

## 🛠️ Customização por Stack

O sistema suporta múltiplas stacks. Para cada uma, você deve:

1. **Editar `.cursorrules`** para refletir a stack.
2. **Adicionar exemplos** na pasta `examples/` (Controllers, Models, Componentes, etc).
3. **Criar skills** em `.cursor/rules/skill-[stack].mdc` com padrões específicos.

### Exemplo: Trocar para Python FastAPI
```
# .cursorrules
Stack: Python FastAPI + PostgreSQL + React

# examples/
- python-user-service.py
- python-user-schema.py
- react-user-form.jsx
```

---

## ⚠️ Pontos Importantes

1. **Revisão Humana é Obrigatória:** Entre cada comando, você DEVE revisar o documento gerado. Não pule esta etapa.
2. **Ralph Loop:** A IA corrige erros automaticamente durante a execução. Você não precisa fazer isso manualmente.
3. **Contexto é Tudo:** Quanto melhor os exemplos na pasta `examples/`, melhor a IA gerará o código.
4. **Iteração:** Se precisar adicionar funcionalidades, volte ao Design e repita o fluxo.

---

## 📚 Referências

- [Método DARE (DewTech)](https://www.youtube.com/@dewtech)
- [Context Engineering (Cole Medin)](https://github.com/coleam00/context-engineering-intro)
- [PRP Agentic Engineering (Wirasm)](https://github.com/Wirasm/PRPs-agentic-eng)
- [Cursor IDE Docs](https://cursor.com/docs)
