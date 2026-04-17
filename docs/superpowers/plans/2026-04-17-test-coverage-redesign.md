# test-coverage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder github PR comments so missing coverage appears first, split the 735-line `src/index.ts` into single-concern modules, and dedupe formatter helpers.

**Architecture:** Refactor first (preserve all behavior under existing integration tests), then layer in the ordering change and cleanup. The module split mirrors the concern boundaries in the design doc. Shared formatter helpers live in `src/formatters/shared.ts` and are the single source of truth for grouping, badge URLs, status lines, and ordering.

**Tech Stack:** TypeScript 5, Jest 29 + ts-jest, glob 10, Node 20.

**Spec:** `docs/superpowers/specs/2026-04-17-test-coverage-redesign-design.md`

---

## Ground rules

- After every task, run the full suite: `npm test`. All existing tests must pass.
- Commit after every task with a Conventional Commits prefix (`refactor:`, `feat:`, `fix:`, `chore:`).
- Never commit with tests red. If a task gets partway through and tests are red, continue to the end of that task before committing.
- When moving code between files: copy first, delete from the original in the same commit, update imports. Do not leave dead duplicates.

---

## Task 1: Extract shared types into `src/types.ts`

**Files:**
- Create: `src/types.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface ApiCoverageOptions {
  rootDir?: string;
  srcDir?: string;
  testDir?: string;
  ignorePaths?: string[];
  outputFormat?: OutputFormat;
  debug?: boolean;
  threshold?: number;
}

export type OutputFormat =
  | 'text'
  | 'json'
  | 'html'
  | 'badge'
  | 'github'
  | 'github-plain'
  | 'github-table'
  | 'pretty';

export interface CoverageResult {
  className: string;
  methodName: string;
  covered: boolean;
}

export type ApiIndex = Map<string, Set<string>>;

export type MethodKey = `${string}.${string}`;
```

- [ ] **Step 2: Import from `src/types.ts` in `src/index.ts`**

At the top of `src/index.ts`, replace the inline `ApiCoverageOptions` interface and the `ApiIndex`, `MethodKey`, `CoverageResult` type aliases with:

```typescript
import {
  ApiCoverageOptions,
  ApiIndex,
  CoverageResult,
  MethodKey,
  OutputFormat,
} from './types';
```

Delete the original inline definitions (lines 7-24 of the current `src/index.ts`). Update the class field `private outputFormat?: OutputFormat;` to use the imported type.

- [ ] **Step 3: Re-export public types from `src/index.ts`**

At the bottom of `src/index.ts` (after the class), add:

```typescript
export type { ApiCoverageOptions, CoverageResult } from './types';
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/index.ts
git commit -m "refactor: extract shared types to src/types.ts"
```

---

## Task 2: Extract program setup into `src/program.ts`

**Files:**
- Create: `src/program.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/program.ts`**

```typescript
import * as path from 'path';
import * as ts from 'typescript';
import * as glob from 'glob';

export interface ProgramContext {
  program: ts.Program;
  rootDir: string;
  srcDir: string;
  testDir: string;
  ignorePaths: string[];
  debug: boolean;
}

export interface ProgramOptions {
  rootDir: string;
  srcDir: string;
  testDir: string;
  ignorePaths: string[];
  debug: boolean;
}

export function createProgram(opts: ProgramOptions): ProgramContext {
  const configPath = ts.findConfigFile(opts.rootDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    throw new Error('tsconfig.json not found in project root');
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

  const testGlob = path.join(opts.testDir, '**/*.{spec,test}.ts').replace(/\\/g, '/');
  const testFiles = glob.sync(testGlob);

  const allFiles = Array.from(new Set([...parsed.fileNames, ...testFiles]));

  if (opts.debug) {
    console.log(`[debug] source files from tsconfig: ${parsed.fileNames.length}`);
    console.log(`[debug] test files found by glob: ${testFiles.length}`);
    console.log(`[debug] total files in program: ${allFiles.length}`);
  }

  const program = ts.createProgram({
    rootNames: allFiles,
    options: parsed.options,
  });

  return { program, ...opts };
}

export function isIgnored(ctx: ProgramContext, filePath: string): boolean {
  return ctx.ignorePaths.some(p => filePath.includes(p));
}

export function isTestFile(ctx: ProgramContext, filePath: string): boolean {
  const normalised = filePath.replace(/\\/g, '/');
  const relToTestDir = path.relative(ctx.testDir, filePath);

  const result =
    (!relToTestDir.startsWith('..') && !path.isAbsolute(relToTestDir)) ||
    normalised.endsWith('.spec.ts') ||
    normalised.endsWith('.test.ts') ||
    normalised.includes('.spec.') ||
    normalised.includes('.test.');

  if (ctx.debug && result) {
    console.log(`[debug] test file: ${filePath}`);
  }

  return result;
}

export function isSourceFile(ctx: ProgramContext, filePath: string): boolean {
  const rel = path.relative(ctx.srcDir, filePath);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && !isTestFile(ctx, filePath);
}
```

- [ ] **Step 2: Update `src/index.ts` to use `program.ts`**

At the top of `src/index.ts`, add:

```typescript
import { createProgram, isIgnored, isSourceFile, isTestFile, ProgramContext } from './program';
```

In the `ApiCoverageReporter` class:
- Delete the private method `createProgram()` (currently lines 48-81).
- Delete the private methods `isIgnored`, `isTestFile`, `isSourceFile` (currently lines 86-111).
- Store a `private ctx!: ProgramContext;` field.
- In `runCoverageReport`, replace `const program = this.createProgram();` with:

```typescript
this.ctx = createProgram({
  rootDir: this.rootDir,
  srcDir: this.srcDir,
  testDir: this.testDir,
  ignorePaths: this.ignorePaths,
  debug: this.debug,
});
const program = this.ctx.program;
```

- Anywhere the class calls `this.isIgnored(filePath)`, replace with `isIgnored(this.ctx, filePath)`. Same substitution for `isTestFile` and `isSourceFile`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/program.ts src/index.ts
git commit -m "refactor: extract program setup into src/program.ts"
```

---

## Task 3: Extract API index into `src/api-index.ts`

**Files:**
- Create: `src/api-index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/api-index.ts`**

```typescript
import * as ts from 'typescript';
import { isIgnored, isSourceFile, ProgramContext } from './program';
import { ApiIndex } from './types';

export function buildApiIndex(ctx: ProgramContext): ApiIndex {
  const apiIndex: ApiIndex = new Map();

  for (const sourceFile of ctx.program.getSourceFiles()) {
    const filePath = sourceFile.fileName;

    if (sourceFile.isDeclarationFile) continue;
    if (!isSourceFile(ctx, filePath)) continue;
    if (isIgnored(ctx, filePath)) continue;

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const isExported = node.modifiers?.some(
          m => m.kind === ts.SyntaxKind.ExportKeyword,
        );

        if (!isExported) return;

        const className = node.name.text;
        const methods = new Set<string>();

        node.members.forEach(member => {
          let methodName: string | null = null;

          if (ts.isMethodDeclaration(member) && member.name) {
            methodName = member.name.getText(sourceFile);
          }

          if (
            ts.isPropertyDeclaration(member) &&
            member.name &&
            member.initializer &&
            ts.isArrowFunction(member.initializer)
          ) {
            methodName = member.name.getText(sourceFile);
          }

          if (!methodName) return;

          const isPrivate = hasNonPublicModifier(member);
          const isConstructor = methodName === 'constructor';
          const isInternal = methodName.startsWith('_');

          if (!isPrivate && !isConstructor && !isInternal) {
            methods.add(methodName);
          }
        });

        if (methods.size > 0) {
          apiIndex.set(className, methods);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (ctx.debug) {
    console.log(`[debug] API index built: ${apiIndex.size} classes`);
    apiIndex.forEach((methods, cls) =>
      console.log(`[debug]   ${cls}: [${[...methods].join(', ')}]`),
    );
  }

  return apiIndex;
}

function hasNonPublicModifier(member: ts.ClassElement): boolean {
  if (
    ts.isMethodDeclaration(member) ||
    ts.isPropertyDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member)
  ) {
    return !!member.modifiers?.some(
      m =>
        m.kind === ts.SyntaxKind.PrivateKeyword ||
        m.kind === ts.SyntaxKind.ProtectedKeyword,
    );
  }

  return false;
}
```

- [ ] **Step 2: Update `src/index.ts`**

At the top, add:

```typescript
import { buildApiIndex } from './api-index';
```

Delete the private `buildApiIndex` method and the private `hasNonPublicModifier` method from the class (currently lines 116-201).

In `runCoverageReport`, replace `const apiIndex = this.buildApiIndex(program);` with `const apiIndex = buildApiIndex(this.ctx);`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/api-index.ts src/index.ts
git commit -m "refactor: extract API index into src/api-index.ts"
```

---

## Task 4: Extract call detection into `src/call-detection.ts`

**Files:**
- Create: `src/call-detection.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/call-detection.ts`**

```typescript
import * as ts from 'typescript';
import { ApiIndex, MethodKey } from './types';

export function extractTypedCalls(
  nodeToScan: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  apiIndex: ApiIndex,
  debug: boolean,
): Set<MethodKey> {
  const calls = new Set<MethodKey>();

  const tryMatchClass = (className: string, methodName: string): boolean => {
    if (apiIndex.has(className) && apiIndex.get(className)!.has(methodName)) {
      calls.add(`${className}.${methodName}` as MethodKey);
      return true;
    }
    return false;
  };

  const matchTypeHierarchy = (type: ts.Type, methodName: string): boolean => {
    const symbol = checker.getApparentType(type).getSymbol();
    if (!symbol) return false;

    for (const decl of symbol.getDeclarations() ?? []) {
      if (ts.isClassDeclaration(decl) && decl.name) {
        if (tryMatchClass(decl.name.text, methodName)) return true;
      }
    }

    if (type.isClassOrInterface()) {
      for (const base of checker.getBaseTypes(type as ts.InterfaceType)) {
        if (matchTypeHierarchy(base, methodName)) return true;
      }
    }

    return false;
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.getText().replace(/['"]/g, '');

        const signature = checker.getResolvedSignature(node);
        const decl = signature?.getDeclaration();

        if (decl && ts.isMethodDeclaration(decl)) {
          const parent = decl.parent;
          if (ts.isClassDeclaration(parent) && parent.name) {
            if (tryMatchClass(parent.name.text, methodName)) {
              ts.forEachChild(node, visit);
              return;
            }
          }
        }

        const obj = node.expression.expression;
        const type = checker.getTypeAtLocation(obj);

        if (matchTypeHierarchy(type, methodName)) {
          ts.forEachChild(node, visit);
          return;
        }

        for (const [className, methods] of apiIndex.entries()) {
          if (methods.has(methodName)) {
            if (debug) {
              console.log(
                `[debug] name-only match: ${className}.${methodName} in ${sourceFile.fileName}`,
              );
            }
            calls.add(`${className}.${methodName}` as MethodKey);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(nodeToScan);
  return calls;
}
```

- [ ] **Step 2: Update `src/index.ts`**

At the top, add:

```typescript
import { extractTypedCalls } from './call-detection';
```

Delete the private `extractTypedCalls` method from the class (currently lines 206-285).

Update callsites inside the class — the method is called from `buildCallGraph` (inside class) and from `runCoverageReport`. Both become:

```typescript
extractTypedCalls(nodeToScan, sourceFile, checker, apiIndex, this.debug)
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/call-detection.ts src/index.ts
git commit -m "refactor: extract call detection into src/call-detection.ts"
```

---

## Task 5: Extract call graph into `src/call-graph.ts`

**Files:**
- Create: `src/call-graph.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/call-graph.ts`**

```typescript
import * as ts from 'typescript';
import { extractTypedCalls } from './call-detection';
import { isIgnored, isSourceFile, ProgramContext } from './program';
import { ApiIndex, MethodKey } from './types';

export function buildCallGraph(
  ctx: ProgramContext,
  checker: ts.TypeChecker,
  apiIndex: ApiIndex,
): Map<MethodKey, Set<MethodKey>> {
  const callGraph = new Map<MethodKey, Set<MethodKey>>();

  apiIndex.forEach((methods, className) => {
    methods.forEach(m => callGraph.set(`${className}.${m}` as MethodKey, new Set()));
  });

  for (const sourceFile of ctx.program.getSourceFiles()) {
    const filePath = sourceFile.fileName;

    if (sourceFile.isDeclarationFile) continue;
    if (!isSourceFile(ctx, filePath)) continue;
    if (isIgnored(ctx, filePath)) continue;

    const visit = (node: ts.Node) => {
      let currentMethodKey: MethodKey | null = null;

      if (
        ts.isMethodDeclaration(node) &&
        node.name &&
        node.parent &&
        ts.isClassDeclaration(node.parent) &&
        node.parent.name
      ) {
        const className = node.parent.name.text;
        const methodName = node.name.getText(sourceFile);
        if (apiIndex.has(className) && apiIndex.get(className)!.has(methodName)) {
          currentMethodKey = `${className}.${methodName}` as MethodKey;
        }
      } else if (
        ts.isPropertyDeclaration(node) &&
        node.initializer &&
        ts.isArrowFunction(node.initializer) &&
        node.name &&
        node.parent &&
        ts.isClassDeclaration(node.parent) &&
        node.parent.name
      ) {
        const className = node.parent.name.text;
        const methodName = node.name.getText(sourceFile);
        if (apiIndex.has(className) && apiIndex.get(className)!.has(methodName)) {
          currentMethodKey = `${className}.${methodName}` as MethodKey;
        }
      }

      if (currentMethodKey) {
        const internalCalls = extractTypedCalls(node, sourceFile, checker, apiIndex, ctx.debug);

        const edges = callGraph.get(currentMethodKey)!;
        internalCalls.forEach(call => {
          if (call !== currentMethodKey) {
            edges.add(call);
          }
        });

        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  if (ctx.debug) {
    console.log(`[debug] Internal call graph built. Ready for transitive resolution.`);
  }

  return callGraph;
}

export function resolveTransitiveCalls(
  directlyCalled: Set<MethodKey>,
  callGraph: Map<MethodKey, Set<MethodKey>>,
): Set<MethodKey> {
  const called = new Set(directlyCalled);
  const queue = Array.from(directlyCalled);

  while (queue.length > 0) {
    const currentMethod = queue.shift()!;
    const deps = callGraph.get(currentMethod);
    if (!deps) continue;
    for (const dep of deps) {
      if (!called.has(dep)) {
        called.add(dep);
        queue.push(dep);
      }
    }
  }

  return called;
}
```

- [ ] **Step 2: Update `src/index.ts`**

At the top, add:

```typescript
import { buildCallGraph, resolveTransitiveCalls } from './call-graph';
```

Delete the private `buildCallGraph` method from the class (currently lines 290-356).

In `runCoverageReport`, replace `const callGraph = this.buildCallGraph(program, checker, apiIndex);` with:

```typescript
const callGraph = buildCallGraph(this.ctx, checker, apiIndex);
```

Replace the in-class BFS loop (currently lines 404-419) with:

```typescript
const calledMethods = resolveTransitiveCalls(directlyCalled, callGraph);
```

Rename the local variable that holds direct-from-test calls to `directlyCalled` (it was previously `calledMethods` used for both direct and transitive). The rewrite in Task 10 keeps this name.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/call-graph.ts src/index.ts
git commit -m "refactor: extract call graph into src/call-graph.ts"
```

---

## Task 6: Move `pretty-output.ts` to `src/formatters/pretty.ts`

**Files:**
- Delete: `src/pretty-output.ts`
- Create: `src/formatters/pretty.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/formatters/` directory and move the file**

```bash
mkdir -p src/formatters
git mv src/pretty-output.ts src/formatters/pretty.ts
```

- [ ] **Step 2: Update the local `CoverageResult` import in the moved file**

Open `src/formatters/pretty.ts`. Replace the inline `CoverageResult` interface (currently lines 11-15) with:

```typescript
import { CoverageResult } from '../types';
```

Rename the exported function from `prettyOutput` to `formatPretty` for consistency with later formatter files, and export a `console.log` caller wrapper so the reporter keeps its one-line dispatch.

Replace the end of `src/formatters/pretty.ts` so it reads:

```typescript
export function formatPretty(results: CoverageResult[]): void {
  // existing body unchanged
  ...
  console.log(lines.join('\n'));
}
```

- [ ] **Step 3: Update the import in `src/index.ts`**

Change:

```typescript
import { prettyOutput } from './pretty-output';
```

to:

```typescript
import { formatPretty } from './formatters/pretty';
```

Change the single call `prettyOutput(results);` inside `runCoverageReport` to `formatPretty(results);`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/formatters/pretty.ts src/index.ts
git commit -m "refactor: move pretty-output to src/formatters/pretty.ts"
```

---

## Task 7: Add `src/formatters/shared.ts` with pure helpers and unit tests

**Files:**
- Create: `src/formatters/shared.ts`
- Create: `tests/formatters-shared.test.ts`

This is the only task that adds genuinely new logic (helpers extracted from duplicated inline code). TDD applies.

- [ ] **Step 1: Write the failing test file**

Create `tests/formatters-shared.test.ts`:

```typescript
import {
  groupByClass,
  renderShieldsBadge,
  renderStatus,
  sortClassesByMissingFirst,
} from '../src/formatters/shared';
import { CoverageResult } from '../src/types';

describe('groupByClass', () => {
  it('groups results by className preserving order', () => {
    const results: CoverageResult[] = [
      { className: 'A', methodName: 'x', covered: true },
      { className: 'B', methodName: 'y', covered: false },
      { className: 'A', methodName: 'z', covered: false },
    ];
    const grouped = groupByClass(results);
    expect(Object.keys(grouped).sort()).toEqual(['A', 'B']);
    expect(grouped.A).toHaveLength(2);
    expect(grouped.B).toHaveLength(1);
  });
});

describe('renderShieldsBadge', () => {
  it('renders a brightgreen badge when passed', () => {
    const md = renderShieldsBadge(100, true);
    expect(md).toContain('brightgreen');
    expect(md).toContain('100.0%25');
  });
  it('renders a yellow badge when failing but >= 60%', () => {
    expect(renderShieldsBadge(75, false)).toContain('yellow');
  });
  it('renders a red badge when failing and < 60%', () => {
    expect(renderShieldsBadge(40, false)).toContain('red');
  });
});

describe('renderStatus', () => {
  it('renders the passing variant with percentage', () => {
    expect(renderStatus(100, 100, true, 'emoji')).toMatch(/Passed/);
    expect(renderStatus(100, 100, true, 'emoji')).toMatch(/100\.0%/);
  });
  it('renders the failing variant with threshold', () => {
    const out = renderStatus(50, 80, false, 'emoji');
    expect(out).toMatch(/Failed/);
    expect(out).toMatch(/80%/);
  });
  it('supports a plain (no-emoji) variant', () => {
    const plain = renderStatus(100, 100, true, 'plain');
    expect(plain).not.toMatch(/🎉|❌/);
  });
});

describe('sortClassesByMissingFirst', () => {
  it('puts classes with the most missing methods first', () => {
    const grouped: Record<string, CoverageResult[]> = {
      AllCovered: [{ className: 'AllCovered', methodName: 'a', covered: true }],
      OneMissing: [
        { className: 'OneMissing', methodName: 'a', covered: true },
        { className: 'OneMissing', methodName: 'b', covered: false },
      ],
      TwoMissing: [
        { className: 'TwoMissing', methodName: 'a', covered: false },
        { className: 'TwoMissing', methodName: 'b', covered: false },
      ],
    };
    expect(sortClassesByMissingFirst(grouped)).toEqual([
      'TwoMissing',
      'OneMissing',
      'AllCovered',
    ]);
  });

  it('breaks ties alphabetically', () => {
    const grouped: Record<string, CoverageResult[]> = {
      Bravo: [{ className: 'Bravo', methodName: 'a', covered: false }],
      Alpha: [{ className: 'Alpha', methodName: 'a', covered: false }],
    };
    expect(sortClassesByMissingFirst(grouped)).toEqual(['Alpha', 'Bravo']);
  });
});
```

- [ ] **Step 2: Verify the tests fail (module does not exist)**

Run: `npm test -- tests/formatters-shared.test.ts`
Expected: FAIL — "Cannot find module '../src/formatters/shared'".

- [ ] **Step 3: Create `src/formatters/shared.ts` with the minimum to make tests pass**

```typescript
import { CoverageResult } from '../types';

export type GroupedResults = Record<string, CoverageResult[]>;

export function groupByClass(results: CoverageResult[]): GroupedResults {
  return results.reduce<GroupedResults>((acc, r) => {
    (acc[r.className] ??= []).push(r);
    return acc;
  }, {});
}

export function renderShieldsBadge(pct: number, passed: boolean): string {
  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  return `![API Coverage](https://img.shields.io/badge/API%20Coverage-${pct.toFixed(1)}%25-${color})`;
}

export type StatusStyle = 'plain' | 'emoji';

export function renderStatus(
  pct: number,
  threshold: number,
  passed: boolean,
  style: StatusStyle,
): string {
  if (style === 'emoji') {
    return passed
      ? `**Build Passed:** 🎉 ${pct.toFixed(1)}% API Coverage`
      : `**Build Failed:** ❌ Coverage ${pct.toFixed(1)}% is below the required threshold of ${threshold}%`;
  }
  return passed
    ? `Build Passed: ${pct.toFixed(0)}% API Coverage!`
    : `Build Failed: coverage ${pct.toFixed(1)}% is below threshold ${threshold}%`;
}

export function sortClassesByMissingFirst(grouped: GroupedResults): string[] {
  const missingCount = (cls: string) => grouped[cls].filter(m => !m.covered).length;

  return Object.keys(grouped).sort((a, b) => {
    const ma = missingCount(a);
    const mb = missingCount(b);
    if (ma !== mb) return mb - ma; // more missing first
    return a.localeCompare(b);
  });
}
```

- [ ] **Step 4: Run the helper tests and the full suite**

Run: `npm test`
Expected: all tests pass (new helper tests + existing integration tests).

- [ ] **Step 5: Commit**

```bash
git add src/formatters/shared.ts tests/formatters-shared.test.ts
git commit -m "feat: add formatters/shared helpers with unit tests"
```

---

## Task 8: Extract github formatters into `src/formatters/github.ts`, wire through shared helpers, and preserve current behavior

**Files:**
- Create: `src/formatters/github.ts`
- Create: `tests/formatters-github.test.ts`
- Modify: `src/index.ts`

This task moves the two `generateGithub*` functions out of `index.ts` and reroutes them through `formatters/shared.ts`. No behavior change yet — the ordering tweak is Task 10.

- [ ] **Step 1: Write a baseline regression test that locks in current output structure**

Create `tests/formatters-github.test.ts`:

```typescript
import {
  generateGithubPlainComment,
  generateGithubTableComment,
} from '../src/formatters/github';
import { CoverageResult } from '../src/types';

const results: CoverageResult[] = [
  { className: 'Alpha', methodName: 'covered', covered: true },
  { className: 'Alpha', methodName: 'uncovered', covered: false },
  { className: 'Bravo', methodName: 'only', covered: true },
];

describe('generateGithubPlainComment', () => {
  it('contains a shields.io badge', () => {
    expect(generateGithubPlainComment(results, { threshold: 100 })).toContain(
      'img.shields.io/badge/API%20Coverage',
    );
  });
  it('contains a collapsible details section', () => {
    const out = generateGithubPlainComment(results, { threshold: 100 });
    expect(out).toContain('<details>');
    expect(out).toContain('</details>');
  });
});

describe('generateGithubTableComment', () => {
  it('contains the table header', () => {
    const out = generateGithubTableComment(results, { threshold: 100 });
    expect(out).toContain('| Category | Coverage | Missing Coverage');
  });
  it('contains every class name', () => {
    const out = generateGithubTableComment(results, { threshold: 100 });
    expect(out).toContain('Alpha');
    expect(out).toContain('Bravo');
  });
});
```

- [ ] **Step 2: Verify the tests fail (module does not exist)**

Run: `npm test -- tests/formatters-github.test.ts`
Expected: FAIL — "Cannot find module '../src/formatters/github'".

- [ ] **Step 3: Create `src/formatters/github.ts`**

Take the two functions `generateGithubPlainComment` and `generateGithubTableComment` from the end of `src/index.ts`. Put them in `src/formatters/github.ts`, replacing their inline badge/group/status logic with calls to the shared helpers.

```typescript
import { CoverageResult } from '../types';
import {
  groupByClass,
  renderShieldsBadge,
  renderStatus,
} from './shared';

export function generateGithubPlainComment(
  results: CoverageResult[],
  options: { threshold?: number } = {},
): string {
  const { threshold = 100 } = options;

  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const badge = renderShieldsBadge(pct, passed);
  const grouped = groupByClass(results);

  const classLines = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    const methodLines = methods
      .map(m => `  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`)
      .join('\n');
    return `**${cls}: ${clsCovered}/${methods.length}**\n${methodLines}`;
  }).join('\n\n');

  const status = renderStatus(pct, threshold, passed, 'plain');

  return [
    ``,
    `## 📊 API Coverage Report`,
    `\n`,
    `${badge}`,
    `\n`,
    `${status}`,
    `\n`,
    `<details>`,
    `<summary>🔍 View Detailed Coverage Breakdown</summary>`,
    `\n`,
    classLines,
    `\n`,
    `<sub>Plain report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
    `</details>`,
  ].join('\n');
}

export function generateGithubTableComment(
  results: CoverageResult[],
  options: { threshold?: number } = {},
): string {
  const { threshold = 100 } = options;

  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const badge = renderShieldsBadge(pct, passed);
  const grouped = groupByClass(results);

  const tableRows = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const coveredMethods = methods.filter(m => m.covered).map(m => `\`${m.methodName}\``);
    const uncoveredMethods = methods.filter(m => !m.covered).map(m => `\`${m.methodName}\``);
    return `| **${cls}** | ${coveredMethods.length}/${methods.length} | ${uncoveredMethods.join(', ')} | ${coveredMethods.join(', ')} |`;
  }).join('\n');

  const status = renderStatus(pct, threshold, passed, 'emoji');

  return [
    ``,
    `## 📊 API Coverage Report`,
    `\n`,
    `${badge}`,
    `\n`,
    `| Category | Coverage | Missing Coverage ❌ | Covered Methods ✅ |`,
    `| :--- | :---: | :--- | :--- |`,
    tableRows,
    `\n`,
    `---`,
    `${status}`,
    `\n`,
    `<sub>Table report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
  ].join('\n');
}
```

Note: the threshold default in `generateGithubPlainComment` is now `100` (was `80`). This matches the spec. The footer text still reads `@civitas-cerebrum/api-coverage` — Task 11 fixes that.

- [ ] **Step 4: Update `src/index.ts`**

Remove the two `export function generateGithub*` definitions from the bottom of `src/index.ts` (currently lines 634-735).

At the top of `src/index.ts`, add:

```typescript
import {
  generateGithubPlainComment,
  generateGithubTableComment,
} from './formatters/github';
```

Re-export them at the bottom:

```typescript
export { generateGithubPlainComment, generateGithubTableComment } from './formatters/github';
```

The github branches inside `runCoverageReport` (currently lines 575-589) stay the same — they already call these functions by name.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass (new github regression tests + existing integration tests).

- [ ] **Step 6: Commit**

```bash
git add src/formatters/github.ts src/index.ts tests/formatters-github.test.ts
git commit -m "refactor: extract github formatters and route through shared helpers"
```

---

## Task 9: Extract simple formatters (text, json, badge, html) and add the dispatcher

**Files:**
- Create: `src/formatters/text.ts`
- Create: `src/formatters/json.ts`
- Create: `src/formatters/badge.ts`
- Create: `src/formatters/html.ts`
- Create: `src/formatters/index.ts`
- Modify: `src/index.ts`

The current `runCoverageReport` has inline branches for text/json/badge/html. Move each one into its own formatter and consume `groupByClass` from shared.

All formatters share this signature:

```typescript
export interface FormatterInput {
  results: CoverageResult[];
  threshold: number;
  rootDir: string;
}
export interface FormatterOutput {
  output: string;      // content to print (may be empty)
  writePath?: string;  // absolute path to write to disk (optional)
  stepSummary?: boolean; // if true, prefer GITHUB_STEP_SUMMARY over stdout
}
export type Formatter = (input: FormatterInput) => FormatterOutput;
```

- [ ] **Step 1: Create `src/formatters/text.ts`**

```typescript
import * as path from 'path';
import { CoverageResult } from '../types';
import { groupByClass } from './shared';

export interface FormatterInput {
  results: CoverageResult[];
  threshold: number;
  rootDir: string;
}

export interface FormatterOutput {
  output: string;
  writePath?: string;
  stepSummary?: boolean;
}

export function formatText(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const uncovered = results.filter(r => !r.covered);
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const lines: string[] = [];
  lines.push('\n=== API COVERAGE REPORT ===\n');

  const grouped = groupByClass(results);
  for (const cls of Object.keys(grouped).sort()) {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    lines.push(`${cls}: ${clsCovered}/${methods.length}`);
    for (const m of methods) {
      lines.push(`  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`);
    }
    lines.push('');
  }

  lines.push(`OVERALL: ${covered}/${total} (${total ? pct.toFixed(1) : 0}%)`);
  lines.push(`THRESHOLD: ${threshold}%`);
  lines.push(`STATUS: ${passed ? 'PASSED' : 'FAILED'}`);

  if (uncovered.length) {
    lines.push('\nUncovered:');
    uncovered.forEach(u => lines.push(`  ${u.className}.${u.methodName}`));
  }

  return {
    output: lines.join('\n'),
    writePath: path.join(rootDir, 'test-coverage-report.txt'),
  };
}
```

- [ ] **Step 2: Create `src/formatters/json.ts`**

```typescript
import * as path from 'path';
import { FormatterInput, FormatterOutput } from './text';
import { groupByClass } from './shared';

export function formatJson(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const uncovered = results.filter(r => !r.covered);
  const pct = total ? (covered / total) * 100 : 0;

  const grouped = groupByClass(results);

  const json = {
    summary: { total, covered, percentage: pct, threshold, passed: pct >= threshold },
    classes: Object.entries(grouped).map(([name, methods]) => ({
      name,
      methods: methods.map(m => ({ name: m.methodName, covered: m.covered })),
    })),
    uncovered: uncovered.map(u => `${u.className}.${u.methodName}`),
  };

  const content = JSON.stringify(json, null, 2);
  return {
    output: content,
    writePath: path.join(rootDir, 'test-coverage-report.json'),
  };
}
```

- [ ] **Step 3: Create `src/formatters/badge.ts`**

The formatter returns the raw SVG as `output` and the target path as `writePath`. The reporter writes the SVG to disk and prints a separate "Badge written to ..." announcement line (it special-cases this in Task 10 Step 1).

```typescript
import * as path from 'path';
import { FormatterInput, FormatterOutput } from './text';

export function formatBadge(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;

  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  const label = 'API coverage';
  const value = `${pct.toFixed(1)}%`;
  const lw = 90;
  const vw = 60;
  const tw = lw + vw;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect width="${lw}" height="20" fill="#555"/>
  <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
  <rect width="${tw}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;

  return {
    output: svg,
    writePath: path.join(rootDir, 'test-coverage-badge.svg'),
  };
}
```

- [ ] **Step 4: Create `src/formatters/html.ts`**

```typescript
import * as path from 'path';
import { CoverageResult } from '../types';
import { FormatterInput, FormatterOutput } from './text';
import { groupByClass } from './shared';

export function formatHtml(input: FormatterInput): FormatterOutput {
  const { results, threshold, rootDir } = input;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const uncovered = results.filter(r => !r.covered);
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;
  const barColor = passed ? '#1D9E75' : '#E24B4A';

  const grouped = groupByClass(results);

  const classRows = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    const clsPct = methods.length ? (clsCovered / methods.length) * 100 : 0;
    const clsColor = clsPct >= threshold ? '#1D9E75' : clsPct >= 60 ? '#BA7517' : '#E24B4A';
    const badges = methods.map((m: CoverageResult) =>
      `<span class="method ${m.covered ? 'covered' : 'uncovered'}">${m.methodName}</span>`,
    ).join('');
    return `
      <div class="class-card">
        <div class="class-header">
          <span class="dot" style="background:${clsColor}"></span>
          <span class="class-name">${cls}</span>
          <div class="mini-bar"><div class="mini-fill" style="width:${clsPct.toFixed(1)}%;background:${clsColor}"></div></div>
          <span class="class-ratio">${clsCovered} / ${methods.length}</span>
        </div>
        <div class="methods">${badges}</div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>API Coverage Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;background:#f5f5f5;color:#1a1a1a;padding:2rem}
  .card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:1.5rem;max-width:800px;margin:0 auto}
  .header{display:flex;align-items:baseline;gap:1rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #e5e5e5}
  .title{font-size:16px;font-weight:600}
  .subtitle{font-size:13px;color:#888}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1.5rem}
  .metric{background:#f9f9f9;border-radius:8px;padding:12px 14px}
  .metric-label{font-size:12px;color:#888;margin-bottom:4px}
  .metric-value{font-size:22px;font-weight:600}
  .bar-track{height:6px;background:#eee;border-radius:99px;overflow:hidden;margin-bottom:1.25rem}
  .bar-fill{height:100%;border-radius:99px;transition:width .6s ease}
  .class-card{border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin-bottom:8px}
  .class-header{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f0f0f0;background:#fafafa}
  .class-name{font-size:13px;font-weight:600;flex:1;font-family:monospace}
  .class-ratio{font-size:12px;color:#888}
  .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .mini-bar{width:80px;height:4px;background:#eee;border-radius:99px;overflow:hidden}
  .mini-fill{height:100%;border-radius:99px}
  .methods{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px}
  .method{font-size:12px;font-family:monospace;padding:3px 9px;border-radius:6px}
  .covered{background:#E1F5EE;color:#0F6E56}
  .uncovered{background:#FCEBEB;color:#A32D2D}
  .footer{margin-top:1.25rem;font-size:12px;color:#aaa;text-align:right}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="title">API coverage report</span>
    <span class="subtitle">Generated ${new Date().toISOString().slice(0, 10)}</span>
  </div>
  <div class="summary">
    <div class="metric"><div class="metric-label">Coverage (Target: ${threshold}%)</div><div class="metric-value" style="color:${barColor}">${pct.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">Covered</div><div class="metric-value">${covered} / ${total}</div></div>
    <div class="metric"><div class="metric-label">Uncovered</div><div class="metric-value" style="color:${uncovered.length ? '#E24B4A' : '#1D9E75'}">${uncovered.length}</div></div>
  </div>
  <div class="bar-track"><div class="bar-fill" id="bar" style="width:0;background:${barColor}"></div></div>
  ${classRows}
  <div class="footer">@civitas-cerebrum/test-coverage</div>
</div>
<script>setTimeout(()=>document.getElementById('bar').style.width='${pct.toFixed(1)}%',100)</script>
</body>
</html>`;

  return {
    output: html,
    writePath: path.join(rootDir, 'test-coverage-report.html'),
  };
}
```

- [ ] **Step 5: Create `src/formatters/index.ts` dispatcher**

```typescript
import { CoverageResult, OutputFormat } from '../types';
import { formatPretty } from './pretty';
import { formatText, FormatterInput, FormatterOutput } from './text';
import { formatJson } from './json';
import { formatBadge } from './badge';
import { formatHtml } from './html';
import {
  generateGithubPlainComment,
  generateGithubTableComment,
} from './github';
import * as path from 'path';

export { FormatterInput, FormatterOutput };

export function runFormatter(
  format: OutputFormat,
  input: FormatterInput,
): FormatterOutput | null {
  switch (format) {
    case 'pretty':
      formatPretty(input.results);
      return null;
    case 'json':
      return formatJson(input);
    case 'badge':
      return formatBadge(input);
    case 'html':
      return formatHtml(input);
    case 'text':
      return formatText(input);
    case 'github':
    case 'github-plain':
      return {
        output: generateGithubPlainComment(input.results, { threshold: input.threshold }),
        writePath: path.join(input.rootDir, 'test-coverage-report.md'),
        stepSummary: true,
      };
    case 'github-table':
      return {
        output: generateGithubTableComment(input.results, { threshold: input.threshold }),
        writePath: path.join(input.rootDir, 'test-coverage-report.md'),
        stepSummary: true,
      };
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all pass. `src/index.ts` still has the old inline format branches — those will be removed in Task 10. The new formatters are dead code at this point, which is fine; their signature is exercised by the type system.

- [ ] **Step 7: Commit**

```bash
git add src/formatters/
git commit -m "refactor: extract text, json, badge, html formatters and dispatcher"
```

---

## Task 10: Reduce `src/index.ts` to an orchestrator

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `runCoverageReport` body with a dispatcher-driven implementation**

The full new body of `runCoverageReport` inside the class:

```typescript
public async runCoverageReport(): Promise<boolean> {
  this.ctx = createProgram({
    rootDir: this.rootDir,
    srcDir: this.srcDir,
    testDir: this.testDir,
    ignorePaths: this.ignorePaths,
    debug: this.debug,
  });
  const program = this.ctx.program;
  const checker = program.getTypeChecker();

  const apiIndex = buildApiIndex(this.ctx);
  const callGraph = buildCallGraph(this.ctx, checker, apiIndex);

  const allMethods: MethodKey[] = [];
  apiIndex.forEach((methods, className) => {
    methods.forEach(m => allMethods.push(`${className}.${m}` as MethodKey));
  });

  if (this.debug) {
    console.log(`[debug] total API methods to track: ${allMethods.length}`);
  }

  const directlyCalled = new Set<MethodKey>();
  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;
    if (sourceFile.isDeclarationFile) continue;
    if (!isTestFile(this.ctx, filePath)) continue;
    if (isIgnored(this.ctx, filePath)) continue;

    if (this.debug) {
      console.log(`[debug] scanning test file: ${filePath}`);
    }

    const calls = extractTypedCalls(sourceFile, sourceFile, checker, apiIndex, this.debug);
    if (this.debug && calls.size > 0) {
      console.log(`[debug]   found calls: ${[...calls].join(', ')}`);
    }
    calls.forEach(c => directlyCalled.add(c));
  }

  const calledMethods = resolveTransitiveCalls(directlyCalled, callGraph);

  const results: CoverageResult[] = allMethods.map(key => {
    const [className, methodName] = key.split('.');
    return { className, methodName, covered: calledMethods.has(key) };
  });

  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const isSuccess = pct >= this.threshold;

  const formatterOutput = runFormatter(this.outputFormat ?? 'text', {
    results,
    threshold: this.threshold,
    rootDir: this.rootDir,
  });

  if (formatterOutput) {
    const { output, writePath, stepSummary } = formatterOutput;

    if (writePath) {
      fs.writeFileSync(writePath, output, 'utf-8');
    }

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummary && summaryPath) {
      fs.appendFileSync(summaryPath, output, 'utf-8');
    } else if (this.outputFormat === 'badge') {
      console.log(`Badge written to ${writePath}`);
    } else {
      console.log(output);
    }
  }

  return isSuccess;
}
```

- [ ] **Step 2: Prune imports in `src/index.ts`**

`src/index.ts` should now only import things it actually uses at the top:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import {
  ApiCoverageOptions,
  CoverageResult,
  MethodKey,
  OutputFormat,
} from './types';
import { createProgram, isIgnored, isTestFile, ProgramContext } from './program';
import { buildApiIndex } from './api-index';
import { extractTypedCalls } from './call-detection';
import { buildCallGraph, resolveTransitiveCalls } from './call-graph';
import { runFormatter } from './formatters';
```

Keep the public re-exports at the bottom:

```typescript
export type { ApiCoverageOptions, CoverageResult } from './types';
export {
  generateGithubPlainComment,
  generateGithubTableComment,
} from './formatters/github';
```

Delete all the inline format-branch code that used to live in `runCoverageReport` (badge SVG, HTML template, JSON reducer, text lines) — Task 9 moved it all into the formatters.

Delete `path` if it's unused after the prune.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Run the build and check there's no dead code warning**

Run: `npm run build`
Expected: clean compile, no `noUnusedLocals` errors. `src/index.ts` should be roughly 100 lines.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "refactor: reduce src/index.ts to a thin orchestrator"
```

---

## Task 11: Fix footer package name and add regression test

**Files:**
- Modify: `src/formatters/github.ts`
- Modify: `tests/formatters-github.test.ts`

- [ ] **Step 1: Add a failing test asserting the correct package name**

Append to `tests/formatters-github.test.ts`:

```typescript
describe('github footers', () => {
  it('plain comment footer references the correct package name', () => {
    const out = generateGithubPlainComment(results, { threshold: 100 });
    expect(out).toContain('@civitas-cerebrum/test-coverage');
    expect(out).not.toContain('@civitas-cerebrum/api-coverage');
  });
  it('table comment footer references the correct package name', () => {
    const out = generateGithubTableComment(results, { threshold: 100 });
    expect(out).toContain('@civitas-cerebrum/test-coverage');
    expect(out).not.toContain('@civitas-cerebrum/api-coverage');
  });
});
```

- [ ] **Step 2: Verify they fail**

Run: `npm test -- tests/formatters-github.test.ts`
Expected: the two new tests fail because the footer still reads `@civitas-cerebrum/api-coverage`.

- [ ] **Step 3: Fix the footer in `src/formatters/github.ts`**

In `generateGithubPlainComment`, change:

```typescript
`<sub>Plain report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
```

to:

```typescript
`<sub>Plain report generated by \`@civitas-cerebrum/test-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
```

Same change in `generateGithubTableComment`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/formatters/github.ts tests/formatters-github.test.ts
git commit -m "fix: correct package name in github comment footer"
```

---

## Task 12: Add a threshold-default regression test (threshold was already fixed in Task 8)

**Files:**
- Modify: `tests/formatters-github.test.ts`

Task 8 set the default to 100 when the functions were ported. This task locks that behavior in with a test.

- [ ] **Step 1: Add the regression test**

Append to `tests/formatters-github.test.ts`:

```typescript
describe('threshold defaults', () => {
  // 75% covered; threshold 80 → fail, threshold 100 → fail, but the status wording differs.
  const mixed: CoverageResult[] = [
    { className: 'A', methodName: 'x', covered: true },
    { className: 'A', methodName: 'y', covered: true },
    { className: 'A', methodName: 'z', covered: true },
    { className: 'A', methodName: 'w', covered: false },
  ];

  it('generateGithubPlainComment defaults threshold to 100', () => {
    const out = generateGithubPlainComment(mixed);
    // With threshold 100, 75% fails and the message should reference 100%
    expect(out).toMatch(/100/);
    expect(out).not.toMatch(/threshold 80%/);
  });

  it('generateGithubTableComment defaults threshold to 100', () => {
    const out = generateGithubTableComment(mixed);
    expect(out).toMatch(/threshold of 100%/);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all pass (because Task 8 already set the plain default to 100).

- [ ] **Step 3: Commit**

```bash
git add tests/formatters-github.test.ts
git commit -m "test: lock in threshold-default of 100 for both github generators"
```

---

## Task 13: Apply the ordering rule — uncovered classes first in both github comments

**Files:**
- Modify: `src/formatters/github.ts`
- Modify: `tests/formatters-github.test.ts`

This is the user-visible behavior change. TDD: write the ordering assertion first, then implement.

- [ ] **Step 1: Write the failing ordering test**

Append to `tests/formatters-github.test.ts`:

```typescript
describe('github ordering', () => {
  const mixed: CoverageResult[] = [
    { className: 'AllCovered', methodName: 'a', covered: true },
    { className: 'AllCovered', methodName: 'b', covered: true },
    { className: 'OneMissing', methodName: 'a', covered: true },
    { className: 'OneMissing', methodName: 'b', covered: false },
    { className: 'TwoMissing', methodName: 'a', covered: false },
    { className: 'TwoMissing', methodName: 'b', covered: false },
  ];

  it('plain comment lists classes with missing methods first', () => {
    const out = generateGithubPlainComment(mixed, { threshold: 100 });
    const twoIdx = out.indexOf('TwoMissing');
    const oneIdx = out.indexOf('OneMissing');
    const allIdx = out.indexOf('AllCovered');
    expect(twoIdx).toBeGreaterThan(-1);
    expect(oneIdx).toBeGreaterThan(-1);
    expect(allIdx).toBeGreaterThan(-1);
    expect(twoIdx).toBeLessThan(oneIdx);
    expect(oneIdx).toBeLessThan(allIdx);
  });

  it('plain comment lists uncovered methods before covered within a class', () => {
    const out = generateGithubPlainComment(mixed, { threshold: 100 });
    // Inside "OneMissing": `[ ] b` should appear before `[x] a`
    const classBlock = out.slice(out.indexOf('OneMissing'));
    const missingIdx = classBlock.indexOf('[ ] b');
    const coveredIdx = classBlock.indexOf('[x] a');
    expect(missingIdx).toBeGreaterThan(-1);
    expect(coveredIdx).toBeGreaterThan(-1);
    expect(missingIdx).toBeLessThan(coveredIdx);
  });

  it('table comment lists classes with missing methods first', () => {
    const out = generateGithubTableComment(mixed, { threshold: 100 });
    const twoIdx = out.indexOf('**TwoMissing**');
    const oneIdx = out.indexOf('**OneMissing**');
    const allIdx = out.indexOf('**AllCovered**');
    expect(twoIdx).toBeLessThan(oneIdx);
    expect(oneIdx).toBeLessThan(allIdx);
  });
});
```

- [ ] **Step 2: Verify the ordering tests fail**

Run: `npm test -- tests/formatters-github.test.ts`
Expected: the three new ordering tests fail — current alphabetical sort puts `AllCovered` first.

- [ ] **Step 3: Apply ordering in `src/formatters/github.ts`**

Add an import:

```typescript
import {
  groupByClass,
  renderShieldsBadge,
  renderStatus,
  sortClassesByMissingFirst,
} from './shared';
```

In `generateGithubPlainComment`, replace:

```typescript
const classLines = Object.keys(grouped).sort().map(cls => {
  const methods = grouped[cls];
  const clsCovered = methods.filter(m => m.covered).length;
  const methodLines = methods
    .map(m => `  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`)
    .join('\n');
  return `**${cls}: ${clsCovered}/${methods.length}**\n${methodLines}`;
}).join('\n\n');
```

with:

```typescript
const classLines = sortClassesByMissingFirst(grouped).map(cls => {
  const methods = [...grouped[cls]].sort((a, b) => {
    if (a.covered !== b.covered) return a.covered ? 1 : -1;
    return a.methodName.localeCompare(b.methodName);
  });
  const clsCovered = methods.filter(m => m.covered).length;
  const methodLines = methods
    .map(m => `  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`)
    .join('\n');
  return `**${cls}: ${clsCovered}/${methods.length}**\n${methodLines}`;
}).join('\n\n');
```

In `generateGithubTableComment`, replace:

```typescript
const tableRows = Object.keys(grouped).sort().map(cls => {
  const methods = grouped[cls];
  const coveredMethods = methods.filter(m => m.covered).map(m => `\`${m.methodName}\``);
  const uncoveredMethods = methods.filter(m => !m.covered).map(m => `\`${m.methodName}\``);
  return `| **${cls}** | ${coveredMethods.length}/${methods.length} | ${uncoveredMethods.join(', ')} | ${coveredMethods.join(', ')} |`;
}).join('\n');
```

with:

```typescript
const tableRows = sortClassesByMissingFirst(grouped).map(cls => {
  const methods = grouped[cls];
  const coveredMethods = methods.filter(m => m.covered).map(m => `\`${m.methodName}\``);
  const uncoveredMethods = methods.filter(m => !m.covered).map(m => `\`${m.methodName}\``);
  return `| **${cls}** | ${coveredMethods.length}/${methods.length} | ${uncoveredMethods.join(', ')} | ${coveredMethods.join(', ')} |`;
}).join('\n');
```

The table order within-cell is already "uncovered column" and "covered column" — no per-method reordering needed there.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/formatters/github.ts tests/formatters-github.test.ts
git commit -m "feat: order github comments with missing coverage first"
```

---

## Task 14: Version bump and final verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

In `package.json`, change:

```json
"version": "0.0.8",
```

to:

```json
"version": "0.1.0",
```

- [ ] **Step 2: Run the full suite, the build, and the coverage self-check**

```bash
npm test
npm run build
npx test-coverage --format github-table
```

Expected:
- All tests pass.
- Build succeeds, `dist/` is produced.
- The coverage self-check prints a github-table comment where (if all methods are covered) the single class still renders, and (if anything regresses) missing methods appear first.

- [ ] **Step 3: Inspect the generated `test-coverage-report.md`**

Open `test-coverage-report.md`. Verify:
- Footer reads `@civitas-cerebrum/test-coverage`.
- On a passing run, the single class row renders normally.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.0"
```

---

## Summary of commits this plan produces

1. `refactor: extract shared types to src/types.ts`
2. `refactor: extract program setup into src/program.ts`
3. `refactor: extract API index into src/api-index.ts`
4. `refactor: extract call detection into src/call-detection.ts`
5. `refactor: extract call graph into src/call-graph.ts`
6. `refactor: move pretty-output to src/formatters/pretty.ts`
7. `feat: add formatters/shared helpers with unit tests`
8. `refactor: extract github formatters and route through shared helpers`
9. `refactor: extract text, json, badge, html formatters and dispatcher`
10. `refactor: reduce src/index.ts to a thin orchestrator`
11. `fix: correct package name in github comment footer`
12. `test: lock in threshold-default of 100 for both github generators`
13. `feat: order github comments with missing coverage first`
14. `chore: bump version to 0.1.0`
