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
