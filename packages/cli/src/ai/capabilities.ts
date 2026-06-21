import type { ProviderCapabilities, AiProviderName } from './types.js';
import { providerToDriverId } from './resolve.js';

export function capabilitiesForProvider(name: AiProviderName): ProviderCapabilities {
  if (name === 'mock') {
    return { enrichment: true, execution: true };
  }
  return {
    enrichment: true,
    execution: providerToDriverId(name) !== null,
  };
}
