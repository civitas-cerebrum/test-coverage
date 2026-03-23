import * as fs from 'fs';
import * as path from 'path';

export interface CoverageTarget {
  category: string;
  tier: 'primary' | 'advanced';
  classRef: any;
}

export interface ApiCoverageOptions {
  /** Directories to recursively scan for test files */
  testDirs: string[];
  /** Where to save the output api-coverage-report.txt */
  reportOutputDir: string;
  /** Array of class configurations to measure coverage against */
  targets: CoverageTarget[];
  /** Strings that, if present in the filename, will cause the file to be ignored */
  ignorePatterns?: string[];
  /** Optional custom filename for the report. Defaults to 'api-coverage-report.txt' */
  reportFileName?: string;
}

export interface CoverageResult {
  report: string;
  uncoveredMethods: { name: string; category: string }[];
  reportPath: string;
}

function getPublicClassMethods(cls: any): string[] {
  const methods: string[] = [];
  const proto = cls?.prototype;
  if (!proto) return methods;
  
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor' || name.startsWith('_')) continue;
    if (typeof proto[name] === 'function') {
      methods.push(name);
    }
  }
  return methods.sort();
}

export function generateApiCoverage(options: ApiCoverageOptions): CoverageResult {
  const { 
    testDirs, 
    reportOutputDir, 
    targets, 
    ignorePatterns = [],
    reportFileName = 'api-coverage-report.txt' 
  } = options;

  const walkDir = (dir: string, fileList: string[] = []): string[] => {
    if (!fs.existsSync(dir)) return fileList;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        walkDir(filePath, fileList);
      } else {
        const isSpec = file.endsWith('.spec.ts');
        const shouldIgnore = ignorePatterns.some(pattern => file.includes(pattern));
        
        if (isSpec && !shouldIgnore) {
          fileList.push(filePath);
        }
      }
    }
    return fileList;
  };

  const allTestFiles = testDirs.flatMap(dir => walkDir(dir));
  const testSource = allTestFiles.map(f => fs.readFileSync(f, 'utf-8')).join('\n');

  const apis: { name: string; category: string; tier: string; covered: boolean }[] = [];

  const checkCoverage = (method: string) => {
    const pattern = new RegExp(`\\.\\b${method}\\b\\s*\\(`);
    return pattern.test(testSource);
  };

  for (const target of targets) {
    const methods = getPublicClassMethods(target.classRef);
    for (const m of methods) {
      apis.push({
        name: m,
        category: target.category,
        tier: target.tier,
        covered: checkCoverage(m)
      });
    }
  }

  const primaryApis = apis.filter((a) => a.tier === 'primary');
  const advancedApis = apis.filter((a) => a.tier === 'advanced');
  const primaryCovered = primaryApis.filter((a) => a.covered);
  const advancedCovered = advancedApis.filter((a) => a.covered);

  const lines: string[] = [
    '',
    '========================================================',
    '                  API COVERAGE REPORT                    ',
    '========================================================',
  ];

  const buildCategoryReport = (title: string, apiList: typeof apis, coveredList: typeof apis) => {
    if (apiList.length === 0) return;
    
    lines.push('', `  ${title}`, '  ' + '-'.repeat(title.length));
    
    const categories = [...new Set(apiList.map((a) => a.category))];
    for (const cat of categories) {
      const catApis = apiList.filter((a) => a.category === cat);
      const catCovered = catApis.filter((a) => a.covered);
      const catPct = catApis.length ? ((catCovered.length / catApis.length) * 100).toFixed(0) : '0';
      
      lines.push('', `  ${cat}: ${catCovered.length}/${catApis.length} (${catPct}%)`);
      for (const api of catApis) {
        lines.push(`    ${api.covered ? '  [x]' : '  [ ]'} ${api.name}`);
      }
    }
    const totalPct = apiList.length ? ((coveredList.length / apiList.length) * 100).toFixed(1) : 0;
    lines.push('', `  ${title.split(' ')[0]} total coverage: ${coveredList.length}/${apiList.length} (${totalPct}%)`);
  };

  buildCategoryReport('PRIMARY APIs', primaryApis, primaryCovered);
  buildCategoryReport('ADVANCED APIs', advancedApis, advancedCovered);

  const allCovered = apis.filter((a) => a.covered);
  lines.push(
    '',
    '========================================================',
    `  OVERALL: ${allCovered.length}/${apis.length} methods (${apis.length ? ((allCovered.length / apis.length) * 100).toFixed(1) : 0}%)`,
    '========================================================'
  );

  const uncoveredTotal = apis.filter((a) => !a.covered);
  if (uncoveredTotal.length > 0) {
    lines.push('', '  Uncovered methods:');
    for (const api of uncoveredTotal) {
      lines.push(`    [ ] [${api.category}] ${api.name}`);
    }
  }

  lines.push('');
  const report = lines.join('\n');
  const reportPath = path.join(reportOutputDir, reportFileName);
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(reportOutputDir)) {
    fs.mkdirSync(reportOutputDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, report, 'utf-8');

  return { report, uncoveredMethods: uncoveredTotal, reportPath };
}