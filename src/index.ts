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

export class ApiCoverageReporter {
  private rootDir: string;
  private srcDir: string;
  private testDir: string;
  private ignorePaths: string[];
  private outputFormat?: OutputFormat;
  private debug: boolean;
  private threshold: number;
  private ctx!: ProgramContext;

  constructor(options: ApiCoverageOptions = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.srcDir = options.srcDir || path.join(this.rootDir, 'src');
    this.testDir = options.testDir || path.join(this.rootDir, 'tests');
    this.ignorePaths = options.ignorePaths || ['node_modules', 'dist'];
    this.outputFormat = options.outputFormat || 'text';
    this.debug = options.debug ?? false;
    this.threshold = options.threshold ?? 100;
  }

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
}

export type { ApiCoverageOptions, CoverageResult } from './types';
export {
  generateGithubPlainComment,
  generateGithubTableComment,
} from './formatters/github';
