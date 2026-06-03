#!/usr/bin/env node
/**
 * gen-runner-commands.mjs — gera os comandos "operacionais" do DARE CLI como
 * skills/commands de IDE, nas 3 IDEs (Claude, Cursor, Antigravity), a partir de
 * UMA spec canônica. Garante 1:1 entre `dare <cmd>` e `/dare-<cmd>`.
 *
 * Fonte da verdade: implementations/. Rode o sync depois (`pnpm sync`).
 * Uso: node packages/cli/scripts/gen-runner-commands.mjs
 */
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');
const IMPL = path.join(REPO, 'implementations');

/** @type {Array<{slug:string,cli:string,title:string,summary:string,when:string[],usage:string[],steps:string[],related:string[]}>} */
const COMMANDS = [
  {
    slug: 'dare-init',
    cli: 'dare init',
    title: 'Inicializar um novo projeto DARE',
    summary:
      'Cria um projeto DARE do zero (greenfield) com setup interativo: escolhe stack backend/frontend, knowledge graph, IDE e gera o scaffolder completo + DNA DARE.',
    when: [
      'O usuário quer começar um projeto **novo** do zero.',
      'Não existe código ainda — é greenfield. Para projeto legado, use `/dare-discover`.',
    ],
    usage: [
      'dare init                       # fluxo interativo completo',
      'dare init minha-api --stack node-nestjs',
      'dare init meu-mcp --mcp node-ts --transport http',
      'dare init api --stack go-gin --toolchain docker --non-interactive',
    ],
    steps: [
      'Rode `dare init` (ou com `--stack`/`--mcp` se o usuário já decidiu a stack).',
      'Responda aos prompts: nome, stack backend, frontend opcional, knowledge graph (json/sqlite/neo4j), IDE(s).',
      'Ao final, o projeto tem scaffolder + os 7 artefatos de DNA + comandos/skills de IDE instalados.',
      'Próximo passo: descreva a ideia com `/dare-design`.',
    ],
    related: ['dare-design', 'dare-discover', 'dare-bootstrap'],
  },
  {
    slug: 'dare-bootstrap',
    cli: 'dare bootstrap',
    title: 'Rodar o scaffold oficial da stack do projeto',
    summary:
      'Executa o scaffolder oficial da stack registrada em `dare.config.json` para materializar o esqueleto do framework no projeto atual.',
    when: [
      'Logo após `dare init`, para gerar o esqueleto real do framework.',
      'Quando `dare.config.json` existe mas os artefatos do framework ainda não foram gerados.',
    ],
    usage: [
      'dare bootstrap',
      'dare bootstrap --force   # roda mesmo se já houver artefatos (pode sobrescrever)',
    ],
    steps: [
      'Confirme que existe `dare.config.json` com a stack definida.',
      'Rode `dare bootstrap` (use `--force` apenas se o usuário aceitar sobrescrever arquivos existentes).',
      'Verifique a saída: arquivos gerados e próximos passos sugeridos pelo CLI.',
    ],
    related: ['dare-init', 'dare-design'],
  },
  {
    slug: 'dare-discover',
    cli: 'dare discover',
    title: 'Adotar o DARE em um projeto existente',
    summary:
      'Detecta a stack de um projeto já existente (brownfield) e instala os arquivos da metodologia DARE — incluindo os comandos/skills de IDE — sem tocar no código.',
    when: [
      'O usuário quer adotar o DARE em um repositório que **já existe**.',
      'Para entender/documentar o legado em profundidade depois, encadeie com `/dare-reverse` e `/dare-dna`.',
    ],
    usage: [
      'dare discover',
      'dare discover --dir ./caminho/do/projeto',
      'dare discover --check    # só mostra a detecção, sem instalar nada',
    ],
    steps: [
      'Rode `dare discover --check` primeiro para revisar a stack detectada.',
      'Se a detecção estiver correta, rode `dare discover` para instalar os artefatos DARE + comandos de IDE.',
      'Próximo passo: `/dare-reverse` (Fase 0 — coleta) e `/dare-dna` (convenções).',
    ],
    related: ['dare-reverse', 'dare-dna', 'dare-migrate'],
  },
  {
    slug: 'dare-graph',
    cli: 'dare graph',
    title: 'Inspecionar o knowledge graph do DARE',
    summary:
      'Consulta e visualiza o grafo de conhecimento do projeto (tasks, arquivos, schemas, endpoints, componentes, entidades e suas relações).',
    when: [
      'Você quer entender dependências entre tasks/arquivos/entidades.',
      'Precisa achar nós relacionados a um termo, ou exportar um diagrama do grafo.',
    ],
    usage: [
      'dare graph stats                       # contagem de nós/arestas por tipo',
      'dare graph query <termo> --limit 10    # busca nós por label/descrição',
      'dare graph query auth --type endpoint',
      'dare graph viz --format mermaid -o graph.mmd',
      'dare graph ingest                      # re-sincroniza o grafo do dare-dag.yaml',
    ],
    steps: [
      'Escolha o subcomando conforme a intenção: `stats`, `query <termo>`, `viz`, `ingest`.',
      'Rode o comando e interprete a saída (para `viz`, abra/renderize o diagrama gerado).',
      'Se o grafo parecer desatualizado, rode `dare graph ingest` para re-sincronizar.',
    ],
    related: ['dare-dag', 'dare-execute'],
  },
  {
    slug: 'dare-dag',
    cli: 'dare dag',
    title: 'Inspecionar e visualizar o DAG de tasks',
    summary:
      'Mostra o DAG estático de tasks (`DARE/dare-dag.yaml`): ranks, dependências e caminho crítico. Use `dare dag viz` para exportar o diagrama.',
    when: [
      'Você quer ver a ordem de execução, os ranks e o caminho crítico das tasks.',
      'Antes de começar a execução, para conferir a topologia do plano.',
    ],
    usage: [
      'dare dag viz',
      'dare dag viz --dag DARE/dare-dag.yaml',
    ],
    steps: [
      'Rode `dare dag viz` para renderizar o grafo de tasks.',
      'Confira ranks e dependências; tasks de mesmo rank podem rodar em paralelo.',
      'Para validar a integridade do arquivo, use `/dare-validate`. Para executar, `/dare-execute`.',
    ],
    related: ['dare-validate', 'dare-execute', 'dare-graph'],
  },
  {
    slug: 'dare-validate',
    cli: 'dare validate',
    title: 'Validar a integridade do dare-dag.yaml',
    summary:
      'Valida `DARE/dare-dag.yaml` (ciclos, referências quebradas, campos obrigatórios). Adequado para pre-commit hooks e CI.',
    when: [
      'Antes de commitar mudanças no DAG.',
      'Em CI, como gate de integridade do plano de execução.',
    ],
    usage: [
      'dare validate',
      'dare validate --strict          # trata warnings como erros (CI-friendly)',
      'dare validate --dag DARE/dare-dag.yaml',
    ],
    steps: [
      'Rode `dare validate` (use `--strict` em CI).',
      'Se houver erros, corrija o `dare-dag.yaml` apontado e rode de novo até passar.',
      'Saída limpa = DAG íntegro e pronto para `/dare-execute`.',
    ],
    related: ['dare-dag', 'dare-execute'],
  },
  {
    slug: 'dare-info',
    cli: 'dare info',
    title: 'Diagnóstico do setup DARE do projeto',
    summary:
      'Mostra versão do CLI, caminhos relevantes e a integridade da instalação DARE no projeto atual.',
    when: [
      'Algo parece errado no setup e você quer um diagnóstico rápido.',
      'Para confirmar a versão do CLI e os artefatos DARE presentes.',
    ],
    usage: ['dare info'],
    steps: [
      'Rode `dare info`.',
      'Revise versão, caminhos e a checagem de integridade.',
      'Se houver artefatos faltando/desatualizados, rode `/dare-update`.',
    ],
    related: ['dare-update', 'dare-welcome'],
  },
  {
    slug: 'dare-update',
    cli: 'dare update',
    title: 'Atualizar o projeto para a versão atual do CLI',
    summary:
      'Sincroniza os artefatos do projeto (comandos de IDE, skills, templates) com a versão instalada do DARE CLI, preservando customizações.',
    when: [
      'Depois de atualizar o `@dewtech/dare-cli` para uma versão nova.',
      'Quando `dare info` apontar artefatos desatualizados.',
    ],
    usage: [
      'dare update --dry-run     # mostra o que mudaria, sem escrever',
      'dare update -y            # aplica tudo, mantém customizações',
      'dare update --target 3.2.0',
    ],
    steps: [
      'Rode `dare update --dry-run` e revise o diff proposto.',
      'Se estiver ok, rode `dare update -y`.',
      'Evite `--force` salvo se o usuário aceitar sobrescrever arquivos customizados.',
    ],
    related: ['dare-info', 'dare-welcome'],
  },
  {
    slug: 'dare-skill',
    cli: 'dare skill',
    title: 'Gerenciar skills DARE do projeto',
    summary:
      'Adiciona, remove, lista, inspeciona, atualiza ou publica skills DARE neste projeto.',
    when: [
      'Você quer instalar uma skill extra (ex.: uma skill de stack) no projeto.',
      'Quer listar/inspecionar as skills disponíveis ou publicar uma própria.',
    ],
    usage: [
      'dare skill list',
      'dare skill info <nome>',
      'dare skill add <nome>',
      'dare skill remove <nome>',
      'dare skill update',
    ],
    steps: [
      'Use `dare skill list` para ver o que está instalado/disponível.',
      'Rode o subcomando desejado (`add`/`remove`/`info`/`update`/`publish`).',
      'Confirme o resultado e, se mudou comandos de IDE, recarregue a IDE.',
    ],
    related: ['dare-update', 'dare-info'],
  },
  {
    slug: 'dare-welcome',
    cli: 'dare welcome',
    title: 'Banner de boas-vindas e guia rápido',
    summary:
      'Mostra o banner do DARE e um guia de início rápido com o fluxo Design → Architecture → Review → Execute.',
    when: [
      'Primeiro contato com o DARE neste projeto.',
      'O usuário quer relembrar o fluxo canônico de comandos.',
    ],
    usage: ['dare welcome'],
    steps: [
      'Rode `dare welcome`.',
      'Apresente o fluxo: `/dare-design` → `/dare-blueprint` → `/dare-tasks` → `/dare-execute`.',
    ],
    related: ['dare-design', 'dare-info'],
  },
];

function bodyMarkdown(c) {
  const lines = [];
  lines.push(c.summary, '');
  lines.push('> Este comando expõe o CLI `' + c.cli + '` na IDE. O agente pode **rodar o comando no terminal** e interpretar a saída.', '');
  lines.push('## Quando usar', '');
  for (const w of c.when) lines.push('- ' + w);
  lines.push('', '## Como rodar', '', '```bash');
  for (const u of c.usage) lines.push(u);
  lines.push('```', '', '## O que fazer', '');
  c.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('', '## Comandos relacionados', '', c.related.map((r) => '`/' + r + '`').join(' · '), '');
  return lines.join('\n');
}

async function main() {
  let n = 0;
  for (const c of COMMANDS) {
    const body = bodyMarkdown(c);

    // Claude: .claude/commands/<slug>.md  — header "# /<slug>"
    const claude = `# /${c.slug}\n\n${body}`;
    await fs.outputFile(path.join(IMPL, 'claude', '.claude', 'commands', `${c.slug}.md`), claude);

    // Cursor: .cursor/commands/<slug>.md — header "# Comando: /<slug>"
    const cursor = `# Comando: /${c.slug}\n\n${body}`;
    await fs.outputFile(path.join(IMPL, 'cursor', '.cursor', 'commands', `${c.slug}.md`), cursor);

    // Antigravity: .agents/skills/<slug>/SKILL.md — frontmatter name/description
    const fm = `---\nname: ${c.slug}\ndescription: ${c.summary.replace(/\n/g, ' ')} Mapeia o CLI \`${c.cli}\`.\n---\n\n# ${c.title}\n\n${body}`;
    await fs.outputFile(path.join(IMPL, 'antigravity', '.agents', 'skills', c.slug, 'SKILL.md'), fm);

    n++;
  }
  console.log(`[gen-runner-commands] gerados ${n} comandos × 3 IDEs = ${n * 3} arquivos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
