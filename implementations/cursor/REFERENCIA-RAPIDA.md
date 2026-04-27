# Referência Rápida - Sistema DARE

## 🎯 Os 6 Comandos Principais

| Comando | O que faz | Entrada | Saída |
|---------|-----------|---------|-------|
| `/generate-design` | Cria o documento de requisitos | Descrição da feature | `DARE/DESIGN.md` |
| `/generate-blueprint` | Cria a arquitetura e plano | `DARE/DESIGN.md` | `DARE/BLUEPRINT.md` |
| `/generate-tasks` | Quebra em tarefas atômicas | `DARE/BLUEPRINT.md` | `DARE/TASKS.md` + `DARE/EXECUTION/task-*.md` |
| `/execute-task` | Implementa uma tarefa | `task-001` | Código + Testes ✓ |
| `/generate-dockerfile` | Cria Dockerfile otimizado | Stack do projeto | `Dockerfile` + `.dockerignore` |
| `/generate-docker-compose` | Cria orquestração de serviços | `DARE/BLUEPRINT.md` | `docker-compose.yml` |

## 📂 Estrutura de Arquivos

```
seu-projeto/
├── .cursorrules                    ← Regras globais (carregado automaticamente)
├── .cursor/
│   ├── commands/                   ← Os 6 comandos DARE
│   ├── rules/                      ← Skills por stack (Laravel, Python, Go, Docker, etc)
│   └── settings.local.json         ← Configurações do Cursor
├── DARE/
│   ├── DESIGN.md                   ← Requisitos aprovados
│   ├── BLUEPRINT.md                ← Arquitetura aprovada
│   ├── TASKS.md                    ← Visão geral das tarefas
│   └── EXECUTION/
│       ├── task-001.md             ← Especificação isolada
│       ├── task-002.md
│       └── ...
├── templates/                      ← Templates para documentos
├── examples/                       ← Exemplos de código-base
├── Dockerfile                      ← Gerado por /generate-dockerfile
└── docker-compose.yml              ← Gerado por /generate-docker-compose
```

## 🔄 Fluxo Completo de Desenvolvimento

```
1. /generate-design "Sua ideia"
   ↓ (Você revisa e aprova)
2. /generate-blueprint DARE/DESIGN.md
   ↓ (Você revisa e aprova)
3. /generate-tasks DARE/BLUEPRINT.md
   ↓ (Você revisa e aprova)
4. /execute-task task-001
   ↓ (IA implementa + testes)
5. /execute-task task-002
   ↓ (IA implementa + testes)
6. ... (Repita para todas as tasks)
```

## 🛠️ Fluxo com Docker (Opcional)

```
Após /generate-blueprint:

1. /generate-dockerfile
   ↓ (Você revisa)
2. /generate-docker-compose
   ↓ (Você revisa)
3. docker-compose up -d
```

## 📝 Checklist de Revisão

### Antes de Aprovar DESIGN.md
- [ ] Funcionalidades descrevem exatamente o que você quer?
- [ ] Stack técnica está correta?
- [ ] Escopo está bem definido (o que entra e o que não entra)?

### Antes de Aprovar BLUEPRINT.md
- [ ] Arquitetura faz sentido para o tamanho do projeto?
- [ ] Modelo de dados está normalizado?
- [ ] Endpoints cobrem todos os casos de uso?
- [ ] Ordem de implementação respeita dependências?
- [ ] Blueprint está claro para outra IA executar?

### Antes de Aprovar TASKS.md
- [ ] Cada task é atômica e pequena?
- [ ] Critérios de sucesso são mensuráveis?
- [ ] Dependências entre tasks estão claras?
- [ ] Há exemplos de código para cada padrão?

## 🚀 Primeiros 5 Minutos

1. **Setup:** Execute `setup-projeto.bat` (Windows) ou `setup-projeto.sh` (Mac/Linux)
2. **Abra no Cursor:** File → Open Folder → Seu projeto
3. **Teste:** Abra Composer (Ctrl+I) e digite `/generate-design "Teste"`
4. **Revise:** Leia o `DARE/DESIGN.md` gerado
5. **Próximo:** `/generate-blueprint DARE/DESIGN.md`

## 💡 Dicas Importantes

- **Ralph Loop:** A IA executa testes automaticamente e corrige erros até passar.
- **Revisão Humana:** Você SEMPRE revisa antes de avançar para o próximo passo.
- **Contexto:** Quanto melhor os exemplos na pasta `examples/`, melhor a IA gera código.
- **Iteração:** Se precisar adicionar funcionalidades, volte ao Design e repita.

## 🔗 Arquivos de Referência

| Arquivo | Propósito |
|---------|-----------|
| `CONFIGURACAO-CURSOR.md` | Guia detalhado de setup |
| `GUIA-DE-USO.md` | Exemplo prático completo |
| `SETUP-RAPIDO.md` | Setup em 5 minutos |
| `.cursorrules` | Regras globais do projeto |
| `.cursor/rules/skill-*.mdc` | Skills por stack |
| `.cursor/commands/*.md` | Definição dos comandos |
| `templates/*.md` | Templates para documentos |
| `examples/` | Exemplos de código-base |

## 🎓 Stack Suportadas

- **Backend:** Laravel/PHP, Python (FastAPI/Flask), Go
- **Frontend:** Vue.js 3, React (em desenvolvimento)
- **Banco de Dados:** PostgreSQL, MySQL, SQLite
- **Cache:** Redis
- **Containerização:** Docker, Docker Compose

## 📞 Suporte

Se algo não funcionar:
1. Leia `CONFIGURACAO-CURSOR.md` (seção Troubleshooting)
2. Verifique se os arquivos estão no lugar certo
3. Feche e reabra o Cursor
4. Teste novamente

---

**Última atualização:** Abril 2026
**Versão:** 1.0 DARE System
