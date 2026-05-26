---
title: Instalação
description: Como instalar o DARE CLI globalmente
---

# Instalação

## Via npm (recomendado)

```bash
npm install -g @dewtech/dare-cli
```

Confirme a instalação:

```bash
dare --version
# dare/3.0.0 linux-x64 node-v20.11.0
```

## Via pnpm

```bash
pnpm add -g @dewtech/dare-cli
```

## Via yarn

```bash
yarn global add @dewtech/dare-cli
```

---

## Verificando a instalação

```bash
dare --help
```

Saída esperada:

```
DARE Method CLI v3.0.0

Usage: dare <command> [options]

Commands:
  new          Create a new DARE project
  init         Initialize DARE in an existing project
  design       Start or continue the DESIGN phase
  blueprint    Generate BLUEPRINT from DESIGN
  execute      Execute tasks with Ralph Loop
  skill        Manage skills
  status       Show project status
  update       Update DARE templates in project

Options:
  -v, --version  Show version
  -h, --help     Show help
```

---

## Atualizando

```bash
npm install -g @dewtech/dare-cli@latest
```

Após atualizar o CLI globalmente, sincronize os templates em projetos existentes:

```bash
cd meu-projeto-dare
dare update
```

!!! warning "Atualização em projetos existentes"
    `dare update` **nunca modifica** seus arquivos `DESIGN.md`, `BLUEPRINT.md` ou `TASKS.md`.
    Ele atualiza apenas os templates de skills, comandos e configurações do DARE.

---

## Próximo passo

[Crie seu primeiro projeto →](first-project.md)
