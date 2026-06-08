import type { FormalBackend as FormalBackendId, FormalGateConfig } from '../../types.js';
import type { FormalBackend } from './backend.js';
import { UnknownFormalBackendError } from './backend.js';

const BACKEND_LOADERS: Readonly<
  Record<FormalBackendId, () => Promise<FormalBackend>>
> = {
  dafny: async () => (await import('./dafny.js')).backend,
  verus: async () => (await import('./verus.js')).backend,
  lean: async () => (await import('./lean.js')).backend,
};

const BACKEND_ORDER: ReadonlyArray<FormalBackendId> = ['dafny', 'verus', 'lean'];

const backendCache = new Map<FormalBackendId, FormalBackend>();

async function loadBackend(id: FormalBackendId): Promise<FormalBackend> {
  const cached = backendCache.get(id);
  if (cached) return cached;
  const loader = BACKEND_LOADERS[id];
  if (!loader) throw new UnknownFormalBackendError(String(id));
  const loaded = await loader();
  backendCache.set(id, loaded);
  return loaded;
}

/** Resolve o backend formal por config; lazy-load por import(). throws UnknownFormalBackendError. */
export async function backendForConfig(cfg: FormalGateConfig): Promise<FormalBackend> {
  if (!(cfg.backend in BACKEND_LOADERS)) {
    throw new UnknownFormalBackendError(String(cfg.backend));
  }
  return loadBackend(cfg.backend);
}

/** Todos os backends registrados (carrega cada módulo no máximo uma vez). */
export async function listFormalBackends(): Promise<ReadonlyArray<FormalBackend>> {
  return Promise.all(BACKEND_ORDER.map((id) => loadBackend(id)));
}
