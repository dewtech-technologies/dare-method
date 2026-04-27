# Configuração do Cursor para Carregar Regras e Comandos DARE

Este guia mostra como configurar o Cursor IDE para carregar automaticamente todas as regras globais, skills e comandos quando você abre a pasta do seu projeto.

## 📋 Estrutura de Arquivos Necessária

O Cursor procura por configurações em locais específicos. Aqui está a estrutura que você precisa ter:

```
seu-projeto/
├── .cursorrules                          # ← Arquivo global (carregado automaticamente)
├── .cursor/
│   ├── commands/
│   │   ├── generate-design.md
│   │   ├── generate-blueprint.md
│   │   ├── generate-tasks.md
│   │   └── execute-task.md
│   ├── rules/
│   │   ├── skill-laravel-api.mdc
│   │   ├── skill-docker.mdc
│   │   ├── skill-python-api.mdc
│   │   ├── skill-go-api.mdc
│   │   └── skill-vue-frontend.mdc
│   └── settings.local.json               # ← Configurações locais (opcional)
├── DARE/
├── templates/
├── examples/
└── [resto do projeto]
```

## 🔧 Passo 1: Copiar a Pasta `.cursor` para Seu Projeto

1. Acesse a pasta `DARE-SYSTEM` que foi criada em `C:\projetos-dewtech\fermio-plataform\produtividade-assistida-ia\DARE-SYSTEM\`.
2. Copie a pasta `.cursor` inteira para a raiz do seu projeto (ex: `C:\projetos-dewtech\fermio-plataform\seu-projeto\.cursor`).

## 🔧 Passo 2: Copiar o Arquivo `.cursorrules`

1. Copie o arquivo `.cursorrules` da pasta `DARE-SYSTEM` para a raiz do seu projeto.
2. O Cursor carregará este arquivo automaticamente em cada conversa.

## 🔧 Passo 3: Verificar se o Cursor Reconhece as Regras

1. Abra o Cursor IDE.
2. Abra a pasta do seu projeto (File → Open Folder).
3. Abra o Composer (Ctrl/Cmd + I).
4. Na caixa de chat, você deve ver uma indicação de que o `.cursorrules` foi carregado (geralmente um ícone de "regras" ou uma mensagem no início da conversa).

## 🎯 Como os Comandos Funcionam

Os comandos definidos em `.cursor/commands/` funcionam como **Slash Commands** no Cursor Composer. Quando você digita `/` no Composer, o Cursor mostra uma lista de comandos disponíveis.

### Registrando Comandos Customizados

O Cursor reconhece automaticamente arquivos em `.cursor/commands/` como comandos customizados. Cada arquivo `.md` nessa pasta se torna um comando disponível.

**Exemplo:**
- Arquivo: `.cursor/commands/generate-design.md`
- Comando no Cursor: `/generate-design`

### Usando os Comandos

1. Abra o Composer (Ctrl/Cmd + I).
2. Digite `/` para ver a lista de comandos disponíveis.
3. Selecione o comando desejado (ex: `/generate-design`).
4. Digite os argumentos (ex: `/generate-design "Criar API de usuários"`).
5. Pressione Enter para executar.

## 📝 Estrutura de um Comando Customizado

Cada arquivo de comando em `.cursor/commands/` deve seguir este formato:

```markdown
# Comando: /[nome-do-comando]

## Descrição
[O que o comando faz]

## Instruções para o Cursor Composer
[Instruções detalhadas de como executar o comando]
```

**Exemplo (generate-design.md):**
```markdown
# Comando: /generate-design

## Descrição
Transforma uma ideia inicial em um documento de Design estruturado.

## Instruções para o Cursor Composer
1. Leia a ideia inicial do usuário ($ARGUMENTS).
2. Estruture em DESIGN.md seguindo o template.
3. Salve o arquivo em DARE/DESIGN.md.
```

## 🎨 Customizando as Regras Globais

O arquivo `.cursorrules` contém as regras globais que o Cursor segue em TODAS as conversas. Para customizar:

1. Abra o arquivo `.cursorrules` na raiz do seu projeto.
2. Edite as seções relevantes (Stack Tecnológico, Convenções, Padrões, etc).
3. Salve o arquivo.
4. Feche e reabra o Cursor para que as mudanças sejam carregadas.

### Exemplo: Trocar de Laravel para Python

Se você estiver usando Python em vez de Laravel, edite o `.cursorrules`:

```markdown
# Antes
## Stack Tecnológico Principal
- Linguagem: PHP 8.3
- Framework: Laravel 11.x

# Depois
## Stack Tecnológico Principal
- Linguagem: Python 3.11
- Framework: FastAPI
```

## 📚 Carregando Skills Específicas

As skills (arquivos em `.cursor/rules/`) são carregadas automaticamente pelo Cursor quando você abre a pasta do projeto. Cada arquivo `.mdc` (Markdown Cursor) define regras específicas para um contexto.

### Adicionar uma Nova Skill

1. Crie um novo arquivo em `.cursor/rules/skill-[nome].mdc`.
2. Defina as regras e convenções nele.
3. O Cursor carregará automaticamente na próxima conversa.

**Exemplo: Adicionar Skill de Testes**
```
.cursor/rules/skill-testing.mdc
```

```markdown
---
description: Padrões para Testes Unitários e de Integração
globs: *.test.php, *.test.ts, *_test.go, test_*.py
---
# Regras Globais do Projeto (Testes)

Você é um especialista em testes automatizados...
```

## 🔄 Fluxo Completo de Configuração

1. **Copiar arquivos:**
   ```bash
   # Copiar .cursor para seu projeto
   cp -r DARE-SYSTEM/.cursor seu-projeto/
   
   # Copiar .cursorrules para seu projeto
   cp DARE-SYSTEM/.cursorrules seu-projeto/
   ```

2. **Verificar estrutura:**
   ```bash
   seu-projeto/
   ├── .cursorrules
   ├── .cursor/
   │   ├── commands/
   │   ├── rules/
   │   └── settings.local.json
   ```

3. **Abrir no Cursor:**
   - File → Open Folder → Selecione `seu-projeto`
   - O Cursor carregará automaticamente `.cursorrules` e as skills

4. **Testar os comandos:**
   - Abra o Composer (Ctrl/Cmd + I)
   - Digite `/` para ver os comandos disponíveis
   - Execute `/generate-design "Teste"`

## ⚙️ Arquivo `.cursor/settings.local.json` (Opcional)

Este arquivo permite configurações adicionais específicas do Cursor. Exemplo:

```json
{
  "models": {
    "default": "claude-opus-4-1",
    "thinking": "claude-opus-4-1"
  },
  "features": {
    "agentic": true,
    "composer": true
  }
}
```

## 🚀 Dicas e Boas Práticas

1. **Versione seus arquivos:** Adicione `.cursorrules` e `.cursor/` ao seu repositório Git para que toda a equipe use as mesmas regras.

2. **Mantenha as regras atualizadas:** Conforme o projeto evolui, atualize o `.cursorrules` e as skills.

3. **Use exemplos:** Adicione arquivos na pasta `examples/` para que a IA tenha referências de padrões de código.

4. **Documente customizações:** Se você criar skills customizadas, adicione comentários explicando o propósito.

5. **Teste os comandos:** Após configurar, teste cada comando para garantir que funcionam corretamente.

## 🔍 Troubleshooting

### Problema: O Cursor não reconhece os comandos

**Solução:**
1. Verifique se a pasta `.cursor/commands/` existe e contém os arquivos `.md`.
2. Feche e reabra o Cursor.
3. Verifique se os nomes dos arquivos correspondem aos comandos (ex: `generate-design.md` → `/generate-design`).

### Problema: As regras do `.cursorrules` não estão sendo aplicadas

**Solução:**
1. Verifique se o arquivo `.cursorrules` está na raiz do projeto.
2. Abra o arquivo e confirme que está em formato Markdown válido.
3. Feche e reabra o Cursor.
4. No Composer, verifique se há uma indicação de que as regras foram carregadas.

### Problema: As skills em `.cursor/rules/` não estão sendo usadas

**Solução:**
1. Verifique se os arquivos têm a extensão `.mdc` (não `.md`).
2. Confirme que o cabeçalho YAML está correto (entre `---`).
3. Feche e reabra o Cursor.

## 📖 Referências

- [Documentação Oficial do Cursor - Rules](https://cursor.com/docs/context/rules)
- [Documentação Oficial do Cursor - Commands](https://cursor.com/docs/context/commands)
- [Método DARE (DewTech)](https://www.youtube.com/@dewtech)
- [Context Engineering (Cole Medin)](https://github.com/coleam00/context-engineering-intro)
