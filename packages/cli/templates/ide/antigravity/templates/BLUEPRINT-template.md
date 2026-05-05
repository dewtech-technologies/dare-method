# BLUEPRINT DE IMPLEMENTAÇÃO: [Nome do Projeto]

## 1. VISÃO GERAL DA ARQUITETURA
[Descrição da arquitetura do sistema: Monolito modular, Microserviços, Hexagonal, etc.]
[Diagrama em formato Mermaid se aplicável]

## 2. STACK TÉCNICA DEFINIDA
- **Linguagem:** [ex: PHP 8.3]
- **Framework:** [ex: Laravel 11.x]
- **Banco de Dados:** [ex: PostgreSQL 16.x]
- **Pacotes Essenciais:** [Lista de dependências do composer/npm]

## 3. MODELO DE DADOS
[Entidades principais, relacionamentos e tipos de dados]
[Exemplo de Migration Laravel ou Model Pydantic/Go Struct]

## 4. ESTRUTURA DE PASTAS E ARQUIVOS
[Árvore de diretórios completa focando nos arquivos que serão criados/modificados]
```text
app/
├── Http/
│   ├── Controllers/
│   └── Requests/
├── Models/
├── Services/
└── ...
```

## 5. ENDPOINTS DA API
| Método | Endpoint | Controller@Method | Descrição | Request Body | Response | Auth |
|---|---|---|---|---|---|---|
| POST | /api/v1/users | UserController@store | Cria usuário | {name, email, pass} | {id, token} | Não |
| GET | /api/v1/users | UserController@index | Lista usuários | - | [{id, name}] | Sim |

## 6. CÓDIGO-BASE / PADRÕES A SEGUIR
[Trechos de código críticos que definem o padrão do projeto]
[Exemplo: Interface de repositório, FormRequest base, Trait de respostas de API]

## 7. PLANO DE EXECUÇÃO (FASES)
- **Fase 1:** Setup do projeto e Banco de Dados (Migrations/Seeds)
- **Fase 2:** Autenticação e Autorização (Middlewares/Policies)
- **Fase 3:** [Módulo Principal 1]
- **Fase 4:** [Módulo Principal 2]
- **Fase N:** Testes e Documentação

## 8. COMANDOS DE SETUP
[Todos os comandos para rodar o projeto do zero, ex: docker-compose up, php artisan migrate, etc]

## 9. CRITÉRIOS DE SUCESSO GERAIS
- [ ] O código passa em todos os testes (`php artisan test`)
- [ ] Não há erros de linting (`./vendor/bin/pint`)
- [ ] A API responde conforme os endpoints definidos
- [ ] A documentação Swagger/OpenAPI está atualizada
