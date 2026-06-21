import type { AiCommandName } from './types.js';

export function buildEnrichmentPrompt(
  command: AiCommandName,
  facts: unknown,
  opts?: { deep?: boolean; extra?: string },
): string {
  const factsJson = JSON.stringify(facts, null, 2);
  const header = [
    'You are enriching DARE CLI artifacts from deterministic facts.',
    'Return ONLY a single JSON object matching the requested schema.',
    'Do not fabricate files or endpoints that are absent from the facts.',
    'If uncertain, state assumptions in openQuestions/ambiguities fields.',
    '',
    `Command: dare ${command}`,
    opts?.deep ? 'Mode: deep (include extended semantic sections when applicable).' : '',
    opts?.extra ? `Context: ${opts.extra}` : '',
    '',
    'Deterministic facts:',
    factsJson,
    '',
  ]
    .filter(Boolean)
    .join('\n');

  switch (command) {
    case 'reverse':
      return (
        header +
        'Fill semantic reverse-engineering fields: purpose, domainGlossary, optional mermaid diagrams, ' +
        'modulePurposes map (module id -> responsibility), and deep sections when in deep mode.'
      );
    case 'dna':
      return (
        header +
        'Infer house-style conventions: architecturePattern, layerRules, testingStyle, errorHandling, goldenRules.'
      );
    case 'migrate':
      return (
        header +
        'Propose migration strategySummary, riskAreas, parityNotes, and blockingGaps for the target stack.'
      );
    case 'design':
      return (
        header +
        'Turn the description and facts into goals, constraints, successCriteria, and optional userJourneys.'
      );
    case 'patterns':
      return (
        header +
        'Summarize recurring patterns, recommendations, antiPatterns, and optional injectionNotes.'
      );
    case 'blueprint':
      return (
        header +
        'Produce architectureSummary, keyDecisions, risks, and optional taskNotes for the blueprint phase.'
      );
    case 'review':
      return (
        header +
        'Audit the task spec against implementation hints in facts; return passed, unmetCriteria, notes.'
      );
    case 'refine':
      return (
        header +
        'Propose subtasks with id, title, optional files, and rationale for splitting the parent task.'
      );
    default:
      return header;
  }
}
