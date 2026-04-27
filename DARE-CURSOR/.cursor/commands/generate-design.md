# Comando: /generate-design

## Descrição
Este comando inicia o Método DARE (Design) gerando um documento de requisitos a partir de uma ideia inicial.

## Instruções para o Cursor Composer

1. **Leia a Ideia Inicial:** Analise o prompt fornecido pelo usuário (`$ARGUMENTS`) que descreve o que ele deseja construir.
2. **Leia o Template:** Utilize a estrutura definida em `templates/DESIGN-template.md`.
3. **Analise o Contexto Global:** Leia o arquivo `.cursorrules` (ou equivalente na pasta `.cursor/rules/`) para entender a stack técnica do projeto e preencher automaticamente a seção de STACK TÉCNICA.
4. **Gere o Documento:**
   - Preencha o template com as informações extraídas do prompt.
   - Organize as funcionalidades de forma clara.
   - Identifique possíveis requisitos técnicos implícitos e restrições.
   - **Integre Requisitos de Segurança (OWASP):** Adicione obrigatoriamente requisitos de segurança na seção correspondente (ex: Rate Limiting, HTTPS, Proteção contra Força Bruta) baseando-se na skill `skill-security.mdc`.
   - Defina claramente o que fica FORA DO ESCOPO para manter o foco da versão.
5. **Salve o Arquivo:** Crie o arquivo `DARE/DESIGN.md` com o conteúdo gerado.
6. **Mensagem Final:** Informe ao usuário: "Documento DESIGN.md gerado com sucesso. Por favor, revise e aprove o documento. Quando estiver pronto, execute `/generate-blueprint DARE/DESIGN.md`."
