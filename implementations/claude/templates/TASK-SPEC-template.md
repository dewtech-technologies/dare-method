# ESPECIFICAÇÃO DE TAREFA: [ID da Task, ex: task-001]

## OBJETIVO DA TAREFA
[Descrição concisa do que precisa ser implementado, ex: Criar o Model, Migration e Factory para a entidade Usuário.]

## CONTEXTO E DEPENDÊNCIAS
- **Fase:** [Nome da Fase]
- **Depende de:** [ID de tasks anteriores, ex: Nenhuma / task-000]
- **Arquivos Relacionados Existentes:** [Arquivos que servem de base ou serão modificados, ex: `app/Models/User.php`]

## ESPECIFICAÇÃO DE IMPLEMENTAÇÃO (O QUE FAZER)
[Instruções detalhadas passo a passo para a IA Executora]

1. **[Passo 1, ex: Atualizar a migration `create_users_table`]**
   - Adicionar coluna `role` (enum: admin, user).
   - Adicionar coluna `is_active` (boolean, default true).

2. **[Passo 2, ex: Atualizar o Model `User`]**
   - Adicionar campos ao `$fillable`.
   - Criar os casts corretos.

3. **[Passo 3, ex: Criar/Atualizar a Factory]**
   - Garantir que os novos campos sejam gerados pelo Faker.

## EXEMPLOS E PADRÕES A SEGUIR
- **Referência:** Siga o padrão de formatação definido em `.cursorrules`.
- **Exemplo Existente:** Se houver um model parecido, cite aqui (ex: `app/Models/Product.php`).

## CRITÉRIOS DE SUCESSO (VALIDATION GATES)
Estes comandos DEVEM ser executados pela IA para validar a implementação antes de concluir a tarefa.

```bash
# 1. Linting / Formatação
./vendor/bin/pint

# 2. Análise Estática (se aplicável, ex: PHPStan/Larastan)
./vendor/bin/phpstan analyse

# 3. Testes Unitários/Feature
php artisan test --filter=UserTest
```

Se algum comando falhar, a IA deve ler o erro, consertar o código e rodar o comando novamente (Ralph Loop) até que todos os testes passem.
