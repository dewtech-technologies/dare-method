# Comando: /generate-blueprint

## Descrição
Este comando avança o Método DARE para a fase Architect, lendo o Design aprovado e gerando a arquitetura completa de implementação.

## Instruções para o Cursor Composer

1. **Leia o Documento Design:** Acesse e leia o arquivo `$ARGUMENTS` (geralmente `DARE/DESIGN.md`) que contém os requisitos do projeto.
2. **Leia o Template:** Utilize a estrutura definida em `templates/BLUEPRINT-template.md`.
3. **Analise o Contexto Global:** Leia o arquivo `.cursorrules` (ou equivalente) para entender as regras, convenções de nomenclatura e padrões de arquitetura exigidos pela stack do projeto.
4. **Analise Exemplos:** Se houver arquivos na pasta `examples/`, analise-os para extrair os padrões de código esperados e incluí-los na seção "CÓDIGO-BASE / PADRÕES A SEGUIR".
5. **Gere a Arquitetura (O Blueprint):**
   - **Visão Geral:** Defina a arquitetura apropriada para o projeto (Monolito, Microserviços, Hexagonal, MVC).
   - **Segurança (OWASP):** Adicione uma subseção explicando como as diretrizes da `skill-security.mdc` serão implementadas (ex: Bcrypt para senhas, Middlewares de Rate Limit, Validação estrita).
   - **Modelo de Dados:** Projete o esquema completo do banco de dados (tabelas, campos, tipos, relacionamentos) e apresente em formato Markdown ou SQL simplificado. Certifique-se de que dados sensíveis estão protegidos.
   - **Endpoints:** Liste todas as rotas da API necessárias com Request e Response esperados em uma tabela Markdown, incluindo as necessidades de Autenticação/Autorização.
   - **Estrutura:** Esboce a árvore de diretórios dos arquivos que serão criados.
   - **Plano de Execução:** Divida o projeto em Fases lógicas e sequenciais. A Fase 2 geralmente deve incluir o Setup de Segurança (Auth, Middlewares).
   - **Comandos:** Liste comandos de setup (ex: migrations, composer install).
6. **Salve o Arquivo:** Crie o arquivo `DARE/BLUEPRINT.md` com o conteúdo gerado.
7. **Mensagem Final:** Informe ao usuário: "Documento BLUEPRINT.md gerado com sucesso. Por favor, revise a arquitetura e os endpoints. Quando estiver aprovado, execute `/generate-tasks DARE/BLUEPRINT.md`."
