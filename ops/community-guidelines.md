# DARE Method — Community Guidelines

> Version 1.0 — May 2026
> License: MIT — DARE Method / Dewtech Technologies

---

## Para que serve este guia

Este documento define as regras de convivência da comunidade DARE Method: quem pode contribuir, como citar o DARE em projetos próprios e quais usos da marca registrada "DARE" requerem autorização expressa.

O DARE Method é um framework de desenvolvimento de software publicado sob licença **MIT**. Isso significa que qualquer pessoa pode usar, modificar e distribuir o código livremente — incluindo para fins comerciais. No entanto, o **nome e a marca "DARE"** possuem proteção adicional conforme descrito neste guia.

---

## Forks são bem-vindos

A licença MIT garante liberdade total de fork. Você pode:

- Fazer fork do repositório e criar sua própria versão
- Modificar qualquer parte do código, CLI, registry ou documentação
- Distribuir sua versão modificada, inclusive comercialmente
- Usar o DARE como base para produtos e serviços

O único requisito da licença MIT é manter o aviso de copyright original nos arquivos de código que você copiar.

---

## O que voce NAO pode fazer

As restrições abaixo protegem a marca "DARE" e a integridade da comunidade. Violações podem resultar em solicitação de remoção (DMCA takedown) ou ação legal.

### 1. Usar a marca "DARE" como nome de produto sem atribuição

Você **não pode** lançar um produto, serviço, SaaS ou pacote npm chamado:
- "DARE Pro", "DARE Cloud", "DARE Enterprise", "DARE Platform"
- Qualquer nome que use "DARE" como marca principal de um produto comercial

sem um acordo de licença com a Dewtech Technologies.

**O que fazer em vez disso:** nomeie seu produto com outro nome e indique que ele foi *construído com DARE Method*.

**Exemplo correto:** "Archify — built with DARE v3.0"

### 2. Remover os créditos ao DARE Method

Você **não pode** distribuir versões modificadas do DARE removendo os avisos de autoria presentes nos arquivos de código (`LICENSE`, headers dos arquivos) ou na documentação.

### 3. Vender consultoria "certificada DARE" sem autorização

O uso do termo "Certificado DARE" ou "DARE Certified Architect" para fins comerciais (treinamentos, cursos, serviços de consultoria) requer autorização prévia da Dewtech Technologies.

Consultorias que *usam* o DARE como metodologia são livres — veja a seção "Uso DARE em consultoria própria" abaixo.

---

## Como contribuir

Contribuições são muito bem-vindas! O processo é simples:

1. **Issues:** Abra uma issue para discutir bugs, melhorias ou novas ideias antes de codificar.
2. **Pull Requests:** Fork → branch descritiva → PR contra `main`. Descreva o problema que o PR resolve.
3. **Discussões:** Use a aba Discussions do GitHub para perguntas abertas, RFCs e feedback de uso.
4. **Skills:** Veja a seção abaixo para publicar novas skills DARE.

Todos os contribuidores devem concordar com o Code of Conduct (seção final deste documento).

---

## Publicar uma skill

Skills são extensões do CLI DARE que adicionam comportamentos, templates ou integrações.

### Requisitos para publicação

- Licença **MIT obrigatória** — skills proprietárias não são aceitas no registry público
- Arquivo `dare.skill.json` na raiz, com `name`, `version`, `description`, `author` e `license: "MIT"`
- Testes passando (`dare skill test`)
- README com exemplos de uso

### Processo de publicação

```bash
# Publicar no registry público
dare skill publish

# Publicar versão específica
dare skill publish --version 1.2.0
```

A equipe revisa skills antes da publicação para garantir segurança e qualidade. Skills maliciosas ou que violem este guia serão removidas sem aviso.

---

## Usar DARE em consultoria propria

Você pode usar o DARE Method como metodologia central nos seus serviços de consultoria sem precisar de autorização prévia.

**Obrigatorio:** creditar o DARE em seus entregáveis com a nota:

> *Arquitetura desenvolvida com DARE v3.0 / Dewtech Technologies — dare.dewtech.tech*

Essa atribuição pode aparecer no rodapé de documentos, em seções de "Metodologia" de propostas ou em comentários no código-fonte. Não precisa ser visível para o cliente final em interfaces de usuário.

---

## Uso comercial

O DARE é MIT — uso comercial é **permitido e incentivado**.

| Uso | Permitido? |
|-----|-----------|
| SaaS baseado em DARE com nome próprio | Sim, com atribuição |
| Cursos sobre DARE | Sim, com atribuição |
| Livro sobre DARE | Sim, com atribuição |
| Consultoria usando DARE | Sim, com atribuição |
| Produto chamado "DARE Pro" | **Nao** — requer acordo de licenca |
| Consultoria "Certificada DARE" | **Nao** — requer acordo de licenca |
| Fork para uso interno da empresa | Sim, sem restricao |

---

## Code of Conduct

Este projeto adota o **Contributor Covenant v2.1**.

### Nossa promessa

Nos como membros, contribuidores e líderes nos comprometemos a fazer a participação em nossa comunidade uma experiência livre de assédio para todas as pessoas, independentemente de idade, tamanho corporal, deficiência visível ou invisível, etnia, características sexuais, identidade e expressão de gênero, nível de experiência, educação, status socioeconômico, nacionalidade, aparência pessoal, raça, religião ou identidade e orientação sexual.

### Comportamentos esperados

- Demonstrar empatia e bondade com outras pessoas
- Respeitar opiniões, pontos de vista e experiências diferentes
- Dar e aceitar graciosamente feedback construtivo
- Aceitar responsabilidade e pedir desculpas aos afetados por nossos erros
- Focar no que é melhor não apenas para nós como indivíduos, mas para a comunidade em geral

### Comportamentos inaceitaveis

- Uso de linguagem ou imagens sexualizadas e atenção ou avanços sexuais de qualquer tipo
- Trolling, comentários insultuosos/depreciativos e ataques pessoais ou políticos
- Assédio público ou privado
- Publicar informações privadas de outras pessoas sem permissão explícita
- Outra conduta que poderia ser razoavelmente considerada inapropriada em um ambiente profissional

### Aplicação

Instâncias de comportamento abusivo, assediante ou inaceitável podem ser reportadas abrindo uma issue com a label `conduct` ou enviando e-mail para wleandro.oliveira@gmail.com. Todas as reclamações serão revisadas e investigadas.

Texto completo em: [contributor-covenant.org/version/2/1/code_of_conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

---

## Contato e duvidas

- **Issues GitHub:** [github.com/dewtech-technologies/dare-method/issues](https://github.com/dewtech-technologies/dare-method/issues)
- **Email:** wleandro.oliveira@gmail.com
- **Discussões:** aba Discussions do repositório

Para solicitações de acordo de licença comercial ou parcerias, entre em contato por e-mail com o assunto `[DARE License]`.
