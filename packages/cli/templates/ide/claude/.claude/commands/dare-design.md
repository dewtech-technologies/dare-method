# /dare-design

Gera ou atualiza o `DARE/DESIGN.md` a partir de uma descrição do projeto ou feature.

## Como usar

```
/dare-design Quero uma API REST de autenticação com JWT e refresh token
/dare-design Adicionar endpoint de upload de arquivos com validação
```

## O que fazer

1. **Leia o contexto atual do projeto:**
   - `package.json` / `composer.json` / `Cargo.toml` / `requirements.txt` para entender stack
   - Estrutura de pastas existente
   - `DARE/DESIGN.md` se já existir (não sobrescreva sem autorização)

2. **Crie ou atualize `DARE/DESIGN.md` com:**
   - **Descrição** clara do que será construído
   - **Objetivos** mensuráveis (use checkboxes `- [ ]`)
   - **Restrições** técnicas, de negócio e de tempo
   - **Critérios de sucesso** verificáveis
   - **Stakeholders** e personas afetadas
   - **Riscos** identificados

3. **Use o template** em `templates/DESIGN-template.md` se disponível

4. **Confirme com o usuário** antes de prosseguir para a fase de Architect

## Formato esperado do DESIGN.md

```markdown
# DESIGN: <Nome do Projeto/Feature>

## Descrição
<O que será construído e por quê>

## Objetivos
- [ ] Objetivo mensurável 1
- [ ] Objetivo mensurável 2

## Restrições
- Técnicas: <stack, performance, etc>
- Negócio: <prazo, budget, regulatórias>

## Critérios de Sucesso
- <Critério verificável 1>
- <Critério verificável 2>

## Riscos
- <Risco 1 e mitigação>
```

$ARGUMENTS
