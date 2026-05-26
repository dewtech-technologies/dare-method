/**
 * dare-frontend-design — Metrics collector
 * Evaluates M-01 to M-04 for the dare-frontend-design skill.
 * License: MIT
 */

import type { MetricResult, FrontendMetricsInput } from './types.js';

export function collectFrontendMetrics(input: FrontendMetricsInput): MetricResult[] {
  return [
    checkM01(input),
    checkM02(input),
    checkM03(input),
    checkM04(input),
  ];
}

/**
 * M-01: 0 components > 300 lines.
 */
function checkM01(input: FrontendMetricsInput): MetricResult {
  const pass = input.largeComponentCount === 0;

  return {
    id: 'M-01',
    pass,
    description: '100% of components < 300 lines',
    detail: pass
      ? `All ${input.totalComponentsChecked} component(s) within size limit`
      : `${input.largeComponentCount}/${input.totalComponentsChecked} component(s) exceed 300 lines — split into smaller components`,
  };
}

/**
 * M-02: 0 fetch() calls inline in JSX/template.
 */
function checkM02(input: FrontendMetricsInput): MetricResult {
  const pass = input.inlineFetchCount === 0;

  return {
    id: 'M-02',
    pass,
    description: '0 fetch() calls inline in JSX/template',
    detail: pass
      ? 'All API calls are in custom hooks/composables'
      : `${input.inlineFetchCount} inline fetch() call(s) detected — move to useXxx hook or composable`,
  };
}

/**
 * M-03: 100% of pages have error boundaries.
 */
function checkM03(input: FrontendMetricsInput): MetricResult {
  const pass = input.totalPages === 0 || input.pagesWithErrorBoundary === input.totalPages;

  return {
    id: 'M-03',
    pass,
    description: '100% of pages have error boundary',
    detail: input.totalPages === 0
      ? 'No pages found'
      : pass
        ? `All ${input.totalPages} page(s) have error boundaries`
        : `${input.totalPages - input.pagesWithErrorBoundary} page(s) missing error boundary`,
  };
}

/**
 * M-04: Bundle config (vite.config.ts / webpack.config.js / etc.) exists.
 */
function checkM04(input: FrontendMetricsInput): MetricResult {
  const pass = input.bundleConfigExists;

  return {
    id: 'M-04',
    pass,
    description: 'Bundle config exists (for size monitoring)',
    detail: pass
      ? 'Bundle configuration found'
      : 'No bundle config detected — add vite.config.ts or webpack.config.js to monitor bundle size',
  };
}
