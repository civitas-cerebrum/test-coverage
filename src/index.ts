import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export interface MethodInfo {
  name: string;
  category: string;
  covered: boolean;
}

export interface ApiCoverageOptions {
  rootDir?: string;
  testDir?: string;
  srcDir?: string;
  nodeModulesDir?: string;
  ignoreTestPatterns?: string[];
}

export class ApiCoverageReporter {
  private rootDir: string;
  private testDir: string;
  private srcDir: string;
  private nodeModulesDir: string;
  private ignoreTestPatterns: string[];

  constructor(options: ApiCoverageOptions = {}) {
    this.rootDir = options.rootDir || process.cwd(); // Default to where the script is run from
    this.testDir = options.testDir || path.join(this.rootDir, 'tests');
    this.srcDir = options.srcDir || path.join(this.rootDir, 'src');
    this.nodeModulesDir = options.nodeModulesDir || path.join(this.rootDir, 'node_modules');
    this.ignoreTestPatterns = options.ignoreTestPatterns || [];
  }

  private walkDir(dir: string, extensions: string[], ignorePatterns: string[] = []): string[] {
    let fileList: string[] = [];
    if (!fs.existsSync(dir)) return fileList;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const isIgnored = ignorePatterns.some(p => filePath.includes(p));

      if (isIgnored) continue;

      if (fs.statSync(filePath).isDirectory()) {
        fileList = fileList.concat(this.walkDir(filePath, extensions, ignorePatterns));
      } else {
        if (extensions.some(ext => file.endsWith(ext))) {
          fileList.push(filePath);
        }
      }
    }
    return fileList;
  }

  private extractClassesAndMethods(filePath: string): Array<{ className: string, methods: string[] }> {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
    const result: Array<{ className: string, methods: string[] }> = [];

    function visit(node: ts.Node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const methods: string[] = [];

        node.members.forEach(member => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const hasPrivate = member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword);
            const hasProtected = member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword);
            const methodName = member.name.getText(sourceFile);

            const isConstructor = methodName === 'constructor';
            const isInternal = methodName.startsWith('_');

            if (!hasPrivate && !hasProtected && !isConstructor && !isInternal) {
              methods.push(methodName);
            }
          }
        });

        if (methods.length > 0) {
          result.push({ className, methods });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return result;
  }

  public async runCoverageReport(): Promise<boolean> {
    const testFiles = this.walkDir(this.testDir, ['.spec.ts', '.test.ts'], this.ignoreTestPatterns);
    let testSource = testFiles.map(f => fs.readFileSync(f, 'utf-8')).join('\n');
    testSource = testSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    const checkCoverage = (method: string) => {
      const pattern = new RegExp(`\\.\\b${method}\\b\\s*\\(`);
      return pattern.test(testSource);
    };

    const apis: MethodInfo[] = [];
    const sourceFiles = this.walkDir(this.srcDir, ['.ts'], ['.spec.ts', '.test.ts', '.d.ts']);
    
    for (const file of sourceFiles) {
      const classes = this.extractClassesAndMethods(file);
      for (const { className, methods } of classes) {
        for (const m of methods) {
          apis.push({ name: m, category: className, covered: checkCoverage(m) });
        }
      }
    }

    if (fs.existsSync(this.nodeModulesDir)) {
      const externalFiles = this.walkDir(this.nodeModulesDir, ['.d.ts', '.ts'], ['node_modules']);
      for (const file of externalFiles) {
        const classes = this.extractClassesAndMethods(file);
        for (const { className, methods } of classes) {
          for (const m of methods) {
            if (!apis.some(a => a.category === className && a.name === m)) {
              apis.push({ name: m, category: className, covered: checkCoverage(m) });
            }
          }
        }
      }
    }

    const lines: string[] = [
      '',
      '========================================================',
      '                  API COVERAGE REPORT                    ',
      '========================================================',
      ''
    ];

    const categories = [...new Set(apis.map((a) => a.category))].sort();
    for (const cat of categories) {
      const catApis = apis.filter((a) => a.category === cat);
      const catCovered = catApis.filter((a) => a.covered);
      const catPct = catApis.length ? ((catCovered.length / catApis.length) * 100).toFixed(0) : '0';

      lines.push(`  ${cat}: ${catCovered.length}/${catApis.length} (${catPct}%)`);
      for (const api of catApis) {
        lines.push(`    ${api.covered ? '  [x]' : '  [ ]'} ${api.name}`);
      }
      lines.push('');
    }

    const allCovered = apis.filter((a) => a.covered);
    lines.push(
      '========================================================',
      `  OVERALL: ${allCovered.length}/${apis.length} methods (${apis.length ? ((allCovered.length / apis.length) * 100).toFixed(1) : 0}%)`,
      '========================================================'
    );

    const uncoveredTotal = apis.filter((a) => !a.covered);

    if (uncoveredTotal.length > 0) {
      lines.push('', '  Uncovered methods (not in any test):');
      for (const api of uncoveredTotal) {
        lines.push(`    [ ] [${api.category}] ${api.name}`);
      }
    }

    lines.push('');

    const report = lines.join('\n');
    console.log(report);

    const reportPath = path.resolve(this.rootDir, 'test-coverage-report.txt');
    fs.writeFileSync(reportPath, report, 'utf-8');

    return uncoveredTotal.length === 0;
  }
}