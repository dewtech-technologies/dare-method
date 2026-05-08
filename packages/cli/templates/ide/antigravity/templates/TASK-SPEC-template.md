# TASK [ID]: [Título da Task]

> **Complexidade:** LOW / MED / HIGH  
> **Depends on:** [task-ids ou —]  
> **Estimativa:** [X horas]

---

## 1. OBJETIVO

[Uma frase precisa do que esta task entrega. Deve ser verificável — termine com um estado observável, não uma ação.]

Exemplo: _"Ao final desta task, o endpoint `POST /api/v1/users` aceita cadastro, valida unicidade de e-mail e retorna JWT."_

---

## 2. CONTEXTO

- **Fase no BLUEPRINT:** Fase [N] — [Nome da fase]
- **Arquivos existentes relevantes:** [caminhos de arquivos que servem de referência ou serão modificados]
- **Decisões do BLUEPRINT que afetam esta task:** [cite seção/decisão específica]

---

## 3. ARQUIVOS A CRIAR / MODIFICAR

| Ação | Caminho | Descrição |
|------|---------|-----------|
| CRIAR | `src/[módulo]/[arquivo]` | [o que contém] |
| MODIFICAR | `src/[módulo]/[arquivo]` | [o que muda] |
| CRIAR | `tests/[arquivo].test.[ext]` | Testes da feature |

---

## 4. IMPLEMENTAÇÃO

### Passo 1: [Nome do passo]
[Descrição precisa do que fazer. Inclua assinaturas de função/struct se crítico.]

```[lang]
// Exemplo de padrão esperado
```

### Passo 2: [Nome do passo]
[Descrição]

### Passo 3: Testes
- [ ] Teste do caminho feliz (`should_[comportamento]_when_[condição]`)
- [ ] Teste de erro de validação (400 / erro de negócio)
- [ ] Teste de autorização (401 / 403 quando aplicável)
- [ ] Teste de edge case: [descrever]

---

## 5. CONSIDERAÇÕES DE SEGURANÇA

- [ ] **Input validation:** toda entrada do usuário validada no servidor antes de qualquer processamento
- [ ] **Autenticação / Autorização:** verificar se o usuário tem permissão sobre o *recurso específico*, não só sobre a rota
- [ ] **Dados sensíveis:** senhas, tokens e PII nunca aparecem em logs, responses de erro ou mensagens de exceção
- [ ] **SQL / Command Injection:** usar ORM / prepared statements; nunca concatenar strings em queries
- [ ] **Dependências novas:** se esta task adicionar uma dependência, verificar CVEs com `npm audit` / `cargo audit` / `pip-audit` antes de commitar
- [ ] **Segredo em código:** nenhum token, chave ou credencial hardcoded — sempre via variável de ambiente

---

## 6. VALIDATION GATES (RALPH LOOP)

Execute **todos** antes de marcar a task como DONE. Se qualquer um falhar, leia o erro, corrija e reexecute.

```bash
# 1. Build — sem erros de compilação
[comando de build da stack]

# 2. Tests — todos passando, incluindo os novos
[comando de test]

# 3. Lint — sem warnings
[comando de lint]

# 4. Auditoria de dependências (se novas deps foram adicionadas nesta task)
[npm audit --audit-level=high | cargo audit | pip-audit | composer audit]
```

> **Gate de segurança obrigatório:** se esta task adicionar dependências externas, `[audit-cmd]` não pode retornar CVE de nível HIGH ou CRITICAL.

---

## 7. CRITÉRIOS DE DONE

- [ ] Todos os 4 validation gates passaram sem erros
- [ ] Testes cobrem caminho feliz + erros + edge cases da seção 4
- [ ] Considerações de segurança da seção 5 todas checadas
- [ ] Arquivos listados na seção 3 criados/modificados conforme spec
- [ ] `DARE/TASKS.md` atualizado com status `DONE`

---

## 8. PRÓXIMA TASK SUGERIDA

`[task-id]` — [título] _(desbloqueada após conclusão desta task)_
