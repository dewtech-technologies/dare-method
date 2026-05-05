# /dare-execute

Executa uma task específica do `DARE/dare-dag.yaml` seguindo o Ralph Loop.

## Como usar

```
/dare-execute task-001
/dare-execute task-003 --force
```

## O que fazer

1. **Leia `DARE/BLUEPRINT.md`** — obrigatório antes de qualquer implementação

2. **Leia a task especificada** em `DARE/dare-dag.yaml`:
   - Extraia `subtask_prompt`
   - Verifique `complexity` (LOW/MED/HIGH)
   - Liste `depends_on`

3. **Verifique dependências:**
   - Todas as tasks em `depends_on` devem ter status `DONE` em `DARE/TASKS.md`
   - Se alguma estiver `PENDING`, alerte o usuário (a menos que `--force`)
   - Se alguma estiver `FAILED`, recuse executar

4. **Implemente a task** seguindo o `subtask_prompt`:
   - Siga padrões do `CLAUDE.md`
   - Crie/modifique arquivos conforme spec
   - Adicione testes
   - Implemente validações de segurança

5. **Execute o Ralph Loop:**
   - **Build:** compile sem erros
   - **Test:** todos os testes passando (incluindo os novos)
   - **Lint:** sem warnings

6. **Atualize `DARE/TASKS.md`:**
   - Mude status para `DONE`
   - Adicione duração e tokens consumidos se possível

7. **Crie artifact em `DARE/EXECUTION/task-<id>.md`:**
   ```markdown
   # Task <id>: <título>
   
   ## Status: ✅ DONE
   ## Duração: <ms>
   
   ## Arquivos criados/modificados
   - path/to/file1.ts
   - path/to/file2.test.ts
   
   ## Testes
   - ✅ test_should_x
   - ✅ test_should_y
   
   ## Ralph Loop
   - ✅ Build
   - ✅ Test
   - ✅ Lint
   ```

8. **Sugira a próxima task** disponível (com dependências satisfeitas)

## Modo Paralelo

Para executar múltiplas tasks em paralelo, use o CLI direto:
```bash
dare execute --parallel --runner claude
```

Isto executa tasks por rank topológico, respeitando `depends_on`.

$ARGUMENTS
