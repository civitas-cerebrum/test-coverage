import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as glob from 'glob';
import { prettyOutput } from './pretty-output';

// ---------------------------------------------------------------------------
// Branded identity types
// ---------------------------------------------------------------------------

/** Globally unique class identity: "<relativePath>#<ClassName>" */
type ClassId = string & { readonly __brand: 'ClassId' };

/** Plain method name (no dots, no path) */
type MethodName = string & { readonly __brand: 'MethodName' };

/**
 * Unique key for a single API method.
 * Format: "<relativePath>#<ClassName>.<methodName>"
 */
type MethodKey = `${ClassId}.${MethodName}`;

function makeClassId(filePath: string, className: string, rootDir: string): ClassId {
  const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
  return `${rel}#${className}` as ClassId;
}

function makeMethodKey(classId: ClassId, methodName: MethodName): MethodKey {
  return `${classId}.${methodName}` as MethodKey;
}

function parseMethodKey(key: MethodKey): { classId: ClassId; methodName: MethodName } {
  // MethodKey format: "<path>#<ClassName>.<methodName>"
  // The last '.' is always the class/method separator because method names cannot contain dots.
  const dotIdx = key.lastIndexOf('.');
  return {
    classId: key.slice(0, dotIdx) as ClassId,
    methodName: key.slice(dotIdx + 1) as MethodName,
  };
}

// ---------------------------------------------------------------------------
// Core data structures
// ---------------------------------------------------------------------------

interface ClassEntry {
  classId: ClassId;
  /** Short display name (no path prefix) */
  className: string;
  methods: Set<MethodName>;
}

/** classId → ClassEntry */
type ApiIndex = Map<ClassId, ClassEntry>;

interface CoverageResult {
  classId: ClassId;
  className: string;
  methodName: MethodName;
  covered: boolean;
}

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface ApiCoverageOptions {
  rootDir?: string;
  srcDir?: string;
  testDir?: string;
  ignorePaths?: string[];
  outputFormat?: 'text' | 'json' | 'html' | 'badge' | 'github' | 'github-plain' | 'github-table' | 'pretty';
  debug?: boolean;
  threshold?: number;
  /**
   * When true, a method call whose target class cannot be resolved via the
   * TypeScript type checker falls back to matching by method name alone.
   * This can produce false positives when multiple classes share a method name.
   * Default: false.
   */
  looseMatching?: boolean;
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

export class ApiCoverageReporter {
  private rootDir: string;
  private srcDir: string;
  private testDir: string;
  private ignorePaths: string[];
  private outputFormat: NonNullable<ApiCoverageOptions['outputFormat']>;
  private debug: boolean;
  private threshold: number;
  private looseMatching: boolean;

  constructor(options: ApiCoverageOptions = {}) {
    this.rootDir = options.rootDir ?? process.cwd();
    this.srcDir = options.srcDir ?? path.join(this.rootDir, 'src');
    this.testDir = options.testDir ?? path.join(this.rootDir, 'tests');
    this.ignorePaths = options.ignorePaths ?? ['node_modules', 'dist'];
    this.outputFormat = options.outputFormat ?? 'text';
    this.debug = options.debug ?? false;
    this.threshold = options.threshold ?? 100;
    this.looseMatching = options.looseMatching ?? false;
  }

  // -------------------------------------------------------------------------
  // Program setup
  // -------------------------------------------------------------------------

  private createProgram(): ts.Program {
    const configPath = ts.findConfigFile(this.rootDir, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) throw new Error('tsconfig.json not found in project root');

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );

    const testGlob = path.join(this.testDir, '**/*.{spec,test}.ts').replace(/\\/g, '/');
    const testFiles = glob.sync(testGlob);
    const allFiles = Array.from(new Set([...parsed.fileNames, ...testFiles]));

    if (this.debug) {
      console.log(`[debug] source files from tsconfig : ${parsed.fileNames.length}`);
      console.log(`[debug] test files found by glob   : ${testFiles.length}`);
      console.log(`[debug] total files in program     : ${allFiles.length}`);
    }

    return ts.createProgram({ rootNames: allFiles, options: parsed.options });
  }

  // -------------------------------------------------------------------------
  // File classification helpers
  // -------------------------------------------------------------------------

  private isIgnored(filePath: string): boolean {
    return this.ignorePaths.some(p => filePath.includes(p));
  }

  private isTestFile(filePath: string): boolean {
    const normalised = filePath.replace(/\\/g, '/');
    const relToTestDir = path.relative(this.testDir, filePath);
    const underTestDir = !relToTestDir.startsWith('..') && !path.isAbsolute(relToTestDir);
    const hasTestSuffix = normalised.includes('.spec.') || normalised.includes('.test.');
    const result = underTestDir || hasTestSuffix;
    if (this.debug && result) console.log(`[debug] test file: ${filePath}`);
    return result;
  }

  private isSourceFile(filePath: string): boolean {
    const rel = path.relative(this.srcDir, filePath);
    return !rel.startsWith('..') && !path.isAbsolute(rel) && !this.isTestFile(filePath);
  }

  // -------------------------------------------------------------------------
  // Build API index
  // -------------------------------------------------------------------------

  private buildApiIndex(program: ts.Program): ApiIndex {
    const apiIndex: ApiIndex = new Map();

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = sourceFile.fileName;
      if (sourceFile.isDeclarationFile) continue;
      if (!this.isSourceFile(filePath)) continue;
      if (this.isIgnored(filePath)) continue;

      const visitNode = (node: ts.Node) => {
        if (ts.isClassDeclaration(node) && node.name) {
          const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
          if (!isExported) {
            ts.forEachChild(node, visitNode);
            return;
          }

          const className = node.name.text;
          const classId = makeClassId(filePath, className, this.rootDir);
          const methods = new Set<MethodName>();

          for (const member of node.members) {
            const methodName = this.extractPublicMethodName(member, sourceFile);
            if (methodName) methods.add(methodName);
          }

          if (methods.size > 0) {
            apiIndex.set(classId, { classId, className, methods });
          }
        }

        ts.forEachChild(node, visitNode);
      };

      visitNode(sourceFile);
    }

    if (this.debug) {
      console.log(`[debug] API index: ${apiIndex.size} classes`);
      for (const [id, entry] of apiIndex) {
        console.log(`[debug]   ${id}: [${[...entry.methods].join(', ')}]`);
      }
    }

    return apiIndex;
  }

  /** Returns the method name if the member is a public, non-constructor, non-internal method/arrow prop. */
  private extractPublicMethodName(
    member: ts.ClassElement,
    sourceFile: ts.SourceFile,
  ): MethodName | null {
    let rawName: string | null = null;

    if (ts.isMethodDeclaration(member) && member.name) {
      rawName = member.name.getText(sourceFile);
    } else if (
      ts.isPropertyDeclaration(member) &&
      member.name &&
      member.initializer &&
      ts.isArrowFunction(member.initializer)
    ) {
      rawName = member.name.getText(sourceFile);
    }

    if (!rawName) return null;
    if (rawName === 'constructor') return null;
    if (rawName.startsWith('_')) return null;
    if (this.hasNonPublicModifier(member)) return null;

    return rawName as MethodName;
  }

  private hasNonPublicModifier(member: ts.ClassElement): boolean {
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

  // -------------------------------------------------------------------------
  // Extract typed calls
  // -------------------------------------------------------------------------

  /**
   * Walks `nodeToScan` and returns every MethodKey whose call can be resolved
   * to a class in `apiIndex`.
   *
   * Resolution order:
   *   1. Signature declaration parent class  (most precise)
   *   2. Type-checker type hierarchy          (handles interfaces/subclasses)
   *   3. Name-only fallback                  (opt-in via looseMatching, warns on ambiguity)
   */
  private extractTypedCalls(
    nodeToScan: ts.Node,
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    apiIndex: ApiIndex,
  ): Set<MethodKey> {
    const calls = new Set<MethodKey>();

    /** Fast lookup: methodName → all ClassEntries that expose it */
    const byMethodName = this.buildMethodNameIndex(apiIndex);

    const tryAddByClassId = (classId: ClassId, methodName: MethodName): boolean => {
      const entry = apiIndex.get(classId);
      if (entry?.methods.has(methodName)) {
        calls.add(makeMethodKey(classId, methodName));
        return true;
      }
      return false;
    };

    const matchTypeHierarchy = (type: ts.Type, methodName: MethodName): boolean => {
      const symbol = checker.getApparentType(type).getSymbol();
      if (!symbol) return false;

      for (const decl of symbol.getDeclarations() ?? []) {
        if (ts.isClassDeclaration(decl) && decl.name) {
          const classId = makeClassId(decl.getSourceFile().fileName, decl.name.text, this.rootDir);
          if (tryAddByClassId(classId, methodName)) return true;
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
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.getText().replace(/['"]/g, '') as MethodName;

        // 1. Resolve via signature declaration
        const signature = checker.getResolvedSignature(node);
        const decl = signature?.getDeclaration();
        if (decl && ts.isMethodDeclaration(decl)) {
          const parent = decl.parent;
          if (ts.isClassDeclaration(parent) && parent.name) {
            const classId = makeClassId(
              decl.getSourceFile().fileName,
              parent.name.text,
              this.rootDir,
            );
            if (tryAddByClassId(classId, methodName)) {
              ts.forEachChild(node, visit);
              return;
            }
          }
        }

        // 2. Resolve via type hierarchy
        const objType = checker.getTypeAtLocation(node.expression.expression);
        if (matchTypeHierarchy(objType, methodName)) {
          ts.forEachChild(node, visit);
          return;
        }

        // 3. Name-only fallback (opt-in)
        if (this.looseMatching) {
          const candidates = byMethodName.get(methodName) ?? [];
          if (candidates.length > 1 && this.debug) {
            console.warn(
              `[warn] loose match ambiguity: "${methodName}" matches ${candidates.length} classes ` +
              `(${candidates.map(e => e.className).join(', ')}) in ${sourceFile.fileName}`,
            );
          }
          for (const entry of candidates) {
            calls.add(makeMethodKey(entry.classId, methodName));
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(nodeToScan);
    return calls;
  }

  /** Pre-compute methodName → ClassEntry[] for O(1) loose-match lookup. */
  private buildMethodNameIndex(apiIndex: ApiIndex): Map<MethodName, ClassEntry[]> {
    const index = new Map<MethodName, ClassEntry[]>();
    for (const entry of apiIndex.values()) {
      for (const method of entry.methods) {
        const list = index.get(method) ?? [];
        list.push(entry);
        index.set(method, list);
      }
    }
    return index;
  }

  // -------------------------------------------------------------------------
  // Build internal call graph
  // -------------------------------------------------------------------------

  /**
   * Builds a graph of which API methods call which other API methods
   * *within the source files themselves* (not in tests).
   *
   * This is what powers the transitive coverage:
   *   testB() calls methodB() → methodB() calls methodA()
   *   ∴ methodA() is considered covered even without a direct test.
   */
  private buildCallGraph(
    program: ts.Program,
    checker: ts.TypeChecker,
    apiIndex: ApiIndex,
  ): Map<MethodKey, Set<MethodKey>> {
    // Initialise an empty set for every known API method
    const callGraph = new Map<MethodKey, Set<MethodKey>>();
    for (const entry of apiIndex.values()) {
      for (const method of entry.methods) {
        callGraph.set(makeMethodKey(entry.classId, method), new Set());
      }
    }

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = sourceFile.fileName;
      if (sourceFile.isDeclarationFile) continue;
      if (!this.isSourceFile(filePath)) continue;
      if (this.isIgnored(filePath)) continue;

      /**
       * Walk the source file top-level. When we enter a node that IS a known
       * API method, we scan its entire body with extractTypedCalls, record its
       * outgoing edges, then stop descending (extractTypedCalls handles the rest).
       *
       * We do NOT return early from the top-level visitor so nested classes are
       * still discovered on the next iteration of forEachChild.
       */
      const visitTopLevel = (node: ts.Node) => {
        const currentKey = this.resolveMethodKey(node, sourceFile, apiIndex);

        if (currentKey !== null) {
          const internalCalls = this.extractTypedCalls(node, sourceFile, checker, apiIndex);
          const edges = callGraph.get(currentKey)!;
          for (const dep of internalCalls) {
            if (dep !== currentKey) edges.add(dep);
          }
          // Don't descend — extractTypedCalls already walked the body.
          // Nested class declarations inside a method body are an exotic
          // pattern; if support is ever needed, remove this return.
          return;
        }

        ts.forEachChild(node, visitTopLevel);
      };

      visitTopLevel(sourceFile);
    }

    if (this.debug) {
      console.log('[debug] call graph edges:');
      for (const [key, deps] of callGraph) {
        if (deps.size) console.log(`[debug]   ${key} → [${[...deps].join(', ')}]`);
      }
    }

    return callGraph;
  }

  /**
   * If `node` is a method (standard or arrow-property) that exists in the
   * API index, return its MethodKey. Otherwise return null.
   */
  private resolveMethodKey(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    apiIndex: ApiIndex,
  ): MethodKey | null {
    let className: string | null = null;
    let methodName: string | null = null;
    let filePath: string | null = null;

    if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      node.parent &&
      ts.isClassDeclaration(node.parent) &&
      node.parent.name
    ) {
      className = node.parent.name.text;
      methodName = node.name.getText(sourceFile);
      filePath = sourceFile.fileName;
    } else if (
      ts.isPropertyDeclaration(node) &&
      node.initializer &&
      ts.isArrowFunction(node.initializer) &&
      node.name &&
      node.parent &&
      ts.isClassDeclaration(node.parent) &&
      node.parent.name
    ) {
      className = node.parent.name.text;
      methodName = node.name.getText(sourceFile);
      filePath = sourceFile.fileName;
    }

    if (!className || !methodName || !filePath) return null;

    const classId = makeClassId(filePath, className, this.rootDir);
    const entry = apiIndex.get(classId);
    if (!entry?.methods.has(methodName as MethodName)) return null;

    return makeMethodKey(classId, methodName as MethodName);
  }

  // -------------------------------------------------------------------------
  // Analysis
  // -------------------------------------------------------------------------

  private analyse(program: ts.Program): CoverageResult[] {
    const checker = program.getTypeChecker();
    const apiIndex = this.buildApiIndex(program);
    const callGraph = this.buildCallGraph(program, checker, apiIndex);

    // All known method keys
    const allMethods: MethodKey[] = [];
    for (const entry of apiIndex.values()) {
      for (const method of entry.methods) {
        allMethods.push(makeMethodKey(entry.classId, method));
      }
    }

    if (this.debug) console.log(`[debug] total API methods: ${allMethods.length}`);

    // --- Step 1: direct calls from test files ---
    const calledMethods = new Set<MethodKey>();

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = sourceFile.fileName;
      if (sourceFile.isDeclarationFile) continue;
      if (!this.isTestFile(filePath)) continue;
      if (this.isIgnored(filePath)) continue;

      if (this.debug) console.log(`[debug] scanning test file: ${filePath}`);

      const calls = this.extractTypedCalls(sourceFile, sourceFile, checker, apiIndex);
      if (this.debug && calls.size > 0) {
        console.log(`[debug]   direct calls: ${[...calls].join(', ')}`);
      }
      for (const c of calls) calledMethods.add(c);
    }

    // --- Step 2: transitive closure via BFS ---
    // If methodB() is tested AND calls methodA() internally,
    // methodA() is marked as covered even without its own direct test.
    const queue = Array.from(calledMethods);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dep of callGraph.get(current) ?? []) {
        if (!calledMethods.has(dep)) {
          calledMethods.add(dep);
          if (this.debug) console.log(`[debug]   transitive: ${dep} via ${current}`);
          queue.push(dep);
        }
      }
    }

    // --- Build results ---
    return allMethods.map(key => {
      const { classId, methodName } = parseMethodKey(key);
      const className = apiIndex.get(classId)?.className ?? classId;
      return { classId, className, methodName, covered: calledMethods.has(key) };
    });
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  public async runCoverageReport(): Promise<boolean> {
    const program = this.createProgram();
    const results = this.analyse(program);
    return this.renderReport(results);
  }

  // -------------------------------------------------------------------------
  // Rendering (all output formats)
  // -------------------------------------------------------------------------

  private renderReport(results: CoverageResult[]): boolean {
    const total = results.length;
    const covered = results.filter(r => r.covered).length;
    const uncovered = results.filter(r => !r.covered);
    const pct = total ? (covered / total) * 100 : 0;
    const isSuccess = pct >= this.threshold;

    switch (this.outputFormat) {
      case 'pretty':
        prettyOutput(results);
        return isSuccess;

      case 'json':
        return this.renderJson(results, { total, covered, pct, isSuccess, uncovered });

      case 'badge':
        return this.renderBadge(pct, isSuccess);

      case 'html':
        return this.renderHtml(results, { total, covered, pct, isSuccess, uncovered });

      case 'github':
      case 'github-plain':
        return this.renderGithub(results, isSuccess, false);

      case 'github-table':
        return this.renderGithub(results, isSuccess, true);

      default:
        return this.renderText(results, { total, covered, pct, isSuccess, uncovered });
    }
  }

  private groupByClass(results: CoverageResult[]): Record<string, CoverageResult[]> {
    return results.reduce(
      (acc, r) => {
        (acc[r.className] ??= []).push(r);
        return acc;
      },
      {} as Record<string, CoverageResult[]>,
    );
  }

  private renderText(
    results: CoverageResult[],
    summary: { total: number; covered: number; pct: number; isSuccess: boolean; uncovered: CoverageResult[] },
  ): boolean {
    const { total, covered, pct, isSuccess, uncovered } = summary;
    const grouped = this.groupByClass(results);
    const lines: string[] = ['\n=== API COVERAGE REPORT ===\n'];

    for (const cls of Object.keys(grouped).sort()) {
      const methods = grouped[cls];
      const clsCovered = methods.filter(m => m.covered).length;
      lines.push(`${cls}: ${clsCovered}/${methods.length}`);
      for (const m of methods) lines.push(`  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`);
      lines.push('');
    }

    lines.push(`OVERALL: ${covered}/${total} (${pct.toFixed(1)}%)`);
    lines.push(`THRESHOLD: ${this.threshold}%`);
    lines.push(`STATUS: ${isSuccess ? 'PASSED' : 'FAILED'}`);
    if (uncovered.length) {
      lines.push('\nUncovered:');
      uncovered.forEach(u => lines.push(`  ${u.className}.${u.methodName}`));
    }

    const report = lines.join('\n');
    console.log(report);
    fs.writeFileSync(path.join(this.rootDir, 'test-coverage-report.txt'), report, 'utf-8');
    return isSuccess;
  }

  private renderJson(
    results: CoverageResult[],
    summary: { total: number; covered: number; pct: number; isSuccess: boolean; uncovered: CoverageResult[] },
  ): boolean {
    const { total, covered, pct, isSuccess, uncovered } = summary;
    const json = {
      summary: { total, covered, percentage: pct, threshold: this.threshold, passed: isSuccess },
      classes: Object.entries(this.groupByClass(results)).map(([name, methods]) => ({
        name,
        methods: methods.map(m => ({ name: m.methodName, covered: m.covered })),
      })),
      uncovered: uncovered.map(u => `${u.className}.${u.methodName}`),
    };
    const out = JSON.stringify(json, null, 2);
    const outPath = path.join(this.rootDir, 'test-coverage-report.json');
    fs.writeFileSync(outPath, out, 'utf-8');
    console.log(out);
    return isSuccess;
  }

  private renderBadge(pct: number, isSuccess: boolean): boolean {
    const color = isSuccess ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
    const label = 'API coverage';
    const value = `${pct.toFixed(1)}%`;
    const lw = 90, vw = 60, tw = lw + vw;
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
    const badgePath = path.join(this.rootDir, 'test-coverage-badge.svg');
    fs.writeFileSync(badgePath, svg, 'utf-8');
    console.log(`Badge written to ${badgePath}`);
    return isSuccess;
  }

  private renderHtml(
    results: CoverageResult[],
    summary: { total: number; covered: number; pct: number; isSuccess: boolean; uncovered: CoverageResult[] },
  ): boolean {
    const { covered, total, pct, isSuccess, uncovered } = summary;
    const grouped = this.groupByClass(results);
    const barColor = isSuccess ? '#1D9E75' : '#E24B4A';

    const classRows = Object.keys(grouped).sort().map(cls => {
      const methods = grouped[cls];
      const clsCovered = methods.filter(m => m.covered).length;
      const clsPct = methods.length ? (clsCovered / methods.length) * 100 : 0;
      const clsColor = clsPct >= this.threshold ? '#1D9E75' : clsPct >= 60 ? '#BA7517' : '#E24B4A';
      const badges = methods
        .map(m => `<span class="method ${m.covered ? 'covered' : 'uncovered'}">${m.methodName}</span>`)
        .join('');
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
    <div class="metric"><div class="metric-label">Coverage (Target: ${this.threshold}%)</div><div class="metric-value" style="color:${barColor}">${pct.toFixed(1)}%</div></div>
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

    const outPath = path.join(this.rootDir, 'test-coverage-report.html');
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`HTML report written to ${outPath}`);
    return isSuccess;
  }

  private renderGithub(results: CoverageResult[], isSuccess: boolean, table: boolean): boolean {
    const comment = table
      ? generateGithubTableComment(results, { threshold: this.threshold })
      : generateGithubPlainComment(results, { threshold: this.threshold });

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) fs.appendFileSync(summaryPath, comment, 'utf-8');
    else console.log(comment);

    fs.writeFileSync(path.join(this.rootDir, 'test-coverage-report.md'), comment, 'utf-8');
    return isSuccess;
  }
}

// ---------------------------------------------------------------------------
// GitHub comment generators (exported for standalone use)
// ---------------------------------------------------------------------------

export function generateGithubPlainComment(
  results: CoverageResult[],
  options: { threshold?: number } = {},
): string {
  const { threshold = 100 } = options;
  const total = results.length;
  const covered = results.filter(r => r.covered).length;
  const pct = total ? (covered / total) * 100 : 0;
  const passed = pct >= threshold;
  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  const badge = `![API Coverage](https://img.shields.io/badge/API%20Coverage-${pct.toFixed(1)}%25-${color})`;

  const grouped = results.reduce<Record<string, CoverageResult[]>>((acc, r) => {
    (acc[r.className] ??= []).push(r);
    return acc;
  }, {});

  const classLines = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const clsCovered = methods.filter(m => m.covered).length;
    const methodLines = methods.map(m => `  ${m.covered ? '[x]' : '[ ]'} ${m.methodName}`).join('\n');
    return `**${cls}: ${clsCovered}/${methods.length}**\n${methodLines}`;
  }).join('\n\n');

  const status = passed
    ? `Build Passed: ${pct.toFixed(0)}% API Coverage!`
    : `Build Failed: coverage ${pct.toFixed(1)}% is below threshold ${threshold}%`;

  return [
    '',
    '## 📊 API Coverage Report',
    '\n',
    badge,
    '\n',
    status,
    '\n',
    '<details>',
    '<summary>🔍 View Detailed Coverage Breakdown</summary>',
    '\n',
    classLines,
    '\n',
    `<sub>Plain report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
    '</details>',
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
  const color = passed ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
  const badge = `![API Coverage](https://img.shields.io/badge/API%20Coverage-${pct.toFixed(1)}%25-${color})`;

  const grouped = results.reduce<Record<string, CoverageResult[]>>((acc, r) => {
    (acc[r.className] ??= []).push(r);
    return acc;
  }, {});

  const tableRows = Object.keys(grouped).sort().map(cls => {
    const methods = grouped[cls];
    const coveredMethods = methods.filter(m => m.covered).map(m => `\`${m.methodName}\``);
    const uncoveredMethods = methods.filter(m => !m.covered).map(m => `\`${m.methodName}\``);
    return `| **${cls}** | ${coveredMethods.length}/${methods.length} | ${uncoveredMethods.join(', ')} | ${coveredMethods.join(', ')} |`;
  }).join('\n');

  const status = passed
    ? `**Build Passed:** 🎉 ${pct.toFixed(1)}% API Coverage`
    : `**Build Failed:** ❌ Coverage ${pct.toFixed(1)}% is below the required threshold of ${threshold}%`;

  return [
    '',
    '## 📊 API Coverage Report',
    '\n',
    badge,
    '\n',
    '| Category | Coverage | Missing Coverage ❌ | Covered Methods ✅ |',
    '| :--- | :---: | :--- | :--- |',
    tableRows,
    '\n',
    '---',
    status,
    '\n',
    `<sub>Table report generated by \`@civitas-cerebrum/api-coverage\` · ${new Date().toISOString().slice(0, 10)}</sub>`,
  ].join('\n');
}