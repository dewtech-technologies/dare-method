---
title: Contribuindo
description: Como contribuir com o DARE Method
---

# Contribuindo com o DARE Method

O DARE Method é open source (MIT) e bem-vindo a contribuições de qualquer tipo.

## Formas de contribuir

### Código

- Bugs: abra uma issue com o label `bug`
- Features: abra uma RFC em `docs/rfcs/` antes de implementar
- Skills: veja [Publicar uma Skill](publish-a-skill.md)

### Documentação

- Corrija typos via pull request diretamente
- Adicione exemplos em suas áreas de expertise
- Traduza para outros idiomas (EN/PT já cobertos)

### Comunidade

- Responda issues com a label `help wanted`
- Compartilhe seu caso de uso no GitHub Discussions
- Escreva sobre DARE no seu blog e nos envie o link

## Processo de pull request

```bash
# Fork e clone
git clone https://github.com/SEU_USUARIO/dare-method
cd dare-method

# Crie uma branch
git checkout -b feat/minha-feature

# Faça suas mudanças
# ...

# Teste
pnpm test

# Commit (seguindo Conventional Commits)
git commit -m "feat(skills): adicionar dare-stripe-integration"

# Push e abra PR
git push origin feat/minha-feature
```

## Conventional Commits

| Prefixo | Uso |
|---------|-----|
| `feat:` | Nova feature |
| `fix:` | Bug fix |
| `docs:` | Documentação |
| `chore:` | Manutenção |
| `skill:` | Nova skill ou atualização |
| `refactor:` | Refatoração sem mudança de comportamento |

## Código de conduta

Este projeto segue o [Contributor Covenant](https://www.contributor-covenant.org/).
Comportamento respeitoso e inclusivo é esperado de todos os participantes.
