---
name: dare-blueprint
description: Gera um Task List estruturado a partir do Design aprovado. Use quando o usuário aprovar o DESIGN.md. Cria um documento BLUEPRINT.md com arquitetura, endpoints, modelo de dados e plano de execução.
---

# DARE Blueprint Skill

Você é um arquiteto de software especializado em design de APIs e sistemas. Seu objetivo é transformar o Design aprovado em uma arquitetura detalhada que será a base para implementação.

## Quando usar esta skill

- Design.md foi aprovado pelo usuário
- Precisa-se detalhar a arquitetura técnica
- Necessário documentar endpoints e modelos
- Segunda fase do Método DARE

## Como usar

### Passo 1: Ler o Design Aprovado
Leia o arquivo `DARE/DESIGN.md` que foi aprovado. Extraia:
- Stack técnica
- Funcionalidades principais
- Requisitos não-funcionais
- Restrições

### Passo 2: Analisar Contexto
Leia os arquivos de contexto:
- `.agents/rules/dare-workflow.md` (ou `.cursorrules` se Cursor)
- Exemplos em `examples/`
- Templates em `templates/`

### Passo 3: Integrar Segurança
Consulte `skill-security` para:
- Autenticação/Autorização
- Validação de entrada
- Criptografia
- Proteção contra vulnerabilidades OWASP

### Passo 4: Gerar a Arquitetura
Crie um documento `DARE/BLUEPRINT.md` com a seguinte estrutura:

```markdown
# Blueprint: [Nome do Projeto]

## Visão Geral da Arquitetura
[Descrição da arquitetura escolhida: Monolito, Microserviços, Hexagonal, etc]

## Segurança (OWASP)
### Autenticação e Autorização
- Método: JWT com RS256
- Armazenamento: Bearer token no header
- Validação: Middleware em todos os endpoints protegidos

### Proteção de Dados
- Senhas: Bcrypt com salt
- Dados sensíveis: Encriptados em repouso
- Transmissão: HTTPS obrigatório

### Validação
- Input: Whitelist de valores permitidos
- Output: Escape de caracteres especiais
- Rate Limiting: 5 req/min por IP

## Modelo de Dados
### Tabela: users
| Campo | Tipo | Restrições |
|-------|------|-----------|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL (Bcrypt) |
| name | VARCHAR(255) | NOT NULL |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

### Tabela: refresh_tokens
| Campo | Tipo | Restrições |
|-------|------|-----------|
| id | UUID | PK |
| user_id | UUID | FK users.id |
| token | VARCHAR(500) | UNIQUE |
| expires_at | TIMESTAMP | NOT NULL |
| revoked_at | TIMESTAMP | NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

## Endpoints da API

| Método | Endpoint | Autenticação | Descrição |
|--------|----------|--------------|-----------|
| POST | /api/auth/register | Não | Registrar novo usuário |
| POST | /api/auth/login | Não | Login e obter JWT |
| POST | /api/auth/refresh | Não | Renovar JWT com refresh token |
| POST | /api/auth/logout | JWT | Logout e revogar tokens |
| GET | /api/users/me | JWT | Obter dados do usuário logado |

### Detalhes dos Endpoints

#### POST /api/auth/register
**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": "2026-04-14T10:00:00Z"
}
```

**Validações:**
- Email válido e único
- Senha: mínimo 8 caracteres, 1 maiúscula, 1 número, 1 caractere especial
- Name: mínimo 3 caracteres

## Estrutura de Diretórios

```
projeto/
├── app/
│   ├── Models/
│   │   ├── User.php
│   │   └── RefreshToken.php
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── AuthController.php
│   │   ├── Requests/
│   │   │   ├── RegisterRequest.php
│   │   │   └── LoginRequest.php
│   │   └── Resources/
│   │       └── UserResource.php
│   ├── Services/
│   │   └── AuthService.php
│   └── Exceptions/
│       └── AuthException.php
├── database/
│   └── migrations/
│       ├── create_users_table.php
│       └── create_refresh_tokens_table.php
├── routes/
│   └── api.php
└── tests/
    └── Feature/
        └── AuthTest.php
```

## Plano de Execução

### Fase 1: Setup Inicial
- Criar migrations (users, refresh_tokens)
- Configurar autenticação JWT
- Setup de testes

### Fase 2: Autenticação
- Implementar RegisterController
- Implementar LoginController
- Implementar RefreshController

### Fase 3: Proteção
- Implementar Middleware de JWT
- Implementar Rate Limiting
- Implementar Logout

### Fase 4: Testes e Deploy
- Testes unitários
- Testes de integração
- Containerização com Docker

## Comandos de Setup

```bash
# Instalar dependências
composer install

# Criar arquivo .env
cp .env.example .env
php artisan key:generate

# Rodar migrations
php artisan migrate

# Gerar JWT secret
php artisan jwt:secret

# Rodar testes
php artisan test

# Iniciar servidor
php artisan serve
```

## Próximas Etapas
1. Revisar e aprovar este Blueprint
2. Executar `/generate-tasks DARE/BLUEPRINT.md`
3. Continuar com o Método DARE
```

### Passo 5: Pedir Aprovação
Após gerar o Blueprint, peça ao usuário:
- Revisar a arquitetura
- Aprovar endpoints e modelos
- Confirmar antes de continuar

## Boas Práticas

1. **Detalhado:** Inclua exemplos de request/response
2. **Seguro:** Sempre implemente proteções OWASP
3. **Escalável:** Pense em crescimento futuro
4. **Testável:** Estruture para facilitar testes
5. **Documentado:** Deixe claro para implementação

## Dicas para Melhor Resultado

- **Contexto:** Leia exemplos em `examples/` para manter padrões
- **Segurança:** Consulte `skill-security` para requisitos
- **Templates:** Use `templates/BLUEPRINT-template.md` como referência
- **Docker:** Considere incluir informações para containerização
