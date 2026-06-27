import { createRequire } from 'node:module';
import type { AiCommandName, AiProviderName } from '../ai/types.js';
import { capabilitiesForProvider } from '../ai/capabilities.js';
import { listProviderNames } from '../ai/registry.js';
import { parityFor, SEMANTIC_COMMANDS } from '../ai/parity.js';
import { jsonSchemaForCommand } from '../ai/schemas.js';

const require = createRequire(import.meta.url);
const { version: cliVersion } = require('../../package.json') as { version: string };

export const PROTOCOL_VERSION = '1.0.0';

export interface OperationDescriptor {
  readonly command: AiCommandName;
  readonly route: string;
  readonly heuristicAlwaysRuns: true;
  readonly requiresInput?: ReadonlyArray<string>;
  readonly schemaFields: ReadonlyArray<string>;
  readonly artifacts: ReadonlyArray<string>;
  readonly jsonSchema: Record<string, unknown>;
}

export interface ProtocolManifest {
  readonly protocolVersion: string;
  readonly cliVersion: string;
  readonly operations: ReadonlyArray<OperationDescriptor>;
  readonly capabilities: Readonly<
    Record<AiProviderName, ReturnType<typeof capabilitiesForProvider>>
  >;
}

function requiresInputFor(command: AiCommandName): ReadonlyArray<string> | undefined {
  switch (command) {
    case 'design':
      return ['description'];
    case 'review':
    case 'refine':
      return ['taskId'];
    default:
      return undefined;
  }
}

export function buildManifest(): ProtocolManifest {
  const operations: OperationDescriptor[] = SEMANTIC_COMMANDS.map((command) => {
    const parity = parityFor(command);
    const requiresInput = requiresInputFor(command);
    return {
      command,
      route: `POST /commands/${command}`,
      heuristicAlwaysRuns: true as const,
      ...(requiresInput ? { requiresInput } : {}),
      schemaFields: parity.schemaFields,
      artifacts: parity.artifacts,
      jsonSchema: jsonSchemaForCommand(command),
    };
  });

  const capabilities = Object.fromEntries(
    listProviderNames().map((name) => [name, capabilitiesForProvider(name)]),
  ) as ProtocolManifest['capabilities'];

  return {
    protocolVersion: PROTOCOL_VERSION,
    cliVersion,
    operations,
    capabilities,
  };
}
