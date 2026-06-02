// SPDX-License-Identifier: MIT
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `templates/` holds files that are SHIPPED to generated projects — they
    // are not part of the CLI's own test suite. Their *.test.ts / *.spec.ts
    // files (e.g. MCP echo tests) depend on packages installed in the
    // generated project (zod, the MCP SDK), not in the CLI workspace.
    // Exclude them so `vitest run` only collects the CLI's own tests.
    exclude: ['**/node_modules/**', '**/dist/**', 'templates/**'],
  },
});
