# Design: `@civitas-cerebrum/test-coverage` redesign

**Date:** 2026-04-17
**Status:** Approved

## Goal

Three changes, in order of user-visibility:

1. **PR comment ordering** — classes with missing methods appear first in both `github-plain` and `github-table` formats, so reviewers see what's missing without scrolling or expanding a `<details>` block.
2. **Module split** — break the ~735-line `src/index.ts` into focused modules so each file has a single responsibility and is easier to reason about.
3. **Cleanup** — fix the wrong package name in footers, align threshold defaults across formatters, preserve the public API.

No runtime behavior changes beyond the ordering tweak. No breaking changes to the programmatic API. No changes to the CLI surface.

## Non-goals

- No new output formats.
- No changes to the analysis pipeline (program setup, API indexing, call detection, call graph).
- No changes to badge rendering, JSON shape, HTML template, or text output.
- No changes to `cli.ts` argument parsing.

## 1. PR comment ordering

### Current behavior

**`github-table`:**

```
## 📊 API Coverage Report
[badge]
| Category | Coverage | Missing Coverage ❌ | Covered Methods ✅ |
| :--- | :---: | :--- | :--- |
[rows sorted alphabetically by class name]
---
**Build Passed/Failed:** …
```

**`github-plain`:**

```
## 📊 API Coverage Report
[badge]
**Build Passed/Failed:** …
<details>
<summary>🔍 View Detailed Coverage Breakdown</summary>
[per-class lists sorted alphabetically]
</details>
```

The issue: classes with missing coverage are scattered through an alphabetical list. On a failing build the reviewer has to scan to find what's missing.

### New ordering rules

Both formats apply the same sort to the per-class groups:

1. **Primary:** classes with any uncovered methods come before fully-covered classes.
2. **Secondary (within uncovered group):** more uncovered methods first (descending count).
3. **Tertiary:** alphabetical by class name.

Within a single class, methods are sorted:

1. Uncovered methods first.
2. Alphabetical within each group.

### Nothing else changes

- Same badge.
- Same table columns in the same order.
- Same `<details>` wrapper for `github-plain`.
- Same status line text and position.
- Same footer.

## 2. Module split

Each file maps to a distinct concern. No file overlaps another in responsibility.

### Target layout

```
src/
  index.ts              # Public exports only
  cli.ts                # Unchanged
  reporter.ts           # ApiCoverageReporter — thin orchestrator
  program.ts            # createProgram + file classification helpers
  api-index.ts          # buildApiIndex + hasNonPublicModifier
  call-detection.ts     # extractTypedCalls
  call-graph.ts         # buildCallGraph + transitive closure
  types.ts              # Shared types
  formatters/
    index.ts            # dispatch by format name
    shared.ts           # groupByClass, renderShieldsBadge, renderStatus,
                        # sortClassesByMissingFirst
    pretty.ts           # (moved from pretty-output.ts)
    text.ts
    json.ts
    html.ts
    badge.ts
    github.ts           # plain + table (consume shared helpers)
```

### Module contracts

**`types.ts`**

```typescript
export interface ApiCoverageOptions { /* unchanged */ }
export interface CoverageResult {
  className: string;
  methodName: string;
  covered: boolean;
}
export type ApiIndex = Map<string, Set<string>>;
export type MethodKey = `${string}.${string}`;
export type OutputFormat =
  | 'text' | 'json' | 'html' | 'badge'
  | 'github' | 'github-plain' | 'github-table' | 'pretty';
```

**`program.ts`**

```typescript
export interface ProgramContext {
  program: ts.Program;
  rootDir: string;
  srcDir: string;
  testDir: string;
  ignorePaths: string[];
  debug: boolean;
}
export function createProgram(opts: {...}): ProgramContext;
export function isSourceFile(ctx: ProgramContext, filePath: string): boolean;
export function isTestFile(ctx: ProgramContext, filePath: string): boolean;
export function isIgnored(ctx: ProgramContext, filePath: string): boolean;
```

**`api-index.ts`**

```typescript
export function buildApiIndex(ctx: ProgramContext): ApiIndex;
```

**`call-detection.ts`**

```typescript
export function extractTypedCalls(
  nodeToScan: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  apiIndex: ApiIndex,
  debug: boolean,
): Set<MethodKey>;
```

**`call-graph.ts`**

```typescript
export function buildCallGraph(
  ctx: ProgramContext,
  checker: ts.TypeChecker,
  apiIndex: ApiIndex,
): Map<MethodKey, Set<MethodKey>>;

export function resolveTransitiveCalls(
  directlyCalled: Set<MethodKey>,
  callGraph: Map<MethodKey, Set<MethodKey>>,
): Set<MethodKey>;
```

**`formatters/index.ts`**

```typescript
export interface FormatterOptions {
  threshold: number;
  rootDir: string;
}
export interface FormatterResult {
  output: string;
  writePath?: string; // absolute path to write output to
}
export type Formatter = (results: CoverageResult[], opts: FormatterOptions) => FormatterResult;

export function getFormatter(format: OutputFormat): Formatter;
```

Each formatter file exports a `Formatter`-shaped function. The reporter writes `writePath` to disk (if provided) and prints `output` (to stdout, or to `GITHUB_STEP_SUMMARY` for github formats). No formatter writes to disk or reads env vars itself — the reporter decides.

**`reporter.ts`**

```typescript
export class ApiCoverageReporter {
  constructor(options?: ApiCoverageOptions);
  runCoverageReport(): Promise<boolean>;
}
```

Orchestrates:
1. Build program context
2. Build API index
3. Build call graph
4. Scan test files for direct calls
5. Resolve transitive closure
6. Compute pass/fail against threshold
7. Dispatch to formatter, write output

Target size: ~80 lines.

**`index.ts` (public surface)**

```typescript
export { ApiCoverageReporter } from './reporter';
export type { ApiCoverageOptions, CoverageResult } from './types';
export { generateGithubPlainComment, generateGithubTableComment } from './formatters/github';
```

The two `generateGithub*` functions keep their current signatures so programmatic consumers don't break.

## 3. Cleanup

- **Footer text** — change `@civitas-cerebrum/api-coverage` → `@civitas-cerebrum/test-coverage` in both `github-plain` and `github-table`.
- **Threshold default alignment** — `generateGithubPlainComment` defaults to `threshold = 100` (was 80), matching `generateGithubTableComment` and the reporter.
- **Shared formatter helpers (`formatters/shared.ts`)** — the current code duplicates the same logic across multiple formatters. Extract once and reuse:
  - `groupByClass(results)` — currently re-implemented 5 times (text path in reporter, html path in reporter, pretty, github-plain, github-table).
  - `renderShieldsBadge(pct, passed)` — currently duplicated in github-plain and github-table.
  - `renderStatus(pct, threshold, passed, style)` — pass/fail line; `style` picks terse vs emoji variant used by the two github formats.
  - `sortClassesByMissingFirst(grouped)` — the section 1 ordering rule, applied identically by both github formats. Non-github formats (text, pretty, html) keep their existing alphabetical order; the ordering change is intentionally scoped to PR comments.
- **Version bump** — `0.0.8` → `0.1.0`. Internal refactor, threshold default change is a behavior fix but changes the default for one edge case (programmatic callers of `generateGithubPlainComment` without an explicit threshold). Minor bump signals the internal restructure without claiming breaking.

## Testing

The existing `tests/index.test.ts` and fixtures continue to pass unchanged — they exercise the public API (`ApiCoverageReporter.runCoverageReport`, the exported helpers), which is preserved.

New assertions to add:
- Ordering test: given a mixed results array, `generateGithubPlainComment` and `generateGithubTableComment` produce output where uncovered classes precede covered ones.
- Threshold-default test: `generateGithubPlainComment(results)` (no options) uses threshold 100.
- Footer test: both comment generators include `@civitas-cerebrum/test-coverage`.

## Risks

- **TypeScript compiler API coupling** — splitting the AST-walking code across three files (`api-index.ts`, `call-detection.ts`, `call-graph.ts`) adds import surface but keeps each walker self-contained. Existing integration tests catch regressions in the analysis pipeline.
- **Programmatic consumer breakage** — the two `generateGithub*` helpers are the only public API beyond the reporter class. Keeping their signatures and re-exporting from `index.ts` preserves the contract. Only observable change: `generateGithubPlainComment` without explicit threshold now defaults to 100 instead of 80.

## Out of scope

- Rewriting `pretty-output.ts` internals (only moved, not rewritten).
- Adding new formats, new flags, or new config options.
- Changing how classes or methods are discovered.
