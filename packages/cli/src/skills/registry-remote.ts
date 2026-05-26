/**
 * Remote registry client and resolver for the DARE skill registry.
 *
 * Provides:
 *   - `RemoteRegistry` — HTTP client for the Vercel Functions backend
 *   - `RegistryResolver` — combina remote + local + mock em ordem de prioridade
 *
 * Priority: Remote (if online) → Local (~/.dare/registry/) → Mock (offline)
 *
 * @module skills/registry-remote
 */

import { registry as mockRegistry, type RegistrySkill } from './registry.js';
import { LocalRegistry, type LocalRegistrySkill } from './registry-local.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteSkill {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dare_version: string;
  dependencies: Record<string, string>;
  keywords: string[];
  homepage?: string;
  publishedAt: string;
}

export type SkillSource = 'remote' | 'local' | 'mock';

export interface ResolvedSkill extends RegistrySkill {
  source: SkillSource;
}

export interface PublishPayload {
  version: string;
  description: string;
  author: string;
  license: string;
  dare_version: string;
  dependencies: Record<string, string>;
  keywords: string[];
  homepage?: string;
}

// ---------------------------------------------------------------------------
// RemoteRegistry
// ---------------------------------------------------------------------------

/**
 * HTTP client for the DARE registry backend (Vercel Functions).
 *
 * All network calls use `AbortController` with a configurable timeout.
 */
export class RemoteRegistry {
  private readonly _baseUrl: string;
  private readonly _timeoutMs: number;

  constructor(
    baseUrl = 'https://dare-registry.vercel.app',
    timeoutMs = 3_000,
  ) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._timeoutMs = timeoutMs;
  }

  /**
   * Lists all skills from the remote registry.
   * Returns an empty array on network failure.
   *
   * @throws Never — failures are returned as empty array.
   */
  async list(options: { keyword?: string; author?: string } = {}): Promise<RemoteSkill[]> {
    const url = new URL(`${this._baseUrl}/api/skills`);
    if (options.keyword) url.searchParams.set('keyword', options.keyword);
    if (options.author) url.searchParams.set('author', options.author);

    const response = await this._fetch(url.toString());
    const data = await response.json() as { skills: RemoteSkill[] };
    return data.skills ?? [];
  }

  /**
   * Fetches details for a single skill by name.
   * Returns `null` when not found (404) or on network failure.
   */
  async find(name: string): Promise<RemoteSkill | null> {
    const url = `${this._baseUrl}/api/skills/${encodeURIComponent(name)}`;
    const response = await this._fetch(url);

    if (response.status === 404) return null;
    if (!response.ok) return null;

    const data = await response.json() as { latest: RemoteSkill };
    return data.latest ?? null;
  }

  /**
   * Publishes a skill to the remote registry.
   *
   * @param skillName - The skill name (used in the URL path)
   * @param payload   - Skill metadata
   * @param token     - Bearer token for authentication
   * @throws Error if the request fails or returns a non-2xx status.
   */
  async publish(skillName: string, payload: PublishPayload, token: string): Promise<void> {
    const url = `${this._baseUrl}/api/publish/${encodeURIComponent(skillName)}`;
    const response = await this._fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const err = await response.json() as { detail?: string; title?: string };
        detail = err.detail ?? err.title ?? detail;
      } catch {
        // ignore
      }
      throw new Error(`Remote publish failed: ${detail}`);
    }
  }

  /**
   * Checks connectivity to the registry by fetching the skills list.
   * Returns `true` if the registry responds with a 2xx status.
   */
  async isOnline(): Promise<boolean> {
    try {
      const url = `${this._baseUrl}/api/skills`;
      const response = await this._fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ---- private ---------------------------------------------------------------

  private async _fetch(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// RegistryResolver
// ---------------------------------------------------------------------------

/**
 * Combines remote, local, and mock registries with priority fallback.
 *
 * Priority order:
 *   1. Remote (if available and online — timeout = 3s)
 *   2. Local  (`~/.dare/registry/`)
 *   3. Mock   (bundled JSON fallback)
 *
 * Skills from higher-priority sources overwrite those with the same
 * `name@version` from lower-priority sources.
 */
export class RegistryResolver {
  private readonly _remote: RemoteRegistry;
  private readonly _local: LocalRegistry;

  constructor(
    remote?: RemoteRegistry,
    local?: LocalRegistry,
  ) {
    this._remote = remote ?? new RemoteRegistry();
    this._local = local ?? new LocalRegistry();
  }

  /**
   * Returns all skills with source annotations.
   * Falls back automatically if remote is offline.
   */
  async list(): Promise<ResolvedSkill[]> {
    const map = new Map<string, ResolvedSkill>();

    // 1. Mock (lowest priority — add first so it can be overwritten)
    for (const s of mockRegistry.loadAll()) {
      map.set(`${s.name}@${s.version}`, { ...s, source: 'mock' });
    }

    // 2. Local (overlays mock)
    for (const s of this._local.list()) {
      map.set(`${s.name}@${s.version}`, {
        name: s.name,
        version: s.version,
        description: s.description,
        author: s.author,
        license: s.license,
        homepage: s.homepage ?? '',
        repository: s.repository ?? '',
        keywords: s.keywords ?? [],
        dependencies: {},
        published_at: s.published_at ?? '',
        size_kb: s.size_kb ?? 0,
        source: 'local',
      });
    }

    // 3. Remote (highest priority — overlays local and mock)
    try {
      const remoteSkills = await this._remote.list();
      for (const s of remoteSkills) {
        map.set(`${s.name}@${s.version}`, {
          name: s.name,
          version: s.version,
          description: s.description,
          author: s.author,
          license: s.license,
          homepage: s.homepage ?? '',
          repository: '',
          keywords: s.keywords,
          dependencies: s.dependencies,
          published_at: s.publishedAt,
          size_kb: 0,
          source: 'remote',
        });
      }
    } catch {
      // Remote offline — local/mock fallback already in map
    }

    return Array.from(map.values());
  }

  /**
   * Finds a single skill by name.
   * Uses remote first, then local, then mock.
   */
  async find(name: string): Promise<ResolvedSkill | null> {
    // Try remote first
    try {
      const remote = await this._remote.find(name);
      if (remote) {
        return {
          name: remote.name,
          version: remote.version,
          description: remote.description,
          author: remote.author,
          license: remote.license,
          homepage: remote.homepage ?? '',
          repository: '',
          keywords: remote.keywords,
          dependencies: remote.dependencies,
          published_at: remote.publishedAt,
          size_kb: 0,
          source: 'remote',
        };
      }
    } catch {
      // fallthrough to local
    }

    // Try local
    const local = this._local.find(name);
    if (local) {
      return {
        name: local.name,
        version: local.version,
        description: local.description,
        author: local.author,
        license: local.license,
        homepage: local.homepage ?? '',
        repository: local.repository ?? '',
        keywords: local.keywords ?? [],
        dependencies: {},
        published_at: local.published_at ?? '',
        size_kb: local.size_kb ?? 0,
        source: 'local',
      };
    }

    // Fallback to mock
    const mock = mockRegistry.findByName(name);
    if (mock) {
      return { ...mock, source: 'mock' };
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

/** Shared remote registry client. */
export const remoteRegistry = new RemoteRegistry();

/** Shared resolver (remote → local → mock). */
export const registryResolver = new RegistryResolver();
