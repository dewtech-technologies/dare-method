export interface FixtureResult {
  readonly id: string;
  readonly stack: string;
  readonly fixRate: number;
  readonly passToPassRegressed: boolean;
  readonly solved: boolean;
  readonly failToPass: { readonly passed: number; readonly total: number };
  readonly passToPass: { readonly passed: number; readonly total: number };
  readonly durationMs: number;
}

export interface BenchReport {
  readonly schemaVersion: 1;
  readonly ranAt: string;
  readonly suite: string;
  readonly totals: {
    readonly fixtures: number;
    readonly solved: number;
    readonly solveRate: number;
  };
  readonly results: ReadonlyArray<FixtureResult>;
  readonly regression?: {
    readonly baselineSolveRate: number;
    readonly deltaPp: number;
    readonly failed: boolean;
  };
}

export interface RawFixtureCounts {
  readonly id: string;
  readonly stack: string;
  readonly failToPass: { readonly passed: number; readonly total: number };
  readonly passToPass: { readonly passed: number; readonly total: number };
  readonly durationMs: number;
}

export function computeFixtureResult(raw: RawFixtureCounts): FixtureResult {
  const passToPassRegressed = raw.passToPass.passed < raw.passToPass.total;
  const fixRate = passToPassRegressed
    ? 0
    : raw.failToPass.total === 0
      ? 1
      : raw.failToPass.passed / raw.failToPass.total;
  const solved = fixRate === 1 && !passToPassRegressed;

  return {
    id: raw.id,
    stack: raw.stack,
    fixRate,
    passToPassRegressed,
    solved,
    failToPass: raw.failToPass,
    passToPass: raw.passToPass,
    durationMs: raw.durationMs,
  };
}

export function buildReport(
  results: ReadonlyArray<FixtureResult>,
  opts: {
    readonly suite: string;
    readonly baseline?: BenchReport;
    readonly failOnRegressionPp?: number;
    readonly ranAt?: string;
  },
): BenchReport {
  const solved = results.filter((r) => r.solved).length;
  const solveRate = results.length === 0 ? 0 : solved / results.length;

  const regression = opts.baseline
    ? (() => {
        const deltaPp = (solveRate - opts.baseline!.totals.solveRate) * 100;
        const threshold = opts.failOnRegressionPp ?? 3;
        return {
          baselineSolveRate: opts.baseline!.totals.solveRate,
          deltaPp,
          failed: -deltaPp > threshold,
        };
      })()
    : undefined;

  return {
    schemaVersion: 1,
    ranAt: opts.ranAt ?? new Date().toISOString(),
    suite: opts.suite,
    totals: {
      fixtures: results.length,
      solved,
      solveRate,
    },
    results: [...results],
    regression,
  };
}
