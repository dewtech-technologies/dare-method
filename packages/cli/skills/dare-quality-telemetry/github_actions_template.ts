/**
 * dare-quality-telemetry — GitHub Actions workflow template
 * Provides the YAML template string for CI integration.
 * License: MIT
 */

/**
 * GitHub Actions workflow template for DARE metrics collection.
 * Copy this to .github/workflows/dare-metrics.yml in your project.
 */
export const GITHUB_ACTIONS_TEMPLATE = `# .github/workflows/dare-metrics.yml
name: DARE Metrics
on: [push, pull_request]
jobs:
  metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g @dewtech/dare-cli
      - run: dare metrics collect --skills dare-ax,dare-layered-design --output metrics.json
      - run: dare metrics validate metrics.json
`;
