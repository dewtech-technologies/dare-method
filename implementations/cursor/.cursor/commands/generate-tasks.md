# Comando: /generate-tasks

## Descrição
Este comando avança o Método DARE lendo o Blueprint aprovado e gerando as tarefas atômicas isoladas para execução.

## Instruções para o Cursor Composer

1. **Leia o Documento Blueprint:** Acesse e leia o arquivo `$ARGUMENTS` (geralmente `DARE/BLUEPRINT.md`) que contém a arquitetura completa.
2. **Leia os Templates:** Utilize a estrutura definida em `templates/TASKS-template.md` e `templates/TASK-SPEC-template.md`.
3. **Analise o Contexto Global:** Leia o arquivo `.cursorrules` (ou equivalente) para garantir que as instruções de código sigam as convenções do projeto.
4. **Desdobre as Fases em Tarefas Atômicas:**
   - Para cada Fase definida no Blueprint, crie tarefas granulares e executáveis.
   - Uma tarefa deve ser pequena o suficiente para ser concluída em um único prompt do Composer.
   - **Tarefas de Segurança:** Garanta que requisitos de segurança (ex: Middlewares, Validação de FormRequests, Criptografia) tenham tarefas específicas ou estejam explicitamente incluídos nas tarefas relevantes.
   - Exemplo: "Fase 2: Autenticação" vira "Task 003: Migration de Users", "Task 004: AuthController (com Rate Limit e Bcrypt)", etc.
5. **Gere os Arquivos de Tarefas:**
   - **TASKS.md:** Crie o arquivo `DARE/TASKS.md` com a visão geral de todas as tarefas e suas dependências.
   - **Especificações Isoladas:** Para CADA tarefa criada, crie um arquivo em `DARE/EXECUTION/task-[id].md` seguindo o template `TASK-SPEC-template.md`.
   - Preencha as instruções de implementação detalhadas para cada arquivo de task isolada, incluindo os Validation Gates apropriados para a stack (ex: PHPUnit para Laravel, Pytest para Python).
6. **Mensagem Final:** Informe ao usuário: "Documento TASKS.md e especificações isoladas geradas em DARE/EXECUTION/ com sucesso. Revise as tarefas. Para iniciar a implementação, execute `/execute-task task-001`."
