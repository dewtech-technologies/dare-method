/**
 * dare-frontend-design — FrontendGenerator
 * Scaffolds DARE-compliant frontend structure for React or Vue projects.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import type { ScaffoldOptions, ScaffoldResult, Framework } from './types.js';

export class FrontendGenerator {
  /**
   * Generate a DARE-compliant frontend project structure.
   */
  scaffold(options: ScaffoldOptions): ScaffoldResult {
    const { framework, outputDir, projectName = 'my-app' } = options;

    const dirsCreated: string[] = [];
    const filesCreated: string[] = [];

    if (framework === 'react') {
      scaffoldReact(outputDir, projectName, dirsCreated, filesCreated);
    } else if (framework === 'vue') {
      scaffoldVue(outputDir, projectName, dirsCreated, filesCreated);
    } else {
      throw new Error(`FrontendGenerator: unknown framework "${framework as string}"`);
    }

    return {
      filesCreated,
      dirsCreated,
      framework,
    };
  }
}

// ---------------------------------------------------------------------------
// React scaffold
// ---------------------------------------------------------------------------

function scaffoldReact(
  outputDir: string,
  projectName: string,
  dirsCreated: string[],
  filesCreated: string[]
): void {
  const dirs = [
    'src/components',
    'src/hooks',
    'src/pages',
    'src/store',
    'src/api',
    'src/types',
    'src/styles',
  ];

  for (const dir of dirs) {
    const fullDir = path.join(outputDir, dir);
    mkdirSafe(fullDir);
    dirsCreated.push(fullDir);
  }

  const files: Record<string, string> = {
    'src/components/ErrorBoundary.tsx': reactErrorBoundaryTemplate(),
    'src/components/LoadingSpinner.tsx': reactLoadingSpinnerTemplate(),
    'src/hooks/useFetch.ts': reactUseFetchTemplate(),
    'src/pages/NotFoundPage.tsx': reactNotFoundPageTemplate(),
    'src/api/client.ts': reactApiClientTemplate(),
    'src/api/endpoints.ts': reactEndpointsTemplate(),
    'src/store/store.ts': reactStoreTemplate(),
    'src/types/index.ts': reactTypesTemplate(),
    'src/App.tsx': reactAppTemplate(projectName),
    'src/styles/globals.css': cssGlobalsTemplate(),
  };

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(outputDir, relPath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    filesCreated.push(fullPath);
  }
}

// ---------------------------------------------------------------------------
// Vue scaffold
// ---------------------------------------------------------------------------

function scaffoldVue(
  outputDir: string,
  projectName: string,
  dirsCreated: string[],
  filesCreated: string[]
): void {
  const dirs = [
    'src/components',
    'src/composables',
    'src/pages',
    'src/stores',
    'src/api',
    'src/types',
  ];

  for (const dir of dirs) {
    const fullDir = path.join(outputDir, dir);
    mkdirSafe(fullDir);
    dirsCreated.push(fullDir);
  }

  const files: Record<string, string> = {
    'src/components/ErrorBoundary.vue': vueErrorBoundaryTemplate(),
    'src/components/LoadingSpinner.vue': vueLoadingSpinnerTemplate(),
    'src/composables/useFetch.ts': vueUseFetchTemplate(),
    'src/pages/NotFoundPage.vue': vueNotFoundPageTemplate(),
    'src/api/client.ts': vueApiClientTemplate(),
    'src/api/endpoints.ts': vueEndpointsTemplate(),
    'src/stores/app.ts': vuePiniaStoreTemplate(projectName),
    'src/types/index.ts': vueTypesTemplate(),
    'src/App.vue': vueAppTemplate(projectName),
  };

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(outputDir, relPath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    filesCreated.push(fullPath);
  }
}

function mkdirSafe(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// React templates
// ---------------------------------------------------------------------------

function reactErrorBoundaryTemplate(): string {
  return `/**
 * ErrorBoundary — wraps children and catches render errors.
 * DARE Frontend Design: every page must have an error boundary.
 */
import { useState, useEffect, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error as Error);
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (hasError) {
    return (
      fallback ?? (
        <div role="alert" style={{ padding: '1rem', color: 'red' }}>
          <h2>Something went wrong</h2>
          {error && <pre style={{ fontSize: '0.8rem' }}>{error.message}</pre>}
        </div>
      )
    );
  }

  return <>{children}</>;
}

export default ErrorBoundary;
`;
}

function reactLoadingSpinnerTemplate(): string {
  return `/**
 * LoadingSpinner — accessible loading indicator.
 */
interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-label={label} style={{ textAlign: 'center', padding: '1rem' }}>
      <span aria-hidden="true">⏳</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
`;
}

function reactUseFetchTemplate(): string {
  return `/**
 * useFetch — generic data fetching hook.
 * DARE Frontend Design: all API calls isolated in custom hooks.
 */
import { useState, useEffect } from 'react';

type FetchState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export function useFetch<T>(url: string | null): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'idle' });

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    setState({ status: 'loading' });

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);
        return res.json() as Promise<T>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
`;
}

function reactNotFoundPageTemplate(): string {
  return `/**
 * NotFoundPage — 404 page with error boundary.
 * DARE Frontend Design: each page wrapped in ErrorBoundary.
 */
import ErrorBoundary from '../components/ErrorBoundary';

export function NotFoundPage() {
  return (
    <ErrorBoundary>
      <main role="main" style={{ textAlign: 'center', padding: '2rem' }}>
        <h1>404 — Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
        <a href="/">Go home</a>
      </main>
    </ErrorBoundary>
  );
}

export default NotFoundPage;
`;
}

function reactApiClientTemplate(): string {
  return `/**
 * API client — wraps fetch with auth headers.
 * DARE Frontend Design: centralized API layer (no direct fetch in components).
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(\`\${BASE_URL}\${path}\`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(\`GET \${path} failed: \${res.status}\`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(\`\${BASE_URL}\${path}\`, {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(\`POST \${path} failed: \${res.status}\`);
  return res.json() as Promise<T>;
}

function getHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('auth_token');
  return token ? { Authorization: \`Bearer \${token}\` } : {};
}
`;
}

function reactEndpointsTemplate(): string {
  return `/**
 * API endpoints — type-safe endpoint definitions.
 * DARE Frontend Design: endpoints from OpenAPI spec centralized here.
 */

export const ENDPOINTS = {
  // Replace with actual endpoints from OpenAPI spec
  users: {
    list: '/users',
    detail: (id: string) => \`/users/\${id}\`,
    create: '/users',
    delete: (id: string) => \`/users/\${id}\`,
  },
} as const;
`;
}

function reactStoreTemplate(): string {
  return `/**
 * Global store configuration.
 * DARE Frontend Design: global state centralized (Redux/Zustand/etc).
 * Replace with your chosen state management library.
 */

// Minimal store using React context (replace with Redux/Zustand if needed)
import { createContext, useContext, useState, type ReactNode } from 'react';

interface AppState {
  user: { id: string; name: string } | null;
  setUser: (user: { id: string; name: string } | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  return <AppContext.Provider value={{ user, setUser }}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used within AppProvider');
  return ctx;
}
`;
}

function reactTypesTemplate(): string {
  return `/**
 * Shared TypeScript types.
 * DARE Frontend Design: all types explicit (strict mode).
 */

export interface ApiError {
  status: number;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}
`;
}

function reactAppTemplate(projectName: string): string {
  return `/**
 * ${projectName} — App entry point.
 * DARE Frontend Design: router setup with error boundaries.
 */
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <ErrorBoundary>
      <div id="app">
        {/* Router setup here (React Router, TanStack Router, etc.) */}
        <NotFoundPage />
      </div>
    </ErrorBoundary>
  );
}

export default App;
`;
}

function cssGlobalsTemplate(): string {
  return `/* Global styles — DARE Frontend Design */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
`;
}

// ---------------------------------------------------------------------------
// Vue templates
// ---------------------------------------------------------------------------

function vueErrorBoundaryTemplate(): string {
  return `<script setup lang="ts">
/**
 * ErrorBoundary.vue — wraps slot content and catches errors.
 * DARE Frontend Design: every page must have an error boundary.
 */
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((err: Error) => {
  hasError.value = true;
  errorMessage.value = err.message;
  return false; // prevent propagation
});
</script>

<template>
  <div v-if="hasError" role="alert" class="error-boundary">
    <h2>Something went wrong</h2>
    <pre>{{ errorMessage }}</pre>
  </div>
  <slot v-else />
</template>
`;
}

function vueLoadingSpinnerTemplate(): string {
  return `<script setup lang="ts">
/**
 * LoadingSpinner.vue — accessible loading indicator.
 */
defineProps<{ label?: string }>();
</script>

<template>
  <div role="status" :aria-label="label ?? 'Loading...'" class="loading-spinner">
    <span aria-hidden="true">⏳</span>
    <span class="sr-only">{{ label ?? 'Loading...' }}</span>
  </div>
</template>
`;
}

function vueUseFetchTemplate(): string {
  return `/**
 * useFetch.ts — generic data fetching composable.
 * DARE Frontend Design: all API calls isolated in composables.
 */
import { ref, watchEffect, type Ref } from 'vue';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

export function useFetch<T>(url: Ref<string | null>) {
  const status = ref<FetchStatus>('idle');
  const data = ref<T | null>(null);
  const error = ref<string | null>(null);

  watchEffect((onCleanup) => {
    if (!url.value) return;

    let cancelled = false;
    status.value = 'loading';
    error.value = null;

    fetch(url.value)
      .then((res) => {
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        return res.json() as Promise<T>;
      })
      .then((result) => {
        if (!cancelled) {
          data.value = result;
          status.value = 'success';
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          error.value = err instanceof Error ? err.message : String(err);
          status.value = 'error';
        }
      });

    onCleanup(() => { cancelled = true; });
  });

  return { status, data, error };
}
`;
}

function vueNotFoundPageTemplate(): string {
  return `<script setup lang="ts">
/**
 * NotFoundPage.vue — 404 page with error boundary.
 * DARE Frontend Design: each page wrapped in ErrorBoundary.
 */
import ErrorBoundary from '../components/ErrorBoundary.vue';
</script>

<template>
  <ErrorBoundary>
    <main role="main" style="text-align: center; padding: 2rem">
      <h1>404 — Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <a href="/">Go home</a>
    </main>
  </ErrorBoundary>
</template>
`;
}

function vueApiClientTemplate(): string {
  return `/**
 * API client — wraps fetch with auth headers.
 * DARE Frontend Design: centralized API layer.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(\`\${BASE_URL}\${path}\`, { headers: getHeaders() });
  if (!res.ok) throw new Error(\`GET \${path} failed: \${res.status}\`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(\`\${BASE_URL}\${path}\`, {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(\`POST \${path} failed: \${res.status}\`);
  return res.json() as Promise<T>;
}

function getHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('auth_token');
  return token ? { Authorization: \`Bearer \${token}\` } : {};
}
`;
}

function vueEndpointsTemplate(): string {
  return `/**
 * API endpoints — type-safe endpoint definitions.
 */
export const ENDPOINTS = {
  users: {
    list: '/users',
    detail: (id: string) => \`/users/\${id}\`,
  },
} as const;
`;
}

function vuePiniaStoreTemplate(projectName: string): string {
  return `/**
 * ${projectName} — Pinia store.
 * DARE Frontend Design: global state via stores.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const user = ref<{ id: string; name: string } | null>(null);

  function setUser(newUser: { id: string; name: string } | null) {
    user.value = newUser;
  }

  return { user, setUser };
});
`;
}

function vueTypesTemplate(): string {
  return `/**
 * Shared TypeScript types.
 */
export interface ApiError {
  status: number;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}
`;
}

function vueAppTemplate(projectName: string): string {
  return `<script setup lang="ts">
/**
 * ${projectName} — App.vue entry point.
 * DARE Frontend Design: router-view with error boundary.
 */
import ErrorBoundary from './components/ErrorBoundary.vue';
</script>

<template>
  <ErrorBoundary>
    <div id="app">
      <!-- RouterView here once Vue Router is set up -->
    </div>
  </ErrorBoundary>
</template>
`;
}
